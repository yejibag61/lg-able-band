package com.lgableband.uwb;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.ApiException;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.DeviceType;
import com.lgableband.common.NavigationStatus;
import com.lgableband.common.NotificationChannel;
import com.lgableband.common.VibrationPattern;
import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.NotificationPrefs;
import com.lgableband.uwb.UwbService.UwbSessionResponse;
import com.lgableband.uwb.UwbService.UwbStartRequest;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.KeyHolder;
import org.mockito.invocation.InvocationOnMock;

class UwbServiceDbLifecycleTests {

	@Test
	void dbAwareLifecycleFiltersTargetsAndEnforcesSessionOwnership() {
		JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
		MvpDataService dataService = mock(MvpDataService.class);
		MockDataStore mockDataStore = mock(MockDataStore.class);
		when(dataService.currentUser("Bearer owner")).thenReturn(currentUser(1));
		when(dataService.currentUser("Bearer other")).thenReturn(currentUser(2));

		List<DeviceRow> devices = new ArrayList<>(List.of(
			new DeviceRow(10, 1, "세탁기", DeviceType.WASHER, ConnectionStatus.CONNECTED, true),
			new DeviceRow(11, 1, "공기질 센서", DeviceType.AIR_SENSOR, ConnectionStatus.WARNING, false),
			new DeviceRow(12, 2, "다른 사용자 세탁기", DeviceType.WASHER, ConnectionStatus.CONNECTED, true)
		));
		Map<Long, SessionRow> sessions = new HashMap<>();
		stubDb(jdbcTemplate, devices, sessions);

		UwbService service = new UwbService(provider(jdbcTemplate), dataService, mockDataStore);

		assertThat(service.targets("Bearer owner").items())
			.extracting("deviceId")
			.containsExactly(10L);

		assertThatThrownBy(() -> service.start("Bearer owner", new UwbStartRequest(11L)))
			.isInstanceOf(ApiException.class)
			.hasFieldOrPropertyWithValue("code", "RESOURCE_NOT_FOUND");

		UwbSessionResponse started = service.start("Bearer owner", new UwbStartRequest(10L));
		assertThat(started.targetDevice().deviceId()).isEqualTo(10);
		assertThat(started.targetDevice().name()).isEqualTo("세탁기");
		assertThat(started.status()).isEqualTo("ACTIVE");
		assertThat(started.navigationStatus()).isEqualTo(NavigationStatus.ACTIVE);
		assertThat(started.distanceM()).isGreaterThanOrEqualTo(0.0);
		assertThat(started.confidence()).isBetween(0.0, 1.0);
		assertThat(started.voiceGuide()).contains("세탁기");
		assertThat(started.vibrationPattern()).isEqualTo(VibrationPattern.SLOW);

		UwbSessionResponse current = service.session("Bearer owner", started.sessionId());
		assertThat(current.targetDeviceName()).isEqualTo("세탁기");

		assertThatThrownBy(() -> service.session("Bearer other", started.sessionId()))
			.isInstanceOf(ApiException.class)
			.hasFieldOrPropertyWithValue("code", "RESOURCE_NOT_FOUND");
		assertThatThrownBy(() -> service.stop("Bearer other", started.sessionId()))
			.isInstanceOf(ApiException.class)
			.hasFieldOrPropertyWithValue("code", "RESOURCE_NOT_FOUND");

		UwbSessionResponse stopped = service.stop("Bearer owner", started.sessionId());
		assertThat(stopped.status()).isEqualTo("CANCELED");
		assertThat(stopped.navigationStatus()).isEqualTo(NavigationStatus.CANCELED);
		assertThat(stopped.vibrationPattern()).isEqualTo(VibrationPattern.NONE);
		assertThat(stopped.stoppedAt()).isNotNull();

		UwbSessionResponse afterStop = service.session("Bearer owner", started.sessionId());
		assertThat(afterStop.status()).isEqualTo("CANCELED");

		assertThatThrownBy(() -> service.session("Bearer owner", -1L))
			.isInstanceOf(ApiException.class)
			.hasFieldOrPropertyWithValue("code", "RESOURCE_NOT_FOUND");
	}

