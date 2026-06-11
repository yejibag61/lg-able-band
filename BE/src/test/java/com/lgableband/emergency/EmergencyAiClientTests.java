package com.lgableband.emergency;

import static org.assertj.core.api.Assertions.assertThat;

import com.lgableband.emergency.EmergencyAiClient.EmergencyAiRequest;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class EmergencyAiClientTests {

	@Test
	void readsEmergencyAiJudgmentOverHttp() throws Exception {
		HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
		server.createContext("/api/ai/judge-emergency", exchange -> {
			byte[] body = """
				{
				  "emergencyLevel": "CRITICAL",
				  "emergencyStatus": "SENT",
				  "notifyGuardian": true,
				  "callGuardian": false,
				  "saveEventHistory": true,
				  "alertType": "EMERGENCY",
				  "message": "보호자에게 긴급 요청을 보냈습니다.",
				  "recommendedChannels": ["GUARDIAN_PUSH", "APP_SCREEN"],
				  "vibrationPattern": "SOS_REPEAT",
				  "screenMode": "EMERGENCY_FULL_SCREEN"
				}
				""".getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().add("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, body.length);
			exchange.getResponseBody().write(body);
			exchange.close();
		});
		server.start();

		try {
			EmergencyAiClient client = new EmergencyAiClient(
				JsonMapper.builder().build(),
				"http://127.0.0.1:" + server.getAddress().getPort(),
				1000,
				1000,
				true
			);

			var response = client.judge(new EmergencyAiRequest(
				1,
				"APP",
				"MANUAL_REQUEST",
				null,
				null,
				null,
				null,
				null,
				"도움이 필요합니다."
			));

			assertThat(response).isPresent();
			assertThat(response.orElseThrow().emergencyLevel()).isEqualTo("CRITICAL");
			assertThat(response.orElseThrow().recommendedChannels()).contains("GUARDIAN_PUSH");
		} finally {
			server.stop(0);
		}
	}
}
