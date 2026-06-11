package com.lgableband.alert;

import com.lgableband.common.AlertStatus;
import com.lgableband.common.AlertType;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

	private final AlertService alertService;

	public AlertController(AlertService alertService) {
		this.alertService = alertService;
	}

	@GetMapping
	public AlertListResponse alerts(
		@RequestHeader("Authorization") String authorization,
		@RequestParam(required = false) AlertType type,
		@RequestParam(required = false) AlertStatus status,
		@RequestParam(defaultValue = "20") int limit
	) {
		return new AlertListResponse(this.alertService.alerts(authorization, type, status, limit));
	}

	@GetMapping("/{alertId}")
	public AlertService.AlertView alert(@RequestHeader("Authorization") String authorization, @PathVariable long alertId) {
		return this.alertService.alert(authorization, alertId);
	}

	@PostMapping("/{alertId}/confirm")
	public AlertService.StatusResponse confirm(@RequestHeader("Authorization") String authorization, @PathVariable long alertId) {
		return this.alertService.confirm(authorization, alertId);
	}

	@PostMapping("/{alertId}/replay")
	public ReplayResponse replay(@RequestHeader("Authorization") String authorization, @PathVariable long alertId) {
		AlertService.StatusResponse response = this.alertService.replay(authorization, alertId);
		return new ReplayResponse(
			response.alertId(),
			response.status(),
			response.replay() == null ? null : response.replay().voiceGuide(),
			response.replay() == null ? null : response.replay().replayedAt()
		);
	}

	public record AlertListResponse(List<AlertService.AlertView> items) {
	}

	public record ReplayResponse(
		long alertId,
		AlertStatus status,
		String voiceGuide,
		java.time.OffsetDateTime replayedAt
	) {
	}
}
