package com.lgableband.uwb;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.ApiException;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.DeviceType;
import com.lgableband.common.NavigationStatus;
import com.lgableband.common.VibrationPattern;
import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.UwbSession;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

@Service
public class UwbService {

	private static final double START_DISTANCE_M = 4.0;
	private static final double START_CONFIDENCE = 0.86;

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final MvpDataService dataService;
	private final MockDataStore mockDataStore;

	public UwbService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		MvpDataService dataService,
		MockDataStore mockDataStore
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.dataService = dataService;
		this.mockDataStore = mockDataStore;
	}

	public UwbTargetsResponse targets(String authorization) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return new UwbTargetsResponse(this.mockDataStore.devices(user.userId()).stream()
				.filter(MockDataStore.Device::locationSupported)
				.map(UwbTarget::from)
				.toList());
		}
		return new UwbTargetsResponse(dbTargets(jdbcTemplate, user.userId()));
	}

	public UwbSessionResponse start(String authorization, UwbStartRequest request) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return UwbSessionResponse.from(this.mockDataStore.startUwbSession(user.userId(), request.targetDeviceId()));
		}

		UwbTarget target = dbTarget(jdbcTemplate, user.userId(), request.targetDeviceId());
		long sessionId = insertDbSession(jdbcTemplate, user.userId(), target);
		return UwbSessionResponse.from(dbSession(jdbcTemplate, user.userId(), sessionId));
	}

	public UwbSessionResponse session(String authorization, String sessionId) {
		return session(authorization, parseId(sessionId, "UWB 세션 ID를 확인해주세요."));
	}

	public UwbSessionResponse session(String authorization, long sessionId) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return UwbSessionResponse.from(this.mockDataStore.uwbSession(user.userId(), sessionId));
		}
		return UwbSessionResponse.from(dbSession(jdbcTemplate, user.userId(), sessionId));
	}

	public UwbSessionResponse stop(String authorization, String sessionId) {
		return stop(authorization, parseId(sessionId, "UWB 세션 ID를 확인해주세요."));
	}

	public UwbSessionResponse stop(String authorization, long sessionId) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return UwbSessionResponse.from(this.mockDataStore.stopUwbSession(user.userId(), sessionId));
		}

		DbUwbSession current = dbSession(jdbcTemplate, user.userId(), sessionId);
		if (isTerminal(current.navigationStatus())) {
			return UwbSessionResponse.from(current);
		}
		jdbcTemplate.update(
			"""
			UPDATE uwb_session
			SET status = 'CANCELED',
			    voice_guide = ?,
			    vibration_pattern = 'NONE',
			    stopped_at = CURRENT_TIMESTAMP(6),
			    updated_at = CURRENT_TIMESTAMP(6)
			WHERE session_id = ?
			  AND user_id = ?
			""",
			new Object[] { current.targetDeviceName() + " 탐색을 종료했습니다.", sessionId, user.userId() }
		);
		return UwbSessionResponse.from(dbSession(jdbcTemplate, user.userId(), sessionId));
	}

	private List<UwbTarget> dbTargets(JdbcTemplate jdbcTemplate, long userId) {
		return jdbcTemplate.query(
			"""
			SELECT d.device_id,
			       d.name,
			       d.device_type,
			       d.connection_status,
			       d.location_supported,
			       COALESCE(MAX(de.occurred_at), d.created_at) AS last_event_at
			FROM device d
			LEFT JOIN device_event de ON de.device_id = d.device_id
			WHERE d.user_id = ?
			  AND d.location_supported = TRUE
			  AND d.connection_status <> 'DISCONNECTED'
			GROUP BY d.device_id, d.name, d.device_type, d.connection_status, d.location_supported, d.created_at
			ORDER BY last_event_at DESC, d.device_id DESC
			""",
			(rs, rowNum) -> new UwbTarget(
				rs.getLong("device_id"),
				rs.getString("name"),
				DeviceType.valueOf(rs.getString("device_type")),
				ConnectionStatus.valueOf(rs.getString("connection_status")),
				rs.getBoolean("location_supported"),
				toOffsetDateTime(rs.getObject("last_event_at", LocalDateTime.class))
			),
			new Object[] { userId }
		);
	}

	private UwbTarget dbTarget(JdbcTemplate jdbcTemplate, long userId, long targetDeviceId) {
		return jdbcTemplate.query(
			"""
			SELECT d.device_id,
			       d.name,
			       d.device_type,
			       d.connection_status,
			       d.location_supported,
			       COALESCE(MAX(de.occurred_at), d.created_at) AS last_event_at
			FROM device d
			LEFT JOIN device_event de ON de.device_id = d.device_id
			WHERE d.device_id = ?
			  AND d.user_id = ?
			  AND d.location_supported = TRUE
			  AND d.connection_status <> 'DISCONNECTED'
			GROUP BY d.device_id, d.name, d.device_type, d.connection_status, d.location_supported, d.created_at
			""",
			(rs, rowNum) -> new UwbTarget(
				rs.getLong("device_id"),
				rs.getString("name"),
				DeviceType.valueOf(rs.getString("device_type")),
				ConnectionStatus.valueOf(rs.getString("connection_status")),
				rs.getBoolean("location_supported"),
				toOffsetDateTime(rs.getObject("last_event_at", LocalDateTime.class))
			),
			new Object[] { targetDeviceId, userId }
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "UWB 위치 안내 대상을 찾을 수 없습니다."));
	}

	private long insertDbSession(JdbcTemplate jdbcTemplate, long userId, UwbTarget target) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		String voiceGuide = voiceGuide(target.name(), START_DISTANCE_M, NavigationStatus.ACTIVE);
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO uwb_session (
					user_id,
					target_device_id,
					status,
					distance_m,
					confidence,
					voice_guide,
					vibration_pattern
				) VALUES (?, ?, ?, ?, ?, ?, ?)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, userId);
			ps.setLong(2, target.deviceId());
			ps.setString(3, NavigationStatus.ACTIVE.name());
			ps.setDouble(4, START_DISTANCE_M);
			ps.setDouble(5, START_CONFIDENCE);
			ps.setString(6, voiceGuide);
			ps.setString(7, vibrationPattern(START_DISTANCE_M, NavigationStatus.ACTIVE).name());
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private DbUwbSession dbSession(JdbcTemplate jdbcTemplate, long userId, long sessionId) {
		return jdbcTemplate.query(
			"""
			SELECT us.session_id,
			       us.target_device_id,
			       d.name AS target_device_name,
			       us.status,
			       us.distance_m,
			       us.confidence,
			       us.voice_guide,
			       us.vibration_pattern,
			       us.updated_at,
			       us.stopped_at
			FROM uwb_session us
			JOIN device d ON d.device_id = us.target_device_id
			WHERE us.session_id = ?
			  AND us.user_id = ?
			""",
			(rs, rowNum) -> new DbUwbSession(
				rs.getLong("session_id"),
				rs.getLong("target_device_id"),
				rs.getString("target_device_name"),
				NavigationStatus.valueOf(rs.getString("status")),
				numberToDouble(rs.getObject("distance_m")),
				numberToDouble(rs.getObject("confidence")),
				rs.getString("voice_guide"),
				VibrationPattern.valueOf(rs.getString("vibration_pattern")),
				toOffsetDateTime(rs.getObject("updated_at", LocalDateTime.class)),
				toOffsetDateTime(rs.getObject("stopped_at", LocalDateTime.class))
			),
			new Object[] { sessionId, userId }
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "UWB 세션을 찾을 수 없습니다."));
	}

	private long parseId(String value, String message) {
		try {
			long parsed = Long.parseLong(value);
			if (parsed > 0) {
				return parsed;
			}
		}
		catch (NumberFormatException ex) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
		}
		throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
	}

	private boolean isTerminal(NavigationStatus status) {
		return status == NavigationStatus.ARRIVED || status == NavigationStatus.CANCELED || status == NavigationStatus.FAILED;
	}

	private VibrationPattern vibrationPattern(double distanceM, NavigationStatus status) {
		if (status == NavigationStatus.CANCELED || status == NavigationStatus.FAILED) {
			return VibrationPattern.NONE;
		}
		if (status == NavigationStatus.ARRIVED) {
			return VibrationPattern.LONG_TWICE;
		}
		if (distanceM <= 1.0) {
			return VibrationPattern.FAST;
		}
		if (distanceM <= 3.0) {
			return VibrationPattern.MEDIUM;
		}
		return VibrationPattern.SLOW;
	}

	private String voiceGuide(String targetName, double distanceM, NavigationStatus status) {
		if (status == NavigationStatus.ARRIVED) {
			return targetName + " 앞입니다.";
		}
		if (distanceM <= 1.0) {
			return targetName + " 근처입니다.";
		}
		return "%s까지 약 %.0f미터입니다.".formatted(targetName, distanceM);
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(ZoneOffset.ofHours(9));
	}

	private double numberToDouble(Object value) {
		return value instanceof Number number ? number.doubleValue() : 0;
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	public record UwbStartRequest(@NotNull @Positive Long targetDeviceId) {
	}

	public record UwbTargetsResponse(List<UwbTarget> items) {
	}

	public record UwbTarget(
		long deviceId,
		String name,
		DeviceType type,
		ConnectionStatus connectionStatus,
		boolean locationSupported,
		OffsetDateTime lastEventAt
	) {
		static UwbTarget from(MockDataStore.Device device) {
			return new UwbTarget(
				device.deviceId(),
				device.name(),
				device.type(),
				device.connectionStatus(),
				device.locationSupported(),
				device.lastEventAt()
			);
		}
	}

	public record UwbSessionResponse(
		long sessionId,
		TargetDevice targetDevice,
		long targetDeviceId,
		String targetDeviceName,
		String status,
		NavigationStatus navigationStatus,
		double distanceM,
		double confidence,
		String voiceGuide,
		VibrationPattern vibrationPattern,
		OffsetDateTime updatedAt,
		OffsetDateTime stoppedAt
	) {
		static UwbSessionResponse from(UwbSession session) {
			OffsetDateTime stoppedAt = session.navigationStatus() == NavigationStatus.CANCELED ? session.updatedAt() : null;
			return new UwbSessionResponse(
				session.sessionId(),
				new TargetDevice(session.targetDeviceId(), session.targetDeviceName()),
				session.targetDeviceId(),
				session.targetDeviceName(),
				session.navigationStatus().name(),
				session.navigationStatus(),
				session.distanceM(),
				session.confidence(),
				session.voiceGuide(),
				session.vibrationPattern(),
				session.updatedAt(),
				stoppedAt
			);
		}

		static UwbSessionResponse from(DbUwbSession session) {
			return new UwbSessionResponse(
				session.sessionId(),
				new TargetDevice(session.targetDeviceId(), session.targetDeviceName()),
				session.targetDeviceId(),
				session.targetDeviceName(),
				session.navigationStatus().name(),
				session.navigationStatus(),
				session.distanceM(),
				session.confidence(),
				session.voiceGuide(),
				session.vibrationPattern(),
				session.updatedAt(),
				session.stoppedAt()
			);
		}
	}

	public record TargetDevice(long deviceId, String name) {
	}

	private record DbUwbSession(
		long sessionId,
		long targetDeviceId,
		String targetDeviceName,
		NavigationStatus navigationStatus,
		double distanceM,
		double confidence,
		String voiceGuide,
		VibrationPattern vibrationPattern,
		OffsetDateTime updatedAt,
		OffsetDateTime stoppedAt
	) {
	}
}
