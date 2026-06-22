package com.lgableband.guardian;

import com.lgableband.auth.MvpDataService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.MediaType;
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
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/guardians")
public class GuardianController {

	private final GuardianService guardianService;
	private final GuardianLiveAlertService guardianLiveAlertService;
	private final MvpDataService dataService;

	public GuardianController(
		GuardianService guardianService,
		GuardianLiveAlertService guardianLiveAlertService,
		MvpDataService dataService
	) {
		this.guardianService = guardianService;
		this.guardianLiveAlertService = guardianLiveAlertService;
		this.dataService = dataService;
	}

	@GetMapping
	public GuardianService.GuardianListResponse guardians(@RequestHeader("Authorization") String authorization) {
		return this.guardianService.guardians(authorization);
	}

	@GetMapping("/dashboard")
	public GuardianService.GuardianDashboardResponse dashboard(@RequestHeader("Authorization") String authorization) {
		return this.guardianService.dashboard(authorization);
	}

	@GetMapping(value = "/dashboard/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public SseEmitter dashboardStream(@RequestHeader("Authorization") String authorization) {
		return this.guardianLiveAlertService.subscribe(this.dataService.currentGuardian(authorization).guardianId());
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
