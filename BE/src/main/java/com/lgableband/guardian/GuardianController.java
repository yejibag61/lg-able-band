package com.lgableband.guardian;

import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.Guardian;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/guardians")
public class GuardianController {

	private final MockDataStore store;

	public GuardianController(MockDataStore store) {
		this.store = store;
	}

	@GetMapping
	public GuardianListResponse guardians(@RequestHeader("Authorization") String authorization) {
		long userId = this.store.requireUser(authorization).userId();
		return new GuardianListResponse(this.store.guardians(userId));
	}

	@PostMapping
	public ResponseEntity<Guardian> addGuardian(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody GuardianRequest request
	) {
		long userId = this.store.requireUser(authorization).userId();
		Guardian guardian = this.store.addGuardian(userId, request.name(), request.phone(), request.isPrimary(), request.notifyOnDanger());
		return ResponseEntity.status(HttpStatus.CREATED).body(guardian);
	}

	public record GuardianRequest(
		@NotBlank String name,
		@NotBlank String phone,
		boolean isPrimary,
		boolean notifyOnDanger
	) {
	}

	public record GuardianListResponse(List<Guardian> items) {
	}
}
