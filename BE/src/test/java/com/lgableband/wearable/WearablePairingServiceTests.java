package com.lgableband.wearable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.DeviceType;
import com.lgableband.common.NotificationChannel;
import com.lgableband.device.DeviceService;
import com.lgableband.mock.MockDataStore;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class WearablePairingServiceTests {

	@Test
	void completeUsesQrVerifiedWearableClaimPath() {
		MvpDataService dataService = mock(MvpDataService.class);
		DeviceService deviceService = mock(DeviceService.class);
		WearablePairingRepository repository = new WearablePairingRepository((Path) null);
		Clock clock = Clock.fixed(Instant.parse("2026-06-10T00:00:00Z"), ZoneOffset.ofHours(9));
		WearablePairingService service = new WearablePairingService(
			dataService,
			deviceService,
			repository,
			300,
			clock
		);
		DeviceService.DeviceSummary claimedDevice = new DeviceService.DeviceSummary(
			77L,
			"LG Able Band",
			DeviceType.WEARABLE,
			ConnectionStatus.CONNECTED,
			false,
			OffsetDateTime.parse("2026-06-10T09:00:00+09:00"),
			"LG",
			"able-band-claim-unit",
			true,
			null
		);
		when(dataService.currentUser("Bearer token")).thenReturn(currentUser(55L));
		when(deviceService.claimWearableDevice(eq("Bearer token"), any())).thenReturn(claimedDevice);

		WearablePairingService.PairingSessionResponse session = service.createSession(
			"able-band-claim-unit",
			"LG Able Band",
			"ABLE-4IN-260610"
		);
		WearablePairingService.PairingCompleteResponse completed = service.complete(
			"Bearer token",
			session.pairingSessionId(),
			session.deviceId(),
			session.pairingCode(),
			session.nonce()
		);

		assertThat(completed.status()).isEqualTo(WearablePairingService.PairingStatus.PAIRED);
		assertThat(completed.device().deviceId()).isEqualTo(77L);
		assertThat(completed.accessToken()).isEqualTo("token");
		verify(deviceService).claimWearableDevice(eq("Bearer token"), any(DeviceService.DeviceCreateRequest.class));
		verify(deviceService, never()).createDevice(eq("Bearer token"), any(DeviceService.DeviceCreateRequest.class));
	}

	private static MvpDataService.CurrentUser currentUser(long userId) {
		return new MvpDataService.CurrentUser(
			AccountRole.USER,
			userId,
			"테스트 사용자",
			"user@example.com",
			AccessibilityType.HEARING,
			new MockDataStore.NotificationPrefs(
				List.of(NotificationChannel.VOICE, NotificationChannel.VIBRATION),
				true,
				true
			),
			true
		);
	}
}
