package com.lgableband.warning;

import com.lgableband.common.AccessibilityType;
import com.lgableband.auth.MvpDataService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/warnings")
public class WarningController {

	private final MvpDataService dataService;

	public WarningController(MvpDataService dataService) {
		this.dataService = dataService;
	}

	@PostMapping("/recommendations")
	public WarningRecommendation recommend(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody WarningRequest request
	) {
		this.dataService.currentUser(authorization);
		List<String> channels = new ArrayList<>(List.of("BAND_VIBRATION", "APP_SCREEN"));
		boolean voiceEnabled = request.accessibilityType() == AccessibilityType.VISUAL;
		if (request.accessibilityType() == AccessibilityType.HEARING) {
			channels.add("TV_POPUP");
			channels.add("THINQ_LIGHT");
		}
		boolean notifyGuardian = request.riskScore() >= 70 || "HIGH".equalsIgnoreCase(request.riskLevel()) || "CRITICAL".equalsIgnoreCase(request.riskLevel());
		if (notifyGuardian) {
			channels.add("GUARDIAN_PUSH");
		}
		String vibrationPattern = request.riskScore() >= 90 ? "SOS_REPEAT" : request.riskScore() >= 70 ? "STRONG_REPEAT" : "BASIC_REPEAT";
		String screenMode = request.riskScore() >= 90 ? "EMERGENCY_FULL_SCREEN" : "HIGH_CONTRAST";
		return new WarningRecommendation(List.copyOf(channels), vibrationPattern, screenMode, voiceEnabled, notifyGuardian);
	}

	public record WarningRequest(
		@NotNull AccessibilityType accessibilityType,
		String category,
		String riskLevel,
		int riskScore,
		String eventType
	) {
	}

	public record WarningRecommendation(
		List<String> recommendedChannels,
		String vibrationPattern,
		String screenMode,
		boolean voiceEnabled,
		boolean notifyGuardian
	) {
	}
}
