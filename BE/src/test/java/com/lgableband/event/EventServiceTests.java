package com.lgableband.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.AlertStatus;
import com.lgableband.common.AlertType;
import com.lgableband.common.ApiException;
import com.lgableband.common.NotificationChannel;
import com.lgableband.common.Severity;
import com.lgableband.mock.MockDataStore;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class EventServiceTests {

	@Test
	void dbEventsUseFiltersPaginationTotalAndAuthenticatedUser() throws Exception {
		FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
		ObjectProvider<JdbcTemplate> provider = jdbcProvider(jdbcTemplate);
		MvpDataService dataService = mock(MvpDataService.class);
		MockDataStore mockDataStore = mock(MockDataStore.class);
		when(dataService.currentUser("Bearer db-user")).thenReturn(currentUser(7));

		EventService service = new EventService(provider, dataService, mockDataStore);

		EventService.EventPage page = service.events(
			"Bearer db-user",
			"2026-06-10T00:00:00+09:00",
			"2026-06-11T00:00:00+09:00",
			"DANGER",
			"1",
			"2"
		);

		assertThat(page.page()).isEqualTo(1);
		assertThat(page.size()).isEqualTo(2);
		assertThat(page.totalElements()).isEqualTo(3);
		assertThat(page.items()).hasSize(2);
		assertThat(page.items().get(0).eventId()).isEqualTo(1001);
		assertThat(page.items().get(0).alertId()).isEqualTo(501);
		assertThat(page.items().get(1).alertId()).isNull();
		assertThat(page.items()).extracting(EventService.EventItem::type)
			.containsOnly(AlertType.DANGER);

		assertThat(jdbcTemplate.sqlCalls.get(0)).contains("COUNT(*)");
		assertThat(jdbcTemplate.sqlCalls.get(1)).contains("FROM alert a");
		assertThat(jdbcTemplate.sqlCalls.get(1)).contains("JOIN device d ON d.device_id = de.device_id");
		assertThat(jdbcTemplate.sqlCalls.get(1)).contains("NOT EXISTS");
		assertThat(jdbcTemplate.countArgs.get(0)).containsExactly(
			7L,
			7L,
			"DANGER",
			LocalDateTime.of(2026, 6, 10, 0, 0),
			LocalDateTime.of(2026, 6, 11, 0, 0)
		);
		assertThat(jdbcTemplate.pageArgs.get(0)).containsExactly(
			7L,
			7L,
			"DANGER",
			LocalDateTime.of(2026, 6, 10, 0, 0),
			LocalDateTime.of(2026, 6, 11, 0, 0),
			2,
			2L
		);
	}

	@Test
	void mockFallbackPreservesExistingEventHistory() {
		ObjectProvider<JdbcTemplate> provider = jdbcProvider(null);
		MvpDataService dataService = mock(MvpDataService.class);
		MockDataStore mockDataStore = mock(MockDataStore.class);
		when(dataService.currentUser("Bearer mock-user")).thenReturn(currentUser(1));
		when(mockDataStore.events(
			eq(1L),
			eq(AlertType.EMERGENCY),
			eq(OffsetDateTime.parse("2026-06-10T00:00:00+09:00")),
			eq(OffsetDateTime.parse("2026-06-11T00:00:00+09:00")),
			eq(0),
			eq(1)
		)).thenReturn(List.of(new MockDataStore.EventHistory(
			700,
			300,
			AlertType.EMERGENCY,
			Severity.CRITICAL,
			"긴급 도움 요청",
			"웨어러블 밴드",
			OffsetDateTime.parse("2026-06-10T09:00:00+09:00"),
			AlertStatus.ESCALATED
		)));
		when(mockDataStore.countEvents(
			eq(1L),
			eq(AlertType.EMERGENCY),
			eq(OffsetDateTime.parse("2026-06-10T00:00:00+09:00")),
			eq(OffsetDateTime.parse("2026-06-11T00:00:00+09:00"))
		)).thenReturn(4L);

		EventService service = new EventService(provider, dataService, mockDataStore);

		EventService.EventPage page = service.events(
			"Bearer mock-user",
			"2026-06-10T00:00:00+09:00",
			"2026-06-11T00:00:00+09:00",
			"EMERGENCY",
			"0",
			"1"
		);

		assertThat(page.items()).hasSize(1);
		assertThat(page.items().get(0).alertId()).isEqualTo(300);
		assertThat(page.totalElements()).isEqualTo(4);
	}

	@Test
	void malformedFiltersReturnBadRequest() {
		EventService service = new EventService(jdbcProvider(null), mock(MvpDataService.class), mock(MockDataStore.class));

		assertBadRequest(() -> service.events("Bearer user", "bad-date", null, null, "0", "20"));
		assertBadRequest(() -> service.events("Bearer user", null, null, "NOPE", "0", "20"));
		assertBadRequest(() -> service.events("Bearer user", null, null, null, "-1", "20"));
		assertBadRequest(() -> service.events("Bearer user", null, null, null, "0", "0"));
	}

	private static void assertBadRequest(ThrowingRunnable runnable) {
		assertThatThrownBy(runnable::run)
			.isInstanceOf(ApiException.class)
			.extracting("status")
			.isEqualTo(HttpStatus.BAD_REQUEST);
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

	private static <T> T mapRow(
		RowMapper<T> mapper,
		long eventId,
		Long alertId,
		String type,
		String severity,
		String title,
		String deviceName,
		LocalDateTime occurredAt,
		String alertStatus
	) throws Exception {
		ResultSet resultSet = mock(ResultSet.class);
		when(resultSet.getLong("event_id")).thenReturn(eventId);
		when(resultSet.getObject("alert_id", Long.class)).thenReturn(alertId);
		when(resultSet.getString("history_type")).thenReturn(type);
		when(resultSet.getString("severity")).thenReturn(severity);
		when(resultSet.getString("title")).thenReturn(title);
		when(resultSet.getString("device_name")).thenReturn(deviceName);
		when(resultSet.getObject("occurred_at", LocalDateTime.class)).thenReturn(occurredAt);
		when(resultSet.getString("alert_status")).thenReturn(alertStatus);
		return mapper.mapRow(resultSet, 0);
	}

	private static final class FakeJdbcTemplate extends JdbcTemplate {

		private final List<Object[]> countArgs = new ArrayList<>();
		private final List<Object[]> pageArgs = new ArrayList<>();
		private final List<String> sqlCalls = new ArrayList<>();

		@Override
		public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
			this.sqlCalls.add(sql);
			this.countArgs.add(args);
			return requiredType.cast(3L);
		}

		@Override
		public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
			try {
				this.sqlCalls.add(sql);
				this.pageArgs.add(args);
				return List.of(
					mapRow(rowMapper, 1001L, 501L, "DANGER", "HIGH", "위험 상황 감지", "현관문 센서",
						LocalDateTime.of(2026, 6, 10, 14, 25), "UNREAD"),
					mapRow(rowMapper, 1002L, null, "DANGER", "MEDIUM", "주의 상황 감지", "공기질 센서",
						LocalDateTime.of(2026, 6, 10, 13, 0), "UNREAD")
				);
			}
			catch (Exception ex) {
				throw new IllegalStateException("Failed to map fake event rows.", ex);
			}
		}
	}

	@FunctionalInterface
	private interface ThrowingRunnable {
		void run() throws Exception;
	}
}