	private void stubDb(
		JdbcTemplate jdbcTemplate,
		List<DeviceRow> devices,
		Map<Long, SessionRow> sessions
	) {
		AtomicLong sessionIds = new AtomicLong(7000);
		AtomicReference<DeviceRow> pendingTarget = new AtomicReference<>();
		AtomicReference<Long> pendingUserId = new AtomicReference<>();

		when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
			.thenAnswer(invocation -> {
				String sql = invocation.getArgument(0);
				RowMapper<?> mapper = invocation.getArgument(1);
				Object[] args = jdbcQueryArgs(invocation);

				if (sql.contains("location_supported = TRUE") && args.length == 1) {
					long userId = ((Number) args[0]).longValue();
					return mapRows(mapper, devices.stream()
						.filter(device -> device.userId() == userId)
						.filter(DeviceRow::locationSupported)
						.filter(device -> device.connectionStatus() != ConnectionStatus.DISCONNECTED)
						.map(this::deviceResultSet)
						.toList());
				}

				if (sql.contains("location_supported = TRUE") && args.length == 2) {
					long deviceId = ((Number) args[0]).longValue();
					long userId = ((Number) args[1]).longValue();
					List<DeviceRow> rows = devices.stream()
						.filter(device -> device.deviceId() == deviceId)
						.filter(device -> device.userId() == userId)
						.filter(DeviceRow::locationSupported)
						.filter(device -> device.connectionStatus() != ConnectionStatus.DISCONNECTED)
						.toList();
					rows.stream().findFirst().ifPresent(device -> {
						pendingTarget.set(device);
						pendingUserId.set(userId);
					});
					return mapRows(mapper, rows.stream().map(this::deviceResultSet).toList());
				}

				if (sql.contains("FROM uwb_session us")) {
					long sessionId = ((Number) args[0]).longValue();
					long userId = ((Number) args[1]).longValue();
					return mapRows(mapper, sessions.values().stream()
						.filter(session -> session.sessionId() == sessionId)
						.filter(session -> session.userId() == userId)
						.map(this::sessionResultSet)
						.toList());
				}

				return List.of();
			});

		when(jdbcTemplate.update(any(PreparedStatementCreator.class), any(KeyHolder.class)))
			.thenAnswer(invocation -> {
				long sessionId = sessionIds.incrementAndGet();
				KeyHolder keyHolder = invocation.getArgument(1);
				keyHolder.getKeyList().add(Map.of("GENERATED_KEY", sessionId));
				DeviceRow target = pendingTarget.get();
				sessions.put(sessionId, new SessionRow(
					sessionId,
					pendingUserId.get(),
					target.deviceId(),
					target.name(),
					NavigationStatus.ACTIVE,
					4.0,
					0.86,
					target.name() + "까지 약 4미터입니다.",
					VibrationPattern.SLOW,
					LocalDateTime.now(),
					null
				));
				return 1;
			});

		when(jdbcTemplate.update(anyString(), any(Object[].class)))
			.thenAnswer(invocation -> {
				Object[] args = jdbcUpdateArgs(invocation);
				long sessionId = ((Number) args[1]).longValue();
				long userId = ((Number) args[2]).longValue();
				SessionRow session = sessions.get(sessionId);
				if (session == null || session.userId() != userId) {
					return 0;
				}
				sessions.put(sessionId, session.stop((String) args[0]));
				return 1;
			});
	}

	private Object[] jdbcQueryArgs(InvocationOnMock invocation) {
		Object[] invocationArgs = invocation.getArguments();
		if (invocationArgs.length == 3 && invocationArgs[2] instanceof Object[] args) {
			return args;
		}
		return Arrays.copyOfRange(invocationArgs, 2, invocationArgs.length);
	}

	private Object[] jdbcUpdateArgs(InvocationOnMock invocation) {
		Object[] invocationArgs = invocation.getArguments();
		if (invocationArgs.length == 2 && invocationArgs[1] instanceof Object[] args) {
			return args;
		}
		return Arrays.copyOfRange(invocationArgs, 1, invocationArgs.length);
	}

