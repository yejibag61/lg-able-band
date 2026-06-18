package com.lgableband.mock;

import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.AlertStatus;
import com.lgableband.common.AlertType;
import com.lgableband.common.ApiException;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.DeviceType;
import com.lgableband.common.NavigationStatus;
import com.lgableband.common.NotificationChannel;
import com.lgableband.common.Severity;
import com.lgableband.common.VibrationPattern;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class MockDataStore {

	private final AtomicLong accountSequence = new AtomicLong(3);
	private final AtomicLong userSequence = new AtomicLong(2);
	private final AtomicLong guardianProfileSequence = new AtomicLong(1);
	private final AtomicLong guardianSequence = new AtomicLong(1);
	private final AtomicLong deviceSequence = new AtomicLong(10);
	private final AtomicLong emergencySequence = new AtomicLong(300);
	private final AtomicLong alertSequence = new AtomicLong(200);
	private final AtomicLong eventSequence = new AtomicLong(600);
	private final AtomicLong uwbSequence = new AtomicLong(9000);

	private final Map<Long, Account> accounts = new HashMap<>();
	private final Map<Long, UserProfile> users = new HashMap<>();
	private final Map<Long, GuardianProfile> guardianProfiles = new HashMap<>();
	private final Map<Long, List<Guardian>> guardiansByUserId = new HashMap<>();
	private final Map<Long, List<Device>> devicesByUserId = new HashMap<>();
	private final Map<Long, List<Alert>> alertsByUserId = new HashMap<>();
	private final Map<Long, List<EventHistory>> eventsByUserId = new HashMap<>();
	private final Map<Long, List<EmergencyRequest>> emergenciesByUserId = new HashMap<>();
	private final Map<Long, UwbSession> uwbSessions = new HashMap<>();
	private final Map<String, Long> accountIdsByToken = new HashMap<>();

	public MockDataStore() {
		Account userAccount = new Account(1, AccountRole.USER, "user@example.com", "password1234", "홍길동");
		Account guardianAccount = new Account(2, AccountRole.GUARDIAN, "guardian@example.com", "password1234", "김보호");
		this.accounts.put(userAccount.accountId(), userAccount);
		this.accounts.put(guardianAccount.accountId(), guardianAccount);
		Account adminAccount = new Account(3, AccountRole.USER, "admin@example.com", "password1234", "관리자");
		this.accounts.put(adminAccount.accountId(), adminAccount);

		UserProfile user = new UserProfile(
			1,
			1,
			AccessibilityType.VISUAL,
			new NotificationPrefs(List.of(NotificationChannel.VOICE, NotificationChannel.VIBRATION), true, true)
		);
		this.users.put(user.userId(), user);
		this.users.put(
			2L,
			new UserProfile(
				2,
				3,
				AccessibilityType.VISUAL,
				new NotificationPrefs(List.of(NotificationChannel.VOICE, NotificationChannel.VIBRATION), true, true)
			)
		);
		this.guardianProfiles.put(1L, new GuardianProfile(1, 2, 1L, "FAMILY", "010-0000-0000"));
		this.guardiansByUserId.put(1L, new ArrayList<>(List.of(
			new Guardian(1, "김보호", "010-0000-0000", true, true, ConnectionStatus.CONNECTED)
		)));
		this.devicesByUserId.put(1L, new ArrayList<>(List.of(
			new Device(10, "세탁기", DeviceType.WASHER, ConnectionStatus.CONNECTED, true, OffsetDateTime.now().minusMinutes(10), "세탁실")
		)));
		this.alertsByUserId.put(1L, new ArrayList<>(List.of(
			new Alert(101, AlertType.LIFE, Severity.LOW, "세탁 완료", "세탁이 완료되었습니다. 건조기로 옮겨주세요.", "세탁기", OffsetDateTime.now().minusMinutes(20), AlertStatus.UNREAD, "세탁기 완료 알림입니다."),
			new Alert(102, AlertType.DANGER, Severity.HIGH, "공기질 주의", "실내 공기질이 좋지 않습니다. 환기를 권장합니다.", "공기질 센서", OffsetDateTime.now().minusMinutes(35), AlertStatus.UNREAD, "공기질 주의 알림입니다.")
		)));
		this.eventsByUserId.put(1L, new ArrayList<>(List.of(
			new EventHistory(501, 101, AlertType.LIFE, Severity.LOW, "세탁 완료", "세탁기", OffsetDateTime.now().minusMinutes(20), AlertStatus.UNREAD),
			new EventHistory(502, 102, AlertType.DANGER, Severity.HIGH, "공기질 주의", "공기질 센서", OffsetDateTime.now().minusMinutes(35), AlertStatus.UNREAD)
		)));
		this.emergenciesByUserId.put(1L, new ArrayList<>());
		this.guardiansByUserId.put(2L, new ArrayList<>());
		this.devicesByUserId.put(2L, new ArrayList<>());
		this.alertsByUserId.put(2L, new ArrayList<>());
		this.eventsByUserId.put(2L, new ArrayList<>());
		this.emergenciesByUserId.put(2L, new ArrayList<>());
	}

	public Account signup(
		AccountRole role,
		String name,
		String email,
		String password,
		AccessibilityType accessibilityType,
		NotificationPrefs notificationPrefs,
		String phone,
		String relationship
	) {
		boolean duplicated = this.accounts.values().stream()
			.anyMatch(account -> account.email().equalsIgnoreCase(email) && account.role() == role);
		if (duplicated) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATED_EMAIL", "이미 가입된 이메일입니다.");
		}

		long accountId = this.accountSequence.incrementAndGet();
		Account account = new Account(accountId, role, email, password, name);
		this.accounts.put(accountId, account);

		if (role == AccountRole.USER) {
			long userId = this.userSequence.incrementAndGet();
			NotificationPrefs prefs = notificationPrefs == null
				? new NotificationPrefs(List.of(NotificationChannel.VOICE, NotificationChannel.VIBRATION), true, true)
				: notificationPrefs;
			this.users.put(userId, new UserProfile(userId, accountId, accessibilityType == null ? AccessibilityType.VISUAL : accessibilityType, prefs));
			this.guardiansByUserId.put(userId, new ArrayList<>());
			this.devicesByUserId.put(userId, new ArrayList<>());
			this.alertsByUserId.put(userId, new ArrayList<>());
			this.eventsByUserId.put(userId, new ArrayList<>());
			this.emergenciesByUserId.put(userId, new ArrayList<>());
		}
		else {
			long guardianId = this.guardianProfileSequence.incrementAndGet();
			this.guardianProfiles.put(guardianId, new GuardianProfile(
				guardianId,
				accountId,
				null,
				relationship == null || relationship.isBlank() ? "FAMILY" : relationship,
				phone == null ? "" : phone
			));
		}

		return account;
	}

	public LoginSession login(AccountRole role, String email, String password) {
		Account account = this.accounts.values().stream()
			.filter(candidate -> candidate.role() == role)
			.filter(candidate -> candidate.email().equalsIgnoreCase(email))
			.filter(candidate -> candidate.password().equals(password))
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "이메일, 비밀번호, 역할을 확인해주세요."));

		String token = "mock-" + UUID.randomUUID();
		this.accountIdsByToken.put(token, account.accountId());
		return new LoginSession(token, account);
	}

	public Account requireAccount(String authorization) {
		String token = extractToken(authorization);
		Long accountId = this.accountIdsByToken.get(token);
		if (accountId == null) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "로그인이 필요합니다.");
		}
		return this.accounts.get(accountId);
	}

	public UserProfile requireUser(String authorization) {
		Account account = requireAccount(authorization);
		if (account.role() != AccountRole.USER) {
			throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "USER 계정만 사용할 수 있습니다.");
		}
		return findUserByAccountId(account.accountId());
	}

	public GuardianProfile requireGuardianProfile(String authorization) {
		Account account = requireAccount(authorization);
		if (account.role() != AccountRole.GUARDIAN) {
			throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "GUARDIAN 계정만 사용할 수 있습니다.");
		}
		return findGuardianProfileByAccountId(account.accountId());
	}

	public Account accountById(long accountId) {
		Account account = this.accounts.get(accountId);
		if (account == null) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "계정을 찾을 수 없습니다.");
		}
		return account;
	}

	public UserProfile findUserByAccountId(long accountId) {
		return this.users.values().stream()
			.filter(user -> user.accountId() == accountId)
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "사용자 프로필을 찾을 수 없습니다."));
	}

	public GuardianProfile findGuardianProfileByAccountId(long accountId) {
		return this.guardianProfiles.values().stream()
			.filter(profile -> profile.accountId() == accountId)
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자 프로필을 찾을 수 없습니다."));
	}

	public UserProfile updateAccessibility(long userId, AccessibilityType accessibilityType, NotificationPrefs notificationPrefs) {
		UserProfile current = this.users.get(userId);
		UserProfile updated = new UserProfile(current.userId(), current.accountId(), accessibilityType, notificationPrefs);
		this.users.put(userId, updated);
		return updated;
	}

	public List<Device> devices(long userId) {
		return this.devicesByUserId.getOrDefault(userId, List.of());
	}

	public UserProfile user(long userId) {
		UserProfile user = this.users.get(userId);
		if (user == null) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "사용자 프로필을 찾을 수 없습니다.");
		}
		return user;
	}

	public List<Long> userIds() {
		return this.users.keySet().stream().sorted().toList();
	}

	public Device addDevice(long userId, String name, DeviceType type, boolean locationSupported, String room) {
		Device device = new Device(
			this.deviceSequence.incrementAndGet(),
			name,
			type,
			ConnectionStatus.CONNECTED,
			locationSupported,
			OffsetDateTime.now(),
			room
		);
		this.devicesByUserId.computeIfAbsent(userId, ignored -> new ArrayList<>()).add(0, device);
		return device;
	}

	public Device updateDeviceRoom(long userId, long deviceId, String room) {
		List<Device> devices = this.devicesByUserId.getOrDefault(userId, List.of());
		for (int index = 0; index < devices.size(); index += 1) {
			Device device = devices.get(index);
			if (device.deviceId() == deviceId && device.connectionStatus() != ConnectionStatus.DISCONNECTED) {
				Device updated = new Device(
					device.deviceId(),
					device.name(),
					device.type(),
					device.connectionStatus(),
					device.locationSupported(),
					device.lastEventAt(),
					room
				);
				devices.set(index, updated);
				return updated;
			}
		}
		return null;
	}

	public List<Alert> alerts(long userId, AlertType type, AlertStatus status, int limit) {
		return this.alertsByUserId.getOrDefault(userId, List.of()).stream()
			.filter(alert -> type == null || alert.type() == type)
			.filter(alert -> status == null || alert.status() == status)
			.sorted(Comparator.comparing(Alert::occurredAt).reversed())
			.limit(limit)
			.toList();
	}

	public Alert alert(long userId, long alertId) {
		return this.alertsByUserId.getOrDefault(userId, List.of()).stream()
			.filter(alert -> alert.alertId() == alertId)
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "알림을 찾을 수 없습니다."));
	}

	public Alert confirmAlert(long userId, long alertId) {
		return updateAlertStatus(userId, alertId, AlertStatus.CONFIRMED);
	}

	public Alert replayAlert(long userId, long alertId) {
		return updateAlertStatus(userId, alertId, AlertStatus.REPLAYED);
	}

	public void deleteAlert(long userId, long alertId) {
		List<Alert> alerts = this.alertsByUserId.getOrDefault(userId, new ArrayList<>());
		boolean removed = alerts.removeIf(alert -> alert.alertId() == alertId);
		if (!removed) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "알림을 찾을 수 없습니다.");
		}
		this.eventsByUserId.getOrDefault(userId, new ArrayList<>())
			.removeIf(event -> event.alertId() == alertId);
	}

	private Alert updateAlertStatus(long userId, long alertId, AlertStatus status) {
		List<Alert> alerts = this.alertsByUserId.getOrDefault(userId, new ArrayList<>());
		for (int index = 0; index < alerts.size(); index++) {
			Alert alert = alerts.get(index);
			if (alert.alertId() == alertId) {
				Alert updated = alert.withStatus(status);
				alerts.set(index, updated);
				return updated;
			}
		}
		throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "알림을 찾을 수 없습니다.");
	}

	public List<Guardian> guardians(long userId) {
		return this.guardiansByUserId.getOrDefault(userId, List.of());
	}

	public Guardian addGuardian(long userId, String name, String phone, boolean primary, boolean notifyOnDanger) {
		List<Guardian> guardians = this.guardiansByUserId.computeIfAbsent(userId, ignored -> new ArrayList<>());
		if (primary) {
			guardians.replaceAll(this::removePrimary);
		}
		Guardian guardian = new Guardian(this.guardianSequence.incrementAndGet(), name, phone, primary, notifyOnDanger, ConnectionStatus.CONNECTED);
		guardians.add(guardian);
		return guardian;
	}

	public Guardian linkGuardianByEmail(long userId, String email, boolean primary, boolean notifyOnDanger) {
		Account account = this.accounts.values().stream()
			.filter(candidate -> candidate.role() == AccountRole.GUARDIAN)
			.filter(candidate -> candidate.email().equalsIgnoreCase(email))
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "해당 이메일의 보호자 계정을 찾을 수 없습니다."));

		GuardianProfile profile = findGuardianProfileByAccountId(account.accountId());
		List<Guardian> guardians = this.guardiansByUserId.computeIfAbsent(userId, ignored -> new ArrayList<>());
		boolean duplicated = guardians.stream().anyMatch(guardian -> guardian.guardianId() == profile.guardianId());
		if (duplicated) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATED_GUARDIAN", "이미 연결된 보호자입니다.");
		}
		if (primary) {
			guardians.replaceAll(this::removePrimary);
		}

		Guardian guardian = new Guardian(profile.guardianId(), account.name(), profile.phone(), primary, notifyOnDanger, ConnectionStatus.CONNECTED);
		this.guardianProfiles.put(profile.guardianId(), new GuardianProfile(
			profile.guardianId(),
			profile.accountId(),
			userId,
			profile.relationship(),
			profile.phone()
		));
		guardians.add(guardian);
		return guardian;
	}

	public Guardian updateGuardian(long userId, long guardianId, String name, String phone, boolean primary, boolean notifyOnDanger) {
		List<Guardian> guardians = mutableGuardians(userId);
		if (primary) {
			guardians.replaceAll(this::removePrimary);
		}
		for (int index = 0; index < guardians.size(); index++) {
			Guardian current = guardians.get(index);
			if (current.guardianId() == guardianId) {
				Guardian updated = new Guardian(guardianId, name, phone, primary, notifyOnDanger, ConnectionStatus.CONNECTED);
				guardians.set(index, updated);
				return updated;
			}
		}
		throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자를 찾을 수 없습니다.");
	}

	public void deleteGuardian(long userId, long guardianId) {
		List<Guardian> guardians = mutableGuardians(userId);
		boolean removed = guardians.removeIf(guardian -> guardian.guardianId() == guardianId);
		if (!removed) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자를 찾을 수 없습니다.");
		}
	}

	private List<Guardian> mutableGuardians(long userId) {
		return this.guardiansByUserId.computeIfAbsent(userId, ignored -> new ArrayList<>());
	}

	private Guardian removePrimary(Guardian guardian) {
		return new Guardian(
			guardian.guardianId(),
			guardian.name(),
			guardian.phone(),
			false,
			guardian.notifyOnDanger(),
			guardian.connectionStatus()
		);
	}

	public EmergencyRequest createEmergency(long userId, String message, String source) {
		return createEmergency(
			userId,
			"SENT",
			message,
			source,
			true,
			"FALLBACK",
			"CRITICAL",
			List.of("GUARDIAN_PUSH", "BAND_VIBRATION", "APP_SCREEN"),
			"SOS_REPEAT",
			"EMERGENCY_FULL_SCREEN"
		);
	}

	public EmergencyRequest createEmergency(
		long userId,
		String status,
		String message,
		String source,
		boolean guardianNotified,
		String decisionSource,
		String emergencyLevel,
		List<String> recommendedChannels,
		String vibrationPattern,
		String screenMode
	) {
		List<Guardian> guardians = guardians(userId);
		if (guardians.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "NO_GUARDIAN", "등록된 보호자가 없습니다.");
		}
		EmergencyRequest request = new EmergencyRequest(
			this.emergencySequence.incrementAndGet(),
			status,
			message,
			source,
			OffsetDateTime.now(),
			guardianNotified,
			guardianNotified ? guardians : List.of(),
			decisionSource,
			emergencyLevel,
			recommendedChannels,
			vibrationPattern,
			screenMode
		);
		this.emergenciesByUserId.computeIfAbsent(userId, ignored -> new ArrayList<>()).add(request);
		return request;
	}

	public List<EmergencyRequest> emergencies(long userId) {
		return this.emergenciesByUserId.getOrDefault(userId, List.of()).stream()
			.sorted(Comparator.comparing(EmergencyRequest::sentAt).reversed())
			.toList();
	}

	public EmergencyRequest emergency(long userId, long emergencyRequestId) {
		return this.emergenciesByUserId.getOrDefault(userId, List.of()).stream()
			.filter(request -> request.emergencyRequestId() == emergencyRequestId)
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "긴급 요청을 찾을 수 없습니다."));
	}

	public EmergencyRequest updateEmergencyStatus(long userId, long emergencyRequestId, String status) {
		List<EmergencyRequest> requests = this.emergenciesByUserId.getOrDefault(userId, new ArrayList<>());
		for (int index = 0; index < requests.size(); index++) {
			EmergencyRequest request = requests.get(index);
			if (request.emergencyRequestId() == emergencyRequestId) {
				EmergencyRequest updated = request.withStatus(status);
				requests.set(index, updated);
				return updated;
			}
		}
		throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "긴급 요청을 찾을 수 없습니다.");
	}

	public Alert addContextAlert(
		long userId,
		AlertType type,
		Severity severity,
		String title,
		String message,
		String deviceName,
		OffsetDateTime occurredAt,
		String voiceGuide
	) {
		Alert alert = new Alert(
			this.alertSequence.incrementAndGet(),
			type,
			severity,
			title,
			message,
			deviceName,
			occurredAt,
			AlertStatus.UNREAD,
			voiceGuide
		);
		this.alertsByUserId.computeIfAbsent(userId, ignored -> new ArrayList<>()).add(alert);
		this.eventsByUserId.computeIfAbsent(userId, ignored -> new ArrayList<>()).add(new EventHistory(
			this.eventSequence.incrementAndGet(),
			alert.alertId(),
			type,
			severity,
			title,
			deviceName,
			occurredAt,
			AlertStatus.UNREAD
		));
		return alert;
	}

	public List<EventHistory> events(long userId, AlertType type, int page, int size) {
		return events(userId, type, null, null, page, size);
	}

	public List<EventHistory> events(long userId, AlertType type, OffsetDateTime from, OffsetDateTime to, int page, int size) {
		return filteredEvents(userId, type, from, to).stream()
			.skip((long) page * size)
			.limit(size)
			.toList();
	}

	public long countEvents(long userId, AlertType type, OffsetDateTime from, OffsetDateTime to) {
		return filteredEvents(userId, type, from, to).size();
	}

	private List<EventHistory> filteredEvents(long userId, AlertType type, OffsetDateTime from, OffsetDateTime to) {
		return this.eventsByUserId.getOrDefault(userId, List.of()).stream()
			.filter(event -> type == null || event.type() == type)
			.filter(event -> from == null || !event.occurredAt().isBefore(from))
			.filter(event -> to == null || !event.occurredAt().isAfter(to))
			.sorted(Comparator.comparing(EventHistory::occurredAt).reversed())
			.toList();
	}

	public UwbSession startUwbSession(long userId, long targetDeviceId) {
		Device target = devices(userId).stream()
			.filter(device -> device.deviceId() == targetDeviceId)
			.filter(Device::locationSupported)
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "UWB 위치 안내 대상을 찾을 수 없습니다."));

		UwbSession session = new UwbSession(
			this.uwbSequence.incrementAndGet(),
			userId,
			target.deviceId(),
			target.name(),
			NavigationStatus.ACTIVE,
			4.0,
			0.86,
			target.name() + "까지 약 4미터입니다.",
			VibrationPattern.SLOW,
			OffsetDateTime.now()
		);
		this.uwbSessions.put(session.sessionId(), session);
		return session;
	}

	public UwbSession uwbSession(long sessionId) {
		return advanceUwbSession(requireUwbSession(sessionId));
	}

	public UwbSession uwbSession(long userId, long sessionId) {
		UwbSession session = requireOwnedUwbSession(userId, sessionId);
		return advanceUwbSession(session);
	}

	public UwbSession stopUwbSession(long sessionId) {
		UwbSession stopped = requireUwbSession(sessionId).withStatus(NavigationStatus.CANCELED);
		this.uwbSessions.put(sessionId, stopped);
		return stopped;
	}

	public UwbSession stopUwbSession(long userId, long sessionId) {
		UwbSession stopped = requireOwnedUwbSession(userId, sessionId).withStatus(NavigationStatus.CANCELED);
		this.uwbSessions.put(sessionId, stopped);
		return stopped;
	}

	private UwbSession requireUwbSession(long sessionId) {
		UwbSession session = this.uwbSessions.get(sessionId);
		if (session == null) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "UWB 세션을 찾을 수 없습니다.");
		}
		return session;
	}

	private UwbSession requireOwnedUwbSession(long userId, long sessionId) {
		UwbSession session = requireUwbSession(sessionId);
		if (session.userId() != userId) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "UWB 세션을 찾을 수 없습니다.");
		}
		return session;
	}

	private UwbSession advanceUwbSession(UwbSession session) {
		double nextDistance = Math.max(0.5, session.distanceM() - 1.0);
		NavigationStatus status = nextDistance <= 0.5 ? NavigationStatus.ARRIVED : NavigationStatus.ACTIVE;
		VibrationPattern pattern = vibrationPattern(nextDistance, status);
		UwbSession updated = session.withNavigation(nextDistance, status, pattern);
		this.uwbSessions.put(session.sessionId(), updated);
		return updated;
	}

	private VibrationPattern vibrationPattern(double distanceM, NavigationStatus status) {
		if (status == NavigationStatus.ARRIVED) {
			return VibrationPattern.LONG_TWICE;
		}
		if (distanceM >= 3.0) {
			return VibrationPattern.SLOW;
		}
		if (distanceM >= 1.0) {
			return VibrationPattern.MEDIUM;
		}
		return VibrationPattern.FAST;
	}

	private String extractToken(String authorization) {
		if (authorization == null || !authorization.startsWith("Bearer ")) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authorization 헤더가 필요합니다.");
		}
		return authorization.substring("Bearer ".length());
	}

	public record LoginSession(String accessToken, Account account) {
	}

	public record Account(long accountId, AccountRole role, String email, String password, String name) {
	}

	public record UserProfile(long userId, long accountId, AccessibilityType accessibilityType, NotificationPrefs notificationPrefs) {
	}

	public record GuardianProfile(long guardianId, long accountId, Long linkedUserId, String relationship, String phone) {
	}

	public record NotificationPrefs(List<NotificationChannel> channels, boolean highContrast, boolean largeText) {
	}

	public record Device(long deviceId, String name, DeviceType type, ConnectionStatus connectionStatus, boolean locationSupported, OffsetDateTime lastEventAt, String room) {
	}

	public record Alert(long alertId, AlertType type, Severity severity, String title, String message, String deviceName, OffsetDateTime occurredAt, AlertStatus status, String voiceGuide) {

		public Alert withStatus(AlertStatus status) {
			return new Alert(this.alertId, this.type, this.severity, this.title, this.message, this.deviceName, this.occurredAt, status, this.voiceGuide);
		}
	}

	public record Guardian(long guardianId, String name, String phone, boolean isPrimary, boolean notifyOnDanger, ConnectionStatus connectionStatus) {
	}

	public record EmergencyRequest(
		long emergencyRequestId,
		String status,
		String message,
		String source,
		OffsetDateTime sentAt,
		boolean guardianNotified,
		List<Guardian> guardianTargets,
		String decisionSource,
		String emergencyLevel,
		List<String> recommendedChannels,
		String vibrationPattern,
		String screenMode
	) {

		public EmergencyRequest withStatus(String status) {
			return new EmergencyRequest(
				this.emergencyRequestId,
				status,
				this.message,
				this.source,
				this.sentAt,
				this.guardianNotified,
				this.guardianTargets,
				this.decisionSource,
				this.emergencyLevel,
				this.recommendedChannels,
				this.vibrationPattern,
				this.screenMode
			);
		}
	}

	public record EventHistory(long eventId, long alertId, AlertType type, Severity severity, String title, String deviceName, OffsetDateTime occurredAt, AlertStatus alertStatus) {
	}

	public record UwbSession(long sessionId, long userId, long targetDeviceId, String targetDeviceName, NavigationStatus navigationStatus, double distanceM, double confidence, String voiceGuide, VibrationPattern vibrationPattern, OffsetDateTime updatedAt) {

		public UwbSession withNavigation(double distanceM, NavigationStatus status, VibrationPattern pattern) {
			String guide = status == NavigationStatus.ARRIVED
				? this.targetDeviceName + "에 도착했습니다."
				: this.targetDeviceName + "까지 약 " + distanceM + "미터입니다.";
			return new UwbSession(this.sessionId, this.userId, this.targetDeviceId, this.targetDeviceName, status, distanceM, this.confidence, guide, pattern, OffsetDateTime.now());
		}

		public UwbSession withStatus(NavigationStatus status) {
			return new UwbSession(this.sessionId, this.userId, this.targetDeviceId, this.targetDeviceName, status, this.distanceM, this.confidence, this.voiceGuide, this.vibrationPattern, OffsetDateTime.now());
		}
	}
}
