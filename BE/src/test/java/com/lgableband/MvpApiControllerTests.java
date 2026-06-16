package com.lgableband;

import static org.hamcrest.Matchers.blankOrNullString;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
	"db.host=",
	"db.port=",
	"db.name=",
	"db.user=",
	"db.password=",
	"emergency.ai.enabled=false"
})
@AutoConfigureMockMvc
class MvpApiControllerTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void userCanLoginAndLoadHome() throws Exception {
		MvcResult login = this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "email": "user@example.com",
					  "password": "password1234"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken", not(blankOrNullString())))
			.andExpect(jsonPath("$.role").value("USER"))
			.andReturn();

		String token = login.getResponse().getContentAsString()
			.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");

		this.mockMvc.perform(get("/api/app/home").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("홍길동"))
			.andExpect(jsonPath("$.recentAlerts[0].alertId").exists())
			.andExpect(jsonPath("$.quickActions.canRequestEmergency").value(true));
	}

	@Test
	void alertCanBeConfirmed() throws Exception {
		MvcResult login = this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "email": "user@example.com",
					  "password": "password1234"
					}
					"""))
			.andExpect(status().isOk())
			.andReturn();

		String token = login.getResponse().getContentAsString()
			.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");

		this.mockMvc.perform(post("/api/alerts/101/confirm").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CONFIRMED"));
	}

	@Test
	void alertsCanBeLoadedAndReplayed() throws Exception {
		MvcResult login = this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "email": "user@example.com",
					  "password": "password1234"
					}
					"""))
			.andExpect(status().isOk())
			.andReturn();

		String token = login.getResponse().getContentAsString()
			.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");

		this.mockMvc.perform(get("/api/alerts").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].alertId").exists())
			.andExpect(jsonPath("$.items[0].voiceGuide").exists())
			.andExpect(jsonPath("$.items[0].recommendedAction").exists());

		this.mockMvc.perform(post("/api/alerts/101/replay").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("REPLAYED"))
			.andExpect(jsonPath("$.voiceGuide", not(blankOrNullString())));
	}

	@Test
	void adminCanBroadcastAlertToAllUsers() throws Exception {
		String adminToken = loginToken("USER", "admin@example.com");
		String userToken = loginToken("USER", "user@example.com");

		this.mockMvc.perform(get("/api/admin/alert-templates").header("Authorization", "Bearer " + adminToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].templateId").exists())
			.andExpect(jsonPath("$.items[0].categoryName").exists());

		this.mockMvc.perform(post("/api/admin/alerts/broadcast")
				.header("Authorization", "Bearer " + adminToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "templateId": "washer-complete",
					  "audience": "ALL"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.templateId").value("washer-complete"))
			.andExpect(jsonPath("$.audience").value("ALL"))
			.andExpect(jsonPath("$.dispatchedUserCount").value(greaterThanOrEqualTo(2)));

		this.mockMvc.perform(get("/api/alerts").header("Authorization", "Bearer " + userToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].title").value("세탁 완료 알림"));
	}

	@Test
	void nonAdminUserCannotBroadcastAlert() throws Exception {
		String userToken = loginToken("USER", "user@example.com");

		this.mockMvc.perform(post("/api/admin/alerts/broadcast")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "templateId": "washer-complete",
					  "audience": "ALL"
					}
					"""))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("FORBIDDEN"));
	}

	@Test
	void adminCanBroadcastAlertToSpecificAccessibilityGroup() throws Exception {
		String adminToken = loginToken("USER", "admin@example.com");
		String suffix = "hearing-broadcast-" + System.nanoTime();
		signupUserAndToken(suffix);

		this.mockMvc.perform(post("/api/admin/alerts/broadcast")
				.header("Authorization", "Bearer " + adminToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "templateId": "tv-power-status",
					  "audience": "HEARING"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.templateId").value("tv-power-status"))
			.andExpect(jsonPath("$.audience").value("HEARING"))
			.andExpect(jsonPath("$.dispatchedUserCount").value(greaterThanOrEqualTo(1)));
	}

	@Test
	void guardianCanSignupAndLogin() throws Exception {
		this.mockMvc.perform(post("/api/auth/signup")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "GUARDIAN",
					  "name": "guardian",
					  "email": "guardian-new@example.com",
					  "password": "password1234",
					  "phone": "010-1234-5678",
					  "relationship": "FAMILY"
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.role").value("GUARDIAN"));

		this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "GUARDIAN",
					  "email": "guardian-new@example.com",
					  "password": "password1234"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken", not(blankOrNullString())))
			.andExpect(jsonPath("$.role").value("GUARDIAN"))
			.andExpect(jsonPath("$.guardianProfile.relationship").value("FAMILY"));
	}

	@Test
	void guardianCanLoadDashboardForLinkedUser() throws Exception {
		MvcResult login = this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "GUARDIAN",
					  "email": "guardian@example.com",
					  "password": "password1234"
					}
					"""))
			.andExpect(status().isOk())
			.andReturn();

		String token = login.getResponse().getContentAsString()
			.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");

		this.mockMvc.perform(get("/api/guardians/dashboard").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("홍길동"))
			.andExpect(jsonPath("$.dangerAlerts[0].title").exists())
			.andExpect(jsonPath("$.summary.safetyMessage").exists());
	}

	@Test
	void demoAccountsAndWearableSeedAreStable() throws Exception {
		String userToken = loginToken("USER", "user@example.com");
		String guardianToken = loginToken("GUARDIAN", "guardian@example.com");

		this.mockMvc.perform(get("/api/guardians").header("Authorization", "Bearer " + userToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].name").value("김보호"))
			.andExpect(jsonPath("$.items[0].connectionStatus").value("CONNECTED"));

		this.mockMvc.perform(get("/api/guardians/dashboard").header("Authorization", "Bearer " + guardianToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("홍길동"));

		String vendorDeviceId = "able-band-demo-001";
		MvcResult created = this.mockMvc.perform(post("/api/devices")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(deviceCreateBody(vendorDeviceId)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.type").value("WEARABLE"))
			.andExpect(jsonPath("$.vendorDeviceId").value(vendorDeviceId))
			.andReturn();
		String deviceId = extractJsonNumber(created.getResponse().getContentAsString(), "deviceId");

		this.mockMvc.perform(delete("/api/devices/" + deviceId).header("Authorization", "Bearer " + userToken))
			.andExpect(status().isNoContent());

		this.mockMvc.perform(post("/api/devices")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(deviceCreateBody(vendorDeviceId)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.type").value("WEARABLE"))
			.andExpect(jsonPath("$.vendorDeviceId").value(vendorDeviceId));
	}

	@Test
	void guardiansCanBeManaged() throws Exception {
		String token = userToken();
		String pairingCompleteMessage =
			"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

		MvcResult created = this.mockMvc.perform(post("/api/guardians")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "name": "박보호",
					  "phone": "010-2222-3333",
					  "isPrimary": false,
					  "notifyOnDanger": true
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.name").value("박보호"))
			.andExpect(jsonPath("$.isPrimary").value(false))
			.andExpect(jsonPath("$.notifyOnDanger").value(true))
			.andReturn();

		String guardianId = created.getResponse().getContentAsString()
			.replaceAll(".*\\\"guardianId\\\":([0-9]+).*", "$1");

		this.mockMvc.perform(put("/api/guardians/" + guardianId)
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "name": "박주보호",
					  "phone": "010-3333-4444",
					  "isPrimary": true,
					  "notifyOnDanger": false
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("박주보호"))
			.andExpect(jsonPath("$.isPrimary").value(true))
			.andExpect(jsonPath("$.notifyOnDanger").value(false));

		this.mockMvc.perform(delete("/api/guardians/" + guardianId)
				.header("Authorization", "Bearer " + token))
			.andExpect(status().isNoContent());
	}

	@Test
	void guardianCanBeLinkedByAccountEmail() throws Exception {
		this.mockMvc.perform(post("/api/auth/signup")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "GUARDIAN",
					  "name": "이메일보호",
					  "email": "guardian-link@example.com",
					  "password": "password1234",
					  "phone": "010-5555-6666",
					  "relationship": "FAMILY"
					}
					"""))
			.andExpect(status().isCreated());

		String token = userToken();
		String pairingCompleteMessage =
			"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

		this.mockMvc.perform(post("/api/guardians/link-by-email")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "email": "guardian-link@example.com",
					  "isPrimary": false,
					  "notifyOnDanger": true
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.name").value("이메일보호"))
			.andExpect(jsonPath("$.phone").value("010-5555-6666"))
			.andExpect(jsonPath("$.connectionStatus").value("CONNECTED"));
	}

	@Test
	void unlinkedGuardianCannotLoadDashboardForUser() throws Exception {
		String suffix = "unlinked-dashboard-" + System.nanoTime();
		String guardianEmail = signupGuardian(suffix);
		String guardianToken = loginToken("GUARDIAN", guardianEmail);

		this.mockMvc.perform(get("/api/guardians/dashboard").header("Authorization", "Bearer " + guardianToken))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
	}

	@Test
	void guardianLinkByEmailHandlesNotFoundDuplicateAndInvalidEmail() throws Exception {
		String suffix = "link-errors-" + System.nanoTime();
		String userToken = signupUserAndToken(suffix);
		String guardianEmail = signupGuardian(suffix);

		this.mockMvc.perform(post("/api/guardians/link-by-email")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "email": "missing-%s@example.com",
					  "isPrimary": false,
					  "notifyOnDanger": true
					}
					""".formatted(suffix)))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

		this.mockMvc.perform(post("/api/guardians/link-by-email")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "email": "not-an-email",
					  "isPrimary": false,
					  "notifyOnDanger": true
					}
					"""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		linkGuardianByEmail(userToken, guardianEmail, true, true);

		this.mockMvc.perform(post("/api/guardians/link-by-email")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "email": "%s",
					  "isPrimary": true,
					  "notifyOnDanger": true
					}
					""".formatted(guardianEmail)))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("DUPLICATED_GUARDIAN"));
	}

	@Test
	void livingSignalsCanBeLoadedAndUpdated() throws Exception {
		String token = userToken();
		String pairingCompleteMessage =
			"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

		this.mockMvc.perform(get("/api/living-signals").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.threshold").exists())
			.andExpect(jsonPath("$.workflow[0]").exists())
			.andExpect(jsonPath("$.sounds[0].registeredSoundName").exists());

		MvcResult created = this.mockMvc.perform(post("/api/living-signals/sounds")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "registeredSoundName": "우리 집 초인종",
					  "soundType": "doorbell",
					  "notes": "현관 앞에서 들리는 기본 초인종입니다.",
					  "recordings": [
					    {
					      "label": "doorbell-sample-1",
					      "createdAt": "2026-06-11T13:20:00+09:00",
					      "durationSec": 1.8,
					      "audioDataUrl": "data:audio/wav;base64,AAAA",
					      "embedding": [0.11, 0.22, 0.33, 0.44]
					    }
					  ]
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.registeredSoundName").value("우리 집 초인종"))
			.andExpect(jsonPath("$.soundType").value("doorbell"))
			.andExpect(jsonPath("$.recordings[0].label").value("doorbell-sample-1"))
			.andReturn();

		String soundId = created.getResponse().getContentAsString()
			.replaceAll(".*\\\"soundId\\\":([0-9]+).*", "$1");

		this.mockMvc.perform(put("/api/living-signals/sounds/" + soundId)
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "registeredSoundName": "수정된 초인종",
					  "soundType": "doorbell",
					  "notes": "현관 초인종 샘플을 업데이트했습니다.",
					  "recordings": [
					    {
					      "label": "doorbell-sample-2",
					      "createdAt": "2026-06-11T13:25:00+09:00",
					      "durationSec": 2.0,
					      "audioDataUrl": "data:audio/wav;base64,BBBB",
					      "embedding": [0.21, 0.31, 0.41, 0.51]
					    }
					  ]
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.registeredSoundName").value("수정된 초인종"))
			.andExpect(jsonPath("$.recordings[0].label").value("doorbell-sample-2"));

		this.mockMvc.perform(put("/api/living-signals/threshold")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "threshold": 0.85
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.threshold").value(0.85));

		this.mockMvc.perform(delete("/api/living-signals/sounds/" + soundId)
				.header("Authorization", "Bearer " + token))
			.andExpect(status().isOk());
	}

	@Test
	void wearableDetectionCanCreateLivingSignalAlert() throws Exception {
		String token = userToken();

		this.mockMvc.perform(post("/api/living-signals/detections")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "registeredSoundName": "우리 아파트 방송음",
					  "soundType": "apartment_announcement",
					  "similarity": 0.87,
					  "detectedAt": "2026-06-16T10:30:00+09:00"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.title").value("우리 아파트 방송음 감지"))
			.andExpect(jsonPath("$.message", containsString("우리 아파트 방송음")))
			.andExpect(jsonPath("$.status").value("UNREAD"));

		this.mockMvc.perform(get("/api/alerts").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].title").value("우리 아파트 방송음 감지"));
	}

	@Test
	void contextJudgmentCreatesAlertAndCanBeListed() throws Exception {
		String token = userToken();
		String pairingCompleteMessage =
			"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

		this.mockMvc.perform(post("/api/context/judgments")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "userId": 1,
					  "accessibilityType": "HEARING",
					  "deviceType": "DOOR_SENSOR",
					  "deviceName": "현관문 센서",
					  "eventType": "LONG_OPEN",
					  "location": "현관",
					  "durationSec": 300,
					  "userResponse": "NO_RESPONSE"
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.riskLevel").value("HIGH"))
			.andExpect(jsonPath("$.riskScore").value(85))
			.andExpect(jsonPath("$.notifyGuardian").value(true))
			.andExpect(jsonPath("$.recommendedChannels[0]").value("BAND_VIBRATION"));

		this.mockMvc.perform(get("/api/context/judgments").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].deviceType").value("DOOR_SENSOR"));

		this.mockMvc.perform(get("/api/alerts").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].title").value("위험 상황 감지"));
	}

	@Test
	void warningRecommendationAndEmergencyHistoryAreAvailable() throws Exception {
		String token = userToken();
		String pairingCompleteMessage =
			"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

		this.mockMvc.perform(post("/api/warnings/recommendations")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "accessibilityType": "HEARING",
					  "category": "DANGER",
					  "riskLevel": "HIGH",
					  "riskScore": 85,
					  "eventType": "LONG_OPEN"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.vibrationPattern").value("STRONG_REPEAT"))
			.andExpect(jsonPath("$.voiceEnabled").value(false))
			.andExpect(jsonPath("$.notifyGuardian").value(true));

		MvcResult emergency = this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "message": "도움이 필요합니다.",
					  "source": "APP"
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.guardianNotified").value(true))
			.andExpect(jsonPath("$.guardianTargets[0].name").exists())
			.andReturn();

		String emergencyRequestId = emergency.getResponse().getContentAsString()
			.replaceAll(".*\\\"emergencyRequestId\\\":([0-9]+).*", "$1");

		this.mockMvc.perform(get("/api/emergency-requests").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].status").value("SENT"));

		this.mockMvc.perform(get("/api/emergency-requests/" + emergencyRequestId).header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.source").value("APP"));

		this.mockMvc.perform(patch("/api/emergency-requests/" + emergencyRequestId + "/status")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "status": "RESOLVED"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("RESOLVED"));
	}

	@Test
	void emergencyRequestCreatesGuardianDeliveryRows() throws Exception {
		String suffix = "delivery-" + System.nanoTime();
		String userToken = signupUserAndToken(suffix);
		String primaryGuardianEmail = signupGuardian(suffix + "-primary");
		String secondaryGuardianEmail = signupGuardian(suffix + "-secondary");
		linkGuardianByEmail(userToken, primaryGuardianEmail, true, true);
		linkGuardianByEmail(userToken, secondaryGuardianEmail, false, true);

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "message": "전달 상태 확인 요청",
					  "source": "APP"
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("SENT"))
			.andExpect(jsonPath("$.source").value("APP"))
			.andExpect(jsonPath("$.guardianNotified").value(true))
			.andExpect(jsonPath("$.guardianTargets[0].deliveryStatus").value("SENT"))
			.andExpect(jsonPath("$.guardianTargets[1].deliveryStatus").value("SENT"))
			.andExpect(jsonPath("$.guardianTargets[2]").doesNotExist());

		String guardianToken = loginToken("GUARDIAN", primaryGuardianEmail);
		this.mockMvc.perform(get("/api/guardians/dashboard").header("Authorization", "Bearer " + guardianToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.emergencyRequests[0].source").value("APP"))
			.andExpect(jsonPath("$.summary.activeEmergency").value(true));
	}

	@Test
	void emergencyRequestHasDuplicateCooldown() throws Exception {
		String suffix = "duplicate-" + System.nanoTime();
		String userToken = signupUserAndToken(suffix);
		String guardianEmail = signupGuardian(suffix);
		linkGuardianByEmail(userToken, guardianEmail, true, true);
		String body = """
			{
			  "message": "웨어러블 중복 요청",
			  "source": "WEARABLE"
			}
			""";

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("SENT"));

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("EMERGENCY_DUPLICATE_COOLDOWN"));

		this.mockMvc.perform(get("/api/emergency-requests").header("Authorization", "Bearer " + userToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].source").value("WEARABLE"))
			.andExpect(jsonPath("$.items[1]").doesNotExist());
	}

	@Test
	void emergencyCooldownIsScopedBySource() throws Exception {
		String suffix = "source-cooldown-" + System.nanoTime();
		String userToken = signupUserAndToken(suffix);
		String guardianEmail = signupGuardian(suffix);
		linkGuardianByEmail(userToken, guardianEmail, true, true);

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "message": "앱에서 요청",
					  "source": "APP"
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.source").value("APP"));

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "message": "웨어러블에서 요청",
					  "source": "WEARABLE"
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.source").value("WEARABLE"));

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "message": "앱에서 다시 요청",
					  "source": "APP"
					}
					"""))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("EMERGENCY_DUPLICATE_COOLDOWN"));
	}

	@Test
	void emergencyRequestFailsWhenUserHasNoGuardian() throws Exception {
		String token = signupUserAndToken("noguardian-" + System.nanoTime());

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "message": "보호자 없이 요청합니다.",
					  "source": "APP"
					}
					"""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("NO_GUARDIAN"));
	}

	@Test
	void emergencyRequestWithoutAuthorizationReturnsUnauthorized() throws Exception {
		this.mockMvc.perform(post("/api/emergency-requests")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "message": "인증 없이 요청합니다.",
					  "source": "APP"
					}
					"""))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
	}

	@Test
	void linkedGuardianDashboardShowsNewEmergencyRequest() throws Exception {
		String suffix = "dashboard-" + System.nanoTime();
		String userToken = signupUserAndToken(suffix);
		String guardianEmail = signupGuardian(suffix);
		String message = "Codex 보호자 대시보드 확인 " + suffix;

		this.mockMvc.perform(post("/api/guardians/link-by-email")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "email": "%s",
					  "isPrimary": true,
					  "notifyOnDanger": true
					}
					""".formatted(guardianEmail)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.connectionStatus").value("CONNECTED"));

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + userToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "message": "%s",
					  "source": "WEARABLE"
					}
					""".formatted(message)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("SENT"))
			.andExpect(jsonPath("$.guardianNotified").value(true))
			.andExpect(jsonPath("$.guardianTargets[0].deliveryStatus").value("SENT"));

		String guardianToken = loginToken("GUARDIAN", guardianEmail);

		this.mockMvc.perform(get("/api/guardians/dashboard").header("Authorization", "Bearer " + guardianToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("Codex 사용자 " + suffix))
			.andExpect(jsonPath("$.emergencyRequests[0].message").value(message))
			.andExpect(jsonPath("$.emergencyRequests[0].status").value("SENT"))
			.andExpect(jsonPath("$.summary.activeEmergency").value(true));
	}

	@Test
	void wearablePairingSessionCanBeCreated() throws Exception {
		String deviceId = "able-band-test-" + System.nanoTime();

		this.mockMvc.perform(post("/api/wearable/pairing-sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingSessionCreateBody(deviceId)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.pairingSessionId", containsString("pairing-")))
			.andExpect(jsonPath("$.deviceId").value(deviceId))
			.andExpect(jsonPath("$.deviceName").value("LG Able Band"))
			.andExpect(jsonPath("$.pairingCode").value("ABLE-4IN-260610"))
			.andExpect(jsonPath("$.status").value("WAITING"))
			.andExpect(jsonPath("$.pairingPayload", containsString("lg-able-band://pair")))
			.andExpect(jsonPath("$.pairingPayload", containsString("source=wearable")));
	}

	@Test
	void userCanCompleteWearablePairingSession() throws Exception {
		String deviceId = "able-band-complete-" + System.nanoTime();
		PairingFixture pairing = createPairingSession(deviceId);
		String token = userToken();
		String pairingCompleteMessage =
			"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce(), "ABLE-4IN-260610")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.pairingSessionId").value(pairing.sessionId()))
			.andExpect(jsonPath("$.status").value("PAIRED"))
			.andExpect(jsonPath("$.device.name").value("LG Able Band"))
			.andExpect(jsonPath("$.device.type").value("WEARABLE"))
			.andExpect(jsonPath("$.device.connectionStatus").value("CONNECTED"))
			.andExpect(jsonPath("$.accessToken").value(token))
			.andExpect(jsonPath("$.message").value(pairingCompleteMessage));
	}

	@Test
	void wearablePollingAfterCompleteReturnsPairedStatus() throws Exception {
		String deviceId = "able-band-poll-" + System.nanoTime();
		PairingFixture pairing = createPairingSession(deviceId);
		String token = userToken();
		String pairingCompleteMessage =
			"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce(), "ABLE-4IN-260610")))
			.andExpect(status().isOk());

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", pairing.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PAIRED"))
			.andExpect(jsonPath("$.linkedDeviceId").exists())
			.andExpect(jsonPath("$.accessToken").value(token));
	}

	@Test
	void wearablePairingRejectsWrongPairingCode() throws Exception {
		String deviceId = "able-band-wrong-" + System.nanoTime();
		PairingFixture pairing = createPairingSession(deviceId);

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + userToken())
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce(), "WRONG-CODE")))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_PAIRING_PAYLOAD"));
	}

	@Test
	void wearablePairingCompletionIsIdempotentForSameUserAndPayload() throws Exception {
		String deviceId = "able-band-repeat-" + System.nanoTime();
		PairingFixture pairing = createPairingSession(deviceId);
		String token = userToken();
		String pairingCompleteMessage =
			"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";
		String body = pairingCompleteBody(deviceId, pairing.nonce(), "ABLE-4IN-260610");

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PAIRED"));

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PAIRED"))
			.andExpect(jsonPath("$.accessToken").value(token));
	}

	private String userToken() throws Exception {
		return loginToken("USER", "user@example.com");
	}

	private PairingFixture createPairingSession(String deviceId) throws Exception {
		MvcResult created = this.mockMvc.perform(post("/api/wearable/pairing-sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingSessionCreateBody(deviceId)))
			.andExpect(status().isCreated())
			.andReturn();

		String content = created.getResponse().getContentAsString();
		return new PairingFixture(
			extractJsonString(content, "pairingSessionId"),
			extractJsonString(content, "nonce")
		);
	}

	private String pairingSessionCreateBody(String deviceId) {
		return """
			{
			  "deviceId": "%s",
			  "deviceName": "LG Able Band",
			  "pairingCode": "ABLE-4IN-260610"
			}
			""".formatted(deviceId);
	}

	private String pairingCompleteBody(String deviceId, String nonce, String pairingCode) {
		return """
			{
			  "deviceId": "%s",
			  "pairingCode": "%s",
			  "nonce": "%s"
			}
			""".formatted(deviceId, pairingCode, nonce);
	}

	private String deviceCreateBody(String vendorDeviceId) {
		return """
			{
			  "vendor": "LG",
			  "vendorDeviceId": "%s",
			  "name": "LG Able Band",
			  "type": "WEARABLE",
			  "locationSupported": true,
			  "remoteEnabled": true
			}
			""".formatted(vendorDeviceId);
	}

	private String extractJsonString(String content, String key) {
		String marker = "\"" + key + "\":\"";
		int start = content.indexOf(marker);
		if (start < 0) {
			return "";
		}
		int valueStart = start + marker.length();
		int valueEnd = content.indexOf("\"", valueStart);
		return valueEnd < 0 ? "" : content.substring(valueStart, valueEnd);
	}

	private String extractJsonNumber(String content, String key) {
		String marker = "\"" + key + "\":";
		int start = content.indexOf(marker);
		if (start < 0) {
			return "";
		}
		int valueStart = start + marker.length();
		int valueEnd = valueStart;
		while (valueEnd < content.length() && Character.isDigit(content.charAt(valueEnd))) {
			valueEnd++;
		}
		return content.substring(valueStart, valueEnd);
	}

	private String signupUserAndToken(String suffix) throws Exception {
		String email = "codex-user-" + suffix + "@example.com";
		this.mockMvc.perform(post("/api/auth/signup")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "name": "Codex 사용자 %s",
					  "email": "%s",
					  "password": "password1234",
					  "accessibilityType": "HEARING",
					  "notificationPrefs": {
					    "channels": ["VOICE", "VIBRATION"],
					    "highContrast": true,
					    "largeText": true
					  }
					}
					""".formatted(suffix, email)))
			.andExpect(status().isCreated());
		return loginToken("USER", email);
	}

	private String signupGuardian(String suffix) throws Exception {
		String email = "codex-guardian-" + suffix + "@example.com";
		this.mockMvc.perform(post("/api/auth/signup")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "GUARDIAN",
					  "name": "Codex 보호자 %s",
					  "email": "%s",
					  "password": "password1234",
					  "phone": "010-0000-0000",
					  "relationship": "FAMILY"
					}
					""".formatted(suffix, email)))
			.andExpect(status().isCreated());
		return email;
	}

	private void linkGuardianByEmail(String token, String guardianEmail, boolean isPrimary, boolean notifyOnDanger)
		throws Exception {
		this.mockMvc.perform(post("/api/guardians/link-by-email")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "email": "%s",
					  "isPrimary": %s,
					  "notifyOnDanger": %s
					}
					""".formatted(guardianEmail, isPrimary, notifyOnDanger)))
			.andExpect(status().isCreated());
	}

	private String loginToken(String role, String email) throws Exception {
		MvcResult login = this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "%s",
					  "email": "%s",
					  "password": "password1234"
					}
					""".formatted(role, email)))
			.andExpect(status().isOk())
			.andReturn();
		return login.getResponse().getContentAsString()
			.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
	}

	private record PairingFixture(String sessionId, String nonce) {
	}
}