	@SuppressWarnings("unchecked")
	private <T> List<T> mapRows(RowMapper<?> mapper, List<ResultSet> rows) throws SQLException {
		List<T> mapped = new ArrayList<>();
		for (int index = 0; index < rows.size(); index++) {
			mapped.add((T) mapper.mapRow(rows.get(index), index));
		}
		return mapped;
	}

	private ResultSet deviceResultSet(DeviceRow row) {
		ResultSet resultSet = mock(ResultSet.class);
		try {
			when(resultSet.getLong("device_id")).thenReturn(row.deviceId());
			when(resultSet.getString("name")).thenReturn(row.name());
			when(resultSet.getString("device_type")).thenReturn(row.type().name());
			when(resultSet.getString("connection_status")).thenReturn(row.connectionStatus().name());
			when(resultSet.getBoolean("location_supported")).thenReturn(row.locationSupported());
			when(resultSet.getObject("updated_at", LocalDateTime.class)).thenReturn(LocalDateTime.now());
		}
		catch (SQLException ex) {
			throw new IllegalStateException(ex);
		}
		return resultSet;
	}

	private ResultSet sessionResultSet(SessionRow row) {
		ResultSet resultSet = mock(ResultSet.class);
		try {
			when(resultSet.getLong("session_id")).thenReturn(row.sessionId());
			when(resultSet.getLong("target_device_id")).thenReturn(row.targetDeviceId());
			when(resultSet.getString("target_device_name")).thenReturn(row.targetDeviceName());
			when(resultSet.getString("status")).thenReturn(row.status().name());
			when(resultSet.getDouble("distance_m")).thenReturn(row.distanceM());
			when(resultSet.getDouble("confidence")).thenReturn(row.confidence());
			when(resultSet.getString("voice_guide")).thenReturn(row.voiceGuide());
			when(resultSet.getString("vibration_pattern")).thenReturn(row.vibrationPattern().name());
			when(resultSet.getObject("updated_at", LocalDateTime.class)).thenReturn(row.updatedAt());
			when(resultSet.getObject("stopped_at", LocalDateTime.class)).thenReturn(row.stoppedAt());
		}
		catch (SQLException ex) {
			throw new IllegalStateException(ex);
		}
		return resultSet;
	}

	@SuppressWarnings("unchecked")
	private ObjectProvider<JdbcTemplate> provider(JdbcTemplate jdbcTemplate) {
		ObjectProvider<JdbcTemplate> provider = mock(ObjectProvider.class);
		when(provider.getIfAvailable()).thenReturn(jdbcTemplate);
		return provider;
	}

	private MvpDataService.CurrentUser currentUser(long userId) {
		return new MvpDataService.CurrentUser(
			AccountRole.USER,
			userId,
			"user-" + userId,
			"user-" + userId + "@example.com",
			AccessibilityType.VISUAL,
			new NotificationPrefs(List.of(NotificationChannel.VOICE, NotificationChannel.VIBRATION), true, true),
			true
		);
	}

	private record DeviceRow(
		long deviceId,
		long userId,
		String name,
		DeviceType type,
		ConnectionStatus connectionStatus,
		boolean locationSupported
	) {
	}

	private record SessionRow(
		long sessionId,
		long userId,
		long targetDeviceId,
		String targetDeviceName,
		NavigationStatus status,
		double distanceM,
		double confidence,
		String voiceGuide,
		VibrationPattern vibrationPattern,
		LocalDateTime updatedAt,
		LocalDateTime stoppedAt
	) {
		SessionRow stop(String voiceGuide) {
			LocalDateTime now = LocalDateTime.now();
			return new SessionRow(
				this.sessionId,
				this.userId,
				this.targetDeviceId,
				this.targetDeviceName,
				NavigationStatus.CANCELED,
				this.distanceM,
				this.confidence,
				voiceGuide,
				VibrationPattern.NONE,
				now,
				now
			);
		}
	}
}
