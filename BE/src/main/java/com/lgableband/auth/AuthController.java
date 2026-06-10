package com.lgableband.auth;

import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.mock.MockDataStore.NotificationPrefs;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final MvpDataService dataService;

	public AuthController(MvpDataService dataService) {
		this.dataService = dataService;
	}

	@PostMapping("/signup")
	public ResponseEntity<SignupResponse> signup(@Valid @RequestBody SignupRequest request) {
		MvpDataService.SignupResult result = this.dataService.signup(
			request.role(),
			request.name(),
			request.email(),
			request.password(),
			request.accessibilityType(),
			request.notificationPrefs()
		);

		return ResponseEntity.status(HttpStatus.CREATED).body(new SignupResponse(
			result.accountId(),
			result.role(),
			result.userId(),
			result.name(),
			result.email(),
			result.accessibilityType()
		));
	}

	@PostMapping("/login")
	public LoginResponse login(@Valid @RequestBody LoginRequest request) {
		MvpDataService.LoginResult result = this.dataService.login(request.role(), request.email(), request.password());
		return new LoginResponse(
			result.accessToken(),
			result.role(),
			result.account(),
			result.userProfile(),
			result.guardianProfile()
		);
	}

	public record SignupRequest(
		@NotNull AccountRole role,
		@NotBlank String name,
		@NotBlank @Email String email,
		@NotBlank String password,
		AccessibilityType accessibilityType,
		NotificationPrefs notificationPrefs
	) {
	}

	public record SignupResponse(
		long accountId,
		AccountRole role,
		Long userId,
		String name,
		String email,
		AccessibilityType accessibilityType
	) {
	}

	public record LoginRequest(
		@NotNull AccountRole role,
		@NotBlank @Email String email,
		@NotBlank String password
	) {
	}

	public record LoginResponse(
		String accessToken,
		AccountRole role,
		MvpDataService.AccountSummary account,
		MvpDataService.UserProfileSummary userProfile,
		MvpDataService.GuardianProfileSummary guardianProfile
	) {
	}
}
