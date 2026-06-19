package com.lgableband.alert;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AlertStatus;
import com.lgableband.common.AlertType;
import com.lgableband.common.ApiException;
import com.lgableband.common.DeviceType;
import com.lgableband.common.Severity;
import com.lgableband.mock.MockDataStore;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AlertService {

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final ObjectProvider<PlatformTransactionManager> transactionManagerProvider;
	private final MvpDataService dataService;
	private final MockDataStore mockDataStore;

	public AlertService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		ObjectProvider<PlatformTransactionManager> transactionManagerProvider,
		MvpDataService dataService,
		MockDataStore mockDataStore
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.transactionManagerProvider = transactionManagerProvider;
		this.dataService = dataService;
		this.mockDataStore = mockDataStore;
	}

	public List<AlertView> alerts(String authorization, AlertType type, AlertStatus status, int limit) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			return this.mockDataStore.alerts(user.userId(), type, status, limit).stream()
				.map(this::fromMockAlert)
				.toList();
		}

		StringBuilder sql = new StringBuilder("""
			SELECT a.alert_id,
			       a.alert_type,
			       a.severity,
			       a.title,
			       a.message,
			       COALESCE(a.voice_guide, a.message) AS voice_guide,
			       a.status,
			       a.occurred_at,
			       d.device_id,
			       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.deviceName')), d.name, '') AS device_name,
			       d.device_type,
			       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.locationName')), '') AS location_name,
			       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.recommendedAction')), '') AS recommended_action,
			       JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.requiresGuardianNotify')) AS guardian_notify_override,
			       EXISTS (
			         SELECT 1
			         FROM alert_delivery ad
			         WHERE ad.alert_id = a.alert_id
			       ) AS has_delivery
			FROM alert a
			LEFT JOIN device_event de ON de.event_id = a.event_id
			LEFT JOIN device d ON d.device_id = de.device_id
			WHERE a.user_id = ?
			""");
		List<Object> args = new ArrayList<>();
		args.add(user.userId());

		if (type != null) {
			sql.append(" AND a.alert_type = ?");
			args.add(type.name());
		}

		if (status != null) {
			sql.append(" AND a.status = ?");
			args.add(status.name());
		}

		sql.append(" ORDER BY a.occurred_at DESC, a.alert_id DESC LIMIT ?");
		args.add(limit);

		return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> {
			DeviceType deviceType = enumOrNull(DeviceType.class, rs.getString("device_type"));
			String deviceName = rs.getString("device_name");
			return new AlertView(
				rs.getLong("alert_id"),
				AlertType.valueOf(rs.getString("alert_type")),
				Severity.valueOf(rs.getString("severity")),
				rs.getString("title"),
				rs.getString("message"),
				rs.getString("voice_guide"),
				rs.getObject("device_id") == null
					? null
					: new DeviceInfo(
						rs.getLong("device_id"),
						deviceName,
						deviceType
					),
				deviceName,
				fallbackLocation(rs.getString("location_name"), deviceType),
				toOffsetDateTime(rs.getObject("occurred_at", LocalDateTime.class)),
				AlertStatus.valueOf(rs.getString("status")),
				recommendedAction(
					rs.getString("recommended_action"),
					AlertType.valueOf(rs.getString("alert_type")),
					Severity.valueOf(rs.getString("severity")),
					deviceType
				),
				rs.getBoolean("has_delivery") || requiresGuardianNotify(
					rs.getString("guardian_notify_override"),
					AlertType.valueOf(rs.getString("alert_type")),
					Severity.valueOf(rs.getString("severity"))
				)
			);
		}, args.toArray());
	}

	public AlertView alert(String authorization, long alertId) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			return fromMockAlert(this.mockDataStore.alert(user.userId(), alertId));
		}

		List<AlertView> items = jdbcTemplate.query(
			"""
			SELECT a.alert_id,
			       a.alert_type,
			       a.severity,
			       a.title,
			       a.message,
			       COALESCE(a.voice_guide, a.message) AS voice_guide,
			       a.status,
			       a.occurred_at,
			       d.device_id,
			       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.deviceName')), d.name, '') AS device_name,
			       d.device_type,
			       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.locationName')), '') AS location_name,
			       COALESCE(JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.recommendedAction')), '') AS recommended_action,
			       JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.requiresGuardianNotify')) AS guardian_notify_override,
			       EXISTS (
			         SELECT 1
			         FROM alert_delivery ad
			         WHERE ad.alert_id = a.alert_id
			       ) AS has_delivery
			FROM alert a
			LEFT JOIN device_event de ON de.event_id = a.event_id
			LEFT JOIN device d ON d.device_id = de.device_id
			WHERE a.user_id = ? AND a.alert_id = ?
			""",
			(rs, rowNum) -> {
				DeviceType deviceType = enumOrNull(DeviceType.class, rs.getString("device_type"));
				String deviceName = rs.getString("device_name");
				AlertType alertType = AlertType.valueOf(rs.getString("alert_type"));
				Severity severity = Severity.valueOf(rs.getString("severity"));
				return new AlertView(
					rs.getLong("alert_id"),
					alertType,
					severity,
					rs.getString("title"),
					rs.getString("message"),
					rs.getString("voice_guide"),
					rs.getObject("device_id") == null
						? null
						: new DeviceInfo(
							rs.getLong("device_id"),
							deviceName,
							deviceType
						),
					deviceName,
					fallbackLocation(rs.getString("location_name"), deviceType),
					toOffsetDateTime(rs.getObject("occurred_at", LocalDateTime.class)),
					AlertStatus.valueOf(rs.getString("status")),
					recommendedAction(rs.getString("recommended_action"), alertType, severity, deviceType),
					rs.getBoolean("has_delivery")
						|| requiresGuardianNotify(rs.getString("guardian_notify_override"), alertType, severity)
				);
			},
			user.userId(),
			alertId
		);

		if (items.isEmpty()) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "알림을 찾을 수 없습니다.");
		}

		return items.getFirst();
	}

	public StatusResponse confirm(String authorization, long alertId) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		AlertConfirmPrincipal principal = confirmPrincipal(authorization);
		OffsetDateTime confirmedAt = OffsetDateTime.now();

		if (jdbcTemplate == null) {
			MockDataStore.Alert updated = this.mockDataStore.confirmAlert(principal.userId(), alertId);
			return new StatusResponse(updated.alertId(), updated.status(), confirmedAt, null);
		}

		return inTransaction(() -> {
			int updatedRows = jdbcTemplate.update(
				"""
				UPDATE alert
				SET status = ?, updated_at = ?
				WHERE alert_id = ? AND user_id = ?
				  AND (
				    ? IS NULL
				    OR EXISTS (
				      SELECT 1
				      FROM alert_delivery ad
				      WHERE ad.alert_id = alert.alert_id
				        AND ad.target_guardian_id = ?
				    )
				  )
				""",
				AlertStatus.CONFIRMED.name(),
				Timestamp.valueOf(confirmedAt.toLocalDateTime()),
				alertId,
				principal.userId(),
				principal.guardianId(),
				principal.guardianId()
			);

			if (updatedRows == 0) {
				throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "알림을 찾을 수 없습니다.");
			}

			confirmAlertDelivery(jdbcTemplate, alertId, principal.guardianId(), confirmedAt);

			resolveLinkedEmergencyRequests(jdbcTemplate, principal.userId(), alertId);

			return new StatusResponse(alertId, AlertStatus.CONFIRMED, confirmedAt, null);
		});
	}

	public StatusResponse replay(String authorization, long alertId) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		OffsetDateTime replayedAt = OffsetDateTime.now();

		if (jdbcTemplate == null) {
			MockDataStore.Alert updated = this.mockDataStore.replayAlert(user.userId(), alertId);
			return new StatusResponse(
				updated.alertId(),
				updated.status(),
				null,
				ReplayPayload.of(updated.voiceGuide(), replayedAt)
			);
		}

		AlertView current = alert(authorization, alertId);

		jdbcTemplate.update(
			"""
			UPDATE alert
			SET status = ?, updated_at = ?
			WHERE alert_id = ? AND user_id = ?
			""",
			AlertStatus.REPLAYED.name(),
			Timestamp.valueOf(replayedAt.toLocalDateTime()),
			alertId,
			user.userId()
		);

		return new StatusResponse(
			alertId,
			AlertStatus.REPLAYED,
			null,
			ReplayPayload.of(current.voiceGuide(), replayedAt)
		);
	}

	public DeleteResponse delete(String authorization, long alertId) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			this.mockDataStore.deleteAlert(user.userId(), alertId);
			return new DeleteResponse(alertId, true);
		}

		return inTransaction(() -> {
			Integer ownedAlertCount = jdbcTemplate.queryForObject(
				"SELECT COUNT(*) FROM alert WHERE alert_id = ? AND user_id = ?",
				Integer.class,
				alertId,
				user.userId()
			);
			if (ownedAlertCount == null || ownedAlertCount == 0) {
				throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "알림을 찾을 수 없습니다.");
			}

			cancelLinkedEmergencyRequestsBeforeDelete(jdbcTemplate, user.userId(), alertId);
			jdbcTemplate.update("DELETE FROM alert_delivery WHERE alert_id = ?", alertId);
			int deletedRows = jdbcTemplate.update("DELETE FROM alert WHERE alert_id = ? AND user_id = ?", alertId, user.userId());
			return new DeleteResponse(alertId, deletedRows > 0);
		});
	}

	private <T> T inTransaction(Supplier<T> action) {
		PlatformTransactionManager transactionManager = this.transactionManagerProvider.getIfAvailable();
		if (transactionManager == null) {
			return action.get();
		}
		return new TransactionTemplate(transactionManager).execute(status -> action.get());
	}

	private void confirmAlertDelivery(
		JdbcTemplate jdbcTemplate,
		long alertId,
		Long guardianId,
		OffsetDateTime confirmedAt
	) {
		Timestamp confirmedTimestamp = Timestamp.valueOf(confirmedAt.toLocalDateTime());
		if (guardianId == null) {
			jdbcTemplate.update(
				"""
				UPDATE alert_delivery
				SET delivery_status = 'CONFIRMED',
				    confirmed_at = COALESCE(confirmed_at, ?)
				WHERE alert_id = ?
				""",
				confirmedTimestamp,
				alertId
			);
			return;
		}

		jdbcTemplate.update(
			"""
			UPDATE alert_delivery
			SET delivery_status = 'CONFIRMED',
			    confirmed_at = COALESCE(confirmed_at, ?)
			WHERE alert_id = ?
			  AND target_guardian_id = ?
			""",
			confirmedTimestamp,
			alertId,
			guardianId
		);
	}

	private AlertConfirmPrincipal confirmPrincipal(String authorization) {
		try {
			MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
			return new AlertConfirmPrincipal(user.userId(), null);
		}
		catch (ApiException userException) {
			if (userException.getStatus() != HttpStatus.FORBIDDEN && userException.getStatus() != HttpStatus.UNAUTHORIZED) {
				throw userException;
			}
			MvpDataService.CurrentGuardian guardian = this.dataService.currentGuardian(authorization);
			if (guardian.linkedUserId() == null) {
				throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "연결된 사용자를 찾을 수 없습니다.");
			}
			return new AlertConfirmPrincipal(guardian.linkedUserId(), guardian.guardianId());
		}
	}

	private void resolveLinkedEmergencyRequests(JdbcTemplate jdbcTemplate, long userId, long alertId) {
		jdbcTemplate.update(
			"""
			UPDATE emergency_request
			SET status = 'RESOLVED'
			WHERE user_id = ?
			  AND alert_id = ?
			  AND status NOT IN ('RESOLVED', 'CANCELED')
			""",
			userId,
			alertId
		);
	}

	private void cancelLinkedEmergencyRequestsBeforeDelete(JdbcTemplate jdbcTemplate, long userId, long alertId) {
		jdbcTemplate.update(
			"""
			UPDATE emergency_request
			SET status = CASE
			    WHEN status IN ('RESOLVED', 'CANCELED') THEN status
			    ELSE 'CANCELED'
			  END,
			  alert_id = NULL
			WHERE user_id = ?
			  AND alert_id = ?
			""",
			userId,
			alertId
		);
	}

	private AlertView fromMockAlert(MockDataStore.Alert alert) {
		DeviceType deviceType = inferDeviceType(alert.deviceName());
		return new AlertView(
			alert.alertId(),
			alert.type(),
			alert.severity(),
			alert.title(),
			alert.message(),
			alert.voiceGuide() == null || alert.voiceGuide().isBlank() ? alert.message() : alert.voiceGuide(),
			alert.deviceName() == null || alert.deviceName().isBlank()
				? null
				: new DeviceInfo(0, alert.deviceName(), deviceType),
			alert.deviceName(),
			fallbackLocation("", deviceType),
			alert.occurredAt(),
			alert.status(),
			recommendedAction("", alert.type(), alert.severity(), deviceType),
			requiresGuardianNotify(null, alert.type(), alert.severity())
		);
	}

	private boolean requiresGuardianNotify(String override, AlertType type, Severity severity) {
		if (override != null && !override.isBlank()) {
			return Boolean.parseBoolean(override);
		}
		return type == AlertType.DANGER || type == AlertType.EMERGENCY || severity == Severity.HIGH || severity == Severity.CRITICAL;
	}

	private String recommendedAction(String override, AlertType type, Severity severity, DeviceType deviceType) {
		if (override != null && !override.isBlank()) {
			return override;
		}
		if (type == AlertType.EMERGENCY) {
			return "즉시 안전한 곳으로 이동하고 주변에 도움을 요청하세요.";
		}
		if (type == AlertType.DANGER || severity == Severity.HIGH || severity == Severity.CRITICAL) {
			if (deviceType == DeviceType.RANGE) {
				return "전원을 확인하고 열기구 주변에서 잠시 떨어져 주세요.";
			}
			if (deviceType == DeviceType.AIR_SENSOR) {
				return "환기를 진행하고 실내 공기 상태를 다시 확인해 주세요.";
			}
			return "현장을 바로 확인하고 필요하면 보호자에게 연락하세요.";
		}
		if (type == AlertType.LOCATION) {
			return "진동과 음성 안내를 따라 기기 위치로 천천히 이동하세요.";
		}
		return "알림 내용을 확인한 뒤 필요한 생활 동작을 진행해 주세요.";
	}

	private String fallbackLocation(String locationName, DeviceType deviceType) {
		if (locationName != null && !locationName.isBlank()) {
			return locationName;
		}
		if (deviceType == null) {
			return "위치 정보 없음";
		}
		return switch (deviceType) {
			case WASHER -> "세탁실";
			case RANGE, REFRIGERATOR -> "주방";
			case AIR_SENSOR, TV -> "거실";
			case DOOR_SENSOR -> "현관";
			case WEARABLE -> "사용자 주변";
			default -> "기기 위치";
		};
	}

	private DeviceType inferDeviceType(String deviceName) {
		if (deviceName == null) {
			return null;
		}
		if (deviceName.contains("세탁")) {
			return DeviceType.WASHER;
		}
		if (deviceName.contains("공기")) {
			return DeviceType.AIR_SENSOR;
		}
		if (deviceName.contains("냉장")) {
			return DeviceType.REFRIGERATOR;
		}
		if (deviceName.contains("도어") || deviceName.contains("현관")) {
			return DeviceType.DOOR_SENSOR;
		}
		if (deviceName.contains("레인지")) {
			return DeviceType.RANGE;
		}
		return null;
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(ZoneOffset.ofHours(9));
	}

	private <T extends Enum<T>> T enumOrNull(Class<T> enumType, String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		return Enum.valueOf(enumType, value);
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	public record AlertView(
		long alertId,
		AlertType type,
		Severity severity,
		String title,
		String message,
		String voiceGuide,
		DeviceInfo device,
		String deviceName,
		String locationName,
		OffsetDateTime occurredAt,
		AlertStatus status,
		String recommendedAction,
		boolean requiresGuardianNotify
	) {
	}

	public record DeviceInfo(long deviceId, String name, DeviceType type) {
	}

	public record StatusResponse(
		long alertId,
		AlertStatus status,
		OffsetDateTime confirmedAt,
		ReplayPayload replay
	) {
	}

	public record DeleteResponse(long alertId, boolean deleted) {
	}

	private record AlertConfirmPrincipal(long userId, Long guardianId) {
	}

	public record ReplayPayload(String voiceGuide, OffsetDateTime replayedAt) {
		static ReplayPayload of(String voiceGuide, OffsetDateTime replayedAt) {
			return new ReplayPayload(voiceGuide, replayedAt);
		}
	}
}
