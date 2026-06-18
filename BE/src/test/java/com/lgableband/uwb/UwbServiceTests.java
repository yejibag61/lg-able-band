package com.lgableband.uwb;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.ApiException;
import com.lgableband.common.DeviceType;
import com.lgableband.common.NavigationStatus;
import com.lgableband.common.NotificationChannel;
import com.lgableband.common.VibrationPattern;
import com.lgableband.mock.MockDataStore;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.KeyHolder;

class UwbServiceTests {

	@Test
	void dbUwbSessionLifecycleRequiresOwnedLocationTarget() throws Exception {
		FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
		ObjectProvider<JdbcTemplate> provider = jdbcProvider(jdbcTemplate);
		MvpDataService dataService = mock(MvpDataService.class);
		MockDataStore mockDataStore = mock(MockDataStore.class);
		when(dataService.currentUser("Bearer owner")).thenReturn(currentUser(7));
		when(dataService.currentUser("Bearer other")).thenReturn(currentUser(8));

		UwbService service = new UwbService(provider, dataService, mockDataStore);

		UwbService.UwbTargetsResponse targets = service.targets("Bearer owner");
		UwbService.UwbSessionResponse started = service.start("Bearer owner", new UwbService.UwbStartRequest(44L));
		UwbService.UwbSessionResponse loaded = service.session("Bearer owner", started.sessionId());
		UwbService.UwbSessionResponse stopped = service.stop("Bearer owner", started.sessionId());

		assertThat(targets.items()).hasSize(1);
		assertThat(targets.items().get(0).deviceId()).isEqualTo(44L);
		assertThat(targets.items().get(0).locationSupported()).isTrue();
		assertThat(started.sessionId()).isEqualTo(9901L);
		assertThat(started.targetDevice().deviceId()).isEqualTo(44L);
		assertThat(started.targetDevice().name()).isEqualTo("냉장고");
		assertThat(started.status()).isEqualTo("ACTIVE");
		assertThat(loaded.voiceGuide()).contains("냉장고");
		assertThat(stopped.status()).isEqualTo("CANCELED");
		assertThat(stopped.vibrationPattern()).isEqualTo(VibrationPattern.NONE);
		assertThat(jdbcTemplate.createdSessionUserIds).containsExactly(7L);
		assertThat(jdbcTemplate.createdSessionTargetIds).containsExactly(44L);
		assertThat(jdbcTemplate.stopSessionIds).containsExactly(9901L);

		assertNotFound(() -> service.session("Bearer other", started.sessionId()));
		assertNotFound(() -> service.start("Bearer owner", new UwbService.UwbStartRequest(45L)));
	}

	@Test
	void mockFallbackPreservesExistingUwbContract() {
		ObjectProvider<JdbcTemplate> provider = jdbcProvider(null);
		MvpDataService dataService = mock(MvpDataService.class);
		MockDataStore mockDataStore = mock(MockDataStore.class);
		when(dataService.currentUser("Bearer mock")).thenReturn(currentUser(1));
		when(mockDataStore.devices(1L)).thenReturn(List.of(new MockDataStore.Device(
			10,
			"세탁기",
			DeviceType.WASHER,
				com.lgableband.common.ConnectionStatus.CONNECTED,
				true,
				OffsetDateTime.parse("2026-06-10T14:00:00+09:00"),
				"세탁실"
			)));
		when(mockDataStore.startUwbSession(1L, 10L)).thenReturn(new MockDataStore.UwbSession(
			9001,
			1,
			10,
			"세탁기",
			NavigationStatus.ACTIVE,
			4.0,
			0.86,
			"세탁기까지 약 4미터입니다.",
			VibrationPattern.SLOW,
			OffsetDateTime.parse("2026-06-10T14:01:00+09:00")
		));

		UwbService service = new UwbService(provider, dataService, mockDataStore);

		assertThat(service.targets("Bearer mock").items()).hasSize(1);
		assertThat(service.start("Bearer mock", new UwbService.UwbStartRequest(10L)).status()).isEqualTo("ACTIVE");
	}

	private static void assertNotFound(ThrowingRunnable runnable) {
		assertThatThrownBy(runnable::run)
			.isInstanceOf(ApiException.class)
			.extracting("status")
			.isEqualTo(HttpStatus.NOT_FOUND);
	}

