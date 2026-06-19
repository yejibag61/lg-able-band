package com.lgableband.guardian;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.lgableband.auth.MvpDataService;
import com.lgableband.common.ApiException;
import com.lgableband.common.AccountRole;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.mock.MockDataStore;
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
public class GuardianService {
	private static final ZoneOffset SERVICE_OFFSET = ZoneOffset.ofHours(9);

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final MvpDataService dataService;
	private final MockDataStore mockDataStore;

	public GuardianService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		MvpDataService dataService,
		MockDataStore mockDataStore
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.dataService = dataService;
		this.mockDataStore = mockDataStore;
	}

	public GuardianListResponse guardians(String authorization) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return new GuardianListResponse(this.mockDataStore.guardians(user.userId()).stream()
				.map(this::toSummary)
				.toList());
		}

		return new GuardianListResponse(jdbcTemplate.query(
			"""
			SELECT g.guardian_id, g.name, g.phone, ug.is_primary, ug.notify_on_danger
			FROM user_guardian ug
			JOIN guardian g ON g.guardian_id = ug.guardian_id
			WHERE ug.user_id = ?
			ORDER BY ug.is_primary DESC, ug.map_id ASC
			""",
			(rs, rowNum) -> new GuardianSummary(
				rs.getLong("guardian_id"),
				rs.getString("name"),
				rs.getString("phone"),
				rs.getBoolean("is_primary"),
				rs.getBoolean("notify_on_danger"),
				ConnectionStatus.CONNECTED
			),
			user.userId()
		));
	}

	public GuardianSummary addGuardian(String authorization, GuardianController.GuardianRequest request) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			MockDataStore.Guardian guardian = this.mockDataStore.addGuardian(
				user.userId(),
				request.name(),
				request.phone(),
				request.isPrimary(),
				request.notifyOnDanger()
			);
			return toSummary(guardian);
		}

		if (request.isPrimary()) {
			clearPrimaryGuardian(jdbcTemplate, user.userId());
		}

		long guardianId = insertGuardian(jdbcTemplate, request);
		jdbcTemplate.update(
			"INSERT INTO user_guardian (user_id, guardian_id, is_primary, notify_on_danger) VALUES (?, ?, ?, ?)",
			user.userId(),
			guardianId,
			request.isPrimary(),
			request.notifyOnDanger()
		);
		return guardian(jdbcTemplate, user.userId(), guardianId);
	}

	public GuardianDashboardResponse dashboard(String authorization) {
		MvpDataService.CurrentGuardian guardian = this.dataService.currentGuardian(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			if (guardian.linkedUserId() == null) {
				throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "?곌껐???ъ슜?먮? 李얠쓣 ???놁뒿?덈떎.");
			}
			long linkedUserId = guardian.linkedUserId();
			MockDataStore.UserProfile user = this.mockDataStore.user(linkedUserId);
			MockDataStore.Account account = this.mockDataStore.accountById(user.accountId());
			List<GuardianAlertSummary> alerts = this.mockDataStore.alerts(linkedUserId, null, null, 20).stream()
				.filter(this::isGuardianImportantAlert)
				.map(alert -> new GuardianAlertSummary(
					alert.alertId(),
					alert.type().name(),
					alert.severity().name(),
					alert.title(),
					alert.message(),
					alert.deviceName(),
					alert.occurredAt(),
					alert.status().name()
				))
				.toList();
			List<GuardianEmergencySummary> emergencies = this.mockDataStore.emergencies(linkedUserId).stream()
				.map(request -> new GuardianEmergencySummary(
					request.emergencyRequestId(),
					null,
					request.status(),
					request.message(),
					request.source(),
					request.sentAt(),
					request.guardianNotified()
				))
				.toList();

			return new GuardianDashboardResponse(
				new GuardianUserSummary(linkedUserId, account.name(), user.accessibilityType().name()),
				alerts,
				emergencies,
				createDashboardSummary(alerts, emergencies)
			);
		}

		long linkedUserId = linkedUserId(jdbcTemplate, guardian.guardianId());
		GuardianUserSummary user = guardianUser(jdbcTemplate, linkedUserId);
		List<GuardianAlertSummary> alerts = guardianAlerts(jdbcTemplate, linkedUserId, guardian.guardianId());
		List<GuardianEmergencySummary> emergencies = guardianEmergencies(jdbcTemplate, linkedUserId, guardian.guardianId());
		return new GuardianDashboardResponse(user, alerts, emergencies, createDashboardSummary(alerts, emergencies));
	}

	public GuardianSummary linkGuardianByEmail(String authorization, GuardianController.GuardianEmailLinkRequest request) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return toSummary(this.mockDataStore.linkGuardianByEmail(
				user.userId(),
				request.email().trim(),
				request.isPrimary(),
				request.notifyOnDanger()
			));
		}

		DbGuardianAccount guardianAccount = findGuardianAccountByEmail(jdbcTemplate, request.email().trim());
		Long duplicatedCount = jdbcTemplate.queryForObject(
			"SELECT COUNT(*) FROM user_guardian WHERE user_id = ? AND guardian_id = ?",
			Long.class,
			user.userId(),
			guardianAccount.guardianId()
		);
		if (duplicatedCount != null && duplicatedCount > 0) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATED_GUARDIAN", "이미 연결된 보호자입니다.");
		}
		if (request.isPrimary()) {
			clearPrimaryGuardian(jdbcTemplate, user.userId());
		}

		jdbcTemplate.update(
			"INSERT INTO user_guardian (user_id, guardian_id, is_primary, notify_on_danger) VALUES (?, ?, ?, ?)",
			user.userId(),
			guardianAccount.guardianId(),
			request.isPrimary(),
			request.notifyOnDanger()
		);
		return guardian(jdbcTemplate, user.userId(), guardianAccount.guardianId());
	}

	public GuardianSummary updateGuardian(String authorization, long guardianId, GuardianController.GuardianRequest request) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return toSummary(this.mockDataStore.updateGuardian(
				user.userId(),
				guardianId,
				request.name(),
				request.phone(),
				request.isPrimary(),
				request.notifyOnDanger()
			));
		}

		ensureGuardianLinked(jdbcTemplate, user.userId(), guardianId);
		if (request.isPrimary()) {
			clearPrimaryGuardian(jdbcTemplate, user.userId());
		}
		jdbcTemplate.update(
			"UPDATE guardian SET name = ?, phone = ? WHERE guardian_id = ?",
			request.name(),
			request.phone(),
			guardianId
		);
		jdbcTemplate.update(
			"UPDATE user_guardian SET is_primary = ?, notify_on_danger = ? WHERE user_id = ? AND guardian_id = ?",
			request.isPrimary(),
			request.notifyOnDanger(),
			user.userId(),
			guardianId
		);
		return guardian(jdbcTemplate, user.userId(), guardianId);
	}

	public void deleteGuardian(String authorization, long guardianId) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			this.mockDataStore.deleteGuardian(user.userId(), guardianId);
			return;
		}

		ensureGuardianLinked(jdbcTemplate, user.userId(), guardianId);
		jdbcTemplate.update(
			"DELETE FROM user_guardian WHERE user_id = ? AND guardian_id = ?",
			user.userId(),
			guardianId
		);
		jdbcTemplate.update(
			"""
			DELETE FROM guardian
			WHERE guardian_id = ?
			  AND account_id IS NULL
			  AND NOT EXISTS (SELECT 1 FROM user_guardian WHERE guardian_id = ?)
			""",
			guardianId,
			guardianId
		);
	}

	private long insertGuardian(JdbcTemplate jdbcTemplate, GuardianController.GuardianRequest request) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"INSERT INTO guardian (name, phone, relationship) VALUES (?, ?, ?)",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setString(1, request.name());
			ps.setString(2, request.phone());
			ps.setString(3, "FAMILY");
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private DbGuardianAccount findGuardianAccountByEmail(JdbcTemplate jdbcTemplate, String email) {
		return jdbcTemplate.query(
			"""
			SELECT g.guardian_id, g.name, g.phone
			FROM account a
			JOIN guardian g ON g.account_id = a.account_id
			WHERE a.role = ? AND LOWER(a.email) = LOWER(?)
			""",
			(rs, rowNum) -> new DbGuardianAccount(
				rs.getLong("guardian_id"),
				rs.getString("name"),
				rs.getString("phone")
			),
			AccountRole.GUARDIAN.name(),
			email
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "해당 이메일의 보호자 계정을 찾을 수 없습니다."));
	}

	private boolean isGuardianImportantAlert(MockDataStore.Alert alert) {
		return "DANGER".equals(alert.type().name())
			|| "EMERGENCY".equals(alert.type().name())
			|| "HIGH".equals(alert.severity().name())
			|| "CRITICAL".equals(alert.severity().name());
	}

	private long linkedUserId(JdbcTemplate jdbcTemplate, long guardianId) {
		return jdbcTemplate.query(
			"SELECT user_id FROM user_guardian WHERE guardian_id = ? ORDER BY map_id ASC LIMIT 1",
			(rs, rowNum) -> rs.getLong("user_id"),
			guardianId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "연결된 사용자를 찾을 수 없습니다."));
	}

	private GuardianUserSummary guardianUser(JdbcTemplate jdbcTemplate, long userId) {
		return jdbcTemplate.query(
			"SELECT user_id, name, accessibility_type FROM app_user WHERE user_id = ?",
			(rs, rowNum) -> new GuardianUserSummary(
				rs.getLong("user_id"),
				rs.getString("name"),
				rs.getString("accessibility_type")
			),
			userId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "사용자를 찾을 수 없습니다."));
	}

	private List<GuardianAlertSummary> guardianAlerts(JdbcTemplate jdbcTemplate, long userId, long guardianId) {
		return jdbcTemplate.query(
			"""
			SELECT a.alert_id, a.alert_type, a.severity, a.title, a.message, a.occurred_at, a.status,
			       COALESCE(d.name, '') AS device_name
			FROM alert a
			JOIN alert_delivery ad ON ad.alert_id = a.alert_id AND ad.target_guardian_id = ?
			LEFT JOIN device_event de ON de.event_id = a.event_id
			LEFT JOIN device d ON d.device_id = de.device_id
			WHERE a.user_id = ?
			  AND (a.alert_type IN ('DANGER', 'EMERGENCY') OR a.severity IN ('HIGH', 'CRITICAL'))
			ORDER BY a.occurred_at DESC, a.alert_id DESC
			LIMIT 20
			""",
			(rs, rowNum) -> new GuardianAlertSummary(
				rs.getLong("alert_id"),
				rs.getString("alert_type"),
				rs.getString("severity"),
				rs.getString("title"),
				rs.getString("message"),
				rs.getString("device_name"),
				toOffsetDateTime(rs.getObject("occurred_at", LocalDateTime.class)),
				rs.getString("status")
			),
			guardianId,
			userId
		);
	}

	private List<GuardianEmergencySummary> guardianEmergencies(JdbcTemplate jdbcTemplate, long userId, long guardianId) {
		return jdbcTemplate.query(
			"""
			SELECT er.emergency_id,
			       er.alert_id,
			       CASE
			         WHEN er.status NOT IN ('RESOLVED', 'CANCELED') AND a.status = 'CONFIRMED' THEN 'RESOLVED'
			         ELSE er.status
			       END AS status,
			       er.message,
			       er.source,
			       er.requested_at
			FROM emergency_request er
			JOIN alert_delivery ad ON ad.alert_id = er.alert_id AND ad.target_guardian_id = ?
			LEFT JOIN alert a ON a.alert_id = er.alert_id AND a.user_id = er.user_id
			WHERE er.user_id = ?
			ORDER BY CASE
			    WHEN er.status NOT IN ('RESOLVED', 'CANCELED')
			      AND (a.status IS NULL OR a.status <> 'CONFIRMED') THEN 0
			    ELSE 1
			  END,
			  er.requested_at DESC,
			  er.emergency_id DESC
			LIMIT 10
			""",
			(rs, rowNum) -> new GuardianEmergencySummary(
				rs.getLong("emergency_id"),
				nullableLong(rs, "alert_id"),
				rs.getString("status"),
				rs.getString("message"),
				rs.getString("source"),
				toOffsetDateTime(rs.getObject("requested_at", LocalDateTime.class)),
				true
			),
			guardianId,
			userId
		);
	}

	private Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
		long value = rs.getLong(column);
		return rs.wasNull() ? null : value;
	}

	private GuardianDashboardSummary createDashboardSummary(
		List<GuardianAlertSummary> alerts,
		List<GuardianEmergencySummary> emergencies
	) {
		long unreadAlerts = alerts.stream().filter(alert -> "UNREAD".equals(alert.status())).count();
		boolean activeEmergency = emergencies.stream()
			.anyMatch(request -> !"RESOLVED".equals(request.status()) && !"CANCELED".equals(request.status()));
		String safetyMessage = activeEmergency
			? "긴급 도움 요청이 진행 중입니다."
			: unreadAlerts > 0 ? "확인하지 않은 위험 알림이 있습니다." : "현재 확인 필요한 위험 알림은 없습니다.";
		return new GuardianDashboardSummary(unreadAlerts, emergencies.size(), activeEmergency, safetyMessage);
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(SERVICE_OFFSET);
	}

	private GuardianSummary guardian(JdbcTemplate jdbcTemplate, long userId, long guardianId) {
		return jdbcTemplate.query(
			"""
			SELECT g.guardian_id, g.name, g.phone, ug.is_primary, ug.notify_on_danger
			FROM user_guardian ug
			JOIN guardian g ON g.guardian_id = ug.guardian_id
			WHERE ug.user_id = ? AND ug.guardian_id = ?
			""",
			(rs, rowNum) -> new GuardianSummary(
				rs.getLong("guardian_id"),
				rs.getString("name"),
				rs.getString("phone"),
				rs.getBoolean("is_primary"),
				rs.getBoolean("notify_on_danger"),
				ConnectionStatus.CONNECTED
			),
			userId,
			guardianId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자를 찾을 수 없습니다."));
	}

	private void ensureGuardianLinked(JdbcTemplate jdbcTemplate, long userId, long guardianId) {
		Long count = jdbcTemplate.queryForObject(
			"SELECT COUNT(*) FROM user_guardian WHERE user_id = ? AND guardian_id = ?",
			Long.class,
			userId,
			guardianId
		);
		if (count == null || count == 0) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자를 찾을 수 없습니다.");
		}
	}

	private void clearPrimaryGuardian(JdbcTemplate jdbcTemplate, long userId) {
		jdbcTemplate.update("UPDATE user_guardian SET is_primary = FALSE WHERE user_id = ?", userId);
	}

	private GuardianSummary toSummary(MockDataStore.Guardian guardian) {
		return new GuardianSummary(
			guardian.guardianId(),
			guardian.name(),
			guardian.phone(),
			guardian.isPrimary(),
			guardian.notifyOnDanger(),
			guardian.connectionStatus()
		);
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	public record GuardianListResponse(List<GuardianSummary> items) {
	}

	public record GuardianDashboardResponse(
		GuardianUserSummary user,
		List<GuardianAlertSummary> dangerAlerts,
		List<GuardianEmergencySummary> emergencyRequests,
		GuardianDashboardSummary summary
	) {
	}

	public record GuardianUserSummary(long userId, String name, String accessibilityType) {
	}

	public record GuardianAlertSummary(
		long alertId,
		String type,
		String severity,
		String title,
		String message,
		String deviceName,
		OffsetDateTime occurredAt,
		String status
	) {
	}

	public record GuardianEmergencySummary(
		long emergencyRequestId,
		Long alertId,
		String status,
		String message,
		String source,
		OffsetDateTime sentAt,
		boolean guardianNotified
	) {
	}

	public record GuardianDashboardSummary(
		long unreadDangerAlertCount,
		long emergencyRequestCount,
		boolean activeEmergency,
		String safetyMessage
	) {
	}

	public record GuardianSummary(
		long guardianId,
		String name,
		String phone,
		@JsonProperty("isPrimary") boolean primary,
		boolean notifyOnDanger,
		ConnectionStatus connectionStatus
	) {
	}

	private record DbGuardianAccount(long guardianId, String name, String phone) {
	}
}
