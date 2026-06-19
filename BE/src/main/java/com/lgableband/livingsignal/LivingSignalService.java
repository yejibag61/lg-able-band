package com.lgableband.livingsignal;

import com.lgableband.alert.AlertService;
import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AlertType;
import com.lgableband.common.ApiException;
import com.lgableband.common.DeviceType;
import com.lgableband.common.Severity;
import com.lgableband.common.AlertStatus;
import com.lgableband.mock.MockDataStore;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

@Service
public class LivingSignalService {

	private static final ZoneOffset SERVICE_OFFSET = ZoneOffset.ofHours(9);

	private static final List<String> DEFAULT_WORKFLOW = List.of(
		"사용자가 마이크로 알림음을 녹음하고 이름과 유형을 등록합니다.",
		"등록된 샘플은 embedding으로 변환되어 같은 소리와 비교됩니다.",
		"주변 소리를 들으면 등록된 샘플과 유사도를 계산합니다.",
		"유사도가 threshold 이상이면 등록한 생활 신호 이름으로 안내합니다."
	);

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final MvpDataService dataService;
	private final AlertService alertService;
	private final MockDataStore mockDataStore;

	private final Map<Long, FallbackState> fallbackStates = new ConcurrentHashMap<>();
	private final AtomicLong fallbackSoundSequence = new AtomicLong(100);
	private final AtomicLong fallbackRecordingSequence = new AtomicLong(1000);

