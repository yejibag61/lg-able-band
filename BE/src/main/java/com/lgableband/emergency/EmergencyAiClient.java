package com.lgableband.emergency;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class EmergencyAiClient {

	private static final Logger log = LoggerFactory.getLogger(EmergencyAiClient.class);

	private final ObjectMapper objectMapper;
	private final HttpClient httpClient;
	private final URI judgmentUri;
	private final Duration readTimeout;
	private final boolean enabled;

	public EmergencyAiClient(
		ObjectMapper objectMapper,
		@Value("${emergency.ai.base-url:http://127.0.0.1:8003}") String baseUrl,
		@Value("${emergency.ai.connect-timeout-ms:1000}") long connectTimeoutMs,
		@Value("${emergency.ai.read-timeout-ms:3000}") long readTimeoutMs,
		@Value("${emergency.ai.enabled:true}") boolean enabled
	) {
		this.objectMapper = objectMapper;
		this.httpClient = HttpClient.newBuilder()
			.connectTimeout(Duration.ofMillis(connectTimeoutMs))
			.build();
		this.judgmentUri = URI.create(baseUrl.replaceAll("/+$", "") + "/api/ai/judge-emergency");
		this.readTimeout = Duration.ofMillis(readTimeoutMs);
		this.enabled = enabled;
	}

	public Optional<EmergencyAiResponse> judge(EmergencyAiRequest request) {
		if (!this.enabled) {
			return Optional.empty();
		}

		try {
			HttpRequest httpRequest = HttpRequest.newBuilder(this.judgmentUri)
				.timeout(this.readTimeout)
				.header("Content-Type", "application/json")
				.POST(HttpRequest.BodyPublishers.ofString(this.objectMapper.writeValueAsString(request)))
				.build();
			HttpResponse<String> response = this.httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
			if (response.statusCode() < 200 || response.statusCode() >= 300) {
				log.warn("Emergency AI returned HTTP {}. Using the emergency fallback.", response.statusCode());
				return Optional.empty();
			}
			return Optional.of(this.objectMapper.readValue(response.body(), EmergencyAiResponse.class));
		} catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
			log.warn("Emergency AI request was interrupted. Using the emergency fallback.");
			return Optional.empty();
		} catch (Exception ex) {
			log.warn("Emergency AI request failed. Using the emergency fallback.", ex);
			return Optional.empty();
		}
	}

	public record EmergencyAiRequest(
		long userId,
		String source,
		String triggerType,
		Integer pressCount,
		String riskLevel,
		Integer riskScore,
		String location,
		String userResponse,
		String message
	) {
	}

	public record EmergencyAiResponse(
		String emergencyLevel,
		String emergencyStatus,
		boolean notifyGuardian,
		boolean callGuardian,
		boolean saveEventHistory,
		String alertType,
		String message,
		List<String> recommendedChannels,
		String vibrationPattern,
		String screenMode
	) {
	}
}
