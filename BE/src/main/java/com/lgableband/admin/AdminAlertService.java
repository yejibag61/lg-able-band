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
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

@Service
public class AdminAlertService {

	private static final Logger log = LoggerFactory.getLogger(AdminAlertService.class);
	private static final ZoneOffset SERVICE_OFFSET = ZoneOffset.ofHours(9);

	private static final Set<String> ADMIN_EMAILS = Set.of(
		"admin@example.com",
		"admin@ableband.com"
	);

	private static final List<AlertTemplate> ALERT_TEMPLATES = List.of(
		template(
			"washer-complete",
			"?명긽湲?,
			"?꾨즺 ?뚮┝",
			"WASHER",
			"?명긽湲?,
			AlertType.LIFE,
			Severity.LOW,
			"?명긽 ?꾨즺 ?뚮┝",
			"?명긽???꾨즺?섏뿀?듬땲?? ?명긽臾쇱쓣 爰쇰궡 二쇱꽭??",
			"?명긽???꾨즺?섏뿀?듬땲?? ?명긽臾쇱쓣 爰쇰궡 二쇱꽭??",
			"?명긽??,
			"?명긽臾쇱쓣 爰쇰궡怨??꾩썝 ?곹깭瑜??뺤씤??二쇱꽭??"
		),
		template(
			"washer-mode-change",
			"?명긽湲?,
			"?명긽 紐⑤뱶 蹂寃??덈궡",
			"WASHER",
			"?명긽湲?,
			AlertType.LIFE,
			Severity.MEDIUM,
			"?명긽 紐⑤뱶 蹂寃??덈궡",
			"?명긽 紐⑤뱶媛 蹂寃쎈릺?덉뒿?덈떎. ?꾩옱 ?ㅼ젙???뺤씤??二쇱꽭??",
			"?명긽 紐⑤뱶媛 蹂寃쎈릺?덉뒿?덈떎. ?꾩옱 ?ㅼ젙???뺤씤??二쇱꽭??",
			"?명긽??,
			"?명긽 肄붿뒪瑜??ㅼ떆 ?뺤씤?섍퀬 ?꾩슂??寃쎌슦 議곗젙??二쇱꽭??"
		),
		template(
			"washer-door-warning",
			"?명긽湲?,
			"?ㅻ쪟쨌臾??대┝ ?덈궡",
			"WASHER",
			"?명긽湲?,
			AlertType.LIFE,
			Severity.MEDIUM,
			"?명긽湲??ㅻ쪟 ?먮뒗 臾??대┝ ?덈궡",
			"?명긽湲?臾몄씠 ?대젮 ?덇굅???숈옉 ?ㅻ쪟媛 媛먯??섏뿀?듬땲??",
			"?명긽湲?臾몄씠 ?대젮 ?덇굅???숈옉 ?ㅻ쪟媛 媛먯??섏뿀?듬땲??",
			"?명긽??,
			"?명긽湲?臾몄씠 ?ロ? ?덈뒗吏 ?뺤씤?섍퀬 ?ㅻ쪟 ?곹깭瑜??먭???二쇱꽭??"
		),
		template(
			"air-sensor-co2",
			"LG 怨듦린吏??쇱꽌",
			"?댁궛?뷀깂???덈궡",
			"AIR_SENSOR",
			"LG 怨듦린吏??쇱꽌",
			AlertType.LIFE,
			Severity.MEDIUM,
			"?댁궛?뷀깂???띾룄 ?덈궡",
			"?댁궛?뷀깂???띾룄媛 ?믪뒿?덈떎. ?섍린媛 ?꾩슂?⑸땲??",
			"?댁궛?뷀깂???띾룄媛 ?믪뒿?덈떎. ?섍린媛 ?꾩슂?⑸땲??",
			"嫄곗떎",
			"李쎈Ц???닿퀬 ?ㅻ궡 怨듦린瑜??섍린??二쇱꽭??"
		),
		template(
			"air-sensor-temp-humidity",
			"LG 怨듦린吏??쇱꽌",
			"?⑤룄/?듬룄 ?덈궡",
			"AIR_SENSOR",
			"LG 怨듦린吏??쇱꽌",
			AlertType.LIFE,
			Severity.MEDIUM,
			"?⑤룄 諛??듬룄 ?덈궡",
			"?ㅻ궡 ?⑤룄 ?먮뒗 ?듬룄媛 苡뚯쟻 踰붿쐞瑜?踰쀬뼱?ъ뒿?덈떎.",
			"?ㅻ궡 ?⑤룄 ?먮뒗 ?듬룄媛 苡뚯쟻 踰붿쐞瑜?踰쀬뼱?ъ뒿?덈떎.",
			"嫄곗떎",
			"?먯뼱而? ?쒕갑 ?먮뒗 ?쒖뒿 湲곕뒫???뺤씤??二쇱꽭??"
		),
		template(
			"air-sensor-dust",
			"LG 怨듦린吏??쇱꽌",
			"誘몄꽭癒쇱? ?덈궡",
			"AIR_SENSOR",
			"LG 怨듦린吏??쇱꽌",
			AlertType.LIFE,
			Severity.MEDIUM,
			"誘몄꽭癒쇱? ?덈궡",
			"?ㅻ궡 誘몄꽭癒쇱? ?띾룄媛 ?믪뒿?덈떎.",
			"?ㅻ궡 誘몄꽭癒쇱? ?띾룄媛 ?믪뒿?덈떎.",
			"嫄곗떎",
			"怨듦린泥?젙湲곗? ?섍린 ?곹깭瑜??뺤씤??二쇱꽭??"
		),
		template(
			"tv-power-status",
			"TV",
			"?꾩썝 ?곹깭 ?덈궡",
			"TV",
			"TV",
			AlertType.LIFE,
			Severity.LOW,
			"TV ?꾩썝 ?곹깭 ?덈궡",
			"TV ?꾩썝 ?곹깭媛 蹂寃쎈릺?덉뒿?덈떎.",
			"TV ?꾩썝 ?곹깭媛 蹂寃쎈릺?덉뒿?덈떎.",
			"嫄곗떎",
			"TV ?꾩썝 ?곹깭瑜??뺤씤??二쇱꽭??"
		),
		template(
			"tv-volume-channel",
			"TV",
			"蹂쇰ⅷ쨌梨꾨꼸 ?덈궡",
			"TV",
			"TV",
			AlertType.LIFE,
			Severity.LOW,
			"TV 蹂쇰ⅷ 諛?梨꾨꼸 ?덈궡",
			"TV 蹂쇰ⅷ ?먮뒗 梨꾨꼸??蹂寃쎈릺?덉뒿?덈떎.",
			"TV 蹂쇰ⅷ ?먮뒗 梨꾨꼸??蹂寃쎈릺?덉뒿?덈떎.",
			"嫄곗떎",
			"?꾩옱 梨꾨꼸怨?蹂쇰ⅷ???뺤씤??二쇱꽭??"
		),
		template(
			"tv-remote-find",
			"TV",
			"由щえ而?李얘린",
			"TV",
			"TV",
			AlertType.LOCATION,
			Severity.MEDIUM,
			"TV 由щえ而?李얘린",
			"由щえ而??꾩튂 ?덈궡瑜??쒖옉?⑸땲??",
			"由щえ而??꾩튂 ?덈궡瑜??쒖옉?⑸땲??",
			"嫄곗떎",
			"二쇰? 吏꾨룞 ?먮뒗 ?꾩튂 ?덈궡???곕씪 由щえ而⑥쓣 李얠븘 二쇱꽭??"
		),
		template(
			"range-power-on",
			"?꾧린?덉씤吏",
			"?꾩썝 耳쒖쭚 ?덈궡",
			"RANGE",
			"?덉쟾 ?꾧린?덉씤吏",
			AlertType.LIFE,
			Severity.LOW,
			"?꾧린?덉씤吏 ?꾩썝 耳쒖쭚 ?덈궡",
			"?꾧린?덉씤吏 ?꾩썝??耳쒖졇 ?덉뒿?덈떎.",
			"?꾧린?덉씤吏 ?꾩썝??耳쒖졇 ?덉뒿?덈떎.",
			"二쇰갑",
			"議곕━ 以묒씠 ?꾨땲?쇰㈃ ?꾩썝??爰?二쇱꽭??"
		),
		template(
			"range-cooking-complete",
			"?꾧린?덉씤吏",
			"議곕━ ?꾨즺 ?뚮┝",
			"RANGE",
			"?덉쟾 ?꾧린?덉씤吏",
			AlertType.LIFE,
			Severity.MEDIUM,
			"議곕━ ?꾨즺 ?뚮┝",
			"議곕━媛 ?꾨즺?섏뿀?듬땲??",
			"議곕━媛 ?꾨즺?섏뿀?듬땲??",
			"二쇰갑",
			"議곕━ ?곹깭瑜??뺤씤?섍퀬 ?덉쟾?섍쾶 ?뺣━??二쇱꽭??"
		),
		template(
			"range-heat-warning",
			"?꾧린?덉씤吏",
			"?붿뿴쨌怨쇱뿴 寃쎄퀬",
			"RANGE",
			"?덉쟾 ?꾧린?덉씤吏",
			AlertType.EMERGENCY,
			Severity.CRITICAL,
			"?붿뿴 ?먮뒗 怨쇱뿴 寃쎄퀬",
			"?꾧린?덉씤吏???붿뿴 ?먮뒗 怨쇱뿴 ?꾪뿕??媛먯??섏뿀?듬땲??",
			"?꾧린?덉씤吏???붿뿴 ?먮뒗 怨쇱뿴 ?꾪뿕??媛먯??섏뿀?듬땲??",
			"二쇰갑",
			"湲곌린 二쇰???鍮꾩슦怨??꾩썝???뺤씤??二쇱꽭??"
		),
		template(
			"door-open",
			"?꾩뼱?쇱꽌",
			"臾??대┝ ?뚮┝",
			"DOOR_SENSOR",
			"?꾩뼱?쇱꽌",
			AlertType.LIFE,
			Severity.MEDIUM,
			"臾??대┝ ?뚮┝",
			"臾몄씠 ?대졇?듬땲??",
			"臾몄씠 ?대졇?듬땲??",
			"?꾧?",
			"臾몄씠 ?덉쟾?섍쾶 ?대━怨??ロ엳?붿? ?뺤씤??二쇱꽭??"
		),
		template(
			"door-long-open",
			"?꾩뼱?쇱꽌",
			"?μ떆媛??대┝ 寃쎄퀬",
			"DOOR_SENSOR",
			"?꾩뼱?쇱꽌",
			AlertType.LIFE,
			Severity.MEDIUM,
			"臾??μ떆媛??대┝ 寃쎄퀬",
			"臾몄씠 ?ㅻ옯?숈븞 ?대젮 ?덉뒿?덈떎.",
			"臾몄씠 ?ㅻ옯?숈븞 ?대젮 ?덉뒿?덈떎.",
			"?꾧?",
			"臾몄쓣 ?レ븘???섎뒗 ?곹솴?몄? ?뺤씤??二쇱꽭??"
		),
		template(
			"door-before-outing",
			"?꾩뼱?쇱꽌",
			"?몄텧쨌痍⑥묠 ???뺤씤",
			"DOOR_SENSOR",
			"?꾩뼱?쇱꽌",
			AlertType.LIFE,
			Severity.MEDIUM,
			"?몄텧 ?먮뒗 痍⑥묠 ??臾??뺤씤",
			"?몄텧 ?먮뒗 痍⑥묠 ?꾩뿉 臾??좉툑 ?곹깭瑜??뺤씤??二쇱꽭??",
			"?몄텧 ?먮뒗 痍⑥묠 ?꾩뿉 臾??좉툑 ?곹깭瑜??뺤씤??二쇱꽭??",
			"?꾧?",
			"臾??좉툑怨??ロ옒 ?곹깭瑜??뺤씤??二쇱꽭??"
		),
		template(
			"fridge-door-open",
			"?됱옣怨?,
			"臾??대┝ ?뚮┝",
			"REFRIGERATOR",
			"?됱옣怨?,
			AlertType.LIFE,
			Severity.MEDIUM,
			"?됱옣怨?臾??대┝ ?뚮┝",
			"?됱옣怨?臾몄씠 ?대젮 ?덉뒿?덈떎.",
			"?됱옣怨?臾몄씠 ?대젮 ?덉뒿?덈떎.",
			"二쇰갑",
			"?됱옣怨?臾몄씠 ?ロ삍?붿? ?뺤씤??二쇱꽭??"
		),
		template(
			"fridge-temperature-warning",
			"?됱옣怨?,
			"?⑤룄 ?댁긽 ?덈궡",
			"REFRIGERATOR",
			"?됱옣怨?,
			AlertType.LIFE,
			Severity.MEDIUM,
			"?됱옣怨??⑤룄 ?댁긽 ?덈궡",
			"?됱옣怨??대? ?⑤룄???댁긽???덉뒿?덈떎.",
			"?됱옣怨??대? ?⑤룄???댁긽???덉뒿?덈떎.",
			"二쇰갑",
			"?됱옣怨?臾멸낵 ?꾩썝 ?곹깭瑜??뺤씤??二쇱꽭??"
		),
		template(
			"fridge-food-find",
			"?됱옣怨?,
			"?앹옱猷?李얘린",
			"REFRIGERATOR",
			"?됱옣怨?,
			AlertType.LOCATION,
			Severity.LOW,
			"?됱옣怨??앹옱猷?李얘린",
			"?됱옣怨????앹옱猷??꾩튂 ?덈궡瑜??쒖옉?⑸땲??",
			"?됱옣怨????앹옱猷??꾩튂 ?덈궡瑜??쒖옉?⑸땲??",
			"二쇰갑",
			"?됱옣怨??덉そ 移몄쓣 李⑤??濡??뺤씤??二쇱꽭??"
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
		OffsetDateTime occurredAt = OffsetDateTime.now(SERVICE_OFFSET);
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

	public SimulatorEventResponse dispatchSimulatorEvent(
		String authorization,
		String targetUserEmail,
		String applianceType,
		String eventType,
		String title,
		String message
	) {
		requireAdmin(authorization);
		log.info(
			"Simulator event request received: targetUserEmail={}, applianceType={}, eventType={}, title={}",
			targetUserEmail,
			applianceType,
			eventType,
			title
		);
		if (targetUserEmail == null || targetUserEmail.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TARGET_USER", "????ъ슜??ID瑜??낅젰?댁＜?몄슂.");
		}
		if (applianceType == null || applianceType.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_APPLIANCE_TYPE", "媛??醫낅쪟媛 鍮꾩뼱 ?덉뒿?덈떎.");
		}
		if (eventType == null || eventType.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_EVENT_TYPE", "?대깽??醫낅쪟媛 鍮꾩뼱 ?덉뒿?덈떎.");
		}
		if (title == null || title.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TITLE", "?뚮┝ ?쒕ぉ??鍮꾩뼱 ?덉뒿?덈떎.");
		}
		if (message == null || message.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_MESSAGE", "?뚮┝ 硫붿떆吏媛 鍮꾩뼱 ?덉뒿?덈떎.");
		}

		SimulatorEventTemplate template = SimulatorEventTemplate.from(applianceType, eventType, title, message);
		OffsetDateTime occurredAt = OffsetDateTime.now(SERVICE_OFFSET);
		JdbcTemplate jdbcTemplate = jdbcTemplateProvider.getIfAvailable();
		String normalizedTargetUserEmail = targetUserEmail.trim().toLowerCase(Locale.ROOT);

		if (jdbcTemplate == null) {
			long targetUserId = resolveMockUserIdByEmail(normalizedTargetUserEmail);
			mockDataStore.user(targetUserId);
			mockDataStore.addContextAlert(
				targetUserId,
				template.alertType(),
				template.severity(),
				template.title(),
				template.message(),
				template.deviceName(),
				occurredAt,
				template.voiceGuide()
			);
			return new SimulatorEventResponse(
				targetUserId,
				template.applianceType(),
				template.eventType(),
				template.title(),
				template.message(),
				occurredAt
			);
		}

		long targetUserId;
		try {
			Long resolvedUserId = jdbcTemplate.queryForObject(
				"""
				SELECT u.user_id
				FROM app_user u
				JOIN account a ON a.account_id = u.account_id
				WHERE LOWER(a.email) = ?
				""",
				(rs, rowNum) -> rs.getLong("user_id"),
				normalizedTargetUserEmail
			);
			targetUserId = resolvedUserId == null ? 0 : resolvedUserId;
		}
		catch (EmptyResultDataAccessException exception) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "????ъ슜?먮? 李얠쓣 ???놁뒿?덈떎.");
		}

		long deviceId = resolveOrCreateDevice(jdbcTemplate, targetUserId, template.toAlertTemplate());
		long eventId = insertDeviceEvent(jdbcTemplate, deviceId, template.toAlertTemplate(), occurredAt);
		insertAlert(jdbcTemplate, targetUserId, eventId, template.toAlertTemplate(), occurredAt);
		log.info(
			"Simulator event created successfully: targetUserEmail={}, targetUserId={}, deviceId={}, eventId={}, applianceType={}, eventType={}",
			normalizedTargetUserEmail,
			targetUserId,
			deviceId,
			eventId,
			template.applianceType(),
			template.eventType()
		);

		return new SimulatorEventResponse(
			targetUserId,
			template.applianceType(),
			template.eventType(),
			template.title(),
			template.message(),
			occurredAt
		);
	}