	public LivingSignalService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		MvpDataService dataService,
		AlertService alertService,
		MockDataStore mockDataStore
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.dataService = dataService;
		this.alertService = alertService;
		this.mockDataStore = mockDataStore;
	}

	public LivingSignalStateResponse state(String authorization) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			return fallbackStateResponse(user.userId());
		}

		try {
			double threshold = jdbcTemplate.query(
				"""
				SELECT similarity_threshold
				FROM living_signal_profile
				WHERE user_id = ?
				""",
				(rs, rowNum) -> rs.getDouble("similarity_threshold"),
				user.userId()
			).stream().findFirst().orElse(0.8);

			List<SoundResponse> sounds = jdbcTemplate.query(
				"""
				SELECT sound_id, registered_sound_name, sound_type, notes, updated_at
				FROM living_signal_sound
				WHERE user_id = ?
				ORDER BY updated_at DESC, sound_id DESC
				""",
				(rs, rowNum) -> new SoundResponse(
					rs.getLong("sound_id"),
					rs.getString("registered_sound_name"),
					rs.getString("sound_type"),
					soundTypeLabel(rs.getString("sound_type")),
					rs.getString("notes"),
					toOffsetDateTime(rs.getObject("updated_at", LocalDateTime.class)),
					recordings(jdbcTemplate, rs.getLong("sound_id"))
				),
				user.userId()
			);

			return new LivingSignalStateResponse(threshold, DEFAULT_WORKFLOW, sounds);
		} catch (DataAccessException exception) {
			throw persistenceReadFailed(exception);
		}
	}

	public SoundResponse createSound(String authorization, SoundUpsertRequest request) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			return createFallbackSound(user.userId(), request);
		}

		try {
			long soundId = insertSound(jdbcTemplate, user.userId(), request);
			insertRecordings(jdbcTemplate, soundId, request.recordings());
			return soundById(jdbcTemplate, user.userId(), soundId);
		} catch (DataAccessException exception) {
			throw persistenceWriteFailed(exception);
		}
	}

	public SoundResponse updateSound(String authorization, long soundId, SoundUpsertRequest request) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			return updateFallbackSound(user.userId(), soundId, request);
		}

		try {
			int updatedRows = jdbcTemplate.update(
				"""
				UPDATE living_signal_sound
				SET registered_sound_name = ?, sound_type = ?, notes = ?, updated_at = ?
				WHERE sound_id = ? AND user_id = ?
				""",
				request.registeredSoundName(),
				request.soundType(),
				blankToNull(request.notes()),
				Timestamp.valueOf(LocalDateTime.now()),
				soundId,
				user.userId()
			);

			if (updatedRows == 0) {
				throw notFound();
			}

			jdbcTemplate.update("DELETE FROM living_signal_recording WHERE sound_id = ?", soundId);
			insertRecordings(jdbcTemplate, soundId, request.recordings());
			return soundById(jdbcTemplate, user.userId(), soundId);
		} catch (DataAccessException exception) {
			throw persistenceWriteFailed(exception);
		}
	}

	public void deleteSound(String authorization, long soundId) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			deleteFallbackSound(user.userId(), soundId);
			return;
		}

		try {
			int deletedRows = jdbcTemplate.update(
				"DELETE FROM living_signal_sound WHERE sound_id = ? AND user_id = ?",
				soundId,
				user.userId()
			);

			if (deletedRows == 0) {
				throw notFound();
			}
		} catch (DataAccessException exception) {
			throw persistenceWriteFailed(exception);
		}
	}

	public ThresholdResponse updateThreshold(String authorization, double threshold) {
		double normalizedThreshold = normalizeThreshold(threshold);
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);

		if (jdbcTemplate == null) {
			return updateFallbackThreshold(user.userId(), normalizedThreshold);
		}

		try {
			jdbcTemplate.update(
				"""
				INSERT INTO living_signal_profile (user_id, similarity_threshold)
				VALUES (?, ?)
				ON DUPLICATE KEY UPDATE similarity_threshold = VALUES(similarity_threshold)
				""",
				user.userId(),
				normalizedThreshold
			);

			return new ThresholdResponse(normalizedThreshold);
		} catch (DataAccessException exception) {
			throw persistenceWriteFailed(exception);
		}
	}

	public AlertService.AlertView createDetectionAlert(String authorization, DetectionAlertRequest request) {
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		MvpDataService.CurrentUser user = this.dataService.currentUser(authorization);
		OffsetDateTime detectedAt = normalizeOffsetDateTime(request.detectedAt());
		String registeredSoundName = request.registeredSoundName().trim();
		String soundType = request.soundType().trim();
		AlertType alertType = alertTypeForSoundType(soundType);
		Severity severity = severityForSoundType(soundType);
		String title = registeredSoundName + " 감지";
		String message = detectionMessage(registeredSoundName, soundType);
		String voiceGuide = detectionVoiceGuide(registeredSoundName, soundType);
		String recommendedAction = recommendedActionForSoundType(soundType);
		boolean requiresGuardianNotify = requiresGuardianNotify(soundType);

		if (jdbcTemplate == null) {
			MockDataStore.Alert alert = this.mockDataStore.addContextAlert(
				user.userId(),
				alertType,
				severity,
				title,
				message,
				"웨어러블",
				detectedAt,
				voiceGuide
			);

			return this.alertService.alert(authorization, alert.alertId());
		}

		try {
			Long wearableDeviceId = findWearableDeviceId(jdbcTemplate, user.userId());
			Long eventId = wearableDeviceId == null
				? null
				: insertDetectionEvent(
					jdbcTemplate,
					wearableDeviceId,
					alertType,
					severity,
					registeredSoundName,
					soundType,
					request.similarity(),
					recommendedAction,
					requiresGuardianNotify,
					detectedAt
				);
			long alertId = insertDetectionAlert(
				jdbcTemplate,
				user.userId(),
				eventId,
				alertType,
				severity,
				title,
				message,
				voiceGuide,
				detectedAt
			);
			return this.alertService.alert(authorization, alertId);
		} catch (DataAccessException exception) {
			throw new ApiException(
				HttpStatus.INTERNAL_SERVER_ERROR,
				"LIVING_SIGNAL_ALERT_FAILED",
				"생활 신호 감지 알림을 생성하지 못했습니다."
			);
		}
	}

	private LivingSignalStateResponse fallbackStateResponse(long userId) {
		FallbackState fallbackState = fallbackStates.computeIfAbsent(userId, ignored -> defaultFallbackState());
		return new LivingSignalStateResponse(
			fallbackState.threshold(),
			DEFAULT_WORKFLOW,
			copySounds(fallbackState.sounds())
		);
	}

	private SoundResponse createFallbackSound(long userId, SoundUpsertRequest request) {
		FallbackState state = fallbackStates.computeIfAbsent(userId, ignored -> defaultFallbackState());
		SoundResponse created = new SoundResponse(
			fallbackSoundSequence.incrementAndGet(),
			request.registeredSoundName(),
			request.soundType(),
			soundTypeLabel(request.soundType()),
			request.notes(),
			OffsetDateTime.now(),
			request.recordings().stream()
				.map(recording -> new RecordingResponse(
					fallbackRecordingSequence.incrementAndGet(),
					recording.label(),
					recording.createdAt(),
					recording.durationSec(),
					recording.audioDataUrl(),
					recording.embedding()
				))
				.toList()
		);
		List<SoundResponse> nextSounds = new ArrayList<>();
		nextSounds.add(created);
		nextSounds.addAll(state.sounds());
		fallbackStates.put(userId, new FallbackState(state.threshold(), nextSounds));
		return created;
	}

	private SoundResponse updateFallbackSound(long userId, long soundId, SoundUpsertRequest request) {
		FallbackState state = fallbackStates.computeIfAbsent(userId, ignored -> defaultFallbackState());
		List<SoundResponse> updatedSounds = state.sounds().stream()
			.map(sound -> {
				if (sound.soundId() != soundId) {
					return sound;
				}
				return new SoundResponse(
					soundId,
					request.registeredSoundName(),
					request.soundType(),
					soundTypeLabel(request.soundType()),
					request.notes(),
					OffsetDateTime.now(),
					request.recordings().stream()
						.map(recording -> new RecordingResponse(
							fallbackRecordingSequence.incrementAndGet(),
							recording.label(),
							recording.createdAt(),
							recording.durationSec(),
							recording.audioDataUrl(),
							recording.embedding()
						))
						.toList()
				);
			})
			.toList();
		fallbackStates.put(userId, new FallbackState(state.threshold(), updatedSounds));
		return updatedSounds.stream()
			.filter(sound -> sound.soundId() == soundId)
			.findFirst()
			.orElseThrow(this::notFound);
	}

	private void deleteFallbackSound(long userId, long soundId) {
		FallbackState state = fallbackStates.computeIfAbsent(userId, ignored -> defaultFallbackState());
		fallbackStates.put(
			userId,
			new FallbackState(
				state.threshold(),
				state.sounds().stream().filter(sound -> sound.soundId() != soundId).toList()
			)
		);
	}

	private ThresholdResponse updateFallbackThreshold(long userId, double threshold) {
		FallbackState state = fallbackStates.computeIfAbsent(userId, ignored -> defaultFallbackState());
		fallbackStates.put(userId, new FallbackState(threshold, state.sounds()));
		return new ThresholdResponse(threshold);
	}

	private long insertSound(JdbcTemplate jdbcTemplate, long userId, SoundUpsertRequest request) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO living_signal_sound (
					user_id,
					registered_sound_name,
					sound_type,
					notes
				) VALUES (?, ?, ?, ?)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, userId);
			ps.setString(2, request.registeredSoundName());
			ps.setString(3, request.soundType());
			ps.setString(4, blankToNull(request.notes()));
			return ps;
		}, keyHolder);

		return keyHolder.getKey().longValue();
	}

	private Long findWearableDeviceId(JdbcTemplate jdbcTemplate, long userId) {
		List<Long> linkedWearables = jdbcTemplate.query(
			"""
			SELECT linked_device_id
			FROM wearable_pairing_session
			WHERE linked_user_id = ?
			  AND status = 'PAIRED'
			  AND linked_device_id IS NOT NULL
			ORDER BY updated_at DESC
			LIMIT 1
			""",
			(rs, rowNum) -> rs.getLong("linked_device_id"),
			userId
		);
		if (!linkedWearables.isEmpty()) {
			return linkedWearables.getFirst();
		}

		List<Long> wearableDevices = jdbcTemplate.query(
			"""
			SELECT device_id
			FROM device
			WHERE user_id = ?
			  AND device_type = 'WEARABLE'
			ORDER BY created_at DESC, device_id DESC
			LIMIT 1
			""",
			(rs, rowNum) -> rs.getLong("device_id"),
			userId
		);

		return wearableDevices.isEmpty() ? null : wearableDevices.getFirst();
	}

	private Long insertDetectionEvent(
		JdbcTemplate jdbcTemplate,
		long deviceId,
		AlertType alertType,
		Severity severity,
		String registeredSoundName,
		String soundType,
		double similarity,
		String recommendedAction,
		boolean requiresGuardianNotify,
		OffsetDateTime detectedAt
	) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO device_event (
					device_id,
					event_type,
					event_level,
					payload_json,
					occurred_at
				) VALUES (?, ?, ?, ?, ?)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, deviceId);
			ps.setString(2, alertType.name());
			ps.setString(3, severity.name());
			ps.setString(
				4,
				detectionPayloadJson(
					registeredSoundName,
					soundType,
					similarity,
					recommendedAction,
					requiresGuardianNotify
				)
			);
			ps.setTimestamp(5, Timestamp.valueOf(toLocalDateTime(detectedAt)));
			return ps;
		}, keyHolder);

		return keyHolder.getKey() == null ? null : keyHolder.getKey().longValue();
	}

	private long insertDetectionAlert(
		JdbcTemplate jdbcTemplate,
		long userId,
		Long eventId,
		AlertType alertType,
		Severity severity,
		String title,
		String message,
		String voiceGuide,
		OffsetDateTime detectedAt
	) {
		KeyHolder keyHolder = new GeneratedKeyHolder();
		jdbcTemplate.update(connection -> {
			PreparedStatement ps = connection.prepareStatement(
				"""
				INSERT INTO alert (
					user_id,
					event_id,
					alert_type,
					severity,
					title,
					message,
					voice_guide,
					status,
					occurred_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				""",
				Statement.RETURN_GENERATED_KEYS
			);
			ps.setLong(1, userId);
			if (eventId == null) {
				ps.setObject(2, null);
			} else {
				ps.setLong(2, eventId);
			}
			ps.setString(3, alertType.name());
			ps.setString(4, severity.name());
			ps.setString(5, title);
			ps.setString(6, message);
			ps.setString(7, voiceGuide);
			ps.setString(8, AlertStatus.UNREAD.name());
			ps.setTimestamp(9, Timestamp.valueOf(toLocalDateTime(detectedAt)));
			return ps;
		}, keyHolder);

		return keyHolder.getKey().longValue();
	}

	private void insertRecordings(JdbcTemplate jdbcTemplate, long soundId, List<RecordingRequest> recordings) {
		for (RecordingRequest recording : recordings) {
			jdbcTemplate.update(
				"""
				INSERT INTO living_signal_recording (
					sound_id,
					label,
					duration_sec,
					audio_data_url,
					embedding_json,
					created_at
				) VALUES (?, ?, ?, ?, ?, ?)
				""",
				soundId,
				recording.label(),
				recording.durationSec(),
				blankToNull(recording.audioDataUrl()),
				toJsonArray(recording.embedding()),
				Timestamp.valueOf(toLocalDateTime(recording.createdAt()))
			);
		}
	}

	private SoundResponse soundById(JdbcTemplate jdbcTemplate, long userId, long soundId) {
		return jdbcTemplate.query(
			"""
			SELECT sound_id, registered_sound_name, sound_type, notes, updated_at
			FROM living_signal_sound
			WHERE sound_id = ? AND user_id = ?
			""",
			(rs, rowNum) -> new SoundResponse(
				rs.getLong("sound_id"),
				rs.getString("registered_sound_name"),
				rs.getString("sound_type"),
				soundTypeLabel(rs.getString("sound_type")),
				rs.getString("notes"),
				toOffsetDateTime(rs.getObject("updated_at", LocalDateTime.class)),
				recordings(jdbcTemplate, rs.getLong("sound_id"))
			),
			soundId,
			userId
		).stream().findFirst().orElseThrow(this::notFound);
	}

	private List<RecordingResponse> recordings(JdbcTemplate jdbcTemplate, long soundId) {
		return jdbcTemplate.query(
			"""
			SELECT recording_id, label, duration_sec, audio_data_url, embedding_json, created_at
			FROM living_signal_recording
			WHERE sound_id = ?
			ORDER BY created_at ASC, recording_id ASC
			""",
			(rs, rowNum) -> new RecordingResponse(
				rs.getLong("recording_id"),
				rs.getString("label"),
				toOffsetDateTime(rs.getObject("created_at", LocalDateTime.class)),
				rs.getDouble("duration_sec"),
				rs.getString("audio_data_url"),
				parseEmbedding(rs.getString("embedding_json"))
			),
			soundId
		);
	}

	private FallbackState defaultFallbackState() {
		OffsetDateTime now = OffsetDateTime.now();
		List<SoundResponse> sounds = List.of(
			new SoundResponse(
				fallbackSoundSequence.incrementAndGet(),
				"우리 아파트 방송음",
				"apartment_announcement",
				soundTypeLabel("apartment_announcement"),
				"방송 시작음을 등록한 기본 샘플입니다.",
				now.minusMinutes(40),
				List.of(
					new RecordingResponse(
						fallbackRecordingSequence.incrementAndGet(),
						"apt-chime-1",
						now.minusMinutes(45),
						2.4,
						"",
						List.of(0.29, 0.36, 0.41, 0.48, 0.43, 0.34, 0.27, 0.18)
					)
				)
			)
		);
		return new FallbackState(0.8, sounds);
	}

	private List<SoundResponse> copySounds(List<SoundResponse> sounds) {
		return sounds.stream()
			.map(sound -> new SoundResponse(
				sound.soundId(),
				sound.registeredSoundName(),
				sound.soundType(),
				sound.soundTypeLabel(),
				sound.notes(),
				sound.updatedAt(),
				sound.recordings().stream()
					.map(recording -> new RecordingResponse(
						recording.recordingId(),
						recording.label(),
						recording.createdAt(),
						recording.durationSec(),
						recording.audioDataUrl(),
						List.copyOf(recording.embedding())
					))
					.toList()
			))
			.toList();
	}

	private List<Double> parseEmbedding(String json) {
		if (json == null || json.isBlank()) {
			return List.of();
		}

		String trimmed = json.trim();
		if (trimmed.length() < 2) {
			return List.of();
		}

		String content = trimmed.substring(1, trimmed.length() - 1).trim();
		if (content.isBlank()) {
			return List.of();
		}

		String[] parts = content.split(",");
		List<Double> values = new ArrayList<>();
		for (String part : parts) {
			values.add(Double.parseDouble(part.trim()));
		}
		return values;
	}

	private String toJsonArray(List<Double> embedding) {
		if (embedding == null || embedding.isEmpty()) {
			return "[]";
		}

		StringBuilder builder = new StringBuilder("[");
		for (int index = 0; index < embedding.size(); index += 1) {
			if (index > 0) {
				builder.append(',');
			}
			builder.append(BigDecimal.valueOf(embedding.get(index)).stripTrailingZeros().toPlainString());
		}
		builder.append(']');
		return builder.toString();
	}

	private LocalDateTime toLocalDateTime(OffsetDateTime dateTime) {
		return dateTime == null
			? LocalDateTime.now(SERVICE_OFFSET)
			: dateTime.atZoneSameInstant(SERVICE_OFFSET).toLocalDateTime();
	}

	private OffsetDateTime normalizeOffsetDateTime(OffsetDateTime dateTime) {
		return dateTime == null
			? OffsetDateTime.now(SERVICE_OFFSET)
			: dateTime.withOffsetSameInstant(SERVICE_OFFSET);
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(SERVICE_OFFSET);
	}

	private String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value;
	}

	private String detectionPayloadJson(
		String registeredSoundName,
		String soundType,
		double similarity,
		String recommendedAction,
		boolean requiresGuardianNotify
	) {
		return """
			{"deviceName":"%s","locationName":"사용자 주변","registeredSoundName":"%s","soundType":"%s","similarity":%s,"recommendedAction":"%s","requiresGuardianNotify":%s}
			""".formatted(
			"웨어러블",
			escapeJson(registeredSoundName),
			escapeJson(soundType),
			BigDecimal.valueOf(similarity).setScale(4, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString(),
			escapeJson(recommendedAction),
			requiresGuardianNotify
		);
	}

	private String escapeJson(String value) {
		return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
	}

	private AlertType alertTypeForSoundType(String soundType) {
		return "fire_alarm".equals(soundType) ? AlertType.DANGER : AlertType.LIFE;
	}

	private Severity severityForSoundType(String soundType) {
		return switch (soundType) {
			case "fire_alarm" -> Severity.HIGH;
			case "apartment_announcement", "doorbell" -> Severity.MEDIUM;
			default -> Severity.LOW;
		};
	}

	private String detectionMessage(String registeredSoundName, String soundType) {
		return switch (soundType) {
			case "apartment_announcement" -> registeredSoundName + "이(가) 감지되었습니다. 방송 내용을 확인해 주세요.";
			case "doorbell" -> registeredSoundName + "이(가) 감지되었습니다. 방문 여부를 확인해 주세요.";
			case "fire_alarm" -> registeredSoundName + "이(가) 감지되었습니다. 즉시 주변 위험을 확인해 주세요.";
			case "appliance_done" -> registeredSoundName + "이(가) 감지되었습니다. 가전 상태를 확인해 주세요.";
			default -> registeredSoundName + "이(가) 감지되었습니다.";
		};
	}

	private String detectionVoiceGuide(String registeredSoundName, String soundType) {
		return switch (soundType) {
			case "fire_alarm" -> registeredSoundName + " 감지. 즉시 확인하세요.";
			case "doorbell" -> registeredSoundName + " 감지. 현관을 확인하세요.";
			case "apartment_announcement" -> registeredSoundName + " 감지. 방송을 확인하세요.";
			default -> registeredSoundName + " 감지";
		};
	}

	private String recommendedActionForSoundType(String soundType) {
		return switch (soundType) {
			case "apartment_announcement" -> "방송 내용을 확인해 주세요.";
			case "doorbell" -> "현관 또는 도어센서를 확인해 주세요.";
			case "fire_alarm" -> "즉시 주변 위험을 확인하고 필요하면 대피해 주세요.";
			case "appliance_done" -> "완료된 가전 상태를 확인해 주세요.";
			default -> "감지된 생활 신호를 확인해 주세요.";
		};
	}

	private boolean requiresGuardianNotify(String soundType) {
		return "fire_alarm".equals(soundType);
	}

	private String soundTypeLabel(String soundType) {
		return switch (soundType) {
			case "apartment_announcement" -> "아파트 방송";
			case "doorbell" -> "초인종";
			case "fire_alarm" -> "화재 경보";
			case "appliance_done" -> "가전 완료음";
			case "background_noise" -> "배경 소음";
			default -> soundType;
		};
	}

	private double normalizeThreshold(double threshold) {
		return BigDecimal.valueOf(threshold)
			.setScale(2, RoundingMode.HALF_UP)
			.doubleValue();
	}

	private ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "생활 신호를 찾을 수 없습니다.");
	}

	private ApiException persistenceReadFailed(DataAccessException exception) {
		return new ApiException(
			HttpStatus.SERVICE_UNAVAILABLE,
			"LIVING_SIGNAL_STATE_UNAVAILABLE",
			"생활 신호 설정을 DB에서 불러오지 못했습니다."
		);
	}

	private ApiException persistenceWriteFailed(DataAccessException exception) {
		return new ApiException(
			HttpStatus.SERVICE_UNAVAILABLE,
			"LIVING_SIGNAL_PERSISTENCE_FAILED",
			"생활 신호 설정을 DB에 저장하지 못했습니다."
		);
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	private record FallbackState(double threshold, List<SoundResponse> sounds) {
	}

	public record LivingSignalStateResponse(
		double threshold,
		List<String> workflow,
		List<SoundResponse> sounds
	) {
	}

	public record SoundResponse(
		long soundId,
		String registeredSoundName,
		String soundType,
		String soundTypeLabel,
		String notes,
		OffsetDateTime updatedAt,
		List<RecordingResponse> recordings
	) {
	}

	public record RecordingResponse(
		long recordingId,
		String label,
		OffsetDateTime createdAt,
		double durationSec,
		String audioDataUrl,
		List<Double> embedding
	) {
	}

	public record ThresholdResponse(double threshold) {
	}

	public record SoundUpsertRequest(
		String registeredSoundName,
		String soundType,
		String notes,
		List<RecordingRequest> recordings
	) {
	}

	public record RecordingRequest(
		String label,
		OffsetDateTime createdAt,
		double durationSec,
		String audioDataUrl,
		List<Double> embedding
	) {
	}

	public record DetectionAlertRequest(
		String registeredSoundName,
		String soundType,
		double similarity,
		OffsetDateTime detectedAt
	) {
	}
}
