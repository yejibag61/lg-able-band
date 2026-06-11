package com.lgableband.guardian;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.lgableband.auth.MvpDataService;
import com.lgableband.common.ApiException;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.mock.MockDataStore;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

@Service
public class GuardianService {

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final MvpDataService dataService;
	private final MockDataStore mockDataStore;

	public GuardianService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		MvpDataService dataService,
		MockDataStore mockDataStore
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.dataService = dataService;
		this.mockDataStore = mockDataStore;
	}

	public GuardianListResponse guardians(String authorization) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return new GuardianListResponse(this.mockDataStore.guardians(user.userId()).stream()
				.map(this::toSummary)
				.toList());
		}

		return new GuardianListResponse(jdbcTemplate.query(
			"""
			SELECT g.guardian_id, g.name, g.phone, ug.is_primary, ug.notify_on_danger
			FROM user_guardian ug
			JOIN guardian g ON g.guardian_id = ug.guardian_id
			WHERE ug.user_id = ?
			ORDER BY ug.is_primary DESC, ug.map_id ASC
			""",
			(rs, rowNum) -> new GuardianSummary(
				rs.getLong("guardian_id"),
				rs.getString("name"),
				rs.getString("phone"),
				rs.getBoolean("is_primary"),
				rs.getBoolean("notify_on_danger"),
				ConnectionStatus.CONNECTED
			),
			user.userId()
		));
	}

	public GuardianSummary addGuardian(String authorization, GuardianController.GuardianRequest request) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			MockDataStore.Guardian guardian = this.mockDataStore.addGuardian(
				user.userId(),
				request.name(),
				request.phone(),
				request.isPrimary(),
				request.notifyOnDanger()
			);
			return toSummary(guardian);
		}

		if (request.isPrimary()) {
			clearPrimaryGuardian(jdbcTemplate, user.userId());
		}

		long guardianId = insertGuardian(jdbcTemplate, request);
		jdbcTemplate.update(
			"INSERT INTO user_guardian (user_id, guardian_id, is_primary, notify_on_danger) VALUES (?, ?, ?, ?)",
			user.userId(),
			guardianId,
			request.isPrimary(),
			request.notifyOnDanger()
		);
		return guardian(jdbcTemplate, user.userId(), guardianId);
	}

	public GuardianSummary updateGuardian(String authorization, long guardianId, GuardianController.GuardianRequest request) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return toSummary(this.mockDataStore.updateGuardian(
				user.userId(),
				guardianId,
				request.name(),
				request.phone(),
				request.isPrimary(),
				request.notifyOnDanger()
			));
		}

		ensureGuardianLinked(jdbcTemplate, user.userId(), guardianId);
		if (request.isPrimary()) {
			clearPrimaryGuardian(jdbcTemplate, user.userId());
		}
		jdbcTemplate.update(
			"UPDATE guardian SET name = ?, phone = ? WHERE guardian_id = ?",
			request.name(),
			request.phone(),
			guardianId
		);
		jdbcTemplate.update(
			"UPDATE user_guardian SET is_primary = ?, notify_on_danger = ? WHERE user_id = ? AND guardian_id = ?",
			request.isPrimary(),
			request.notifyOnDanger(),
			user.userId(),
			guardianId
		);
		return guardian(jdbcTemplate, user.userId(), guardianId);
	}

	public void deleteGuardian(String authorization, long guardianId) {
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			this.mockDataStore.deleteGuardian(user.userId(), guardianId);
			return;
		}

		ensureGuardianLinked(jdbcTemplate, user.userId(), guardianId);
		jdbcTemplate.update(
			"DELETE FROM user_guardian WHERE user_id = ? AND guardian_id = ?",
			user.userId(),
			guardianId
		);
		jdbcTemplate.update(
			"""
			DELETE FROM guardian
			WHERE guardian_id = ?
			  AND account_id IS NULL
			  AND NOT EXISTS (SELECT 1 FROM user_guardian WHERE guardian_id = ?)
			""",
			guardianId,
			guardianId
		);
	}

	private long insertGuardian(JdbcTemplate jdbcTemplate, GuardianController.GuardianRequest request) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"INSERT INTO guardian (name, phone, relationship) VALUES (?, ?, ?)",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setString(1, request.name());
			ps.setString(2, request.phone());
			ps.setString(3, "FAMILY");
			return ps;
		}, keyHolder);
		return keyHolder.getKey().longValue();
	}

	private GuardianSummary guardian(JdbcTemplate jdbcTemplate, long userId, long guardianId) {
		return jdbcTemplate.query(
			"""
			SELECT g.guardian_id, g.name, g.phone, ug.is_primary, ug.notify_on_danger
			FROM user_guardian ug
			JOIN guardian g ON g.guardian_id = ug.guardian_id
			WHERE ug.user_id = ? AND ug.guardian_id = ?
			""",
			(rs, rowNum) -> new GuardianSummary(
				rs.getLong("guardian_id"),
				rs.getString("name"),
				rs.getString("phone"),
				rs.getBoolean("is_primary"),
				rs.getBoolean("notify_on_danger"),
				ConnectionStatus.CONNECTED
			),
			userId,
			guardianId
		).stream().findFirst()
			.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자를 찾을 수 없습니다."));
	}

	private void ensureGuardianLinked(JdbcTemplate jdbcTemplate, long userId, long guardianId) {
		Long count = jdbcTemplate.queryForObject(
			"SELECT COUNT(*) FROM user_guardian WHERE user_id = ? AND guardian_id = ?",
			Long.class,
			userId,
			guardianId
		);
		if (count == null || count == 0) {
			throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "보호자를 찾을 수 없습니다.");
		}
	}

	private void clearPrimaryGuardian(JdbcTemplate jdbcTemplate, long userId) {
		jdbcTemplate.update("UPDATE user_guardian SET is_primary = FALSE WHERE user_id = ?", userId);
	}

	private GuardianSummary toSummary(MockDataStore.Guardian guardian) {
		return new GuardianSummary(
			guardian.guardianId(),
			guardian.name(),
			guardian.phone(),
			guardian.isPrimary(),
			guardian.notifyOnDanger(),
			guardian.connectionStatus()
		);
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	public record GuardianListResponse(List<GuardianSummary> items) {
	}

	public record GuardianSummary(
		long guardianId,
		String name,
		String phone,
		@JsonProperty("isPrimary") boolean primary,
		boolean notifyOnDanger,
		ConnectionStatus connectionStatus
	) {
	}
}
