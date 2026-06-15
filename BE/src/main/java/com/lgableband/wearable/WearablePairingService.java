package com.lgableband.wearable;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.ApiException;
import com.lgableband.common.DeviceType;
import com.lgableband.device.DeviceService;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class WearablePairingService {

	private static final String DEFAULT_VENDOR = "LG";
	private static final String PAIRING_COMPLETE_MESSAGE =
		"\uC6E8\uC5B4\uB7EC\uBE14 \uC5F0\uB3D9\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";

	private final MvpDataService dataService;
	private final DeviceService deviceService;
	private final WearablePairingRepository pairingRepository;
	private final Duration sessionTtl;
	private final Clock clock;

	@Autowired
	public WearablePairingService(
		MvpDataService dataService,
		DeviceService deviceService,
		WearablePairingRepository pairingRepository,
		@Value("${wearable.pairing.ttl-seconds:300}") long sessionTtlSeconds,
		ObjectProvider<Clock> clockProvider
	) {
		this(
			dataService,
			deviceService,
			pairingRepository,
			sessionTtlSeconds,
			clockProvider.getIfAvailable(() -> Clock.system(ZoneOffset.ofHours(9)))
		);
	}

	public WearablePairingService(
		MvpDataService dataService,
		DeviceService deviceService,
		WearablePairingRepository pairingRepository,
		long sessionTtlSeconds,
		Clock clock
	) {
		this.dataService = dataService;
		this.deviceService = deviceService;
		this.pairingRepository = pairingRepository;
		this.sessionTtl = Duration.ofSeconds(sessionTtlSeconds);
		this.clock = clock;
	}

	public PairingSessionResponse createSession(String deviceId, String deviceName, String pairingCode) {
		expireSessions();
		WearablePairingSession existing = this.pairingRepository.findWaitingSessionForDevice(deviceId).orElse(null);
		if (existing != null) {
			this.pairingRepository.expireWaitingSessionsForDevice(existing.deviceId(), existing.pairingSessionId());
			return sessionResponse(existing);
		}

		OffsetDateTime issuedAt = now();
		OffsetDateTime expiresAt = issuedAt.plus(this.sessionTtl);
		WearablePairingSession session = WearablePairingSession.waiting(
			"pairing-" + UUID.randomUUID(),
			deviceId,
			deviceName.isBlank() ? "LG Able Band" : deviceName,
			pairingCode,
			UUID.randomUUID().toString(),
			issuedAt,
			expiresAt
		);

		this.pairingRepository.save(session);
		this.pairingRepository.expireWaitingSessionsForDevice(session.deviceId(), session.pairingSessionId());
		return sessionResponse(session);
	}

	public PairingSessionStatusResponse status(String pairingSessionId, String deviceId, String nonce) {
		expireSessions();
		WearablePairingSession session = session(pairingSessionId);
		validateDeviceSecret(session, deviceId, nonce);

		return new PairingSessionStatusResponse(
			session.pairingSessionId(),
			session.deviceId(),
			session.deviceName(),
			session.pairingCode(),
			session.status(),
			session.pairedAt(),
			session.device() == null ? null : session.device().deviceId(),
			session.status() == PairingStatus.PAIRED ? session.accessToken() : null
		);
	}

	public PairingCompleteResponse complete(
		String authorization,
		String pairingSessionId,
		String deviceId,
		String pairingCode,
		String nonce
	) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		expireSessions();
		WearablePairingSession session = session(pairingSessionId);
		validatePairingPayload(session, deviceId, pairingCode, nonce);
		PairingStatus status = session.status();

		if (status == PairingStatus.EXPIRED) {
			throw new ApiException(
				HttpStatus.CONFLICT,
				"PAIRING_EXPIRED",
				"\uc6e8\uc5b4\ub7ec\ube14\u0020\uc5f0\ub3d9\u0020\uc2dc\uac04\uc774\u0020\ub9cc\ub8cc\ub418\uc5c8\uc2b5\ub2c8\ub2e4\u002e"
			);
		}

		if (status == PairingStatus.UNPAIRED) {
			throw new ApiException(
				HttpStatus.CONFLICT,
				"PAIRING_UNPAIRED",
				"\ud574\uc81c\ub41c\u0020\uc6e8\uc5b4\ub7ec\ube14\u0020\uc5f0\ub3d9\uc785\ub2c8\ub2e4\u002e\u0020\uc0c8\u0020\uc5f0\ub3d9\u0020\uc138\uc158\uc744\u0020\uc0dd\uc131\ud574\uc8fc\uc138\uc694\u002e"
			);
		}

		if (status == PairingStatus.PAIRED) {
			if (session.linkedUserId() == user.userId()) {
				WearablePairingSession refreshed = session.refreshToken(bearerToken(authorization));
				this.pairingRepository.save(refreshed);
				this.pairingRepository.expireWaitingSessionsForDevice(
					refreshed.deviceId(),
					refreshed.pairingSessionId()
				);
				return completeResponse(refreshed);
			}
			throw new ApiException(
				HttpStatus.CONFLICT,
				"PAIRING_ALREADY_COMPLETED",
				"\uc774\ubbf8\u0020\uc644\ub8cc\ub41c\u0020\uc6e8\uc5b4\ub7ec\ube14\u0020\uc5f0\ub3d9\uc785\ub2c8\ub2e4\u002e"
			);
		}

		DeviceService.DeviceSummary device = this.deviceService.claimWearableDevice(
			authorization,
			new DeviceService.DeviceCreateRequest(
				DEFAULT_VENDOR,
				session.deviceId(),
				session.deviceName(),
				DeviceType.WEARABLE,
				false,
				true
			)
		);
		WearablePairingSession paired = session.pair(
			user.userId(),
			device,
			bearerToken(authorization),
			now()
		);
		this.pairingRepository.save(paired);
		this.pairingRepository.expireWaitingSessionsForDevice(paired.deviceId(), paired.pairingSessionId());
		return completeResponse(paired);
	}

	public PairingUnpairResponse unpair(String authorization, String pairingSessionId, String deviceId, String nonce) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		expireSessions();
		WearablePairingSession session = session(pairingSessionId);
		validateDeviceSecret(session, deviceId, nonce);

		if (session.linkedUserId() != null && session.linkedUserId() != user.userId()) {
			throw new ApiException(
				HttpStatus.FORBIDDEN,
				"FORBIDDEN",
				"\ub2e4\ub978\u0020\uc0ac\uc6a9\uc790\uc758\u0020\uc6e8\uc5b4\ub7ec\ube14\u0020\uc5f0\ub3d9\uc740\u0020\ud574\uc81c\ud560\u0020\uc218\u0020\uc5c6\uc2b5\ub2c8\ub2e4\u002e"
			);
		}

		if (session.device() != null) {
			this.deviceService.deleteDevice(authorization, session.device().deviceId());
		}

		WearablePairingSession unpaired = session.unpair();
		this.pairingRepository.save(unpaired);
		return new PairingUnpairResponse(
			unpaired.pairingSessionId(),
			PairingStatus.UNPAIRED,
			"\uc6e8\uc5b4\ub7ec\ube14\u0020\uc5f0\ub3d9\uc774\u0020\ud574\uc81c\ub418\uc5c8\uc2b5\ub2c8\ub2e4\u002e"
		);
	}

	private WearablePairingSession session(String pairingSessionId) {
		WearablePairingSession session = this.pairingRepository.find(pairingSessionId).orElse(null);
		if (session == null) {
			throw new ApiException(
				HttpStatus.NOT_FOUND,
				"PAIRING_SESSION_NOT_FOUND",
				"\uc6e8\uc5b4\ub7ec\ube14\u0020\uc5f0\ub3d9\u0020\uc138\uc158\uc744\u0020\ucc3e\uc744\u0020\uc218\u0020\uc5c6\uc2b5\ub2c8\ub2e4\u002e"
			);
		}
		if (session.status() == PairingStatus.WAITING && !now().isBefore(session.expiresAt())) {
			return this.pairingRepository.expire(pairingSessionId).orElse(session.expire());
		}
		return session;
	}

	private void validateDeviceSecret(WearablePairingSession session, String deviceId, String nonce) {
		if (!session.deviceId().equals(deviceId) || !session.nonce().equals(nonce)) {
			throw new ApiException(
				HttpStatus.BAD_REQUEST,
				"INVALID_PAIRING_PAYLOAD",
				"\uc5f0\ub3d9\u0020\u0051\u0052\u0020\uc815\ubcf4\uac00\u0020\uc62c\ubc14\ub974\uc9c0\u0020\uc54a\uc2b5\ub2c8\ub2e4\u002e"
			);
		}
	}

	private void validatePairingPayload(
		WearablePairingSession session,
		String deviceId,
		String pairingCode,
		String nonce
	) {
		validateDeviceSecret(session, deviceId, nonce);
		if (!session.pairingCode().equals(pairingCode)) {
			throw new ApiException(
				HttpStatus.BAD_REQUEST,
				"INVALID_PAIRING_PAYLOAD",
				"\uc5f0\ub3d9\u0020\u0051\u0052\u0020\uc815\ubcf4\uac00\u0020\uc62c\ubc14\ub974\uc9c0\u0020\uc54a\uc2b5\ub2c8\ub2e4\u002e"
			);
		}
	}

	private PairingSessionResponse sessionResponse(WearablePairingSession session) {
		return new PairingSessionResponse(
			session.pairingSessionId(),
			session.deviceId(),
			session.deviceName(),
			session.pairingCode(),
			session.nonce(),
			session.issuedAt(),
			session.expiresAt(),
			(int) this.sessionTtl.toMinutes(),
			PairingStatus.WAITING,
			pairingPayload(session)
		);
	}

	private PairingCompleteResponse completeResponse(WearablePairingSession session) {
		return new PairingCompleteResponse(
			session.pairingSessionId(),
			PairingStatus.PAIRED,
			session.device(),
			session.accessToken(),
			PAIRING_COMPLETE_MESSAGE
		);
	}

	private String pairingPayload(WearablePairingSession session) {
		return "lg-able-band://pair"
			+ "?pairingSessionId=" + url(session.pairingSessionId())
			+ "&deviceId=" + url(session.deviceId())
			+ "&deviceName=" + url(session.deviceName())
			+ "&pairingCode=" + url(session.pairingCode())
			+ "&nonce=" + url(session.nonce())
			+ "&issuedAt=" + url(session.issuedAt().toString())
			+ "&expiresAt=" + url(session.expiresAt().toString())
			+ "&source=wearable";
	}

	private String bearerToken(String authorization) {
		String prefix = "Bearer ";
		if (authorization != null && authorization.startsWith(prefix)) {
			return authorization.substring(prefix.length());
		}
		return authorization;
	}

	private String url(String value) {
		return URLEncoder.encode(value, StandardCharsets.UTF_8);
	}

	private OffsetDateTime now() {
		return OffsetDateTime.now(this.clock);
	}

	private void expireSessions() {
		this.pairingRepository.expireSessions(now());
	}

	public enum PairingStatus {
		WAITING,
		PAIRED,
		EXPIRED,
		UNPAIRED,
		INVALID
	}

	public record PairingSessionResponse(
		String pairingSessionId,
		String deviceId,
		String deviceName,
		String pairingCode,
		String nonce,
		OffsetDateTime issuedAt,
		OffsetDateTime expiresAt,
		int expiresInMinutes,
		PairingStatus status,
		String pairingPayload
	) {
	}

	public record PairingSessionStatusResponse(
		String pairingSessionId,
		String deviceId,
		String deviceName,
		String pairingCode,
		PairingStatus status,
		OffsetDateTime pairedAt,
		Long linkedDeviceId,
		String accessToken
	) {
	}

	public record PairingCompleteResponse(
		String pairingSessionId,
		PairingStatus status,
		DeviceService.DeviceSummary device,
		String accessToken,
		String message
	) {
	}

	public record PairingUnpairResponse(
		String pairingSessionId,
		PairingStatus status,
		String message
	) {
	}
}
