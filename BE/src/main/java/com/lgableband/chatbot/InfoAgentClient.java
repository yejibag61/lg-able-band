package com.lgableband.chatbot;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class InfoAgentClient {

	private final JsonAiClient client;

	public InfoAgentClient(
		ObjectMapper objectMapper,
		@Value("${ml.info-agent.base-url:http://127.0.0.1:8004}") String baseUrl,
		@Value("${ml.info-agent.connect-timeout-ms:1000}") long connectTimeoutMs,
		@Value("${ml.info-agent.timeout-ms:30000}") long timeoutMs
	) {
		this.client = new JsonAiClient(
			objectMapper,
			baseUrl,
			"/api/info-agent/query",
			connectTimeoutMs,
			timeoutMs,
			"Info Agent"
		);
	}

	public Optional<Map<String, Object>> query(String query, String accessibilityType, int topK, Map<String, Object> context) {
		Map<String, Object> payload = new LinkedHashMap<>();
		payload.put("query", query);
		payload.put("userAccessibilityType", accessibilityType);
		payload.put("topK", topK);
		if (context != null && !context.isEmpty()) {
			payload.put("context", context);
		}
		return this.client.post(payload)
			.filter(response -> Boolean.TRUE.equals(response.get("success")));
	}
}
