package com.lgableband;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.blankOrNullString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
	"db.password="
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
	void contextJudgmentCreatesAlertAndCanBeListed() throws Exception {
		String token = userToken();

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

	private String userToken() throws Exception {
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
		return login.getResponse().getContentAsString()
			.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
	}
}
