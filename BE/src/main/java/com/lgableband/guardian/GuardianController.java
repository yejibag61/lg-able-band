package com.lgableband.guardian;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/guardians")
public class GuardianController {

	private final GuardianService guardianService;

	public GuardianController(GuardianService guardianService) {
		this.guardianService = guardianService;
	}

	@GetMapping
	public GuardianService.GuardianListResponse guardians(@RequestHeader("Authorization") String authorization) {
		return this.guardianService.guardians(authorization);
	}

	@GetMapping("/dashboard")
	public GuardianService.GuardianDashboardResponse dashboard(@RequestHeader("Authorization") String authorization) {
		return this.guardianService.dashboard(authorization);
	}

	@PostMapping
	public ResponseEntity<GuardianService.GuardianSummary> addGuardian(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody GuardianRequest request
	) {
		GuardianService.GuardianSummary guardian = this.guardianService.addGuardian(authorization, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(guardian);
	}

	@PostMapping("/link-by-email")
	public ResponseEntity<GuardianService.GuardianSummary> linkGuardianByEmail(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody GuardianEmailLinkRequest request
	) {
		GuardianService.GuardianSummary guardian = this.guardianService.linkGuardianByEmail(authorization, request);
		return ResponseEntity.status(HttpStatus.CREATED).body(guardian);
	}

	@PutMapping("/{guardianId}")
	public GuardianService.GuardianSummary updateGuardian(
		@RequestHeader("Authorization") String authorization,
		@PathVariable long guardianId,
		@Valid @RequestBody GuardianRequest request
	) {
		return this.guardianService.updateGuardian(authorization, guardianId, request);
	}

	@DeleteMapping("/{guardianId}")
	public ResponseEntity<Void> deleteGuardian(
		@RequestHeader("Authorization") String authorization,
		@PathVariable long guardianId
	) {
		this.guardianService.deleteGuardian(authorization, guardianId);
		return ResponseEntity.noContent().build();
	}

	public record GuardianRequest(
		@NotBlank String name,
		@NotBlank String phone,
		boolean isPrimary,
		boolean notifyOnDanger
	) {
	}

	public record GuardianEmailLinkRequest(
		@NotBlank @Email String email,
		boolean isPrimary,
		boolean notifyOnDanger
	) {
	}
}
