package com.lgableband;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.blankOrNullString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
class BackendHardeningApiTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void duplicateEmergencyRequestIsRejectedDuringCooldown() throws Exception {
		String suffix = "cooldown-" + System.nanoTime();
		String token = signupUserAndToken(suffix);
		String guardianEmail = signupGuardian(suffix);
		linkGuardian(token, guardianEmail);

		String body = """
			{
			  "message": "즉시 도움이 필요합니다.",
			  "source": "WEARABLE"
			}
			""";

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("SENT"));

		this.mockMvc.perform(post("/api/emergency-requests")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("EMERGENCY_DUPLICATE_COOLDOWN"));
	}

	@Test
	void eventsReturnAccurateTotalElements() throws Exception {
		String token = userToken();
		createDangerJudgment(token, "hardening-one");
		createDangerJudgment(token, "hardening-two");

		MvcResult fullResult = this.mockMvc.perform(get("/api/events")
				.header("Authorization", "Bearer " + token)
				.param("type", "DANGER")
				.param("page", "0")
				.param("size", "200"))
			.andExpect(status().isOk())
			.andReturn();
		String fullPayload = fullResult.getResponse().getContentAsString();
		int filteredCount = countOccurrences(fullPayload, "\"eventId\":");
		assertThat(filteredCount).isGreaterThanOrEqualTo(2);

		MvcResult pageResult = this.mockMvc.perform(get("/api/events")
				.header("Authorization", "Bearer " + token)
				.param("type", "DANGER")
				.param("page", "0")
				.param("size", "1"))
			.andExpect(status().isOk())
			.andReturn();
		String pagePayload = pageResult.getResponse().getContentAsString();

		assertThat(countOccurrences(pagePayload, "\"eventId\":")).isEqualTo(1);
		assertThat(parseLongField(pagePayload, "totalElements")).isEqualTo(filteredCount);

		String otherToken = signupUserAndToken("events-other-" + System.nanoTime());
		this.mockMvc.perform(get("/api/events")
				.header("Authorization", "Bearer " + otherToken)
				.param("type", "DANGER")
				.param("page", "0")
				.param("size", "20"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items.length()").value(0))
			.andExpect(jsonPath("$.totalElements").value(0));
	}

	@Test
	void eventFiltersRejectMalformedInputAndAllowEmptyFutureRange() throws Exception {
		String token = userToken();

		this.mockMvc.perform(get("/api/events")
				.header("Authorization", "Bearer " + token)
				.param("from", "2099-01-01T00:00:00+09:00")
				.param("page", "0")
				.param("size", "20"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items.length()").value(0))
			.andExpect(jsonPath("$.totalElements").value(0));

		this.mockMvc.perform(get("/api/events")
				.header("Authorization", "Bearer " + token)
				.param("from", "bad-date"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		this.mockMvc.perform(get("/api/events")
				.header("Authorization", "Bearer " + token)
				.param("type", "NOPE"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		this.mockMvc.perform(get("/api/events")
				.header("Authorization", "Bearer " + token)
				.param("page", "-1"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		this.mockMvc.perform(get("/api/events")
				.header("Authorization", "Bearer " + token)
				.param("size", "0"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void uwbSessionAccessRequiresOwnerAuthorization() throws Exception {
		String ownerToken = userToken();
		long sessionId = startUwbSession(ownerToken, 10);

		this.mockMvc.perform(get("/api/uwb/sessions/" + sessionId))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

		this.mockMvc.perform(post("/api/uwb/sessions/" + sessionId + "/stop"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

		String otherToken = signupUserAndToken("uwb-other-" + System.nanoTime());

		this.mockMvc.perform(get("/api/uwb/sessions/" + sessionId)
				.header("Authorization", "Bearer " + otherToken))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

		this.mockMvc.perform(post("/api/uwb/sessions/" + sessionId + "/stop")
				.header("Authorization", "Bearer " + otherToken))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

		this.mockMvc.perform(get("/api/uwb/sessions/" + sessionId)
				.header("Authorization", "Bearer " + ownerToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.targetDevice.deviceId").value(10))
			.andExpect(jsonPath("$.targetDevice.name").value("세탁기"))
			.andExpect(jsonPath("$.targetDeviceName").value("세탁기"))
			.andExpect(jsonPath("$.status").value("ACTIVE"))
			.andExpect(jsonPath("$.navigationStatus").value("ACTIVE"));

		this.mockMvc.perform(post("/api/uwb/sessions/" + sessionId + "/stop")
				.header("Authorization", "Bearer " + ownerToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CANCELED"))
			.andExpect(jsonPath("$.navigationStatus").value("CANCELED"));
	}

	@Test
	void alertConfirmAcceptsResponseTypeBodyAndNoBody() throws Exception {
		String token = userToken();

		this.mockMvc.perform(post("/api/alerts/101/confirm")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "responseType": "CONFIRMED"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CONFIRMED"))
			.andExpect(jsonPath("$.confirmedAt", not(blankOrNullString())));

		this.mockMvc.perform(post("/api/alerts/102/confirm")
				.header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CONFIRMED"))
			.andExpect(jsonPath("$.confirmedAt", not(blankOrNullString())));
	}

	private void createDangerJudgment(String token, String marker) throws Exception {
		this.mockMvc.perform(post("/api/context/judgments")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "accessibilityType": "HEARING",
					  "deviceType": "DOOR_SENSOR",
					  "deviceName": "현관문 센서 %s",
					  "eventType": "LONG_OPEN",
					  "location": "현관",
					  "durationSec": 360,
					  "userResponse": "NO_RESPONSE"
					}
					""".formatted(marker)))
			.andExpect(status().isCreated());
	}

	private long startUwbSession(String token, long targetDeviceId) throws Exception {
		MvcResult result = this.mockMvc.perform(post("/api/uwb/sessions")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "targetDeviceId": %d
					}
					""".formatted(targetDeviceId)))
			.andExpect(status().isCreated())
			.andReturn();
		return parseLongField(result.getResponse().getContentAsString(), "sessionId");
	}

	private void linkGuardian(String token, String guardianEmail) throws Exception {
		this.mockMvc.perform(post("/api/guardians/link-by-email")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "email": "%s",
					  "isPrimary": true,
					  "notifyOnDanger": true
					}
					""".formatted(guardianEmail)))
			.andExpect(status().isCreated());
	}

	private String userToken() throws Exception {
		return loginToken("USER", "user@example.com");
	}

	private String signupUserAndToken(String suffix) throws Exception {
		String email = "hardening-user-" + suffix + "@example.com";
		this.mockMvc.perform(post("/api/auth/signup")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "name": "Hardening 사용자 %s",
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
		String email = "hardening-guardian-" + suffix + "@example.com";
		this.mockMvc.perform(post("/api/auth/signup")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "GUARDIAN",
					  "name": "Hardening 보호자 %s",
					  "email": "%s",
					  "password": "password1234",
					  "phone": "010-0000-0000",
					  "relationship": "FAMILY"
					}
					""".formatted(suffix, email)))
			.andExpect(status().isCreated());
		return email;
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
		return parseStringField(login.getResponse().getContentAsString(), "accessToken");
	}

	private int countOccurrences(String content, String needle) {
		int count = 0;
		int index = content.indexOf(needle);
		while (index >= 0) {
			count++;
			index = content.indexOf(needle, index + needle.length());
		}
		return count;
	}

	private long parseLongField(String content, String field) {
		Matcher matcher = Pattern.compile("\"" + Pattern.quote(field) + "\"\\s*:\\s*(\\d+)").matcher(content);
		assertThat(matcher.find()).as("numeric JSON field %s in %s", field, content).isTrue();
		return Long.parseLong(matcher.group(1));
	}

	private String parseStringField(String content, String field) {
		Matcher matcher = Pattern.compile("\"" + Pattern.quote(field) + "\"\\s*:\\s*\"([^\"]*)\"").matcher(content);
		assertThat(matcher.find()).as("string JSON field %s in %s", field, content).isTrue();
		return matcher.group(1);
	}
}
