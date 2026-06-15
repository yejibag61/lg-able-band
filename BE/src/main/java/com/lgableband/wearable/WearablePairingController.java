package com.lgableband.wearable;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/wearable/pairing-sessions")
public class WearablePairingController {

	private final WearablePairingService wearablePairingService;

	public WearablePairingController(WearablePairingService wearablePairingService) {
		this.wearablePairingService = wearablePairingService;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public WearablePairingService.PairingSessionResponse create(
		@Valid @RequestBody CreatePairingSessionRequest request
	) {
		return this.wearablePairingService.createSession(request.deviceId(), request.deviceName(), request.pairingCode());
	}

	@GetMapping("/{pairingSessionId}")
	public WearablePairingService.PairingSessionStatusResponse status(
		@PathVariable String pairingSessionId,
		@RequestParam String deviceId,
		@RequestParam String nonce
	) {
		return this.wearablePairingService.status(pairingSessionId, deviceId, nonce);
	}

	@PostMapping("/{pairingSessionId}/complete")
	public WearablePairingService.PairingCompleteResponse complete(
		@RequestHeader("Authorization") String authorization,
		@PathVariable String pairingSessionId,
		@Valid @RequestBody CompletePairingRequest request
	) {
		return this.wearablePairingService.complete(
			authorization,
			pairingSessionId,
			request.deviceId(),
			request.pairingCode(),
			request.nonce()
		);
	}

	@PostMapping("/{pairingSessionId}/unpair")
	public WearablePairingService.PairingUnpairResponse unpair(
		@RequestHeader("Authorization") String authorization,
		@PathVariable String pairingSessionId,
		@Valid @RequestBody UnpairRequest request
	) {
		return this.wearablePairingService.unpair(
			authorization,
			pairingSessionId,
			request.deviceId(),
			request.nonce()
		);
	}

	@DeleteMapping("/{pairingSessionId}")
	public WearablePairingService.PairingUnpairResponse unpairFromWearable(
		@RequestHeader("Authorization") String authorization,
		@PathVariable String pairingSessionId,
		@RequestParam String deviceId,
		@RequestParam String nonce
	) {
		return this.wearablePairingService.unpair(
			authorization,
			pairingSessionId,
			deviceId,
			nonce
		);
	}

	public record CreatePairingSessionRequest(
		@NotBlank String deviceId,
		@NotBlank String deviceName,
		@NotBlank String pairingCode
	) {
	}

	public record CompletePairingRequest(
		@NotBlank String deviceId,
		@NotBlank String pairingCode,
		@NotBlank String nonce
	) {
	}

	public record UnpairRequest(
		@NotBlank String deviceId,
		@NotBlank String nonce
	) {
	}
}
