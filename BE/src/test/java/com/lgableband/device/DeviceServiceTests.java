package com.lgableband.device;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.DeviceType;
import com.lgableband.common.NotificationChannel;
import com.lgableband.mock.MockDataStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.KeyHolder;

class DeviceServiceTests {

	@Test
	void qrVerifiedWearableClaimTransfersExistingBandToCurrentUser() {
		ClaimWearableJdbcTemplate jdbcTemplate = new ClaimWearableJdbcTemplate(41L, 7L);
		MvpDataService dataService = mock(MvpDataService.class);
		when(dataService.currentUser("Bearer new-owner")).thenReturn(currentUser(12L));
		DeviceService service = new DeviceService(provider(jdbcTemplate), dataService, mock(MockDataStore.class));

		DeviceService.DeviceSummary claimed = service.claimWearableDevice(
			"Bearer new-owner",
			new DeviceService.DeviceCreateRequest(
				"LG",
				"able-band-demo-001",
				"LG Able Band",
				DeviceType.WEARABLE,
				null,
				false,
				true
			)
		);

		assertThat(claimed.deviceId()).isEqualTo(41L);
		assertThat(claimed.vendorDeviceId()).isEqualTo("able-band-demo-001");
		assertThat(claimed.type()).isEqualTo(DeviceType.WEARABLE);
		assertThat(claimed.connectionStatus()).isEqualTo(ConnectionStatus.CONNECTED);
		assertThat(jdbcTemplate.transferArgs).hasSize(1);
		assertThat(jdbcTemplate.transferArgs.get(0)).containsExactly(
			12L,
			DeviceType.WEARABLE.name(),
			"LG Able Band",
			null,
			false,
			true,
			41L
		);
	}

	@SuppressWarnings("unchecked")
	private static ObjectProvider<JdbcTemplate> provider(JdbcTemplate jdbcTemplate) {
		ObjectProvider<JdbcTemplate> provider = mock(ObjectProvider.class);
		when(provider.getIfAvailable()).thenReturn(jdbcTemplate);
		return provider;
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

	private static final class ClaimWearableJdbcTemplate extends JdbcTemplate {

		private final long existingDeviceId;
		private final long existingUserId;
		private final List<Object[]> transferArgs = new ArrayList<>();

		private ClaimWearableJdbcTemplate(long existingDeviceId, long existingUserId) {
			this.existingDeviceId = existingDeviceId;
			this.existingUserId = existingUserId;
		}

		@Override
		public int update(PreparedStatementCreator psc, KeyHolder generatedKeyHolder) {
			throw new DuplicateKeyException("duplicate vendor device id");
		}

		@Override
		public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
			try {
				ResultSet resultSet = mock(ResultSet.class);
				when(resultSet.getLong("device_id")).thenReturn(this.existingDeviceId);
				when(resultSet.getLong("user_id")).thenReturn(this.existingUserId);
				return List.of(rowMapper.mapRow(resultSet, 0));
			} catch (SQLException ex) {
				throw new IllegalStateException(ex);
			}
		}

		@Override
		public int update(String sql, Object... args) {
			if (sql.contains("SET user_id = ?")) {
				this.transferArgs.add(args);
			}
			return 1;
		}
	}
}
