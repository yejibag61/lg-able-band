package com.lgableband.wearable;

import com.lgableband.device.DeviceService;
import java.time.OffsetDateTime;

record WearablePairingSession(
	String pairingSessionId,
	String deviceId,
	String deviceName,
	String pairingCode,
	String nonce,
	OffsetDateTime issuedAt,
	OffsetDateTime expiresAt,
	WearablePairingService.PairingStatus status,
	Long linkedUserId,
	DeviceService.DeviceSummary device,
	String accessToken,
	OffsetDateTime pairedAt,
	OffsetDateTime unpairedAt
) {

	static WearablePairingSession waiting(
		String pairingSessionId,
		String deviceId,
		String deviceName,
		String pairingCode,
		String nonce,
		OffsetDateTime issuedAt,
		OffsetDateTime expiresAt
	) {
		return new WearablePairingSession(
			pairingSessionId,
			deviceId,
			deviceName,
			pairingCode,
			nonce,
			issuedAt,
			expiresAt,
			WearablePairingService.PairingStatus.WAITING,
			null,
			null,
			null,
			null,
			null
		);
	}

	WearablePairingSession pair(
		long linkedUserId,
		DeviceService.DeviceSummary device,
		String accessToken,
		OffsetDateTime pairedAt
	) {
		return new WearablePairingSession(
			this.pairingSessionId,
			this.deviceId,
			this.deviceName,
			this.pairingCode,
			this.nonce,
			this.issuedAt,
			this.expiresAt,
			WearablePairingService.PairingStatus.PAIRED,
			linkedUserId,
			device,
			accessToken,
			pairedAt,
			null
		);
	}

	WearablePairingSession refreshToken(String accessToken) {
		return new WearablePairingSession(
			this.pairingSessionId,
			this.deviceId,
			this.deviceName,
			this.pairingCode,
			this.nonce,
			this.issuedAt,
			this.expiresAt,
			WearablePairingService.PairingStatus.PAIRED,
			this.linkedUserId,
			this.device,
			accessToken,
			this.pairedAt,
			this.unpairedAt
		);
	}

	WearablePairingSession expire() {
		if (this.status == WearablePairingService.PairingStatus.PAIRED
			|| this.status == WearablePairingService.PairingStatus.UNPAIRED
			|| this.status == WearablePairingService.PairingStatus.EXPIRED) {
			return this;
		}
		return new WearablePairingSession(
			this.pairingSessionId,
			this.deviceId,
			this.deviceName,
			this.pairingCode,
			this.nonce,
			this.issuedAt,
			this.expiresAt,
			WearablePairingService.PairingStatus.EXPIRED,
			this.linkedUserId,
			this.device,
			this.accessToken,
			this.pairedAt,
			this.unpairedAt == null ? this.expiresAt : this.unpairedAt
		);
	}

	WearablePairingSession unpair() {
		return new WearablePairingSession(
			this.pairingSessionId,
			this.deviceId,
			this.deviceName,
			this.pairingCode,
			this.nonce,
			this.issuedAt,
			this.expiresAt,
			WearablePairingService.PairingStatus.UNPAIRED,
			this.linkedUserId,
			null,
			null,
			null,
			OffsetDateTime.now(this.expiresAt.getOffset())
		);
	}
}
