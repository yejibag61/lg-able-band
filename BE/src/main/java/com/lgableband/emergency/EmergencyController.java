package com.lgableband.emergency;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/emergency-requests")
public class EmergencyController {

	private final EmergencyService emergencyService;

	public EmergencyController(EmergencyService emergencyService) {
		this.emergencyService = emergencyService;
	}

	@PostMapping
	public ResponseEntity<EmergencyService.EmergencyRequestSummary> create(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody EmergencyRequestBody request
	) {
		return ResponseEntity.status(HttpStatus.CREATED)
			.body(this.emergencyService.create(authorization, request));
	}

	@GetMapping
	public EmergencyService.EmergencyRequestListResponse list(@RequestHeader("Authorization") String authorization) {
		return this.emergencyService.list(authorization);
	}

	@GetMapping("/{emergencyRequestId}")
	public EmergencyService.EmergencyRequestSummary detail(
		@RequestHeader("Authorization") String authorization,
		@PathVariable long emergencyRequestId
	) {
		return this.emergencyService.detail(authorization, emergencyRequestId);
	}

	@PatchMapping("/{emergencyRequestId}/status")
	public EmergencyService.EmergencyRequestSummary updateStatus(
		@RequestHeader("Authorization") String authorization,
		@PathVariable long emergencyRequestId,
		@Valid @RequestBody EmergencyStatusBody request
	) {
		return this.emergencyService.updateStatus(authorization, emergencyRequestId, request.status());
	}

	public record EmergencyRequestBody(
		@NotBlank String message,
		@NotBlank @Pattern(regexp = "APP|WEARABLE") String source
	) {
	}

	public record EmergencyStatusBody(
		@NotBlank @Pattern(regexp = "SENT|ACKNOWLEDGED|RESOLVED|CANCELED") String status
	) {
	}
}
