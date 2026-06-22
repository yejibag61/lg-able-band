package com.lgableband.guardian;

import com.lgableband.emergency.EmergencyService;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
public class GuardianLiveAlertService {

	private static final long STREAM_TIMEOUT_MS = 30L * 60L * 1000L;

	private final Map<Long, CopyOnWriteArrayList<SseEmitter>> guardianEmitters = new ConcurrentHashMap<>();

	public SseEmitter subscribe(long guardianId) {
		SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
		this.guardianEmitters.computeIfAbsent(guardianId, key -> new CopyOnWriteArrayList<>()).add(emitter);
		emitter.onCompletion(() -> removeEmitter(guardianId, emitter));
		emitter.onTimeout(() -> removeEmitter(guardianId, emitter));
		emitter.onError(error -> removeEmitter(guardianId, emitter));
		send(guardianId, emitter, "connected", Map.of("guardianId", guardianId));
		return emitter;
	}

	public void publishEmergency(
		List<EmergencyService.GuardianTarget> guardians,
		long alertId,
		long emergencyRequestId,
		String message,
		String source,
		OffsetDateTime occurredAt
	) {
		GuardianLiveAlert event = new GuardianLiveAlert(
			alertId,
			emergencyRequestId,
			"EMERGENCY",
			"CRITICAL",
			"긴급 도움 요청",
			message,
			source,
			occurredAt
		);
		for (EmergencyService.GuardianTarget guardian : guardians) {
			publish(guardian.guardianId(), event);
		}
	}

	private void publish(long guardianId, GuardianLiveAlert event) {
		List<SseEmitter> emitters = this.guardianEmitters.getOrDefault(guardianId, new CopyOnWriteArrayList<>());
		for (SseEmitter emitter : emitters) {
			send(guardianId, emitter, "guardian-alert", event);
		}
	}

	private void send(long guardianId, SseEmitter emitter, String eventName, Object payload) {
		try {
			emitter.send(SseEmitter.event().name(eventName).data(payload));
		}
		catch (IOException | IllegalStateException ex) {
			removeEmitter(guardianId, emitter);
		}
	}

	private void removeEmitter(long guardianId, SseEmitter emitter) {
		List<SseEmitter> emitters = this.guardianEmitters.get(guardianId);
		if (emitters == null) {
			return;
		}
		emitters.remove(emitter);
		if (emitters.isEmpty()) {
			this.guardianEmitters.remove(guardianId);
		}
	}

	public record GuardianLiveAlert(
		long alertId,
		long emergencyRequestId,
		String type,
		String severity,
		String title,
		String message,
		String source,
		OffsetDateTime occurredAt
	) {
	}
}
