package com.lgableband.context;

import com.lgableband.context.ContextService.ContextJudgment;
import com.lgableband.context.ContextService.ContextRequest;
import com.lgableband.mock.MockDataStore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/context")
public class ContextController {

	private final MockDataStore store;
	private final ContextService service;

	public ContextController(MockDataStore store, ContextService service) {
		this.store = store;
		this.service = service;
	}

	@PostMapping("/judgments")
	public ResponseEntity<ContextJudgment> judge(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody ContextRequestBody request
	) {
		long userId = this.store.requireUser(authorization).userId();
		return ResponseEntity.status(HttpStatus.CREATED).body(this.service.judge(userId, request.toServiceRequest()));
	}

	@GetMapping("/judgments")
	public ContextJudgmentListResponse judgments(
		@RequestHeader("Authorization") String authorization,
		@RequestParam(defaultValue = "20") int limit
	) {
		long userId = this.store.requireUser(authorization).userId();
		return new ContextJudgmentListResponse(this.service.judgments(userId, limit));
	}

	public record ContextRequestBody(
		Long userId,
		@NotNull com.lgableband.common.AccessibilityType accessibilityType,
		@NotNull com.lgableband.common.DeviceType deviceType,
		String deviceName,
		@NotBlank String eventType,
		String location,
		String value,
		Integer durationSec,
		String userResponse,
		java.time.OffsetDateTime occurredAt
	) {
		ContextRequest toServiceRequest() {
			return new ContextRequest(userId, accessibilityType, deviceType, deviceName, eventType, location, value, durationSec, userResponse, occurredAt);
		}
	}

	public record ContextJudgmentListResponse(List<ContextJudgment> items) {
	}
}
