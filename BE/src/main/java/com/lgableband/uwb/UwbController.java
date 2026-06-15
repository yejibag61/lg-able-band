package com.lgableband.uwb;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/uwb")
public class UwbController {

	private final UwbService service;

	public UwbController(UwbService service) {
		this.service = service;
	}

	@GetMapping("/targets")
	public UwbService.UwbTargetsResponse targets(@RequestHeader(value = "Authorization", required = false) String authorization) {
		return this.service.targets(authorization);
	}

	@PostMapping("/sessions")
	public ResponseEntity<UwbService.UwbSessionResponse> start(
		@RequestHeader(value = "Authorization", required = false) String authorization,
		@Valid @RequestBody UwbService.UwbStartRequest request
	) {
		return ResponseEntity.status(HttpStatus.CREATED).body(this.service.start(authorization, request));
	}

	@GetMapping("/sessions/{sessionId}")
	public UwbService.UwbSessionResponse session(
		@RequestHeader(value = "Authorization", required = false) String authorization,
		@PathVariable String sessionId
	) {
		return this.service.session(authorization, sessionId);
	}

	@PostMapping("/sessions/{sessionId}/stop")
	public UwbService.UwbSessionResponse stop(
		@RequestHeader(value = "Authorization", required = false) String authorization,
		@PathVariable String sessionId
	) {
		return this.service.stop(authorization, sessionId);
	}
}
