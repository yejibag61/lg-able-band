package com.lgableband.context;

import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AlertType;
import com.lgableband.common.DeviceType;
import com.lgableband.common.SafetyStatusLevel;
import com.lgableband.common.Severity;
import com.lgableband.mock.MockDataStore;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Service;

@Service
public class ContextService {

	private final MockDataStore store;
	private final AtomicLong sequence = new AtomicLong(1000);
	private final Map<Long, List<ContextJudgment>> judgmentsByUserId = new ConcurrentHashMap<>();

	public ContextService(MockDataStore store) {
		this.store = store;
	}

	public ContextJudgment judge(long authenticatedUserId, ContextRequest request) {
		long userId = authenticatedUserId;
		Risk risk = assess(request);
		OffsetDateTime occurredAt = request.occurredAt() == null ? OffsetDateTime.now() : request.occurredAt();
		String deviceName = request.deviceName() == null || request.deviceName().isBlank()
			? request.deviceType().name()
			: request.deviceName();
		String title = title(request, risk);
		String message = message(request, risk);
		boolean notifyGuardian = risk.severity() == Severity.CRITICAL;
		List<String> channels = channels(request.accessibilityType(), risk.severity());
		String vibrationPattern = vibrationPattern(risk.severity());
		String screenMode = risk.severity() == Severity.CRITICAL ? "EMERGENCY_FULL_SCREEN" : "HIGH_CONTRAST";
		boolean voiceEnabled = request.accessibilityType() != AccessibilityType.HEARING;

		var alert = this.store.addContextAlert(
			userId,
			risk.alertType(),
			risk.severity(),
			title,
			message,
			deviceName,
			occurredAt,
			voiceEnabled ? message : null
		);

		ContextJudgment judgment = new ContextJudgment(
			this.sequence.incrementAndGet(),
			alert.alertId(),
			risk.category(),
			risk.severity(),
			risk.safetyStatusLevel(),
			risk.score(),
			risk.alertType().name(),
			request.eventType(),
			message,
			request.deviceType(),
			deviceName,
			request.location(),
			occurredAt,
			notifyGuardian,
			channels,
			vibrationPattern,
			screenMode,
			voiceEnabled
		);
		this.judgmentsByUserId.computeIfAbsent(userId, ignored -> new ArrayList<>()).add(judgment);
		return judgment;
	}

	public List<ContextJudgment> judgments(long userId, int limit) {
		return this.judgmentsByUserId.getOrDefault(userId, List.of()).stream()
			.sorted(Comparator.comparing(ContextJudgment::occurredAt).reversed())
			.limit(Math.max(1, limit))
			.toList();
	}

	private Risk assess(ContextRequest request) {
		String eventType = request.eventType().toUpperCase();
		boolean noResponse = "NO_RESPONSE".equalsIgnoreCase(request.userResponse());
		int duration = request.durationSec() == null ? 0 : request.durationSec();

		if (eventType.contains("FALL") || eventType.contains("SOS") || (eventType.contains("INACTIVITY") && noResponse)) {
			return new Risk("EMERGENCY", AlertType.EMERGENCY, Severity.CRITICAL, SafetyStatusLevel.EMERGENCY, 100);
		}
		if (request.deviceType() == DeviceType.RANGE && (eventType.contains("LONG") || duration >= 300)) {
			return new Risk("EMERGENCY", AlertType.EMERGENCY, Severity.CRITICAL, SafetyStatusLevel.EMERGENCY, 95);
		}
		if (eventType.contains("LONG") || eventType.contains("DANGER") || duration >= 300
			|| eventType.contains("OPEN") || eventType.contains("WARNING") || noResponse) {
			return new Risk("CAUTION", AlertType.LIFE, Severity.MEDIUM, SafetyStatusLevel.CAUTION, 55);
		}
		return new Risk("LIFE", AlertType.LIFE, Severity.LOW, SafetyStatusLevel.SAFE, 20);
	}

	private String title(ContextRequest request, Risk risk) {
		return switch (risk.severity()) {
			case CRITICAL -> "긴급 상황 감지";
			case HIGH -> "위험 상황 감지";
			case MEDIUM -> "주의 상황 감지";
			case LOW -> "생활 알림";
		};
	}

	private String message(ContextRequest request, Risk risk) {
		String location = request.location() == null || request.location().isBlank() ? "집 안" : request.location();
		if (request.deviceType() == DeviceType.DOOR_SENSOR && request.eventType().toUpperCase().contains("OPEN")) {
			return location + " 문이 장시간 열려 있습니다.";
		}
		return location + "에서 " + request.eventType() + " 상황이 감지되었습니다. 위험도 " + risk.score() + "점입니다.";
	}

	private List<String> channels(AccessibilityType accessibilityType, Severity severity) {
		List<String> channels = new ArrayList<>();
		channels.add("BAND_VIBRATION");
		channels.add("APP_SCREEN");
		if (accessibilityType == AccessibilityType.HEARING) {
			channels.add("TV_POPUP");
			channels.add("THINQ_LIGHT");
		}
		if (severity == Severity.CRITICAL) {
			channels.add("GUARDIAN_PUSH");
		}
		return List.copyOf(channels);
	}

	private String vibrationPattern(Severity severity) {
		return switch (severity) {
			case LOW -> "BASIC_SHORT";
			case MEDIUM -> "BASIC_REPEAT";
			case HIGH -> "STRONG_REPEAT";
			case CRITICAL -> "SOS_REPEAT";
		};
	}

	private record Risk(String category, AlertType alertType, Severity severity, SafetyStatusLevel safetyStatusLevel, int score) {
	}

	public record ContextRequest(
		Long userId,
		AccessibilityType accessibilityType,
		DeviceType deviceType,
		String deviceName,
		String eventType,
		String location,
		String value,
		Integer durationSec,
		String userResponse,
		OffsetDateTime occurredAt
	) {
	}

	public record ContextJudgment(
		long contextJudgmentId,
		long alertId,
		String category,
		Severity riskLevel,
		SafetyStatusLevel safetyStatusLevel,
		int riskScore,
		String alertType,
		String eventType,
		String message,
		DeviceType deviceType,
		String deviceName,
		String location,
		OffsetDateTime occurredAt,
		boolean notifyGuardian,
		List<String> recommendedChannels,
		String vibrationPattern,
		String screenMode,
		boolean voiceEnabled
	) {
	}
}
