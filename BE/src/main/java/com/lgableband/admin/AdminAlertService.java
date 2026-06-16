package com.lgableband.admin;

import com.lgableband.common.AccessibilityType;
import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AlertType;
import com.lgableband.common.ApiException;
import com.lgableband.common.DeviceType;
import com.lgableband.common.Severity;
import com.lgableband.mock.MockDataStore;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

@Service
public class AdminAlertService {

	private static final Set<String> ADMIN_EMAILS = Set.of(
		"admin@example.com",
		"admin@ableband.com"
	);

	private static final List<AlertTemplate> ALERT_TEMPLATES = List.of(
		template(
			"washer-complete",
			"세탁기",
			"완료 알림",
			"WASHER",
			"세탁기",
			AlertType.LIFE,
			Severity.LOW,
			"세탁 완료 알림",
			"세탁이 완료되었습니다. 세탁물을 꺼내 주세요.",
			"세탁이 완료되었습니다. 세탁물을 꺼내 주세요.",
			"세탁실",
			"세탁물을 꺼내고 전원 상태를 확인해 주세요."
		),
		template(
			"washer-mode-change",
			"세탁기",
			"세탁 모드 변경 안내",
			"WASHER",
			"세탁기",
			AlertType.LIFE,
			Severity.MEDIUM,
			"세탁 모드 변경 안내",
			"세탁 모드가 변경되었습니다. 현재 설정을 확인해 주세요.",
			"세탁 모드가 변경되었습니다. 현재 설정을 확인해 주세요.",
			"세탁실",
			"세탁 코스를 다시 확인하고 필요한 경우 조정해 주세요."
		),
		template(
			"washer-door-warning",
			"세탁기",
			"오류·문 열림 안내",
			"WASHER",
			"세탁기",
			AlertType.DANGER,
			Severity.HIGH,
			"세탁기 오류 또는 문 열림 안내",
			"세탁기 문이 열려 있거나 동작 오류가 감지되었습니다.",
			"세탁기 문이 열려 있거나 동작 오류가 감지되었습니다.",
			"세탁실",
			"세탁기 문이 닫혀 있는지 확인하고 오류 상태를 점검해 주세요."
		),
		template(
			"air-sensor-co2",
			"LG 공기질 센서",
			"이산화탄소 안내",
			"AIR_SENSOR",
			"LG 공기질 센서",
			AlertType.DANGER,
			Severity.HIGH,
			"이산화탄소 농도 안내",
			"이산화탄소 농도가 높습니다. 환기가 필요합니다.",
			"이산화탄소 농도가 높습니다. 환기가 필요합니다.",
			"거실",
			"창문을 열고 실내 공기를 환기해 주세요."
		),
		template(
			"air-sensor-temp-humidity",
			"LG 공기질 센서",
			"온도/습도 안내",
			"AIR_SENSOR",
			"LG 공기질 센서",
			AlertType.LIFE,
			Severity.MEDIUM,
			"온도 및 습도 안내",
			"실내 온도 또는 습도가 쾌적 범위를 벗어났습니다.",
			"실내 온도 또는 습도가 쾌적 범위를 벗어났습니다.",
			"거실",
			"에어컨, 난방 또는 제습 기능을 확인해 주세요."
		),
		template(
			"air-sensor-dust",
			"LG 공기질 센서",
			"미세먼지 안내",
			"AIR_SENSOR",
			"LG 공기질 센서",
			AlertType.DANGER,
			Severity.HIGH,
			"미세먼지 안내",
			"실내 미세먼지 농도가 높습니다.",
			"실내 미세먼지 농도가 높습니다.",
			"거실",
			"공기청정기와 환기 상태를 확인해 주세요."
		),
		template(
			"tv-power-status",
			"TV",
			"전원 상태 안내",
			"TV",
			"TV",
			AlertType.LIFE,
			Severity.LOW,
			"TV 전원 상태 안내",
			"TV 전원 상태가 변경되었습니다.",
			"TV 전원 상태가 변경되었습니다.",
			"거실",
			"TV 전원 상태를 확인해 주세요."
		),
		template(
			"tv-volume-channel",
			"TV",
			"볼륨·채널 안내",
			"TV",
			"TV",
			AlertType.LIFE,
			Severity.LOW,
			"TV 볼륨 및 채널 안내",
			"TV 볼륨 또는 채널이 변경되었습니다.",
			"TV 볼륨 또는 채널이 변경되었습니다.",
			"거실",
			"현재 채널과 볼륨을 확인해 주세요."
		),
		template(
			"tv-remote-find",
			"TV",
			"리모컨 찾기",
			"TV",
			"TV",
			AlertType.LOCATION,
			Severity.MEDIUM,
			"TV 리모컨 찾기",
			"리모컨 위치 안내를 시작합니다.",
			"리모컨 위치 안내를 시작합니다.",
			"거실",
			"주변 진동 또는 위치 안내에 따라 리모컨을 찾아 주세요."
		),
		template(
			"range-power-on",
			"전기레인지",
			"전원 켜짐 안내",
			"RANGE",
			"안전 전기레인지",
			AlertType.DANGER,
			Severity.HIGH,
			"전기레인지 전원 켜짐 안내",
			"전기레인지 전원이 켜져 있습니다.",
			"전기레인지 전원이 켜져 있습니다.",
			"주방",
			"조리 중이 아니라면 전원을 꺼 주세요."
		),
		template(
			"range-cooking-complete",
			"전기레인지",
			"조리 완료 알림",
			"RANGE",
			"안전 전기레인지",
			AlertType.LIFE,
			Severity.MEDIUM,
			"조리 완료 알림",
			"조리가 완료되었습니다.",
			"조리가 완료되었습니다.",
			"주방",
			"조리 상태를 확인하고 안전하게 정리해 주세요."
		),
		template(
			"range-heat-warning",
			"전기레인지",
			"잔열·과열 경고",
			"RANGE",
			"안전 전기레인지",
			AlertType.DANGER,
			Severity.CRITICAL,
			"잔열 또는 과열 경고",
			"전기레인지에 잔열 또는 과열 위험이 감지되었습니다.",
			"전기레인지에 잔열 또는 과열 위험이 감지되었습니다.",
			"주방",
			"기기 주변을 비우고 전원을 확인해 주세요."
		),
		template(
			"door-open",
			"도어센서",
			"문 열림 알림",
			"DOOR_SENSOR",
			"도어센서",
			AlertType.LIFE,
			Severity.MEDIUM,
			"문 열림 알림",
			"문이 열렸습니다.",
			"문이 열렸습니다.",
			"현관",
			"문이 안전하게 열리고 닫히는지 확인해 주세요."
		),
		template(
			"door-long-open",
			"도어센서",
			"장시간 열림 경고",
			"DOOR_SENSOR",
			"도어센서",
			AlertType.DANGER,
			Severity.HIGH,
			"문 장시간 열림 경고",
			"문이 오랫동안 열려 있습니다.",
			"문이 오랫동안 열려 있습니다.",
			"현관",
			"문을 닫아야 하는 상황인지 확인해 주세요."
		),
		template(
			"door-before-outing",
			"도어센서",
			"외출·취침 전 확인",
			"DOOR_SENSOR",
			"도어센서",
			AlertType.LIFE,
			Severity.MEDIUM,
			"외출 또는 취침 전 문 확인",
			"외출 또는 취침 전에 문 잠금 상태를 확인해 주세요.",
			"외출 또는 취침 전에 문 잠금 상태를 확인해 주세요.",
			"현관",
			"문 잠금과 닫힘 상태를 확인해 주세요."
		),
		template(
			"fridge-door-open",
			"냉장고",
			"문 열림 알림",
			"REFRIGERATOR",
			"냉장고",
			AlertType.LIFE,
			Severity.MEDIUM,
			"냉장고 문 열림 알림",
			"냉장고 문이 열려 있습니다.",
			"냉장고 문이 열려 있습니다.",
			"주방",
			"냉장고 문이 닫혔는지 확인해 주세요."
		),
		template(
			"fridge-temperature-warning",
			"냉장고",
			"온도 이상 안내",
			"REFRIGERATOR",
			"냉장고",
			AlertType.DANGER,
			Severity.HIGH,
			"냉장고 온도 이상 안내",
			"냉장고 내부 온도에 이상이 있습니다.",
			"냉장고 내부 온도에 이상이 있습니다.",
			"주방",
			"냉장고 문과 전원 상태를 확인해 주세요."
		),
		template(
			"fridge-food-find",
			"냉장고",
			"식재료 찾기",
			"REFRIGERATOR",
			"냉장고",
			AlertType.LOCATION,
			Severity.LOW,
			"냉장고 식재료 찾기",
			"냉장고 안 식재료 위치 안내를 시작합니다.",
			"냉장고 안 식재료 위치 안내를 시작합니다.",
			"주방",
			"냉장고 안쪽 칸을 차례대로 확인해 주세요."
		)
	);

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final MvpDataService dataService;
	private final MockDataStore mockDataStore;

