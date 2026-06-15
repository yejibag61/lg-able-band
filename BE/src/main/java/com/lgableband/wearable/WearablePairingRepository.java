package com.lgableband.wearable;

import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.DeviceType;
import com.lgableband.device.DeviceService;
import java.io.IOException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class WearablePairingRepository {

	private static final String DEFAULT_VENDOR = "LG";
	private static final ConcurrentMap<String, WearablePairingSession> SESSIONS = new ConcurrentHashMap<>();
	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final Path fallbackFile;

	@Autowired
	public WearablePairingRepository(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		@Value("${wearable.pairing.fallback-file:}") String fallbackFile
	) {
		this(jdbcTemplateProvider, fallbackFile.isBlank() ? null : Path.of(fallbackFile));
	}

	public WearablePairingRepository(Path fallbackFile) {
		this(null, fallbackFile);
	}

	private WearablePairingRepository(ObjectProvider<JdbcTemplate> jdbcTemplateProvider, Path fallbackFile) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.fallbackFile = fallbackFile;
		loadFallbackFile();
	}

	public WearablePairingSession save(WearablePairingSession session) {
		SESSIONS.put(session.pairingSessionId(), session);
		writeFallbackFile();
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate != null) {
			try {
				saveDb(jdbcTemplate, session);
			} catch (DataAccessException ignored) {
			}
		}
		return session;
	}

	public Optional<WearablePairingSession> find(String pairingSessionId) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate != null) {
			try {
				List<WearablePairingSession> sessions = findDb(jdbcTemplate, pairingSessionId);
				if (!sessions.isEmpty()) {
					WearablePairingSession session = sessions.getFirst();
					SESSIONS.put(pairingSessionId, session);
					return Optional.of(session);
				}
			} catch (DataAccessException ignored) {
			}
		}
		return Optional.ofNullable(SESSIONS.get(pairingSessionId));
	}

	public Optional<WearablePairingSession> findWaitingSessionForDevice(String deviceId) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate != null) {
			try {
				List<WearablePairingSession> sessions = findWaitingSessionForDeviceDb(jdbcTemplate, deviceId);
				if (!sessions.isEmpty()) {
					WearablePairingSession session = sessions.getFirst();
					SESSIONS.put(session.pairingSessionId(), session);
					return Optional.of(session);
				}
			} catch (DataAccessException ignored) {
			}
		}
		return SESSIONS.values().stream()
			.filter(session -> isWaitingSessionForDevice(session, deviceId))
			.max((left, right) -> left.issuedAt().compareTo(right.issuedAt()));
	}

	public Optional<WearablePairingSession> expire(String pairingSessionId) {
		Optional<WearablePairingSession> expired = find(pairingSessionId).map(WearablePairingSession::expire);
		expired.ifPresent(this::save);
		return expired;
	}

	public void expireWaitingSessionsForDevice(String deviceId, String retainedPairingSessionId) {
		SESSIONS.replaceAll((key, session) ->
			isOtherWaitingSessionForDevice(session, deviceId, retainedPairingSessionId)
				? session.expire()
				: session
		);
		writeFallbackFile();
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate != null) {
			try {
				expireWaitingSessionsForDeviceDb(jdbcTemplate, deviceId, retainedPairingSessionId);
			} catch (DataAccessException ignored) {
			}
		}
	}

	public void expireSessions(OffsetDateTime now) {
		SESSIONS.replaceAll((key, session) -> shouldExpire(session, now) ? session.expire() : session);
		writeFallbackFile();
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate != null) {
			try {
				jdbcTemplate.update(
					"""
					UPDATE wearable_pairing_session
					SET status = 'EXPIRED',
					    wearable_access_token = NULL,
					    updated_at = CURRENT_TIMESTAMP(6)
					WHERE status = 'WAITING'
					  AND expires_at <= ?
					""",
					toLocalDateTime(now)
				);
			} catch (DataAccessException ignored) {
			}
		}
	}

	private void saveDb(JdbcTemplate jdbcTemplate, WearablePairingSession session) {
		jdbcTemplate.update(
			"""
			INSERT INTO wearable_pairing_session (
			    pairing_session_id,
			    device_id,
			    device_name,
			    pairing_code,
			    nonce,
			    status,
			    linked_user_id,
			    linked_device_id,
			    wearable_access_token,
			    issued_at,
			    expires_at,
			    paired_at,
			    unpaired_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
			    device_id = VALUES(device_id),
			    device_name = VALUES(device_name),
			    pairing_code = VALUES(pairing_code),
			    nonce = VALUES(nonce),
			    status = VALUES(status),
			    linked_user_id = VALUES(linked_user_id),
			    linked_device_id = VALUES(linked_device_id),
			    wearable_access_token = VALUES(wearable_access_token),
			    issued_at = VALUES(issued_at),
			    expires_at = VALUES(expires_at),
			    paired_at = VALUES(paired_at),
			    unpaired_at = VALUES(unpaired_at),
			    updated_at = CURRENT_TIMESTAMP(6)
			""",
			session.pairingSessionId(),
			session.deviceId(),
			session.deviceName(),
			session.pairingCode(),
			session.nonce(),
			session.status().name(),
			session.linkedUserId(),
			linkedDeviceId(session),
			session.accessToken(),
			toLocalDateTime(session.issuedAt()),
			toLocalDateTime(session.expiresAt()),
			toLocalDateTime(session.pairedAt()),
			toLocalDateTime(session.unpairedAt())
		);
	}

	private void expireWaitingSessionsForDeviceDb(
		JdbcTemplate jdbcTemplate,
		String deviceId,
		String retainedPairingSessionId
	) {
		jdbcTemplate.update(
			"""
			UPDATE wearable_pairing_session
			SET status = 'EXPIRED',
			    wearable_access_token = NULL,
			    updated_at = CURRENT_TIMESTAMP(6)
			WHERE device_id = ?
			  AND status = 'WAITING'
			  AND pairing_session_id <> ?
			""",
			deviceId,
			retainedPairingSessionId
		);
	}

	private List<WearablePairingSession> findDb(JdbcTemplate jdbcTemplate, String pairingSessionId) {
		return jdbcTemplate.query(
			"""
			SELECT w.pairing_session_id,
			       w.device_id,
			       w.device_name,
			       w.pairing_code,
			       w.nonce,
			       w.status,
			       w.linked_user_id,
			       w.linked_device_id,
			       w.wearable_access_token,
			       w.issued_at,
			       w.expires_at,
			       w.paired_at,
			       w.unpaired_at,
			       d.name AS linked_device_name,
			       d.device_type AS linked_device_type,
			       d.connection_status AS linked_device_connection_status,
			       d.location_supported AS linked_device_location_supported,
			       d.vendor_device_id AS linked_vendor_device_id,
			       d.remote_enabled AS linked_device_remote_enabled,
			       COALESCE(d.updated_at, d.created_at) AS linked_device_last_event_at
			FROM wearable_pairing_session w
			LEFT JOIN device d ON d.device_id = w.linked_device_id
			WHERE w.pairing_session_id = ?
			""",
			this::mapSession,
			pairingSessionId
		);
	}

	private List<WearablePairingSession> findWaitingSessionForDeviceDb(
		JdbcTemplate jdbcTemplate,
		String deviceId
	) {
		return jdbcTemplate.query(
			"""
			SELECT w.pairing_session_id,
			       w.device_id,
			       w.device_name,
			       w.pairing_code,
			       w.nonce,
			       w.status,
			       w.linked_user_id,
			       w.linked_device_id,
			       w.wearable_access_token,
			       w.issued_at,
			       w.expires_at,
			       w.paired_at,
			       w.unpaired_at,
			       d.name AS linked_device_name,
			       d.device_type AS linked_device_type,
			       d.connection_status AS linked_device_connection_status,
			       d.location_supported AS linked_device_location_supported,
			       d.vendor_device_id AS linked_vendor_device_id,
			       d.remote_enabled AS linked_device_remote_enabled,
			       COALESCE(d.updated_at, d.created_at) AS linked_device_last_event_at
			FROM wearable_pairing_session w
			LEFT JOIN device d ON d.device_id = w.linked_device_id
			WHERE w.device_id = ?
			  AND w.status = 'WAITING'
			ORDER BY w.issued_at DESC, w.created_at DESC
			LIMIT 1
			""",
			this::mapSession,
			deviceId
		);
	}

	private WearablePairingSession mapSession(ResultSet rs, int rowNum) throws SQLException {
		return new WearablePairingSession(
			rs.getString("pairing_session_id"),
			rs.getString("device_id"),
			rs.getString("device_name"),
			rs.getString("pairing_code"),
			rs.getString("nonce"),
			toOffsetDateTime(rs.getObject("issued_at", LocalDateTime.class)),
			toOffsetDateTime(rs.getObject("expires_at", LocalDateTime.class)),
			WearablePairingService.PairingStatus.valueOf(rs.getString("status")),
			nullableLong(rs, "linked_user_id"),
			linkedDevice(rs),
			rs.getString("wearable_access_token"),
			toOffsetDateTime(rs.getObject("paired_at", LocalDateTime.class)),
			toOffsetDateTime(rs.getObject("unpaired_at", LocalDateTime.class))
		);
	}

	private boolean shouldExpire(WearablePairingSession session, OffsetDateTime now) {
		return session.status() == WearablePairingService.PairingStatus.WAITING
			&& !now.isBefore(session.expiresAt());
	}

	private boolean isWaitingSessionForDevice(WearablePairingSession session, String deviceId) {
		return session.status() == WearablePairingService.PairingStatus.WAITING
			&& session.deviceId().equals(deviceId);
	}

	private boolean isOtherWaitingSessionForDevice(
		WearablePairingSession session,
		String deviceId,
		String retainedPairingSessionId
	) {
		return session.status() == WearablePairingService.PairingStatus.WAITING
			&& session.deviceId().equals(deviceId)
			&& !session.pairingSessionId().equals(retainedPairingSessionId);
	}

	private Long linkedDeviceId(WearablePairingSession session) {
		return session.device() == null ? null : session.device().deviceId();
	}

	private DeviceService.DeviceSummary linkedDevice(ResultSet rs) throws SQLException {
		Long deviceId = nullableLong(rs, "linked_device_id");
		if (deviceId == null) {
			return null;
		}
		String type = rs.getString("linked_device_type");
		String status = rs.getString("linked_device_connection_status");
		return new DeviceService.DeviceSummary(
			deviceId,
			rs.getString("linked_device_name"),
			type == null ? DeviceType.WEARABLE : DeviceType.valueOf(type),
			status == null ? ConnectionStatus.CONNECTED : ConnectionStatus.valueOf(status),
			rs.getBoolean("linked_device_location_supported"),
			toOffsetDateTime(rs.getObject("linked_device_last_event_at", LocalDateTime.class)),
			DEFAULT_VENDOR,
			rs.getString("linked_vendor_device_id"),
			rs.getBoolean("linked_device_remote_enabled")
		);
	}

	private Long nullableLong(ResultSet rs, String column) throws SQLException {
		long value = rs.getLong(column);
		return rs.wasNull() ? null : value;
	}

	private LocalDateTime toLocalDateTime(OffsetDateTime dateTime) {
		return dateTime == null ? null : dateTime.atZoneSameInstant(ZoneOffset.ofHours(9)).toLocalDateTime();
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(ZoneOffset.ofHours(9));
	}

	private JdbcTemplate jdbcTemplate() {
		if (this.jdbcTemplateProvider == null) {
			return null;
		}
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	private void loadFallbackFile() {
		if (this.fallbackFile == null || !Files.exists(this.fallbackFile)) {
			return;
		}
		try {
			for (String line : Files.readAllLines(this.fallbackFile, StandardCharsets.UTF_8)) {
				if (!line.isBlank()) {
					WearablePairingSession session = deserialize(line);
					SESSIONS.put(session.pairingSessionId(), session);
				}
			}
		} catch (IOException | IllegalArgumentException ignored) {
		}
	}

	private void writeFallbackFile() {
		if (this.fallbackFile == null) {
			return;
		}
		try {
			Path parent = this.fallbackFile.getParent();
			if (parent != null) {
				Files.createDirectories(parent);
			}
			List<String> lines = SESSIONS.values().stream()
				.map(this::serialize)
				.toList();
			Files.write(this.fallbackFile, lines, StandardCharsets.UTF_8);
		} catch (IOException ignored) {
		}
	}

	private String serialize(WearablePairingSession session) {
		return String.join(
			"\t",
			encode(session.pairingSessionId()),
			encode(session.deviceId()),
			encode(session.deviceName()),
			encode(session.pairingCode()),
			encode(session.nonce()),
			encode(session.issuedAt().toString()),
			encode(session.expiresAt().toString()),
			encode(session.status().name()),
			encode(session.linkedUserId() == null ? "" : session.linkedUserId().toString()),
			encode(linkedDeviceId(session) == null ? "" : linkedDeviceId(session).toString()),
			encode(session.accessToken() == null ? "" : session.accessToken()),
			encode(session.pairedAt() == null ? "" : session.pairedAt().toString()),
			encode(session.unpairedAt() == null ? "" : session.unpairedAt().toString())
		);
	}

	private WearablePairingSession deserialize(String line) {
		String[] fields = line.split("\t", -1);
		Long linkedDeviceId = nullableLong(decode(fields[9]));
		OffsetDateTime pairedAt = nullableOffsetDateTime(decode(fields[11]));
		OffsetDateTime unpairedAt = nullableOffsetDateTime(decode(fields[12]));
		return new WearablePairingSession(
			decode(fields[0]),
			decode(fields[1]),
			decode(fields[2]),
			decode(fields[3]),
			decode(fields[4]),
			OffsetDateTime.parse(decode(fields[5])),
			OffsetDateTime.parse(decode(fields[6])),
			WearablePairingService.PairingStatus.valueOf(decode(fields[7])),
			nullableLong(decode(fields[8])),
			linkedDevice(linkedDeviceId, decode(fields[1]), decode(fields[2]), pairedAt),
			blankToNull(decode(fields[10])),
			pairedAt,
			unpairedAt
		);
	}

	private DeviceService.DeviceSummary linkedDevice(
		Long linkedDeviceId,
		String vendorDeviceId,
		String deviceName,
		OffsetDateTime pairedAt
	) {
		if (linkedDeviceId == null) {
			return null;
		}
		return new DeviceService.DeviceSummary(
			linkedDeviceId,
			deviceName,
			DeviceType.WEARABLE,
			ConnectionStatus.CONNECTED,
			false,
			pairedAt,
			DEFAULT_VENDOR,
			vendorDeviceId,
			true
		);
	}

	private Long nullableLong(String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		return Long.parseLong(value);
	}

	private OffsetDateTime nullableOffsetDateTime(String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		return OffsetDateTime.parse(value);
	}

	private String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value;
	}

	private String encode(String value) {
		return Base64.getUrlEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
	}

	private String decode(String value) {
		return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
	}
}
