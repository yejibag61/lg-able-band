package com.lgableband.user;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.mock.MockDataStore.NotificationPrefs;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/me")
public class UserController {

	private final MvpDataService dataService;

	public UserController(MvpDataService dataService) {
		this.dataService = dataService;
	}

	@GetMapping
	public UserResponse me(@RequestHeader("Authorization") String authorization) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		return new UserResponse(
			user.role(),
			user.userId(),
			user.name(),
			user.email(),
			user.accessibilityType(),
			user.notificationPrefs(),
			user.guardianLinked()
		);
	}

	@PutMapping("/accessibility")
	public AccessibilityResponse updateAccessibility(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody AccessibilityRequest request
	) {
		MvpDataService.AccessibilityResult result = this.dataService.updateAccessibility(
			authorization,
			request.accessibilityType(),
			request.notificationPrefs()
		);
		return new AccessibilityResponse(result.accessibilityType(), result.notificationPrefs(), result.updatedAt());
	}

	public record UserResponse(
		AccountRole role,
		long userId,
		String name,
		String email,
		AccessibilityType accessibilityType,
		NotificationPrefs notificationPrefs,
		boolean guardianLinked
	) {
	}

	public record AccessibilityRequest(
		@NotNull AccessibilityType accessibilityType,
		@NotNull NotificationPrefs notificationPrefs
	) {
	}

	public record AccessibilityResponse(
		AccessibilityType accessibilityType,
		NotificationPrefs notificationPrefs,
		OffsetDateTime updatedAt
	) {
	}
}