	private boolean matchesAudience(AccessibilityType accessibilityType, BroadcastAudience audience) {
		if (audience == BroadcastAudience.ALL) {
			return true;
		}

		return audience.accessibilityType() == accessibilityType;
	}

	private long resolveMockUserIdByEmail(String normalizedEmail) {
		if ("lglg@lgableband.com".equals(normalizedEmail)) {
			return 1L;
		}
		if ("admin@example.com".equals(normalizedEmail)) {
			return 3L;
		}
		throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "????ъ슜???대찓?쇱쓣 李얠쓣 ???놁뒿?덈떎.");
	}

	private MvpDataService.CurrentUser requireAdmin(String authorization) {
		MvpDataService.CurrentUser user = dataService.currentUser(authorization);
		String normalizedEmail = user.email() == null ? "" : user.email().trim().toLowerCase(Locale.ROOT);
		if (!ADMIN_EMAILS.contains(normalizedEmail)) {
			throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "愿由ъ옄留??ъ슜?????덈뒗 湲곕뒫?낅땲??");
		}
		return user;
	}

	private AlertTemplate findTemplate(String templateId) {
		return ALERT_TEMPLATES.stream()
			.filter(template -> template.templateId().equals(templateId))
			.findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "?뚮┝ ?쒗뵆由우쓣 李얠쓣 ???놁뒿?덈떎."));
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
			ps.setObject(5, toLocalDateTime(occurredAt));
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
			toLocalDateTime(occurredAt)
		);
	}

	private LocalDateTime toLocalDateTime(OffsetDateTime dateTime) {
		return dateTime.atZoneSameInstant(SERVICE_OFFSET).toLocalDateTime();
	}

	private String buildPayloadJson(AlertTemplate template) {
		return """
			{"locationName":"%s","recommendedAction":"%s","requiresGuardianNotify":%s,"deviceName":"%s"}
			""".formatted(
			escapeJson(template.locationName()),
			escapeJson(template.recommendedAction()),
			template.severity() == Severity.MEDIUM || template.severity() == Severity.CRITICAL,
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

	public record SimulatorEventResponse(
		long targetUserId,
		String applianceType,
		String eventType,
		String title,
		String message,
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

	private record SimulatorEventTemplate(
		String applianceType,
		String eventType,
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
		private static SimulatorEventTemplate from(
			String applianceType,
			String eventType,
			String title,
			String message
		) {
			String normalizedAppliance = applianceType.trim().toUpperCase(Locale.ROOT);
			String normalizedEvent = eventType.trim().toUpperCase(Locale.ROOT);
			return switch (normalizedAppliance) {
				case "WASHING_MACHINE" -> new SimulatorEventTemplate(
					normalizedAppliance,
					normalizedEvent,
					"?명긽湲?,
					DeviceType.WASHER,
					normalizedEvent.contains("ERROR") || normalizedEvent.contains("DOOR")
						? AlertType.LIFE
						: AlertType.LIFE,
					normalizedEvent.contains("ERROR") || normalizedEvent.contains("DOOR")
						? Severity.MEDIUM
						: Severity.LOW,
					title,
					message,
					message,
					"?명긽??,
					"?명긽湲??곹깭瑜??뺤씤?댁＜?몄슂."
				);
				case "AIR_QUALITY_SENSOR" -> new SimulatorEventTemplate(
					normalizedAppliance,
					normalizedEvent,
					"LG 怨듦린吏??쇱꽌",
					DeviceType.AIR_SENSOR,
					AlertType.LIFE,
					normalizedEvent.contains("FINE_DUST") || normalizedEvent.contains("HIGH_CO2")
						? Severity.MEDIUM
						: Severity.MEDIUM,
					title,
					message,
					message,
					"嫄곗떎",
					"?ㅻ궡 ?섍린 ?곹깭瑜??뺤씤?댁＜?몄슂."
				);
				case "TV" -> new SimulatorEventTemplate(
					normalizedAppliance,
					normalizedEvent,
					"TV",
					DeviceType.TV,
					isEmergencySimulatorEvent(normalizedEvent) ? AlertType.EMERGENCY
						: normalizedEvent.contains("FIND_REMOTE") ? AlertType.LOCATION
						: AlertType.LIFE,
					isEmergencySimulatorEvent(normalizedEvent) ? Severity.CRITICAL : Severity.LOW,
					title,
					message,
					message,
					"嫄곗떎",
					"TV ?곹깭瑜??뺤씤?댁＜?몄슂."
				);
				case "ELECTRIC_RANGE" -> new SimulatorEventTemplate(
					normalizedAppliance,
					normalizedEvent,
					"?꾧린?덉씤吏",
					DeviceType.RANGE,
					isEmergencySimulatorEvent(normalizedEvent)
						|| normalizedEvent.contains("OVERHEAT")
						|| normalizedEvent.contains("LONG")
						? AlertType.EMERGENCY
						: AlertType.LIFE,
					isEmergencySimulatorEvent(normalizedEvent)
						|| normalizedEvent.contains("OVERHEAT")
						|| normalizedEvent.contains("LONG")
						? Severity.CRITICAL
						: Severity.LOW,
					title,
					message,
					message,
					"二쇰갑",
					"?꾧린?덉씤吏 ???곹깭瑜??뺤씤?댁＜?몄슂."
				);
				case "DOOR_SENSOR" -> new SimulatorEventTemplate(
					normalizedAppliance,
					normalizedEvent,
					"?꾩뼱 ?쇱꽌",
					DeviceType.DOOR_SENSOR,
					normalizedEvent.contains("LEFT_OPEN") || normalizedEvent.contains("CHECK_DOOR")
						? AlertType.LIFE
						: AlertType.LIFE,
					normalizedEvent.contains("LEFT_OPEN") || normalizedEvent.contains("CHECK_DOOR")
						? Severity.MEDIUM
						: Severity.LOW,
					title,
					message,
					message,
					"?꾧?",
					"臾??곹깭瑜??뺤씤?댁＜?몄슂."
				);
				case "REFRIGERATOR" -> new SimulatorEventTemplate(
					normalizedAppliance,
					normalizedEvent,
					"?됱옣怨?,
					DeviceType.REFRIGERATOR,
					normalizedEvent.contains("FIND_ITEM") ? AlertType.LOCATION
						: normalizedEvent.contains("TEMPERATURE") ? AlertType.LIFE
						: AlertType.LIFE,
					normalizedEvent.contains("TEMPERATURE") ? Severity.MEDIUM : Severity.LOW,
					title,
					message,
					message,
					"二쇰갑",
					"?됱옣怨??곹깭瑜??뺤씤?댁＜?몄슂."
				);
				default -> throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_APPLIANCE_TYPE", "吏?먰븯吏 ?딅뒗 媛??醫낅쪟?낅땲??");
			};
		}

		private static boolean isEmergencySimulatorEvent(String normalizedEvent) {
			return normalizedEvent.contains("EMERGENCY")
				|| normalizedEvent.contains("SOS")
				|| normalizedEvent.contains("DANGER")
				|| normalizedEvent.contains("RISK")
				|| normalizedEvent.contains("ALERT_POPUP")
				|| normalizedEvent.contains("POPUP");
		}

		private AlertTemplate toAlertTemplate() {
			return new AlertTemplate(
				"simulator-" + this.applianceType + "-" + this.eventType,
				"?쒕??덉씠??,
				this.eventType,
				this.deviceName,
				this.deviceType,
				this.alertType,
				this.severity,
				this.title,
				this.message,
				this.voiceGuide,
				this.locationName,
				this.recommendedAction
			);
		}
	}
}
