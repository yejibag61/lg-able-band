package com.lgableband.uwb;

import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.Device;
import com.lgableband.mock.MockDataStore.UwbSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
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

	private final MockDataStore store;

	public UwbController(MockDataStore store) {
		this.store = store;
	}

	@GetMapping("/targets")
	public UwbTargetsResponse targets(@RequestHeader("Authorization") String authorization) {
		long userId = this.store.requireUser(authorization).userId();
		List<Device> targets = this.store.devices(userId).stream()
			.filter(Device::locationSupported)
			.toList();
		return new UwbTargetsResponse(targets);
	}

	@PostMapping("/sessions")
	public ResponseEntity<UwbSession> start(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody UwbStartRequest request
	) {
		long userId = this.store.requireUser(authorization).userId();
		return ResponseEntity.status(HttpStatus.CREATED)
			.body(this.store.startUwbSession(userId, request.targetDeviceId()));
	}

	@GetMapping("/sessions/{sessionId}")
	public UwbSession session(@PathVariable long sessionId) {
		return this.store.uwbSession(sessionId);
	}

	@PostMapping("/sessions/{sessionId}/stop")
	public UwbSession stop(@PathVariable long sessionId) {
		return this.store.stopUwbSession(sessionId);
	}

	public record UwbStartRequest(@NotNull Long targetDeviceId) {
	}

	public record UwbTargetsResponse(List<Device> items) {
	}
}