	public AdminAlertService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		MvpDataService dataService,
		MockDataStore mockDataStore
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.dataService = dataService;
		this.mockDataStore = mockDataStore;
	}

	public List<AlertTemplateView> templates(String authorization) {
		requireAdmin(authorization);
		return ALERT_TEMPLATES.stream()
			.map(template -> new AlertTemplateView(
				template.templateId(),
				template.categoryName(),
				template.featureName(),
				template.deviceName(),
				template.deviceType(),
				template.alertType(),
				template.severity(),
				template.title(),
				template.message()
			))
			.toList();
	}

	public BroadcastResponse broadcast(String authorization, String templateId, BroadcastAudience audience) {
		requireAdmin(authorization);
		AlertTemplate template = findTemplate(templateId);
		BroadcastAudience targetAudience = audience == null ? BroadcastAudience.ALL : audience;
		OffsetDateTime occurredAt = OffsetDateTime.now();
		JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();

		if (jdbcTemplate == null) {
			int dispatchedCount = 0;
			for (Long userId : mockDataStore.userIds()) {
				if (!matchesAudience(mockDataStore.user(userId).accessibilityType(), targetAudience)) {
					continue;
				}
				mockDataStore.addContextAlert(
					userId,
					template.alertType(),
					template.severity(),
					template.title(),
					template.message(),
					template.deviceName(),
					occurredAt,
					template.voiceGuide()
				);
				dispatchedCount += 1;
			}
			return new BroadcastResponse(template.templateId(), template.title(), targetAudience, dispatchedCount, occurredAt);
		}

		List<Long> userIds = targetAudience == BroadcastAudience.ALL
			? jdbcTemplate.query(
				"SELECT user_id FROM app_user ORDER BY user_id ASC",
				(rs, rowNum) -> rs.getLong("user_id")
			)
			: jdbcTemplate.query(
				"SELECT user_id FROM app_user WHERE accessibility_type = ? ORDER BY user_id ASC",
				(rs, rowNum) -> rs.getLong("user_id"),
				targetAudience.accessibilityType().name()
			);

		int dispatchedCount = 0;
		for (Long userId : userIds) {
			long deviceId = resolveOrCreateDevice(jdbcTemplate, userId, template);
			long eventId = insertDeviceEvent(jdbcTemplate, deviceId, template, occurredAt);
			insertAlert(jdbcTemplate, userId, eventId, template, occurredAt);
			dispatchedCount += 1;
		}

		return new BroadcastResponse(template.templateId(), template.title(), targetAudience, dispatchedCount, occurredAt);
	}

	private boolean matchesAudience(AccessibilityType accessibilityType, BroadcastAudience audience) {
		if (audience == BroadcastAudience.ALL) {
			return true;
		}

		return audience.accessibilityType() == accessibilityType;
	}

	private MvpDataService.CurrentUser requireAdmin(String authorization) {
		MvpDataService.CurrentUser user = dataService.currentUser(authorization);
		String normalizedEmail = user.email() == null ? "" : user.email().trim().toLowerCase(Locale.ROOT);
		if (!ADMIN_EMAILS.contains(normalizedEmail)) {
			throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "관리자만 사용할 수 있는 기능입니다.");
		}
		return user;
	}

	private AlertTemplate findTemplate(String templateId) {
		return ALERT_TEMPLATES.stream()
			.filter(template -> template.templateId().equals(templateId))
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "알림 템플릿을 찾을 수 없습니다."));
	}

	private long resolveOrCreateDevice(JdbcTemplate jdbcTemplate, long userId, AlertTemplate template) {
		List<Long> exactMatch = jdbcTemplate.query(
			"""
			SELECT device_id
			FROM device
			WHERE user_id = ? AND device_type = ?
			ORDER BY updated_at DESC, device_id ASC
			LIMIT 1
			""",
			(rs, rowNum) -> rs.getLong("device_id"),
			userId,
			template.deviceType().name()
		);
		if (!exactMatch.isEmpty()) {
			return exactMatch.getFirst();
		}

		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO device (
					user_id,
					device_type,
					vendor_device_id,
					name,
					connection_status,
					location_supported,
					remote_enabled
				) VALUES (?, ?, ?, ?, 'CONNECTED', FALSE, FALSE)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, userId);
			ps.setString(2, template.deviceType().name());
			ps.setString(3, "admin-demo-" + template.templateId() + "-" + userId);
			ps.setString(4, template.deviceName());
			return ps;
		}, keyHolder);

		return keyHolder.getKey().longValue();
	}

	private long insertDeviceEvent(
		JdbcTemplate jdbcTemplate,
		long deviceId,
		AlertTemplate template,
		OffsetDateTime occurredAt
	) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		String payloadJson = buildPayloadJson(template);
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO device_event (
					device_id,
					event_type,
					event_level,
					payload_json,
					occurred_at
				) VALUES (?, ?, ?, ?, ?)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, deviceId);
			ps.setString(2, template.alertType().name());
			ps.setString(3, template.severity().name());
			ps.setString(4, payloadJson);
			ps.setTimestamp(5, Timestamp.valueOf(occurredAt.toLocalDateTime()));
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private void insertAlert(
		JdbcTemplate jdbcTemplate,
		long userId,
		long eventId,
		AlertTemplate template,
		OffsetDateTime occurredAt
	) {
		jdbcTemplate.update(
			"""
			INSERT INTO alert (
				user_id,
				event_id,
				alert_type,
				severity,
				title,
				message,
				voice_guide,
				status,
				occurred_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, 'UNREAD', ?)
			""",
			userId,
			eventId,
			template.alertType().name(),
			template.severity().name(),
			template.title(),
			template.message(),
			template.voiceGuide(),
			Timestamp.valueOf(occurredAt.toLocalDateTime())
		);
	}

	private String buildPayloadJson(AlertTemplate template) {
		return """
			{"locationName":"%s","recommendedAction":"%s","requiresGuardianNotify":%s,"deviceName":"%s"}
			""".formatted(
			escapeJson(template.locationName()),
			escapeJson(template.recommendedAction()),
			template.severity() == Severity.HIGH || template.severity() == Severity.CRITICAL,
			escapeJson(template.deviceName())
		);
	}

	private String escapeJson(String value) {
		if (value == null) {
			return "";
		}

		return value
			.replace("\\", "\\\\")
			.replace("\"", "\\\"");
	}

	private static AlertTemplate template(
		String templateId,
		String categoryName,
		String featureName,
		String deviceType,
		String deviceName,
		AlertType alertType,
		Severity severity,
		String title,
		String message,
		String voiceGuide,
		String locationName,
		String recommendedAction
	) {
		return new AlertTemplate(
			templateId,
			categoryName,
			featureName,
			deviceName,
			DeviceType.valueOf(deviceType),
			alertType,
			severity,
			title,
			message,
			voiceGuide,
			locationName,
			recommendedAction
		);
	}

	public record AlertTemplateView(
		String templateId,
		String categoryName,
		String featureName,
		String deviceName,
		DeviceType deviceType,
		AlertType alertType,
		Severity severity,
		String title,
		String message
	) {
	}

	public record BroadcastResponse(
		String templateId,
		String title,
		BroadcastAudience audience,
		int dispatchedUserCount,
		OffsetDateTime occurredAt
	) {
	}

	public enum BroadcastAudience {
		ALL(null),
		VISUAL(AccessibilityType.VISUAL),
		HEARING(AccessibilityType.HEARING);

		private final AccessibilityType accessibilityType;

		BroadcastAudience(AccessibilityType accessibilityType) {
			this.accessibilityType = accessibilityType;
		}

		public AccessibilityType accessibilityType() {
			return this.accessibilityType;
		}
	}

	private record AlertTemplate(
		String templateId,
		String categoryName,
		String featureName,
		String deviceName,
		DeviceType deviceType,
		AlertType alertType,
		Severity severity,
		String title,
		String message,
		String voiceGuide,
		String locationName,
		String recommendedAction
	) {
	}
}
