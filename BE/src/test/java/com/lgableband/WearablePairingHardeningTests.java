package com.lgableband;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicReference;
import com.lgableband.auth.MvpDataService;
import com.lgableband.device.DeviceService;
import com.lgableband.wearable.WearablePairingRepository;
import com.lgableband.wearable.WearablePairingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
	"db.host=",
	"db.port=",
	"db.name=",
	"db.user=",
	"db.password=",
	"emergency.ai.enabled=false",
	"wearable.pairing.ttl-seconds=1"
})
@AutoConfigureMockMvc
class WearablePairingHardeningTests {

	private static final String PAIRING_CODE = "ABLE-4IN-260610";
	private static final Instant BASE_TIME = Instant.parse("2026-06-10T00:00:00Z");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MutableClock clock;

	@Autowired
	private MvpDataService dataService;

	@Autowired
	private DeviceService deviceService;

	@Autowired
	private WearablePairingRepository pairingRepository;

	@TempDir
	private Path tempDir;

	@BeforeEach
	void resetClock() {
		this.clock.set(BASE_TIME);
	}

	@Test
	void pairingTtlCanBeConfiguredForTests() throws Exception {
		String deviceId = uniqueDeviceId("configured-ttl");

		MvcResult created = this.mockMvc.perform(post("/api/wearable/pairing-sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingSessionCreateBody(deviceId)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.expiresInMinutes").value(0))
			.andReturn();

		OffsetDateTime issuedAt = OffsetDateTime.parse(extractJsonText(
			created.getResponse().getContentAsString(),
			"issuedAt"
		));
		OffsetDateTime expiresAt = OffsetDateTime.parse(extractJsonText(
			created.getResponse().getContentAsString(),
			"expiresAt"
		));

		org.junit.jupiter.api.Assertions.assertEquals(Duration.ofSeconds(1), Duration.between(issuedAt, expiresAt));
	}

	@Test
	void pairingDefaultTtlRemainsFiveMinutes() {
		WearablePairingService service = new WearablePairingService(
			this.dataService,
			this.deviceService,
			this.pairingRepository,
			300,
			this.clock
		);

		WearablePairingService.PairingSessionResponse created = service.createSession(
			uniqueDeviceId("default-ttl"),
			"LG Able Band",
			PAIRING_CODE
		);

		org.junit.jupiter.api.Assertions.assertEquals(
			Duration.ofMinutes(5),
			Duration.between(created.issuedAt(), created.expiresAt())
		);
	}

	@Test
	void pairingSessionPersistsAcrossRepositoryBoundary() {
		WearablePairingService firstService = new WearablePairingService(
			this.dataService,
			this.deviceService,
			this.pairingRepository,
			300,
			this.clock
		);
		WearablePairingService.PairingSessionResponse created = firstService.createSession(
			uniqueDeviceId("repository-boundary"),
			"LG Able Band",
			PAIRING_CODE
		);
		WearablePairingService secondService = new WearablePairingService(
			this.dataService,
			this.deviceService,
			this.pairingRepository,
			300,
			this.clock
		);

		WearablePairingService.PairingSessionStatusResponse status = secondService.status(
			created.pairingSessionId(),
			created.deviceId(),
			created.nonce()
		);

		org.junit.jupiter.api.Assertions.assertEquals(
			WearablePairingService.PairingStatus.WAITING,
			status.status()
		);
	}

	@Test
	void pairingSessionPersistsAcrossRepositoryFallbackFile() {
		Path fallbackFile = this.tempDir.resolve("pairing-sessions.tsv");
		WearablePairingRepository firstRepository = new WearablePairingRepository(fallbackFile);
		WearablePairingService firstService = new WearablePairingService(
			this.dataService,
			this.deviceService,
			firstRepository,
			300,
			this.clock
		);
		WearablePairingService.PairingSessionResponse created = firstService.createSession(
			uniqueDeviceId("repository-file"),
			"LG Able Band",
			PAIRING_CODE
		);
		WearablePairingRepository secondRepository = new WearablePairingRepository(fallbackFile);
		WearablePairingService secondService = new WearablePairingService(
			this.dataService,
			this.deviceService,
			secondRepository,
			300,
			this.clock
		);

		WearablePairingService.PairingSessionStatusResponse status = secondService.status(
			created.pairingSessionId(),
			created.deviceId(),
			created.nonce()
		);

		org.junit.jupiter.api.Assertions.assertEquals(
			WearablePairingService.PairingStatus.WAITING,
			status.status()
		);
	}

