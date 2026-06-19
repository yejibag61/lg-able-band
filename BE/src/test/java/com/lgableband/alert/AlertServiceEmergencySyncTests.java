package com.lgableband.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AccessibilityType;
import com.lgableband.common.AccountRole;
import com.lgableband.common.AlertStatus;
import com.lgableband.common.ApiException;
import com.lgableband.common.NotificationChannel;
import com.lgableband.mock.MockDataStore;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

class AlertServiceEmergencySyncTests {

	@Test
	void confirmResolvesLinkedEmergencyRequestForOwningUser() {
		FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
		AlertService service = new AlertService(
			provider(jdbcTemplate),
			provider(null),
			dataService(7L),
			mock(MockDataStore.class)
		);

		AlertService.StatusResponse response = service.confirm("Bearer owner", 42L);

		assertThat(response.status()).isEqualTo(AlertStatus.CONFIRMED);
		assertThat(jdbcTemplate.resolvedEmergencyUserIds).containsExactly(7L);
		assertThat(jdbcTemplate.resolvedEmergencyAlertIds).containsExactly(42L);
	}

	@Test
	void deleteCancelsLinkedEmergencyRequestBeforeRemovingAlertForOwningUser() {
		FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
		AlertService service = new AlertService(
			provider(jdbcTemplate),
			provider(null),
			dataService(9L),
			mock(MockDataStore.class)
		);

		AlertService.DeleteResponse response = service.delete("Bearer owner", 84L);

		assertThat(response.deleted()).isTrue();
		assertThat(jdbcTemplate.canceledEmergencyUserIds).containsExactly(9L);
		assertThat(jdbcTemplate.canceledEmergencyAlertIds).containsExactly(84L);
		assertThat(jdbcTemplate.operations).containsExactly(
			"cancel-emergency",
			"delete-delivery",
			"delete-alert"
		);
	}

	@Test
	void guardianConfirmResolvesLinkedUsersEmergencyAndOnlyTheirDelivery() {
		FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
		AlertService service = new AlertService(
			provider(jdbcTemplate),
			provider(null),
			guardianDataService(5L, 17L),
			mock(MockDataStore.class)
		);

		AlertService.StatusResponse response = service.confirm("Bearer guardian", 99L);

		assertThat(response.status()).isEqualTo(AlertStatus.CONFIRMED);
		assertThat(jdbcTemplate.confirmedAlertUserIds).containsExactly(17L);
		assertThat(jdbcTemplate.confirmedDeliveryGuardianIds).containsExactly(5L);
		assertThat(jdbcTemplate.resolvedEmergencyUserIds).containsExactly(17L);
		assertThat(jdbcTemplate.resolvedEmergencyAlertIds).containsExactly(99L);
	}

	@Test
	void guardianConfirmRejectsAlertWithoutTheirDelivery() {
		FakeJdbcTemplate jdbcTemplate = new FakeJdbcTemplate();
		jdbcTemplate.guardianDeliveryExists = false;
		AlertService service = new AlertService(
			provider(jdbcTemplate),
			provider(null),
			guardianDataService(5L, 17L),
			mock(MockDataStore.class)
		);

		assertThatThrownBy(() -> service.confirm("Bearer guardian", 99L))
			.isInstanceOf(ApiException.class)
			.extracting("status")
			.isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(jdbcTemplate.resolvedEmergencyAlertIds).isEmpty();
	}

	@SuppressWarnings("unchecked")
	private static <T> ObjectProvider<T> provider(T instance) {
		ObjectProvider<T> provider = mock(ObjectProvider.class);
		when(provider.getIfAvailable()).thenReturn(instance);
		return provider;
	}

	private static MvpDataService dataService(long userId) {
		MvpDataService dataService = mock(MvpDataService.class);
		when(dataService.currentUser("Bearer owner")).thenReturn(currentUser(userId));
		return dataService;
	}

	private static MvpDataService guardianDataService(long guardianId, long linkedUserId) {
		MvpDataService dataService = mock(MvpDataService.class);
		when(dataService.currentUser("Bearer guardian"))
			.thenThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "GUARDIAN 계정만 사용할 수 있습니다."));
		when(dataService.currentGuardian("Bearer guardian")).thenReturn(new MvpDataService.CurrentGuardian(
			guardianId,
			"보호자",
			"guardian@example.com",
			"FAMILY",
			linkedUserId
		));
		return dataService;
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

	private static final class FakeJdbcTemplate extends JdbcTemplate {

		private final List<Long> resolvedEmergencyUserIds = new ArrayList<>();
		private final List<Long> resolvedEmergencyAlertIds = new ArrayList<>();
		private final List<Long> canceledEmergencyUserIds = new ArrayList<>();
		private final List<Long> canceledEmergencyAlertIds = new ArrayList<>();
		private final List<Long> confirmedAlertUserIds = new ArrayList<>();
		private final List<Long> confirmedDeliveryGuardianIds = new ArrayList<>();
		private final List<String> operations = new ArrayList<>();
		private boolean guardianDeliveryExists = true;

		@Override
		public int update(String sql, Object... args) {
			if (sql.contains("UPDATE alert\n") && sql.contains("SET status = ?")) {
				if (sql.contains("target_guardian_id") && args[4] != null && !this.guardianDeliveryExists) {
					return 0;
				}
				this.confirmedAlertUserIds.add((Long) args[3]);
				return 1;
			}
			if (sql.contains("UPDATE alert_delivery")) {
				if (sql.contains("target_guardian_id = ?")) {
					this.confirmedDeliveryGuardianIds.add((Long) args[2]);
				}
				return 1;
			}
			if (sql.contains("UPDATE emergency_request") && sql.contains("alert_id = NULL")) {
				this.operations.add("cancel-emergency");
				this.canceledEmergencyUserIds.add((Long) args[0]);
				this.canceledEmergencyAlertIds.add((Long) args[1]);
				return 1;
			}
			if (sql.contains("UPDATE emergency_request") && sql.contains("RESOLVED")) {
				this.resolvedEmergencyUserIds.add((Long) args[0]);
				this.resolvedEmergencyAlertIds.add((Long) args[1]);
				return 1;
			}
			if (sql.contains("DELETE FROM alert_delivery")) {
				this.operations.add("delete-delivery");
				return 1;
			}
			if (sql.contains("DELETE FROM alert")) {
				this.operations.add("delete-alert");
				return 1;
			}
			throw new AssertionError("Unexpected update SQL: " + sql);
		}

		@Override
		public <T> T queryForObject(String sql, Class<T> requiredType, Object... args) {
			if (sql.contains("SELECT COUNT(*) FROM alert")) {
				return requiredType.cast(1);
			}
			throw new AssertionError("Unexpected queryForObject SQL: " + sql);
		}
	}
}
