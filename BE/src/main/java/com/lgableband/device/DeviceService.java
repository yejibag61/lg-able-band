package com.lgableband.device;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.ApiException;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.DeviceType;
import com.lgableband.mock.MockDataStore;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Service
public class DeviceService {

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final MvpDataService dataService;
	private final MockDataStore mockDataStore;
	private final ObjectMapper objectMapper = JsonMapper.builder().build();

	public DeviceService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		MvpDataService dataService,
		MockDataStore mockDataStore
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.dataService = dataService;
		this.mockDataStore = mockDataStore;
	}

	public List<DeviceSummary> devices(String authorization) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			return this.mockDataStore.devices(user.userId()).stream()
				.filter(device -> device.connectionStatus() != ConnectionStatus.DISCONNECTED)
				.map(device -> new DeviceSummary(
					device.deviceId(),
					device.name(),
					device.type(),
					device.connectionStatus(),
					device.locationSupported(),
					device.lastEventAt(),
					null,
					mockVendorDeviceId(device.type()),
					false,
					device.room(),
					device.runtime()
				))
				.toList();
		}

		return jdbcTemplate.query(
			"""
			SELECT d.device_id,
			       d.name,
			       d.device_type,
			       d.connection_status,
			       d.location_supported,
			       d.vendor_device_id,
			       d.remote_enabled,
			       d.room,
			       (
			         SELECT de2.payload_json
			         FROM device_event de2
			         WHERE de2.device_id = d.device_id
			           AND JSON_UNQUOTE(JSON_EXTRACT(de2.payload_json, '$.kind')) = 'DEVICE_RUNTIME_STATE'
			         ORDER BY de2.occurred_at DESC, de2.event_id DESC
			         LIMIT 1
			       ) AS runtime_json,
			       COALESCE(MAX(de.occurred_at), d.created_at) AS last_event_at
			FROM device d
			LEFT JOIN device_event de ON de.device_id = d.device_id
			WHERE d.user_id = ?
			  AND d.connection_status <> 'DISCONNECTED'
			GROUP BY d.device_id, d.name, d.device_type, d.connection_status,
			         d.location_supported, d.vendor_device_id, d.remote_enabled, d.room, d.created_at
			ORDER BY last_event_at DESC, d.device_id DESC
			""",
			(rs, rowNum) -> new DeviceSummary(
				rs.getLong("device_id"),
				rs.getString("name"),
				DeviceType.valueOf(rs.getString("device_type")),
				ConnectionStatus.valueOf(rs.getString("connection_status")),
				rs.getBoolean("location_supported"),
				toOffsetDateTime(rs.getObject("last_event_at", LocalDateTime.class)),
				null,
				rs.getString("vendor_device_id"),
				rs.getBoolean("remote_enabled"),
				rs.getString("room"),
				parseRuntime(rs.getString("runtime_json"), DeviceType.valueOf(rs.getString("device_type")))
			),
			user.userId()
		);
	}

	public DeviceSummary createDevice(String authorization, DeviceCreateRequest request) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			MockDataStore.Device device = this.mockDataStore.addDevice(
				user.userId(),
				request.name(),
				request.type(),
				request.locationSupported(),
				normalizeRoom(request.room())
			);
			return new DeviceSummary(
				device.deviceId(),
				device.name(),
				device.type(),
				device.connectionStatus(),
				device.locationSupported(),
				device.lastEventAt(),
				request.vendor(),
				request.vendorDeviceId(),
				request.remoteEnabled(),
				device.room(),
				device.runtime()
			);
		}

		try {
			long deviceId = insertDevice(jdbcTemplate, user.userId(), request);
			insertRegistrationEvent(jdbcTemplate, deviceId, request);
			return new DeviceSummary(
				deviceId,
				request.name(),
				request.type(),
				ConnectionStatus.CONNECTED,
				request.locationSupported(),
				OffsetDateTime.now(),
				request.vendor(),
				request.vendorDeviceId(),
				request.remoteEnabled(),
				normalizeRoom(request.room()),
				defaultRuntime(request.type())
			);
		} catch (DuplicateKeyException ex) {
			return reconnectExistingDevice(jdbcTemplate, user.userId(), request);
		}
	}

	public DeviceSummary claimWearableDevice(String authorization, DeviceCreateRequest request) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (request.type() != DeviceType.WEARABLE) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DEVICE_TYPE", "웨어러블 기기만 연동할 수 있습니다.");
		}

		if (jdbcTemplate == null) {
			MockDataStore.Device device = this.mockDataStore.addDevice(
				user.userId(),
				request.name(),
				request.type(),
				request.locationSupported(),
				normalizeRoom(request.room())
			);
			return new DeviceSummary(
				device.deviceId(),
				device.name(),
				device.type(),
				device.connectionStatus(),
				device.locationSupported(),
				device.lastEventAt(),
				request.vendor(),
				request.vendorDeviceId(),
				request.remoteEnabled(),
				device.room(),
				device.runtime()
			);
		}

		try {
			long deviceId = insertDevice(jdbcTemplate, user.userId(), request);
			insertRegistrationEvent(jdbcTemplate, deviceId, request);
			return new DeviceSummary(
				deviceId,
				request.name(),
				request.type(),
				ConnectionStatus.CONNECTED,
				request.locationSupported(),
				OffsetDateTime.now(),
				request.vendor(),
				request.vendorDeviceId(),
				request.remoteEnabled(),
				normalizeRoom(request.room()),
				defaultRuntime(request.type())
			);
		} catch (DuplicateKeyException ex) {
			return claimExistingWearableDevice(jdbcTemplate, user.userId(), request);
		}
	}

	public DeviceSummary updateDevice(String authorization, long deviceId, DeviceUpdateRequest request) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		String room = normalizeRoom(request.room());
		Map<String, Object> runtime = normalizeRuntime(request.runtime());
		if (room == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DEVICE_ROOM", "가전 위치를 입력해 주세요.");
		}

		if (jdbcTemplate == null) {
			MockDataStore.Device device = this.mockDataStore.updateDevice(user.userId(), deviceId, room, runtime);
			if (device == null) {
				throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "기기를 찾을 수 없습니다.");
			}
			return new DeviceSummary(
				device.deviceId(),
				device.name(),
				device.type(),
				device.connectionStatus(),
				device.locationSupported(),
				device.lastEventAt(),
				null,
				mockVendorDeviceId(device.type()),
				false,
				device.room(),
				device.runtime()
			);
		}

		int updated = jdbcTemplate.update(
			"""
			UPDATE device
			SET room = ?,
			    updated_at = CURRENT_TIMESTAMP(6)
			WHERE device_id = ?
			  AND user_id = ?
			  AND connection_status <> 'DISCONNECTED'
			""",
			room,
			deviceId,
			user.userId()
		);
		if (updated == 0) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "기기를 찾을 수 없습니다.");
		}

		if (!runtime.isEmpty()) {
			insertRuntimeEvent(jdbcTemplate, deviceId, runtime);
		}

		return devices(authorization).stream()
			.filter(device -> device.deviceId() == deviceId)
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "기기를 찾을 수 없습니다."));
	}

	public void deleteDevice(String authorization, long deviceId) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			boolean removed = this.mockDataStore.devices(user.userId())
				.removeIf(device -> device.deviceId() == deviceId);
			if (!removed) {
				throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "기기를 찾을 수 없습니다.");
			}
			return;
		}

		int updated = jdbcTemplate.update(
			"""
			UPDATE device
			SET connection_status = 'DISCONNECTED',
			    updated_at = CURRENT_TIMESTAMP(6)
			WHERE device_id = ?
			  AND user_id = ?
			""",
			deviceId,
			user.userId()
		);
		if (updated == 0) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "기기를 찾을 수 없습니다.");
		}
	}

	private long insertDevice(JdbcTemplate jdbcTemplate, long userId, DeviceCreateRequest request) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO device (
					user_id,
					device_type,
					vendor_device_id,
					name,
					room,
					connection_status,
					location_supported,
					remote_enabled
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, userId);
			ps.setString(2, request.type().name());
			ps.setString(3, blankToNull(request.vendorDeviceId()));
			ps.setString(4, request.name());
			ps.setString(5, normalizeRoom(request.room()));
			ps.setString(6, ConnectionStatus.CONNECTED.name());
			ps.setBoolean(7, request.locationSupported());
			ps.setBoolean(8, request.remoteEnabled());
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private void insertRegistrationEvent(JdbcTemplate jdbcTemplate, long deviceId, DeviceCreateRequest request) {
		jdbcTemplate.update(
			"""
			INSERT INTO device_event (device_id, event_type, event_level, payload_json, occurred_at)
			VALUES (?, 'LIFE', 'LOW', ?, ?)
			""",
			deviceId,
			registrationPayload(request),
			LocalDateTime.now()
		);
	}

	private void insertRuntimeEvent(JdbcTemplate jdbcTemplate, long deviceId, Map<String, Object> runtime) {
		jdbcTemplate.update(
			"""
			INSERT INTO device_event (device_id, event_type, event_level, payload_json, occurred_at)
			VALUES (?, 'LIFE', 'LOW', ?, ?)
			""",
			deviceId,
			runtimePayload(runtime),
			LocalDateTime.now()
		);
	}

	private DeviceSummary claimExistingWearableDevice(JdbcTemplate jdbcTemplate, long userId, DeviceCreateRequest request) {
		String vendorDeviceId = blankToNull(request.vendorDeviceId());
		if (vendorDeviceId == null) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATED_DEVICE", "이미 연결된 기기입니다.");
		}

		DeviceRow currentUserExisting = jdbcTemplate.query(
			"""
			SELECT device_id, user_id
			FROM device
			WHERE user_id = ?
			  AND vendor_device_id = ?
			ORDER BY device_id DESC
			LIMIT 1
			""",
			(rs, rowNum) -> new DeviceRow(
				rs.getLong("device_id"),
				rs.getLong("user_id")
			),
			userId,
			vendorDeviceId
		).stream().findFirst().orElse(null);

		if (currentUserExisting != null) {
			updateClaimedWearableDevice(jdbcTemplate, currentUserExisting.deviceId(), userId, request);
			insertRegistrationEvent(jdbcTemplate, currentUserExisting.deviceId(), request);
			return claimedWearableSummary(currentUserExisting.deviceId(), request);
		}

		DeviceRow existing = jdbcTemplate.query(
			"""
			SELECT device_id, user_id
			FROM device
			WHERE vendor_device_id = ?
			""",
			(rs, rowNum) -> new DeviceRow(
				rs.getLong("device_id"),
				rs.getLong("user_id")
			),
			vendorDeviceId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "DUPLICATED_DEVICE", "이미 연결된 기기입니다."));

		updateClaimedWearableDevice(jdbcTemplate, existing.deviceId(), userId, request);
		insertRegistrationEvent(jdbcTemplate, existing.deviceId(), request);
		return claimedWearableSummary(existing.deviceId(), request);
	}

	private void updateClaimedWearableDevice(
		JdbcTemplate jdbcTemplate,
		long deviceId,
		long userId,
		DeviceCreateRequest request
	) {
		jdbcTemplate.update(
			"""
			UPDATE device
			SET user_id = ?,
			    device_type = ?,
			    name = ?,
			    room = ?,
			    connection_status = 'CONNECTED',
			    location_supported = ?,
			    remote_enabled = ?,
			    updated_at = CURRENT_TIMESTAMP(6)
			WHERE device_id = ?
			""",
			userId,
			request.type().name(),
			request.name(),
			normalizeRoom(request.room()),
			request.locationSupported(),
			request.remoteEnabled(),
			deviceId
		);
	}

	private DeviceSummary claimedWearableSummary(long deviceId, DeviceCreateRequest request) {
		return new DeviceSummary(
			deviceId,
			request.name(),
			request.type(),
			ConnectionStatus.CONNECTED,
			request.locationSupported(),
			OffsetDateTime.now(),
			request.vendor(),
			request.vendorDeviceId(),
			request.remoteEnabled(),
			normalizeRoom(request.room()),
			defaultRuntime(request.type())
		);
	}

	private DeviceSummary reconnectExistingDevice(JdbcTemplate jdbcTemplate, long userId, DeviceCreateRequest request) {
		String vendorDeviceId = blankToNull(request.vendorDeviceId());
		if (vendorDeviceId == null) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATED_DEVICE", "이미 연결된 기기입니다.");
		}

		DeviceRow existing = jdbcTemplate.query(
			"""
			SELECT device_id, user_id
			FROM device
			WHERE vendor_device_id = ?
			""",
			(rs, rowNum) -> new DeviceRow(
				rs.getLong("device_id"),
				rs.getLong("user_id")
			),
			vendorDeviceId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "DUPLICATED_DEVICE", "이미 연결된 기기입니다."));

		if (existing.userId() != userId) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATED_DEVICE", "이미 연결된 기기입니다.");
		}

		jdbcTemplate.update(
			"""
			UPDATE device
			SET device_type = ?,
			    name = ?,
			    room = ?,
			    connection_status = 'CONNECTED',
			    location_supported = ?,
			    remote_enabled = ?,
			    updated_at = CURRENT_TIMESTAMP(6)
			WHERE device_id = ?
			""",
			request.type().name(),
			request.name(),
			normalizeRoom(request.room()),
			request.locationSupported(),
			request.remoteEnabled(),
			existing.deviceId()
		);
		insertRegistrationEvent(jdbcTemplate, existing.deviceId(), request);
		return new DeviceSummary(
			existing.deviceId(),
			request.name(),
			request.type(),
			ConnectionStatus.CONNECTED,
			request.locationSupported(),
			OffsetDateTime.now(),
			request.vendor(),
			request.vendorDeviceId(),
			request.remoteEnabled(),
			normalizeRoom(request.room()),
			defaultRuntime(request.type())
		);
	}

	private String registrationPayload(DeviceCreateRequest request) {
		Map<String, Object> payload = Map.of(
			"kind", "DEVICE_REGISTERED",
			"vendor", request.vendor(),
			"vendorDeviceId", blankToNull(request.vendorDeviceId()) == null ? "" : request.vendorDeviceId(),
			"name", request.name(),
			"type", request.type().name(),
			"locationSupported", request.locationSupported(),
			"remoteEnabled", request.remoteEnabled()
		);
		return """
			{"kind":"%s","vendor":"%s","vendorDeviceId":"%s","name":"%s","type":"%s","locationSupported":%s,"remoteEnabled":%s}
			""".formatted(
			escapeJson(String.valueOf(payload.get("kind"))),
			escapeJson(String.valueOf(payload.get("vendor"))),
			escapeJson(String.valueOf(payload.get("vendorDeviceId"))),
			escapeJson(String.valueOf(payload.get("name"))),
			escapeJson(String.valueOf(payload.get("type"))),
			payload.get("locationSupported"),
			payload.get("remoteEnabled")
		).trim();
	}

	private String runtimePayload(Map<String, Object> runtime) {
		try {
			return this.objectMapper.writeValueAsString(Map.of(
				"kind", "DEVICE_RUNTIME_STATE",
				"runtime", runtime
			));
		}
		catch (JacksonException ex) {
			throw new IllegalArgumentException("Device runtime payload cannot be serialized.", ex);
		}
	}

	@SuppressWarnings("unchecked")
	private Map<String, Object> parseRuntime(String payloadJson, DeviceType type) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return defaultRuntime(type);
		}
		try {
			Map<String, Object> payload = this.objectMapper.readValue(payloadJson, Map.class);
			Object runtime = payload.get("runtime");
			if (runtime instanceof Map<?, ?> runtimeMap) {
				return Map.copyOf((Map<String, Object>) runtimeMap);
			}
		}
		catch (JacksonException ignored) {
		}
		return defaultRuntime(type);
	}

	private Map<String, Object> normalizeRuntime(Map<String, Object> runtime) {
		return runtime == null ? Map.of() : Map.copyOf(runtime);
	}

	private Map<String, Object> defaultRuntime(DeviceType type) {
		return switch (type) {
			case WASHER -> Map.of("powerOn", true, "statusCode", "RUNNING", "remainingMinutes", 14);
			case RANGE -> Map.of("powerOn", false, "cookingStatus", "IDLE");
			case TV -> Map.of("powerOn", false, "volume", 12, "channel", 7);
			case DOOR_SENSOR, REFRIGERATOR -> Map.of("doorOpen", false);
			case AIR_SENSOR -> Map.of("airQuality", "GOOD");
			default -> Map.of();
		};
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(ZoneOffset.ofHours(9));
	}

	private String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value;
	}

	private String normalizeRoom(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private String escapeJson(String value) {
		return value
			.replace("\\", "\\\\")
			.replace("\"", "\\\"");
	}

	private String mockVendorDeviceId(DeviceType type) {
		return switch (type) {
			case WASHER -> "thinq-washer-001";
			case TV -> "thinq-tv-001";
			case RANGE -> "thinq-range-001";
			case DOOR_SENSOR -> "door-sensor-001";
			case AIR_SENSOR -> "thinq-air-001";
			case REFRIGERATOR -> "thinq-fridge-001";
			case WEARABLE -> "able-band-demo-001";
			case UWB_TAG -> "uwb-tag-demo-001";
		};
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	public record DeviceSummary(
		long deviceId,
		String name,
		DeviceType type,
		ConnectionStatus connectionStatus,
		boolean locationSupported,
		OffsetDateTime lastEventAt,
		String vendor,
		String vendorDeviceId,
		boolean remoteEnabled,
		String room,
		Map<String, Object> runtime
	) {

		public DeviceSummary(
			long deviceId,
			String name,
			DeviceType type,
			ConnectionStatus connectionStatus,
			boolean locationSupported,
			OffsetDateTime lastEventAt,
			String vendor,
			String vendorDeviceId,
			boolean remoteEnabled,
			String room
		) {
			this(deviceId, name, type, connectionStatus, locationSupported, lastEventAt, vendor, vendorDeviceId, remoteEnabled, room, Map.of());
		}
	}

	public record DeviceCreateRequest(
		String vendor,
		String vendorDeviceId,
		String name,
		DeviceType type,
		String room,
		boolean locationSupported,
		boolean remoteEnabled
	) {
	}

	public record DeviceUpdateRequest(String room, Map<String, Object> runtime) {
	}

	private record DeviceRow(long deviceId, long userId) {
	}
}
