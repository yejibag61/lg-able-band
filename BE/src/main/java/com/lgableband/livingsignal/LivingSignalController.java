package com.lgableband.livingsignal;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.time.OffsetDateTime;
import java.util.List;
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
@RequestMapping("/api/living-signals")
public class LivingSignalController {

	private final LivingSignalService livingSignalService;

	public LivingSignalController(LivingSignalService livingSignalService) {
		this.livingSignalService = livingSignalService;
	}

	@GetMapping
	public LivingSignalService.LivingSignalStateResponse state(
		@RequestHeader("Authorization") String authorization
	) {
		return this.livingSignalService.state(authorization);
	}

	@PostMapping("/sounds")
	public LivingSignalService.SoundResponse createSound(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody SoundUpsertRequest request
	) {
		return this.livingSignalService.createSound(authorization, toServiceRequest(request));
	}

	@PutMapping("/sounds/{soundId}")
	public LivingSignalService.SoundResponse updateSound(
		@RequestHeader("Authorization") String authorization,
		@PathVariable long soundId,
		@Valid @RequestBody SoundUpsertRequest request
	) {
		return this.livingSignalService.updateSound(authorization, soundId, toServiceRequest(request));
	}

	@DeleteMapping("/sounds/{soundId}")
	public void deleteSound(
		@RequestHeader("Authorization") String authorization,
		@PathVariable long soundId
	) {
		this.livingSignalService.deleteSound(authorization, soundId);
	}

	@PutMapping("/threshold")
	public LivingSignalService.ThresholdResponse updateThreshold(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody ThresholdRequest request
	) {
		return this.livingSignalService.updateThreshold(authorization, request.threshold());
	}

	private LivingSignalService.SoundUpsertRequest toServiceRequest(SoundUpsertRequest request) {
		return new LivingSignalService.SoundUpsertRequest(
			request.registeredSoundName(),
			request.soundType(),
			request.notes(),
			request.recordings().stream()
				.map(recording -> new LivingSignalService.RecordingRequest(
					recording.label(),
					recording.createdAt(),
					recording.durationSec(),
					recording.audioDataUrl(),
					recording.embedding()
				))
				.toList()
		);
	}

	public record ThresholdRequest(
		@Min(0) @Max(1) double threshold
	) {
	}

	public record SoundUpsertRequest(
		@NotBlank String registeredSoundName,
		@NotBlank String soundType,
		String notes,
		@NotEmpty List<RecordingRequest> recordings
	) {
	}

	public record RecordingRequest(
		@NotBlank String label,
		OffsetDateTime createdAt,
		double durationSec,
		String audioDataUrl,
		List<Double> embedding
	) {
	}
}
