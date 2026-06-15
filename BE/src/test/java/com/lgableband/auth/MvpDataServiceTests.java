package com.lgableband.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.ApiException;
import com.lgableband.common.NotificationChannel;
import com.lgableband.mock.MockDataStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class MvpDataServiceTests {

	private static final String WEARABLE_TOKEN = "db-restored-wearable-token";

	@Test
	void currentUserRestoresPairedWearableTokenFromDbWhenSessionCacheIsEmpty() {
		WearableTokenJdbcTemplate jdbcTemplate = new WearableTokenJdbcTemplate();
		MockDataStore mockDataStore = mock(MockDataStore.class);
		when(mockDataStore.requireUser("Bearer " + WEARABLE_TOKEN))
			.thenThrow(new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "로그인이 필요합니다."));
		MvpDataService service = new MvpDataService(provider(jdbcTemplate), mockDataStore);

		MvpDataService.CurrentUser user = service.currentUser("Bearer " + WEARABLE_TOKEN);
		MvpDataService.CurrentUser cachedUser = service.currentUser("Bearer " + WEARABLE_TOKEN);

		assertThat(user.userId()).isEqualTo(55L);
		assertThat(user.name()).isEqualTo("웨어러블 사용자");
		assertThat(user.email()).isEqualTo("wearable-user@example.com");
		assertThat(user.accessibilityType()).isEqualTo(AccessibilityType.HEARING);
		assertThat(user.notificationPrefs().channels()).containsExactly(NotificationChannel.VOICE, NotificationChannel.VIBRATION);
		assertThat(user.guardianLinked()).isTrue();
		assertThat(cachedUser.userId()).isEqualTo(55L);
		assertThat(jdbcTemplate.wearableTokenLookups()).isEqualTo(1);
		verify(mockDataStore, never()).requireUser(anyString());
	}

	@SuppressWarnings("unchecked")
	private static ObjectProvider<JdbcTemplate> provider(JdbcTemplate jdbcTemplate) {
		ObjectProvider<JdbcTemplate> provider = mock(ObjectProvider.class);
		when(provider.getIfAvailable()).thenReturn(jdbcTemplate);
		return provider;
	}

	private static <T> List<T> mapRows(RowMapper<T> rowMapper, List<ResultSet> rows) throws SQLException {
		List<T> mapped = new ArrayList<>();
		for (int index = 0; index < rows.size(); index++) {
			mapped.add(rowMapper.mapRow(rows.get(index), index));
		}
		return mapped;
	}

	private static ResultSet linkedUserResultSet(long userId) throws SQLException {
		ResultSet resultSet = mock(ResultSet.class);
		when(resultSet.getLong("linked_user_id")).thenReturn(userId);
		return resultSet;
	}

	private static ResultSet userResultSet() throws SQLException {
		ResultSet resultSet = mock(ResultSet.class);
		when(resultSet.getLong("user_id")).thenReturn(55L);
		when(resultSet.getLong("account_id")).thenReturn(77L);
		when(resultSet.getString("name")).thenReturn("웨어러블 사용자");
		when(resultSet.getString("accessibility_type")).thenReturn(AccessibilityType.HEARING.name());
		when(resultSet.getBoolean("high_contrast")).thenReturn(true);
		when(resultSet.getBoolean("large_text")).thenReturn(true);
		return resultSet;
	}

	private static ResultSet accountResultSet() throws SQLException {
		ResultSet resultSet = mock(ResultSet.class);
		when(resultSet.getLong("account_id")).thenReturn(77L);
		when(resultSet.getString("role")).thenReturn(AccountRole.USER.name());
		when(resultSet.getString("email")).thenReturn("wearable-user@example.com");
		when(resultSet.getString("password_hash")).thenReturn("sha256:test");
		return resultSet;
	}

	private static ResultSet channelResultSet(NotificationChannel channel) throws SQLException {
		ResultSet resultSet = mock(ResultSet.class);
		when(resultSet.getString("channel")).thenReturn(channel.name());
		return resultSet;
	}

	private static final class WearableTokenJdbcTemplate extends JdbcTemplate {

		private int wearableTokenLookups;

		int wearableTokenLookups() {
			return this.wearableTokenLookups;
		}

		@Override
		public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
			try {
				if (sql.contains("FROM wearable_pairing_session")) {
					this.wearableTokenLookups++;
					if (args.length == 1 && WEARABLE_TOKEN.equals(args[0])) {
						return mapRows(rowMapper, List.of(linkedUserResultSet(55L)));
					}
					return List.of();
				}
				if (sql.contains("FROM app_user WHERE user_id = ?")) {
					return mapRows(rowMapper, List.of(userResultSet()));
				}
				if (sql.contains("FROM account WHERE account_id = ?")) {
					return mapRows(rowMapper, List.of(accountResultSet()));
				}
				if (sql.contains("FROM user_notification_channel")) {
					return mapRows(rowMapper, List.of(
						channelResultSet(NotificationChannel.VOICE),
						channelResultSet(NotificationChannel.VIBRATION)
					));
				}
				return List.of();
			}
			catch (SQLException ex) {
				throw new IllegalStateException("Failed to map fake auth row.", ex);
			}
		}

		@Override
		public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
			return requiredType.cast(1L);
		}
	}
}