	@Test
	void creatingPairingSessionReusesExistingWaitingQrForSameBand() throws Exception {
		String deviceId = uniqueDeviceId("single-active-qr");
		PairingFixture first = createPairingSession(deviceId);
		PairingFixture second = createPairingSession(deviceId);

		org.junit.jupiter.api.Assertions.assertEquals(first.sessionId(), second.sessionId());
		org.junit.jupiter.api.Assertions.assertEquals(first.nonce(), second.nonce());

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + first.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", first.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("WAITING"));

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + second.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", second.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("WAITING"));
	}

	@Test
	void creatingPairingSessionAfterExpiryIssuesNewQrForSameBand() throws Exception {
		String deviceId = uniqueDeviceId("new-after-expiry");
		PairingFixture first = createPairingSession(deviceId);

		this.clock.advance(Duration.ofSeconds(2));

		PairingFixture second = createPairingSession(deviceId);

		org.junit.jupiter.api.Assertions.assertNotEquals(first.sessionId(), second.sessionId());
		org.junit.jupiter.api.Assertions.assertNotEquals(first.nonce(), second.nonce());

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + first.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", first.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("EXPIRED"));

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + second.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", second.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("WAITING"));

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + first.sessionId() + "/complete")
				.header("Authorization", "Bearer " + userToken())
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, first.nonce())))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PAIRING_EXPIRED"));
	}

	@Test
	void wearablePairingCanBeCompletedAndPolled() throws Exception {
		String deviceId = uniqueDeviceId("complete-poll");
		PairingFixture pairing = createPairingSession(deviceId);
		String token = userToken();

		MvcResult complete = this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce())))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.pairingSessionId").value(pairing.sessionId()))
			.andExpect(jsonPath("$.status").value("PAIRED"))
			.andExpect(jsonPath("$.device.name").value("LG Able Band"))
			.andExpect(jsonPath("$.device.type").value("WEARABLE"))
			.andExpect(jsonPath("$.accessToken").value(token))
			.andReturn();
		long linkedDeviceId = extractJsonLong(complete.getResponse().getContentAsString(), "deviceId");

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", pairing.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PAIRED"))
			.andExpect(jsonPath("$.linkedDeviceId").value((int) linkedDeviceId))
			.andExpect(jsonPath("$.accessToken").value(token));
	}

	@Test
	void wearablePairingRejectsWrongNonce() throws Exception {
		String deviceId = uniqueDeviceId("wrong-nonce");
		PairingFixture pairing = createPairingSession(deviceId);

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + userToken())
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, "wrong-" + pairing.nonce())))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_PAIRING_PAYLOAD"));

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", "wrong-" + pairing.nonce()))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("INVALID_PAIRING_PAYLOAD"));
	}

	@Test
	void wearablePairingIsIdempotentForSameUser() throws Exception {
		String deviceId = uniqueDeviceId("regen-token");
		PairingFixture pairing = createPairingSession(deviceId);
		String firstToken = userToken();

		MvcResult firstComplete = this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + firstToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce())))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PAIRED"))
			.andExpect(jsonPath("$.accessToken").value(firstToken))
			.andReturn();
		long linkedDeviceId = extractJsonLong(firstComplete.getResponse().getContentAsString(), "deviceId");
		String secondToken = userToken();

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + secondToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce())))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PAIRED"))
			.andExpect(jsonPath("$.device.deviceId").value((int) linkedDeviceId))
			.andExpect(jsonPath("$.accessToken").value(secondToken));
	}

	@Test
	void wearablePairingRejectsDifferentUserAfterComplete() throws Exception {
		String deviceId = uniqueDeviceId("different-user");
		PairingFixture pairing = createPairingSession(deviceId);
		String ownerToken = userToken();
		String otherToken = signupUserToken("pairing-other-" + System.nanoTime());
		String body = pairingCompleteBody(deviceId, pairing.nonce());

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + ownerToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("PAIRED"));

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + otherToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PAIRING_ALREADY_COMPLETED"));
	}

	@Test
	void wearablePairingCanBeUnpaired() throws Exception {
		String deviceId = uniqueDeviceId("unpair");
		PairingFixture pairing = createPairingSession(deviceId);
		String token = userToken();

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce())))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken").value(token));

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/unpair")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(unpairBody(deviceId, pairing.nonce())))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.pairingSessionId").value(pairing.sessionId()))
			.andExpect(jsonPath("$.status").value("UNPAIRED"));

		this.mockMvc.perform(delete("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.header("Authorization", "Bearer " + token)
				.param("deviceId", deviceId)
				.param("nonce", pairing.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.pairingSessionId").value(pairing.sessionId()))
			.andExpect(jsonPath("$.status").value("UNPAIRED"));

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", pairing.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("UNPAIRED"))
			.andExpect(jsonPath("$.linkedDeviceId").value(nullValue()))
			.andExpect(jsonPath("$.accessToken").value(nullValue()));

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce())))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PAIRING_UNPAIRED"));
	}

	@Test
	void userCanDeleteOwnedDeviceAndRemoveItFromDeviceList() throws Exception {
		String token = userToken();
		String vendorDeviceId = uniqueDeviceId("delete");
		MvcResult created = this.mockMvc.perform(post("/api/devices")
				.header("Authorization", "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(deviceCreateBody(vendorDeviceId)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.vendorDeviceId").value(vendorDeviceId))
			.andReturn();
		long deviceId = extractJsonLong(created.getResponse().getContentAsString(), "deviceId");

		this.mockMvc.perform(delete("/api/devices/" + deviceId)
				.header("Authorization", "Bearer " + token))
			.andExpect(status().isNoContent());

		this.mockMvc.perform(get("/api/devices")
			.header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[?(@.deviceId == %d)]".formatted(deviceId), hasSize(0)));
	}

	@Test
	void userCannotDeleteAnotherUsersDevice() throws Exception {
		String ownerToken = userToken();
		String otherToken = signupUserToken("delete-other-" + System.nanoTime());
		String vendorDeviceId = uniqueDeviceId("delete-other");
		MvcResult created = this.mockMvc.perform(post("/api/devices")
				.header("Authorization", "Bearer " + ownerToken)
				.contentType(MediaType.APPLICATION_JSON)
				.content(deviceCreateBody(vendorDeviceId)))
			.andExpect(status().isCreated())
			.andReturn();
		long deviceId = extractJsonLong(created.getResponse().getContentAsString(), "deviceId");

		this.mockMvc.perform(delete("/api/devices/" + deviceId)
				.header("Authorization", "Bearer " + otherToken))
			.andExpect(status().isNotFound())
			.andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

		this.mockMvc.perform(get("/api/devices")
				.header("Authorization", "Bearer " + ownerToken))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[?(@.deviceId == %d)]".formatted(deviceId), hasSize(1)));
	}

	@Test
	void pairingSessionExpiresUsingConfiguredTtlAndInjectedClock() throws Exception {
		String deviceId = uniqueDeviceId("ttl");
		PairingFixture pairing = createPairingSession(deviceId);

		this.clock.advance(Duration.ofSeconds(2));

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", pairing.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("EXPIRED"))
			.andExpect(jsonPath("$.accessToken").value(nullValue()));

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + userToken())
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce())))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PAIRING_EXPIRED"));
	}

	@Test
	void expiredPairingSessionCannotBeCompleted() throws Exception {
		String deviceId = uniqueDeviceId("expired-complete");
		PairingFixture pairing = createPairingSession(deviceId);

		this.clock.advance(Duration.ofSeconds(2));

		this.mockMvc.perform(post("/api/wearable/pairing-sessions/" + pairing.sessionId() + "/complete")
				.header("Authorization", "Bearer " + userToken())
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingCompleteBody(deviceId, pairing.nonce())))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("PAIRING_EXPIRED"));
	}

	@Test
	void expiredPairingSessionsAreCleanedUp() throws Exception {
		String deviceId = uniqueDeviceId("expired-cleanup");
		PairingFixture pairing = createPairingSession(deviceId);

		this.clock.advance(Duration.ofSeconds(2));

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", pairing.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("EXPIRED"));

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", pairing.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("EXPIRED"));

		this.clock.set(BASE_TIME);

		this.mockMvc.perform(get("/api/wearable/pairing-sessions/" + pairing.sessionId())
				.param("deviceId", deviceId)
				.param("nonce", pairing.nonce()))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("EXPIRED"));
	}

	private PairingFixture createPairingSession(String deviceId) throws Exception {
		MvcResult created = this.mockMvc.perform(post("/api/wearable/pairing-sessions")
				.contentType(MediaType.APPLICATION_JSON)
				.content(pairingSessionCreateBody(deviceId)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.deviceId").value(deviceId))
			.andExpect(jsonPath("$.status").value("WAITING"))
			.andExpect(jsonPath("$.nonce").isNotEmpty())
			.andExpect(jsonPath("$.expiresAt").isNotEmpty())
			.andExpect(jsonPath("$.pairingPayload").isNotEmpty())
			.andReturn();
		String content = created.getResponse().getContentAsString();
		return new PairingFixture(
			extractJsonString(content, "pairingSessionId"),
			extractJsonString(content, "nonce")
		);
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
		return extractJsonString(login.getResponse().getContentAsString(), "accessToken");
	}

	private String signupUserToken(String suffix) throws Exception {
		String email = suffix + "@example.com";
		this.mockMvc.perform(post("/api/auth/signup")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "name": "Pairing 사용자 %s",
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

		MvcResult login = this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "email": "%s",
					  "password": "password1234"
					}
					""".formatted(email)))
			.andExpect(status().isOk())
			.andReturn();
		return extractJsonString(login.getResponse().getContentAsString(), "accessToken");
	}

	private String pairingSessionCreateBody(String deviceId) {
		return """
			{
			  "deviceId": "%s",
			  "deviceName": "LG Able Band",
			  "pairingCode": "%s"
			}
			""".formatted(deviceId, PAIRING_CODE);
	}

	private String pairingCompleteBody(String deviceId, String nonce) {
		return """
			{
			  "deviceId": "%s",
			  "pairingCode": "%s",
			  "nonce": "%s"
			}
			""".formatted(deviceId, PAIRING_CODE, nonce);
	}

	private String unpairBody(String deviceId, String nonce) {
		return """
			{
			  "deviceId": "%s",
			  "nonce": "%s"
			}
			""".formatted(deviceId, nonce);
	}

	private String deviceCreateBody(String vendorDeviceId) {
		return """
			{
			  "vendor": "LG",
			  "vendorDeviceId": "%s",
			  "name": "삭제 테스트 밴드",
			  "type": "WEARABLE",
			  "locationSupported": true,
			  "remoteEnabled": true
			}
			""".formatted(vendorDeviceId);
	}

	private String uniqueDeviceId(String prefix) {
		return "able-band-%s-%d".formatted(prefix, System.nanoTime());
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

	private long extractJsonLong(String content, String key) {
		String marker = "\"" + key + "\":";
		int start = content.indexOf(marker);
		if (start < 0) {
			return -1;
		}
		int valueStart = start + marker.length();
		int valueEnd = valueStart;
		while (valueEnd < content.length() && Character.isDigit(content.charAt(valueEnd))) {
			valueEnd++;
		}
		return Long.parseLong(content.substring(valueStart, valueEnd));
	}

	private String extractJsonText(String content, String key) {
		String marker = "\"" + key + "\":\"";
		int start = content.indexOf(marker);
		if (start < 0) {
			return "";
		}
		int valueStart = start + marker.length();
		int valueEnd = content.indexOf('"', valueStart);
		if (valueEnd < 0) {
			return "";
		}
		return content.substring(valueStart, valueEnd);
	}

	@TestConfiguration
	static class ClockConfig {

		@Bean
		MutableClock wearablePairingClock() {
			return new MutableClock(BASE_TIME, ZoneOffset.ofHours(9));
		}
	}

	static final class MutableClock extends Clock {

		private final AtomicReference<Instant> instant;
		private final ZoneId zone;

		private MutableClock(Instant instant, ZoneId zone) {
			this.instant = new AtomicReference<>(instant);
			this.zone = zone;
		}

		void set(Instant instant) {
			this.instant.set(instant);
		}

		void advance(Duration duration) {
			this.instant.updateAndGet(current -> current.plus(duration));
		}

		@Override
		public ZoneId getZone() {
			return this.zone;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return new MutableClock(this.instant.get(), zone);
		}

		@Override
		public Instant instant() {
			return this.instant.get();
		}
	}

	private record PairingFixture(String sessionId, String nonce) {
	}
}
