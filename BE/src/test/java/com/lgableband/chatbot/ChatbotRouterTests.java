package com.lgableband.chatbot;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class ChatbotRouterTests {

	@ParameterizedTest
	@ValueSource(strings = {
		"최근 알림 읽어줘",
		"세탁기 몇 분 남았어?",
		"냉장고 문 열려 있어?",
		"보호자에게 연락해줘"
	})
	void keepsExistingCommandsOnSoundChatbot(String question) throws Exception {
		try (Servers servers = Servers.start()) {
			assertThat(servers.router().shouldUseInfoAgent(question)).isFalse();
		}
	}

	@ParameterizedTest
	@ValueSource(strings = {
		"장애인 의료비 지원 정보 알려줘",
		"청각장애인을 위한 수어통역 지원이 있어?",
		"폭염 때 장애인은 어떻게 해야 해?",
		"장애인 차별 신고 어디에 해?",
		"시각장애인 보조기기 지원 알려줘"
	})
	void routesInformationQuestionsToInfoAgent(String question) throws Exception {
		try (Servers servers = Servers.start()) {
			assertThat(servers.router().shouldUseInfoAgent(question)).isTrue();
		}
	}

	@ParameterizedTest
	@CsvSource({
		"VISUAL, VISUAL_IMPAIRED",
		"HEARING, HEARING_IMPAIRED",
		"VISUAL_IMPAIRED, VISUAL_IMPAIRED",
		"HEARING_IMPAIRED, HEARING_IMPAIRED",
		"VISUAL_HEARING_IMPAIRED, VISUAL_HEARING_IMPAIRED",
		"PHYSICAL_IMPAIRED, PHYSICAL_IMPAIRED",
		"NONE, ALL",
		"UNKNOWN, ALL"
	})
	void mapsAccessibilityTypesForInfoAgent(String input, String expected) throws Exception {
		try (Servers servers = Servers.start()) {
			assertThat(servers.router().accessibilityType(request("질문", input))).isEqualTo(expected);
		}
	}

	@Test
	void routesExistingCommandsToSoundChatbotWithoutChangingResponse() throws Exception {
		try (Servers servers = Servers.start()) {
			Map<String, Object> response = servers.router().route(request("최근 알림 읽어줘", "VISUAL"));

			assertThat(response.get("intent")).isEqualTo("READ_RECENT_ALERT");
			assertThat(response.get("action")).isEqualTo("READ_RECENT_ALERT");
			assertThat(servers.soundRequests()).isEqualTo(1);
			assertThat(servers.infoRequests()).isZero();
		}
	}

	@Test
	void routesInformationQuestionsAndMapsInfoAgentResponse() throws Exception {
		try (Servers servers = Servers.start()) {
			Map<String, Object> response = servers.router().route(request("장애인 의료비 지원 정보 알려줘", "HEARING"));

			assertThat(response.get("intent")).isEqualTo("INFO_AGENT_QUERY");
			assertThat(response.get("action")).isEqualTo("SHOW_INFO_CARD");
			assertThat(response.get("responseType")).isEqualTo("INFO_CARD");
			assertThat(response.get("answerText")).isEqualTo("장애인의료비지원 정보를 찾았어요.");
			assertThat(response.get("voiceText")).isEqualTo("장애인의료비지원 정보를 찾았어요. 출처에서 확인해 주세요.");
			assertThat(response.get("infoCard")).isInstanceOf(Map.class);
			assertThat(servers.infoRequestBody()).contains("\"userAccessibilityType\":\"HEARING_IMPAIRED\"");
			assertThat(servers.soundRequests()).isZero();
		}
	}

	@Test
	void existingCommandKeywordsTakePriorityOverInformationKeywords() throws Exception {
		try (Servers servers = Servers.start()) {
			servers.router().route(request("최근 알림 지원 내용을 읽어줘", "NONE"));

			assertThat(servers.soundRequests()).isEqualTo(1);
			assertThat(servers.infoRequests()).isZero();
		}
	}

	@Test
	void routesShortFollowupToInfoAgentWithLastInfoAgentTitle() throws Exception {
		try (Servers servers = Servers.start()) {
			Map<String, Object> response = servers.router().route(followupRequest("담당 기관 문의 방법은?"));

			assertThat(response.get("responseType")).isEqualTo("FOLLOWUP_ANSWER");
			assertThat(response.get("intent")).isEqualTo("INFO_AGENT_FOLLOWUP");
			assertThat(response.get("action")).isEqualTo("ANSWER_FOLLOWUP");
			assertThat(response.get("infoCard")).isNull();
			assertThat(response.get("answerText")).isEqualTo("장애인의료비지원 문의는 관할 주민센터에서 확인해 주세요.");
			assertThat(servers.infoRequestBody()).contains("\"query\":\"장애인의료비지원 담당 기관 문의 방법은?\"");
			assertThat(servers.infoRequestBody()).contains("\"isFollowup\":true");
			assertThat(servers.soundRequests()).isZero();
		}
	}

	@ParameterizedTest
	@ValueSource(strings = {
		"지원 대상은 누구야?",
		"누가 받을 수 있어?",
		"신청 조건은?"
	})
	void routesEligibilityFollowupsToInfoAgent(String question) throws Exception {
		try (Servers servers = Servers.start()) {
			servers.router().route(followupRequest(question));

			assertThat(servers.infoRequests()).isEqualTo(1);
			assertThat(servers.infoRequestBody()).contains("\"isFollowup\":true");
			assertThat(servers.soundRequests()).isZero();
		}
	}

	@Test
	void keepsExplicitSoundCommandAheadOfInfoAgentFollowupContext() throws Exception {
		try (Servers servers = Servers.start()) {
			servers.router().route(followupRequest("세탁기 신청 상태 알려줘"));

			assertThat(servers.soundRequests()).isEqualTo(1);
			assertThat(servers.infoRequests()).isZero();
		}
	}

	@Test
	void doesNotRouteShortFollowupWithoutInfoAgentContext() throws Exception {
		try (Servers servers = Servers.start()) {
			servers.router().route(request("담당 기관 문의 방법은?", "VISUAL"));

			assertThat(servers.soundRequests()).isEqualTo(1);
			assertThat(servers.infoRequests()).isZero();
		}
	}

	@Test
	void returnsSafeResponseWhenInfoAgentIsUnavailable() {
		var objectMapper = JsonMapper.builder().build();
		var router = new ChatbotRouter(
			new SoundChatbotClient(objectMapper, "http://127.0.0.1:1", 10, 10),
			new InfoAgentClient(objectMapper, "http://127.0.0.1:1", 10, 10)
		);

		Map<String, Object> response = router.route(request("시각장애인 보조기기 지원 알려줘", "VISUAL"));

		assertThat(response.get("intent")).isEqualTo("INFO_AGENT_QUERY");
		assertThat(response.get("action")).isEqualTo("INFO_AGENT_UNAVAILABLE");
		assertThat(response.get("answerText")).isEqualTo(response.get("voiceText"));
	}

	private static Map<String, Object> request(String text, String accessibilityType) {
		return Map.of(
			"sessionId", "test",
			"text", text,
			"user", Map.of("accessibilityType", accessibilityType),
			"context", Map.of()
		);
	}

	private static Map<String, Object> followupRequest(String text) {
		return Map.of(
			"sessionId", "test",
			"text", text,
			"user", Map.of("accessibilityType", "VISUAL"),
			"context", Map.of(
				"lastInfoAgent", Map.of(
					"title", "장애인의료비지원",
					"category", "의료/건강",
					"priority", "MEDIUM",
					"source", "복지로"
				)
			)
		);
	}

	private static final class Servers implements AutoCloseable {
		private final HttpServer sound;
		private final HttpServer info;
		private final int[] soundRequests = {0};
		private final int[] infoRequests = {0};
		private final String[] infoRequestBody = {""};
		private final ChatbotRouter router;

		private Servers(HttpServer sound, HttpServer info, ChatbotRouter router) {
			this.sound = sound;
			this.info = info;
			this.router = router;
		}

		static Servers start() throws Exception {
			HttpServer sound = HttpServer.create(new InetSocketAddress(0), 0);
			HttpServer info = HttpServer.create(new InetSocketAddress(0), 0);
			var objectMapper = JsonMapper.builder().build();
			var holder = new Servers[] {null};

			sound.createContext("/api/ai/voice-chat", exchange -> {
				holder[0].soundRequests[0]++;
				respond(exchange, """
					{"intent":"READ_RECENT_ALERT","action":"READ_RECENT_ALERT","answerText":"최근 알림입니다.","voiceText":"최근 알림입니다."}
					""");
			});
			info.createContext("/api/info-agent/query", exchange -> {
				holder[0].infoRequests[0]++;
				holder[0].infoRequestBody[0] = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
				if (holder[0].infoRequestBody[0].contains("\"isFollowup\":true")) {
					respond(exchange, """
						{
						  "success": true,
						  "responseType": "FOLLOWUP_ANSWER",
						  "voiceMessage": "장애인의료비지원 문의는 관할 주민센터에서 확인해 주세요.",
						  "classification": {"category":"의료/건강","accessibilityTarget":"ALL","priority":"MEDIUM"},
						  "appCard": null,
						  "followupAnswer": {
						    "type": "CONTACT",
						    "topic": "장애인의료비지원",
						    "answer": "장애인의료비지원 문의는 관할 주민센터에서 확인해 주세요.",
						    "source": "복지로"
						  },
						  "sourceDocuments": []
						}
						""");
					return;
				}
				respond(exchange, """
					{
					  "success": true,
					  "responseType": "INFO_CARD",
					  "answerText": "장애인의료비지원 정보를 찾았어요.",
					  "voiceText": "장애인의료비지원 정보를 찾았어요. 출처에서 확인해 주세요.",
					  "notificationTabMessage": "장애인의료비지원 정보입니다.",
					  "voiceMessage": "장애인의료비지원 안내입니다.",
					  "bandMessage": "의료비 지원",
					  "recommendedChannels": ["APP", "BAND"],
					  "notifyGuardian": false,
					  "classification": {"category":"의료/건강","accessibilityTarget":"ALL","priority":"MEDIUM"},
					  "appCard": {"title":"장애인의료비지원","summary":"요약","recommendedAction":"확인하세요.","source":"복지로","url":""},
					  "sourceDocuments": []
					}
					""");
			});
			sound.start();
			info.start();

			ChatbotRouter router = new ChatbotRouter(
				new SoundChatbotClient(objectMapper, url(sound), 1000, 1000),
				new InfoAgentClient(objectMapper, url(info), 1000, 1000)
			);
			Servers servers = new Servers(sound, info, router);
			holder[0] = servers;
			return servers;
		}

		ChatbotRouter router() {
			return this.router;
		}

		int soundRequests() {
			return this.soundRequests[0];
		}

		int infoRequests() {
			return this.infoRequests[0];
		}

		String infoRequestBody() {
			return this.infoRequestBody[0];
		}

		@Override
		public void close() {
			this.sound.stop(0);
			this.info.stop(0);
		}

		private static String url(HttpServer server) {
			return "http://127.0.0.1:" + server.getAddress().getPort();
		}

		private static void respond(com.sun.net.httpserver.HttpExchange exchange, String json) throws java.io.IOException {
			byte[] body = json.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, body.length);
			exchange.getResponseBody().write(body);
			exchange.close();
		}
	}
}
