package com.lgableband.emergency;

import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.EmergencyRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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

	private final MockDataStore store;

	public EmergencyController(MockDataStore store) {
		this.store = store;
	}

	@PostMapping
	public ResponseEntity<EmergencyRequest> create(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody EmergencyRequestBody request
	) {
		long userId = this.store.requireUser(authorization).userId();
		return ResponseEntity.status(HttpStatus.CREATED)
			.body(this.store.createEmergency(userId, request.message(), request.source()));
	}

	public record EmergencyRequestBody(
		@NotBlank String message,
		@NotBlank String source
	) {
	}
}
