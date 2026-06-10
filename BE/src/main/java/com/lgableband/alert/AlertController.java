package com.lgableband.alert;

import com.lgableband.common.AlertStatus;
import com.lgableband.common.AlertType;
import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.Alert;
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

	private final MockDataStore store;

	public AlertController(MockDataStore store) {
		this.store = store;
	}

	@GetMapping
	public AlertListResponse alerts(
		@RequestHeader("Authorization") String authorization,
		@RequestParam(required = false) AlertType type,
		@RequestParam(required = false) AlertStatus status,
		@RequestParam(defaultValue = "20") int limit
	) {
		long userId = this.store.requireUser(authorization).userId();
		return new AlertListResponse(this.store.alerts(userId, type, status, limit));
	}

	@GetMapping("/{alertId}")
	public Alert alert(@RequestHeader("Authorization") String authorization, @PathVariable long alertId) {
		long userId = this.store.requireUser(authorization).userId();
		return this.store.alert(userId, alertId);
	}

	@PostMapping("/{alertId}/confirm")
	public Alert confirm(@RequestHeader("Authorization") String authorization, @PathVariable long alertId) {
		long userId = this.store.requireUser(authorization).userId();
		return this.store.confirmAlert(userId, alertId);
	}

	public record AlertListResponse(List<Alert> items) {
	}
}
