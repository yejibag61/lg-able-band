package com.lgableband.emergency;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.ApiException;
import com.lgableband.guardian.GuardianLiveAlertService;
import com.lgableband.mock.MockDataStore;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Duration;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class EmergencyService {

	private static final ZoneOffset SERVICE_OFFSET = ZoneOffset.ofHours(9);

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final ObjectProvider<PlatformTransactionManager> transactionManagerProvider;
	private final MvpDataService dataService;
	private final MockDataStore mockDataStore;
	private final GuardianLiveAlertService guardianLiveAlertService;
	private final Duration duplicateCooldown;
	private final Clock clock;

	public EmergencyService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		ObjectProvider<PlatformTransactionManager> transactionManagerProvider,
		MvpDataService dataService,
		MockDataStore mockDataStore,
		GuardianLiveAlertService guardianLiveAlertService,
		@Value("${app.emergency.cooldown-seconds:10}") long duplicateCooldownSeconds,
		ObjectProvider<Clock> clockProvider
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.transactionManagerProvider = transactionManagerProvider;
		this.dataService = dataService;
		this.mockDataStore = mockDataStore;
		this.guardianLiveAlertService = guardianLiveAlertService;
		this.duplicateCooldown = Duration.ofSeconds(duplicateCooldownSeconds);
		this.clock = clockProvider.getIfAvailable(() -> Clock.system(SERVICE_OFFSET));
	}

	public EmergencyRequestSummary create(String authorization, EmergencyController.EmergencyRequestBody request) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			rejectDuplicateMockEmergency(user.userId(), request.source());
			EmergencyRequestSummary summary = toSummary(this.mockDataStore.createEmergency(user.userId(), request.message(), request.source()));
			publishLiveEmergency(summary, null);
			return summary;
		}

		rejectDuplicateDbEmergency(jdbcTemplate, user.userId(), request.source());
		List<GuardianTarget> guardians = guardianTargets(jdbcTemplate, user.userId(), null);
		if (guardians.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "NO_GUARDIAN", "등록된 보호자가 없습니다.");
		}

		PlatformTransactionManager transactionManager = this.transactionManagerProvider.getIfAvailable();
		EmergencyRequestSummary summary;
		if (transactionManager == null) {
			summary = createDbEmergency(jdbcTemplate, user.userId(), request, guardians);
		}
		else {
			summary = new TransactionTemplate(transactionManager)
				.execute(status -> createDbEmergency(jdbcTemplate, user.userId(), request, guardians));
		}
		publishLiveEmergency(summary, null);
		return summary;
	}

	public EmergencyRequestListResponse list(String authorization) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return new EmergencyRequestListResponse(this.mockDataStore.emergencies(user.userId()).stream()
				.map(this::toSummary)
				.toList());
		}

		return new EmergencyRequestListResponse(jdbcTemplate.query(
			"""
			SELECT emergency_id, alert_id, status, message, source, requested_at
			FROM emergency_request
			WHERE user_id = ?
			ORDER BY requested_at DESC, emergency_id DESC
			""",
			(rs, rowNum) -> new EmergencyRow(
				rs.getLong("emergency_id"),
				nullableLong(rs, "alert_id"),
				rs.getString("status"),
				rs.getString("message"),
				rs.getString("source"),
				toOffsetDateTime(rs.getObject("requested_at", LocalDateTime.class))
			),
			user.userId()
		).stream()
			.map(row -> toSummary(jdbcTemplate, user.userId(), row))
			.toList());
	}

	public EmergencyRequestSummary detail(String authorization, long emergencyRequestId) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return toSummary(this.mockDataStore.emergency(user.userId(), emergencyRequestId));
		}

		return toSummary(jdbcTemplate, user.userId(), emergencyRow(jdbcTemplate, user.userId(), emergencyRequestId));
	}

	public EmergencyRequestSummary updateStatus(String authorization, long emergencyRequestId, String status) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return toSummary(this.mockDataStore.updateEmergencyStatus(user.userId(), emergencyRequestId, status));
		}

		EmergencyRow current = emergencyRow(jdbcTemplate, user.userId(), emergencyRequestId);
		jdbcTemplate.update(
			"UPDATE emergency_request SET status = ? WHERE user_id = ? AND emergency_id = ?",
			status,
			user.userId(),
			emergencyRequestId
		);
		if (current.alertId() != null && isTerminalStatus(status)) {
			jdbcTemplate.update(
				"UPDATE alert SET status = 'CONFIRMED' WHERE alert_id = ? AND user_id = ?",
				current.alertId(),
				user.userId()
			);
		}
		return detail(authorization, emergencyRequestId);
	}

	private boolean isTerminalStatus(String status) {
		return "RESOLVED".equals(status) || "CANCELED".equals(status);
	}

	private EmergencyRequestSummary createDbEmergency(
		JdbcTemplate jdbcTemplate,
		long userId,
		EmergencyController.EmergencyRequestBody request,
		List<GuardianTarget> guardians
	) {
		LocalDateTime now = LocalDateTime.ofInstant(this.clock.instant(), SERVICE_OFFSET);
		long alertId = insertEmergencyAlert(jdbcTemplate, userId, request.message(), now);
		long emergencyId = insertEmergencyRequest(jdbcTemplate, userId, alertId, request, now);
		for (GuardianTarget guardian : guardians) {
			insertAlertDelivery(jdbcTemplate, alertId, guardian.guardianId(), now);
		}
		return new EmergencyRequestSummary(
			emergencyId,
			"SENT",
			request.message(),
			request.source(),
			toOffsetDateTime(now),
			true,
			guardianTargets(jdbcTemplate, userId, alertId)
		);
	}

	private void publishLiveEmergency(EmergencyRequestSummary summary, Long fallbackAlertId) {
		this.guardianLiveAlertService.publishEmergency(
			summary.guardianTargets(),
			fallbackAlertId == null ? 0L : fallbackAlertId,
			summary.emergencyRequestId(),
			summary.message(),
			summary.source(),
			summary.sentAt()
		);
	}

	private long insertEmergencyAlert(JdbcTemplate jdbcTemplate, long userId, String message, LocalDateTime now) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO alert (
					user_id, alert_type, severity, title, message, voice_guide, status, occurred_at
				) VALUES (?, 'EMERGENCY', 'CRITICAL', ?, ?, ?, 'ESCALATED', ?)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, userId);
			ps.setString(2, "긴급 도움 요청");
			ps.setString(3, message);
			ps.setString(4, "보호자에게 긴급 요청을 보냈습니다.");
			ps.setObject(5, now);
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private long insertEmergencyRequest(
		JdbcTemplate jdbcTemplate,
		long userId,
		long alertId,
		EmergencyController.EmergencyRequestBody request,
		LocalDateTime now
	) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO emergency_request (user_id, alert_id, message, source, status, requested_at)
				VALUES (?, ?, ?, ?, 'SENT', ?)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, userId);
			ps.setLong(2, alertId);
			ps.setString(3, request.message());
			ps.setString(4, request.source());
			ps.setObject(5, now);
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private void insertAlertDelivery(JdbcTemplate jdbcTemplate, long alertId, long guardianId, LocalDateTime now) {
		jdbcTemplate.update(
			"""
			INSERT INTO alert_delivery (alert_id, channel, target_guardian_id, delivery_status, delivered_at)
			VALUES (?, 'PUSH', ?, 'SENT', ?)
			""",
			alertId,
			guardianId,
			now
		);
	}

	private EmergencyRow emergencyRow(JdbcTemplate jdbcTemplate, long userId, long emergencyRequestId) {
		return jdbcTemplate.query(
			"""
			SELECT emergency_id, alert_id, status, message, source, requested_at
			FROM emergency_request
			WHERE user_id = ? AND emergency_id = ?
			""",
			(rs, rowNum) -> new EmergencyRow(
				rs.getLong("emergency_id"),
				nullableLong(rs, "alert_id"),
				rs.getString("status"),
				rs.getString("message"),
				rs.getString("source"),
				toOffsetDateTime(rs.getObject("requested_at", LocalDateTime.class))
			),
			userId,
			emergencyRequestId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "긴급 요청을 찾을 수 없습니다."));
	}

	private EmergencyRequestSummary toSummary(JdbcTemplate jdbcTemplate, long userId, EmergencyRow row) {
		List<GuardianTarget> targets = guardianTargets(jdbcTemplate, userId, row.alertId());
		return new EmergencyRequestSummary(
			row.emergencyRequestId(),
			row.status(),
			row.message(),
			row.source(),
			row.sentAt(),
			!targets.isEmpty(),
			targets
		);
	}

	private List<GuardianTarget> guardianTargets(JdbcTemplate jdbcTemplate, long userId, Long alertId) {
		if (alertId == null) {
			return jdbcTemplate.query(
				"""
				SELECT g.guardian_id, g.name, 'SENT' AS delivery_status
				FROM user_guardian ug
				JOIN guardian g ON g.guardian_id = ug.guardian_id
				WHERE ug.user_id = ?
				ORDER BY ug.is_primary DESC, ug.map_id ASC
				""",
				(rs, rowNum) -> new GuardianTarget(
					rs.getLong("guardian_id"),
					rs.getString("name"),
					rs.getString("delivery_status")
				),
				userId
			);
		}
		return jdbcTemplate.query(
			"""
			SELECT g.guardian_id, g.name, ad.delivery_status
			FROM alert_delivery ad
			JOIN guardian g ON g.guardian_id = ad.target_guardian_id
			JOIN user_guardian ug ON ug.guardian_id = g.guardian_id AND ug.user_id = ?
			WHERE ad.alert_id = ?
			ORDER BY ug.is_primary DESC, ug.map_id ASC
			""",
			(rs, rowNum) -> new GuardianTarget(
				rs.getLong("guardian_id"),
				rs.getString("name"),
				rs.getString("delivery_status")
			),
			userId,
			alertId
		);
	}

	private EmergencyRequestSummary toSummary(MockDataStore.EmergencyRequest request) {
		return new EmergencyRequestSummary(
			request.emergencyRequestId(),
			request.status(),
			request.message(),
			request.source(),
			request.sentAt(),
			request.guardianNotified(),
			request.guardianTargets().stream()
				.map(guardian -> new GuardianTarget(guardian.guardianId(), guardian.name(), "SENT"))
				.toList()
		);
	}

	private void rejectDuplicateMockEmergency(long userId, String source) {
		OffsetDateTime cutoff = OffsetDateTime.now(this.clock).minus(this.duplicateCooldown);
		boolean duplicated = this.mockDataStore.emergencies(userId).stream()
			.filter(request -> "SENT".equals(request.status()) || "ACKNOWLEDGED".equals(request.status()))
			.filter(request -> source.equals(request.source()))
			.anyMatch(request -> !request.sentAt().isBefore(cutoff));
		if (duplicated) {
			throw duplicateEmergencyException();
		}
	}

	private void rejectDuplicateDbEmergency(JdbcTemplate jdbcTemplate, long userId, String source) {
		LocalDateTime cutoff = LocalDateTime.ofInstant(this.clock.instant(), SERVICE_OFFSET).minus(this.duplicateCooldown);
		Integer activeCount = jdbcTemplate.queryForObject(
			"""
			SELECT COUNT(*)
			FROM emergency_request
			WHERE user_id = ?
			  AND source = ?
			  AND status IN ('SENT', 'ACKNOWLEDGED')
			  AND requested_at >= ?
			""",
			Integer.class,
			userId,
			source,
			cutoff
		);
		if (activeCount != null && activeCount > 0) {
			throw duplicateEmergencyException();
		}
	}

	private ApiException duplicateEmergencyException() {
		return new ApiException(
			HttpStatus.CONFLICT,
			"EMERGENCY_DUPLICATE_COOLDOWN",
			"최근 긴급 요청이 처리 중입니다. 잠시 후 다시 시도해주세요."
		);
	}

	private Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
		long value = rs.getLong(column);
		return rs.wasNull() ? null : value;
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(SERVICE_OFFSET);
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	public record EmergencyRequestListResponse(List<EmergencyRequestSummary> items) {
	}

	public record EmergencyRequestSummary(
		long emergencyRequestId,
		String status,
		String message,
		String source,
		OffsetDateTime sentAt,
		boolean guardianNotified,
		List<GuardianTarget> guardianTargets
	) {
	}

	public record GuardianTarget(long guardianId, String name, String deliveryStatus) {
	}

	private record EmergencyRow(
		long emergencyRequestId,
		Long alertId,
		String status,
		String message,
		String source,
		OffsetDateTime sentAt
	) {
	}
}
