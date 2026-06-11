package com.lgableband.auth;

import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.ApiException;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.NotificationChannel;
import com.lgableband.common.SafetyStatusLevel;
import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.Alert;
import com.lgableband.mock.MockDataStore.NotificationPrefs;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

@Service
public class MvpDataService {

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final MockDataStore mockDataStore;
	private final Map<String, SessionPrincipal> dbSessions = new ConcurrentHashMap<>();

	public MvpDataService(ObjectProvider<JdbcTemplate> jdbcTemplateProvider, MockDataStore mockDataStore) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.mockDataStore = mockDataStore;
	}

	public SignupResult signup(
		AccountRole role,
		String name,
		String email,
		String password,
		AccessibilityType accessibilityType,
		NotificationPrefs notificationPrefs,
		String phone,
		String relationship
	) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			MockDataStore.Account account = this.mockDataStore.signup(role, name, email, password, accessibilityType, notificationPrefs, phone, relationship);
			Long userId = role == AccountRole.USER
				? this.mockDataStore.findUserByAccountId(account.accountId()).userId()
				: null;
			return new SignupResult(account.accountId(), role, userId, name, email, accessibilityType);
		}

		Integer duplicated = jdbcTemplate.queryForObject(
			"SELECT COUNT(*) FROM account WHERE role = ? AND email = ?",
			Integer.class,
			role.name(),
			email
		);
		if (duplicated != null && duplicated > 0) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATED_EMAIL", "이미 가입된 이메일입니다.");
		}

		long accountId = insertAccount(jdbcTemplate, role, email, password);
		Long userId = null;
		if (role == AccountRole.USER) {
			AccessibilityType type = accessibilityType == null ? AccessibilityType.VISUAL : accessibilityType;
			NotificationPrefs prefs = notificationPrefs == null
				? new NotificationPrefs(List.of(NotificationChannel.VOICE, NotificationChannel.VIBRATION), true, true)
				: notificationPrefs;
			userId = insertUser(jdbcTemplate, accountId, name, type, prefs);
			insertNotificationChannels(jdbcTemplate, userId, prefs.channels());
		}
		else {
			insertGuardian(jdbcTemplate, accountId, name, phone, relationship);
		}

		return new SignupResult(accountId, role, userId, name, email, accessibilityType == null ? AccessibilityType.VISUAL : accessibilityType);
	}

	public LoginResult login(AccountRole role, String email, String password) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			MockDataStore.LoginSession session = this.mockDataStore.login(role, email, password);
			MockDataStore.Account account = session.account();
			AccountSummary accountSummary = new AccountSummary(account.accountId(), account.name(), account.email());
			UserProfileSummary userProfile = null;
			GuardianProfileSummary guardianProfile = null;
			if (account.role() == AccountRole.USER) {
				MockDataStore.UserProfile user = this.mockDataStore.findUserByAccountId(account.accountId());
				userProfile = new UserProfileSummary(user.userId(), account.name(), user.accessibilityType());
			}
			else {
				MockDataStore.GuardianProfile guardian = this.mockDataStore.findGuardianProfileByAccountId(account.accountId());
				guardianProfile = new GuardianProfileSummary(guardian.guardianId(), guardian.linkedUserId(), guardian.relationship());
			}
			return new LoginResult(session.accessToken(), account.role(), accountSummary, userProfile, guardianProfile);
		}

		DbAccount account = jdbcTemplate.query(
			"""
			SELECT account_id, role, email, password_hash
			FROM account
			WHERE role = ? AND email = ?
			""",
			(rs, rowNum) -> new DbAccount(
				rs.getLong("account_id"),
				AccountRole.valueOf(rs.getString("role")),
				rs.getString("email"),
				rs.getString("password_hash")
			),
			role.name(),
			email
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "이메일, 비밀번호, 역할을 확인해주세요."));

		if (!hashPassword(password).equals(account.passwordHash())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "이메일, 비밀번호, 역할을 확인해주세요.");
		}

		String token = "db-" + UUID.randomUUID();
		AccountSummary accountSummary;
		UserProfileSummary userProfile = null;
		GuardianProfileSummary guardianProfile = null;
		if (account.role() == AccountRole.USER) {
			DbUser user = findDbUserByAccountId(jdbcTemplate, account.accountId());
			this.dbSessions.put(token, new SessionPrincipal(account.accountId(), account.role(), user.userId(), null));
			accountSummary = new AccountSummary(account.accountId(), user.name(), account.email());
			userProfile = new UserProfileSummary(user.userId(), user.name(), user.accessibilityType());
		}
		else {
			DbGuardian guardian = findDbGuardianByAccountId(jdbcTemplate, account.accountId());
			this.dbSessions.put(token, new SessionPrincipal(account.accountId(), account.role(), null, guardian.guardianId()));
			accountSummary = new AccountSummary(account.accountId(), guardian.name(), account.email());
			guardianProfile = new GuardianProfileSummary(guardian.guardianId(), null, guardian.relationship());
		}

		return new LoginResult(token, account.role(), accountSummary, userProfile, guardianProfile);
	}

	public CurrentUser currentUser(String authorization) {
		String token = extractToken(authorization);
		SessionPrincipal principal = this.dbSessions.get(token);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null || principal == null) {
			MockDataStore.UserProfile user = this.mockDataStore.requireUser(authorization);
			MockDataStore.Account account = this.mockDataStore.accountById(user.accountId());
			return new CurrentUser(
				AccountRole.USER,
				user.userId(),
				account.name(),
				account.email(),
				user.accessibilityType(),
				user.notificationPrefs(),
				!this.mockDataStore.guardians(user.userId()).isEmpty()
			);
		}
		if (principal.role() != AccountRole.USER || principal.userId() == null) {
			throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "USER 계정만 사용할 수 있습니다.");
		}
		DbUser user = findDbUser(jdbcTemplate, principal.userId());
		DbAccount account = findDbAccount(jdbcTemplate, principal.accountId());
		return new CurrentUser(
			AccountRole.USER,
			user.userId(),
			user.name(),
			account.email(),
			user.accessibilityType(),
			notificationPrefs(jdbcTemplate, user.userId()),
			hasGuardian(jdbcTemplate, user.userId())
		);
	}

	public CurrentGuardian currentGuardian(String authorization) {
		String token = extractToken(authorization);
		SessionPrincipal principal = this.dbSessions.get(token);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null || principal == null) {
			MockDataStore.GuardianProfile guardian = this.mockDataStore.requireGuardianProfile(authorization);
			MockDataStore.Account account = this.mockDataStore.accountById(guardian.accountId());
			return new CurrentGuardian(
				guardian.guardianId(),
				account.name(),
				account.email(),
				guardian.relationship(),
				guardian.linkedUserId()
			);
		}
		if (principal.role() != AccountRole.GUARDIAN || principal.guardianId() == null) {
			throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "GUARDIAN 계정만 사용할 수 있습니다.");
		}
		DbGuardian guardian = findDbGuardian(jdbcTemplate, principal.guardianId());
		DbAccount account = findDbAccount(jdbcTemplate, principal.accountId());
		Long linkedUserId = jdbcTemplate.query(
			"SELECT user_id FROM user_guardian WHERE guardian_id = ? ORDER BY map_id ASC LIMIT 1",
			(rs, rowNum) -> rs.getLong("user_id"),
			guardian.guardianId()
		).stream().findFirst().orElse(null);
		return new CurrentGuardian(
			guardian.guardianId(),
			guardian.name(),
			account.email(),
			guardian.relationship(),
			linkedUserId
		);
	}

	public AccessibilityResult updateAccessibility(
		String authorization,
		AccessibilityType accessibilityType,
		NotificationPrefs notificationPrefs
	) {
		String token = extractToken(authorization);
		SessionPrincipal principal = this.dbSessions.get(token);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null || principal == null) {
			MockDataStore.UserProfile user = this.mockDataStore.requireUser(authorization);
			MockDataStore.UserProfile updated = this.mockDataStore.updateAccessibility(user.userId(), accessibilityType, notificationPrefs);
			return new AccessibilityResult(updated.accessibilityType(), updated.notificationPrefs(), OffsetDateTime.now());
		}
		if (principal.role() != AccountRole.USER || principal.userId() == null) {
			throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "USER 계정만 사용할 수 있습니다.");
		}

		jdbcTemplate.update(
			"UPDATE app_user SET accessibility_type = ?, high_contrast = ?, large_text = ? WHERE user_id = ?",
			accessibilityType.name(),
			notificationPrefs.highContrast(),
			notificationPrefs.largeText(),
			principal.userId()
		);
		jdbcTemplate.update("DELETE FROM user_notification_channel WHERE user_id = ?", principal.userId());
		insertNotificationChannels(jdbcTemplate, principal.userId(), notificationPrefs.channels());
		return new AccessibilityResult(accessibilityType, notificationPrefs, OffsetDateTime.now());
	}

	public HomeData home(String authorization) {
		String token = extractToken(authorization);
		SessionPrincipal principal = this.dbSessions.get(token);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null || principal == null) {
			MockDataStore.UserProfile user = this.mockDataStore.requireUser(authorization);
			List<MockDataStore.Device> devices = this.mockDataStore.devices(user.userId());
			List<Alert> alerts = this.mockDataStore.alerts(user.userId(), null, null, 3);
			long connected = devices.stream().filter(device -> device.connectionStatus() == ConnectionStatus.CONNECTED).count();
			long warning = devices.stream().filter(device -> device.connectionStatus() == ConnectionStatus.WARNING || device.connectionStatus() == ConnectionStatus.ERROR).count();
			long uwb = devices.stream().filter(MockDataStore.Device::locationSupported).count();
			boolean hasGuardian = !this.mockDataStore.guardians(user.userId()).isEmpty();
			String guardianName = hasGuardian ? this.mockDataStore.guardians(user.userId()).get(0).name() : null;
			return new HomeData(
				new HomeUser(user.userId(), this.mockDataStore.accountById(user.accountId()).name(), user.accessibilityType().name()),
				new HomeSafetyStatus(SafetyStatusLevel.SAFE, "현재 위험 알림이 없습니다.", OffsetDateTime.now()),
				alerts,
				new HomeDeviceSummary(devices.size(), connected, warning, uwb),
				new HomeEmergency(hasGuardian, guardianName),
				new HomeQuickActions(uwb > 0, hasGuardian)
			);
		}
		if (principal.role() != AccountRole.USER || principal.userId() == null) {
			throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "USER 계정만 사용할 수 있습니다.");
		}

		DbUser user = findDbUser(jdbcTemplate, principal.userId());
		Long total = count(jdbcTemplate, "SELECT COUNT(*) FROM device WHERE user_id = ?", user.userId());
		Long connected = count(jdbcTemplate, "SELECT COUNT(*) FROM device WHERE user_id = ? AND connection_status = 'CONNECTED'", user.userId());
		Long warning = count(jdbcTemplate, "SELECT COUNT(*) FROM device WHERE user_id = ? AND connection_status IN ('WARNING', 'ERROR')", user.userId());
		Long uwb = count(jdbcTemplate, "SELECT COUNT(*) FROM device WHERE user_id = ? AND location_supported = TRUE", user.userId());
		boolean hasGuardian = hasGuardian(jdbcTemplate, user.userId());
		String guardianName = primaryGuardianName(jdbcTemplate, user.userId());
		List<DbAlertSummary> alerts = recentAlerts(jdbcTemplate, user.userId());

		return new HomeData(
			new HomeUser(user.userId(), user.name(), user.accessibilityType().name()),
			new HomeSafetyStatus(SafetyStatusLevel.SAFE, "현재 위험 알림이 없습니다.", OffsetDateTime.now()),
			alerts,
			new HomeDeviceSummary(total, connected, warning, uwb),
			new HomeEmergency(hasGuardian, guardianName),
			new HomeQuickActions(uwb > 0, hasGuardian)
		);
	}

	private long insertAccount(JdbcTemplate jdbcTemplate, AccountRole role, String email, String password) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"INSERT INTO account (role, email, password_hash) VALUES (?, ?, ?)",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setString(1, role.name());
			ps.setString(2, email);
			ps.setString(3, hashPassword(password));
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private long insertUser(JdbcTemplate jdbcTemplate, long accountId, String name, AccessibilityType type, NotificationPrefs prefs) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"INSERT INTO app_user (account_id, name, accessibility_type, high_contrast, large_text) VALUES (?, ?, ?, ?, ?)",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, accountId);
			ps.setString(2, name);
			ps.setString(3, type.name());
			ps.setBoolean(4, prefs.highContrast());
			ps.setBoolean(5, prefs.largeText());
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private void insertGuardian(JdbcTemplate jdbcTemplate, long accountId, String name, String phone, String relationship) {
		jdbcTemplate.update(
			"INSERT INTO guardian (account_id, name, phone, relationship) VALUES (?, ?, ?, ?)",
			accountId,
			name,
			phone == null ? "" : phone,
			relationship == null || relationship.isBlank() ? "FAMILY" : relationship
		);
	}

	private void insertNotificationChannels(JdbcTemplate jdbcTemplate, long userId, List<NotificationChannel> channels) {
		for (NotificationChannel channel : channels) {
			jdbcTemplate.update(
				"INSERT INTO user_notification_channel (user_id, channel) VALUES (?, ?)",
				userId,
				channel.name()
			);
		}
	}

	private DbUser findDbUserByAccountId(JdbcTemplate jdbcTemplate, long accountId) {
		return jdbcTemplate.query(
			"SELECT user_id, account_id, name, accessibility_type, high_contrast, large_text FROM app_user WHERE account_id = ?",
			(rs, rowNum) -> new DbUser(
				rs.getLong("user_id"),
				rs.getLong("account_id"),
				rs.getString("name"),
				AccessibilityType.valueOf(rs.getString("accessibility_type")),
				rs.getBoolean("high_contrast"),
				rs.getBoolean("large_text")
			),
			accountId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "사용자 프로필을 찾을 수 없습니다."));
	}

	private DbUser findDbUser(JdbcTemplate jdbcTemplate, long userId) {
		return jdbcTemplate.query(
			"SELECT user_id, account_id, name, accessibility_type, high_contrast, large_text FROM app_user WHERE user_id = ?",
			(rs, rowNum) -> new DbUser(
				rs.getLong("user_id"),
				rs.getLong("account_id"),
				rs.getString("name"),
				AccessibilityType.valueOf(rs.getString("accessibility_type")),
				rs.getBoolean("high_contrast"),
				rs.getBoolean("large_text")
			),
			userId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "사용자 프로필을 찾을 수 없습니다."));
	}

	private DbGuardian findDbGuardianByAccountId(JdbcTemplate jdbcTemplate, long accountId) {
		return jdbcTemplate.query(
			"SELECT guardian_id, account_id, name, phone, relationship FROM guardian WHERE account_id = ?",
			(rs, rowNum) -> new DbGuardian(
				rs.getLong("guardian_id"),
				rs.getLong("account_id"),
				rs.getString("name"),
				rs.getString("phone"),
				rs.getString("relationship")
			),
			accountId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자 프로필을 찾을 수 없습니다."));
	}

	private DbGuardian findDbGuardian(JdbcTemplate jdbcTemplate, long guardianId) {
		return jdbcTemplate.query(
			"SELECT guardian_id, account_id, name, phone, relationship FROM guardian WHERE guardian_id = ?",
			(rs, rowNum) -> new DbGuardian(
				rs.getLong("guardian_id"),
				rs.getLong("account_id"),
				rs.getString("name"),
				rs.getString("phone"),
				rs.getString("relationship")
			),
			guardianId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자 프로필을 찾을 수 없습니다."));
	}

	private DbAccount findDbAccount(JdbcTemplate jdbcTemplate, long accountId) {
		return jdbcTemplate.query(
			"SELECT account_id, role, email, password_hash FROM account WHERE account_id = ?",
			(rs, rowNum) -> new DbAccount(
				rs.getLong("account_id"),
				AccountRole.valueOf(rs.getString("role")),
				rs.getString("email"),
				rs.getString("password_hash")
			),
			accountId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "계정을 찾을 수 없습니다."));
	}

	private NotificationPrefs notificationPrefs(JdbcTemplate jdbcTemplate, long userId) {
		DbUser user = findDbUser(jdbcTemplate, userId);
		List<NotificationChannel> channels = jdbcTemplate.query(
			"SELECT channel FROM user_notification_channel WHERE user_id = ?",
			(rs, rowNum) -> NotificationChannel.valueOf(rs.getString("channel")),
			userId
		);
		return new NotificationPrefs(channels, user.highContrast(), user.largeText());
	}

	private boolean hasGuardian(JdbcTemplate jdbcTemplate, long userId) {
		return count(jdbcTemplate, "SELECT COUNT(*) FROM user_guardian WHERE user_id = ?", userId) > 0;
	}

	private String primaryGuardianName(JdbcTemplate jdbcTemplate, long userId) {
		return jdbcTemplate.query(
			"""
			SELECT g.name
			FROM user_guardian ug
			JOIN guardian g ON g.guardian_id = ug.guardian_id
			WHERE ug.user_id = ?
			ORDER BY ug.is_primary DESC, ug.map_id ASC
			LIMIT 1
			""",
			(rs, rowNum) -> rs.getString("name"),
			userId
		).stream().findFirst().orElse(null);
	}

	private List<DbAlertSummary> recentAlerts(JdbcTemplate jdbcTemplate, long userId) {
		return jdbcTemplate.query(
			"""
			SELECT a.alert_id, a.alert_type, a.severity, a.title, a.message, a.occurred_at, a.status,
			       COALESCE(d.name, '') AS device_name
			FROM alert a
			LEFT JOIN device_event de ON de.event_id = a.event_id
			LEFT JOIN device d ON d.device_id = de.device_id
			WHERE a.user_id = ?
			ORDER BY a.occurred_at DESC
			LIMIT 3
			""",
			(rs, rowNum) -> new DbAlertSummary(
				rs.getLong("alert_id"),
				rs.getString("alert_type"),
				rs.getString("severity"),
				rs.getString("title"),
				rs.getString("message"),
				rs.getString("device_name"),
				toOffsetDateTime(rs.getObject("occurred_at", LocalDateTime.class)),
				rs.getString("status")
			),
			userId
		);
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(ZoneOffset.ofHours(9));
	}

	private long count(JdbcTemplate jdbcTemplate, String sql, Object... args) {
		Long count = jdbcTemplate.queryForObject(sql, Long.class, args);
		return count == null ? 0 : count;
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	private String extractToken(String authorization) {
		if (authorization == null || !authorization.startsWith("Bearer ")) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authorization 헤더가 필요합니다.");
		}
		return authorization.substring("Bearer ".length());
	}

	private String hashPassword(String password) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			return "sha256:" + HexFormat.of().formatHex(digest.digest(password.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 is not available.", ex);
		}
	}

	private record DbAccount(long accountId, AccountRole role, String email, String passwordHash) {
	}

	private record DbUser(long userId, long accountId, String name, AccessibilityType accessibilityType, boolean highContrast, boolean largeText) {
	}

	private record DbGuardian(long guardianId, long accountId, String name, String phone, String relationship) {
	}

	private record SessionPrincipal(long accountId, AccountRole role, Long userId, Long guardianId) {
	}

	public record SignupResult(long accountId, AccountRole role, Long userId, String name, String email, AccessibilityType accessibilityType) {
	}

	public record LoginResult(String accessToken, AccountRole role, AccountSummary account, UserProfileSummary userProfile, GuardianProfileSummary guardianProfile) {
	}

	public record AccountSummary(long accountId, String name, String email) {
	}

	public record UserProfileSummary(long userId, String name, AccessibilityType accessibilityType) {
	}

	public record GuardianProfileSummary(long guardianId, Long linkedUserId, String relationship) {
	}

	public record CurrentUser(AccountRole role, long userId, String name, String email, AccessibilityType accessibilityType, NotificationPrefs notificationPrefs, boolean guardianLinked) {
	}

	public record CurrentGuardian(long guardianId, String name, String email, String relationship, Long linkedUserId) {
	}

	public record AccessibilityResult(AccessibilityType accessibilityType, NotificationPrefs notificationPrefs, OffsetDateTime updatedAt) {
	}

	public record HomeData(HomeUser user, HomeSafetyStatus safetyStatus, List<?> recentAlerts, HomeDeviceSummary deviceSummary, HomeEmergency emergency, HomeQuickActions quickActions) {
	}

	public record HomeUser(long userId, String name, String accessibilityType) {
	}

	public record HomeSafetyStatus(SafetyStatusLevel level, String message, OffsetDateTime lastCheckedAt) {
	}

	public record HomeDeviceSummary(long totalCount, long connectedCount, long warningCount, long uwbSupportedCount) {
	}

	public record HomeEmergency(boolean enabled, String primaryGuardianName) {
	}

	public record HomeQuickActions(boolean canStartUwbNavigation, boolean canRequestEmergency) {
	}

	public record DbAlertSummary(long alertId, String type, String severity, String title, String message, String deviceName, OffsetDateTime occurredAt, String status) {
	}
}