	@SuppressWarnings("unchecked")
	private static ObjectProvider<JdbcTemplate> jdbcProvider(JdbcTemplate jdbcTemplate) {
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
			new MockDataStore.NotificationPrefs(List.of(NotificationChannel.VOICE), false, false),
			true
		);
	}

	private static <T> T mapDevice(RowMapper<T> mapper, long deviceId, long userId, boolean locationSupported)
		throws Exception {
		ResultSet resultSet = mock(ResultSet.class);
		when(resultSet.getLong("device_id")).thenReturn(deviceId);
		when(resultSet.getLong("user_id")).thenReturn(userId);
		when(resultSet.getString("name")).thenReturn(deviceId == 44L ? "냉장고" : "TV");
		when(resultSet.getString("device_type")).thenReturn(deviceId == 44L ? "REFRIGERATOR" : "TV");
		when(resultSet.getString("connection_status")).thenReturn("CONNECTED");
		when(resultSet.getBoolean("location_supported")).thenReturn(locationSupported);
		when(resultSet.getObject("last_event_at", LocalDateTime.class)).thenReturn(LocalDateTime.of(2026, 6, 10, 14, 0));
		return mapper.mapRow(resultSet, 0);
	}

	private static <T> T mapSession(RowMapper<T> mapper, long userId, String status) throws Exception {
		ResultSet resultSet = mock(ResultSet.class);
		when(resultSet.getLong("session_id")).thenReturn(9901L);
		when(resultSet.getLong("user_id")).thenReturn(userId);
		when(resultSet.getLong("target_device_id")).thenReturn(44L);
		when(resultSet.getString("target_device_name")).thenReturn("냉장고");
		when(resultSet.getString("status")).thenReturn(status);
		when(resultSet.getDouble("distance_m")).thenReturn(status.equals("CANCELED") ? 0.0 : 4.0);
		when(resultSet.getDouble("confidence")).thenReturn(0.86);
		when(resultSet.getString("voice_guide")).thenReturn(status.equals("CANCELED") ? "탐색 종료" : "냉장고까지 약 4미터입니다.");
		when(resultSet.getString("vibration_pattern")).thenReturn(status.equals("CANCELED") ? "NONE" : "SLOW");
		when(resultSet.getObject("updated_at", LocalDateTime.class)).thenReturn(LocalDateTime.of(2026, 6, 10, 14, 1));
		when(resultSet.getObject("stopped_at", LocalDateTime.class))
			.thenReturn(status.equals("CANCELED") ? LocalDateTime.of(2026, 6, 10, 14, 2) : null);
		return mapper.mapRow(resultSet, 0);
	}

	private static final class FakeJdbcTemplate extends JdbcTemplate {

		private final List<Long> createdSessionUserIds = new ArrayList<>();
		private final List<Long> createdSessionTargetIds = new ArrayList<>();
		private final List<Long> stopSessionIds = new ArrayList<>();
		private long activeSessionId = 9901L;
		private String status = "ACTIVE";

		@Override
		public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
			try {
				if (sql.contains("FROM device") && !sql.contains("uwb_session")) {
					if (sql.contains("device_id = ?")) {
						long deviceId = (Long) args[0];
						long userId = (Long) args[1];
						boolean supported = deviceId == 44L;
						if (userId != 7L || !supported) {
							return List.of();
						}
						return List.of(mapDevice(rowMapper, deviceId, userId, true));
					}
					long userId = (Long) args[0];
					return userId == 7L ? List.of(mapDevice(rowMapper, 44L, userId, true)) : List.of();
				}
				if (sql.contains("FROM uwb_session")) {
					long sessionId = (Long) args[0];
					long userId = (Long) args[1];
					if (sessionId != this.activeSessionId || userId != 7L) {
						return List.of();
					}
					return List.of(mapSession(rowMapper, userId, this.status));
				}
				return List.of();
			}
			catch (Exception ex) {
				throw new IllegalStateException("Failed to map fake UWB row.", ex);
			}
		}

		@Override
		public int update(String sql, Object... args) {
			if (sql.startsWith("UPDATE uwb_session")) {
				this.stopSessionIds.add((Long) args[1]);
				this.status = "CANCELED";
				return 1;
			}
			return 0;
		}

		@Override
		public int update(org.springframework.jdbc.core.PreparedStatementCreator psc, KeyHolder generatedKeyHolder) {
			this.createdSessionUserIds.add(7L);
			this.createdSessionTargetIds.add(44L);
			generatedKeyHolder.getKeyList().add(java.util.Map.of("GENERATED_KEY", this.activeSessionId));
			return 1;
		}
	}

	@FunctionalInterface
	private interface ThrowingRunnable {
		void run() throws Exception;
	}
}
