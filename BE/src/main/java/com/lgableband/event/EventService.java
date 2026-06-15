package com.lgableband.event;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.AlertStatus;
import com.lgableband.common.AlertType;
import com.lgableband.common.ApiException;
import com.lgableband.common.Severity;
import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.EventHistory;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class EventService {

	private static final ZoneOffset SERVICE_OFFSET = ZoneOffset.ofHours(9);

	private final ObjectProvider<JdbcTemplate> jdbcTemplateProvider;
	private final MvpDataService dataService;
	private final MockDataStore mockDataStore;

	public EventService(
		ObjectProvider<JdbcTemplate> jdbcTemplateProvider,
		MvpDataService dataService,
		MockDataStore mockDataStore
	) {
		this.jdbcTemplateProvider = jdbcTemplateProvider;
		this.dataService = dataService;
		this.mockDataStore = mockDataStore;
	}

	public EventPage events(
		String authorization,
		String from,
		String to,
		String type,
		String page,
		String size
	) {
		OffsetDateTime parsedFrom = parseDateTime(from, "from");
		OffsetDateTime parsedTo = parseDateTime(to, "to");
		AlertType parsedType = parseType(type);
		int safePage = parsePage(page);
		int safeSize = parseSize(size);
		long userId = this.dataService.currentUser(authorization).userId();
		JdbcTemplate jdbcTemplate = jdbcTemplate();
		if (jdbcTemplate == null) {
			return mockEvents(userId, parsedFrom, parsedTo, parsedType, safePage, safeSize);
		}

		return dbEvents(jdbcTemplate, userId, parsedFrom, parsedTo, parsedType, safePage, safeSize);
	}

	private EventPage mockEvents(
		long userId,
		OffsetDateTime from,
		OffsetDateTime to,
		AlertType type,
		int page,
		int size
	) {
		List<EventItem> items = this.mockDataStore.events(userId, type, from, to, page, size).stream()
			.map(this::toEventItem)
			.toList();
		long totalElements = this.mockDataStore.countEvents(userId, type, from, to);
		return new EventPage(items, page, size, totalElements);
	}

	private EventPage dbEvents(
		JdbcTemplate jdbcTemplate,
		long userId,
		OffsetDateTime from,
		OffsetDateTime to,
		AlertType type,
		int page,
		int size
	) {
		List<Object> countParams = baseQueryParams(userId);
		String filters = appendFilters(countParams, type, from, to);
		String countSql = "SELECT COUNT(*) " + eventHistoryBaseSql() + filters;
		Long totalElements = jdbcTemplate.queryForObject(countSql, Long.class, countParams.toArray());

		List<Object> pageParams = baseQueryParams(userId);
		String pageFilters = appendFilters(pageParams, type, from, to);
		String pageSql = """
			SELECT event_id, alert_id, history_type, severity, title, device_name, occurred_at, alert_status
			"""
			+ eventHistoryBaseSql()
			+ pageFilters
			+ """
			ORDER BY history.occurred_at DESC, history.event_id DESC
			LIMIT ? OFFSET ?
			""";
		pageParams.add(size);
		pageParams.add((long) page * size);

		List<EventItem> items = jdbcTemplate.query(
			pageSql,
			(rs, rowNum) -> new EventItem(
				rs.getLong("event_id"),
				rs.getObject("alert_id", Long.class),
				AlertType.valueOf(rs.getString("history_type")),
				Severity.valueOf(rs.getString("severity")),
				rs.getString("title"),
				rs.getString("device_name"),
				toOffsetDateTime(rs.getObject("occurred_at", LocalDateTime.class)),
				AlertStatus.valueOf(rs.getString("alert_status"))
			),
			pageParams.toArray()
		);

		return new EventPage(items, page, size, totalElements == null ? 0 : totalElements);
	}

	private List<Object> baseQueryParams(long userId) {
		List<Object> params = new ArrayList<>();
		params.add(userId);
		params.add(userId);
		return params;
	}

	private String appendFilters(List<Object> params, AlertType type, OffsetDateTime from, OffsetDateTime to) {
		StringBuilder filters = new StringBuilder();
		if (type != null) {
			filters.append("AND history.history_type = ?\n");
			params.add(type.name());
		}
		if (from != null) {
			filters.append("AND history.occurred_at >= ?\n");
			params.add(toLocalDateTime(from));
		}
		if (to != null) {
			filters.append("AND history.occurred_at <= ?\n");
			params.add(toLocalDateTime(to));
		}
		return filters.toString();
	}

	private String eventHistoryBaseSql() {
		return """
			FROM (
				SELECT de.event_id AS event_id,
				       a.alert_id AS alert_id,
				       de.event_type AS history_type,
				       de.event_level AS severity,
				       COALESCE(a.title, de.event_type) AS title,
				       d.name AS device_name,
				       de.occurred_at AS occurred_at,
				       COALESCE(a.status, 'UNREAD') AS alert_status
				FROM device_event de
				JOIN device d ON d.device_id = de.device_id
				LEFT JOIN alert a ON a.event_id = de.event_id AND a.user_id = d.user_id
				WHERE d.user_id = ?
				UNION ALL
				SELECT a.alert_id AS event_id,
				       a.alert_id AS alert_id,
				       a.alert_type AS history_type,
				       a.severity AS severity,
				       a.title AS title,
				       '' AS device_name,
				       a.occurred_at AS occurred_at,
				       a.status AS alert_status
				FROM alert a
				WHERE a.user_id = ?
				  AND NOT EXISTS (
				      SELECT 1
				      FROM device_event de
				      WHERE de.event_id = a.event_id
				  )
			) history
			WHERE 1 = 1
			""";
	}

	private EventItem toEventItem(EventHistory event) {
		return new EventItem(
			event.eventId(),
			event.alertId(),
			event.type(),
			event.severity(),
			event.title(),
			event.deviceName(),
			event.occurredAt(),
			event.alertStatus()
		);
	}

	private AlertType parseType(String type) {
		if (type == null || type.isBlank()) {
			return null;
		}
		try {
			return AlertType.valueOf(type);
		} catch (IllegalArgumentException ex) {
			throw invalidRequest("type 값을 확인해주세요.");
		}
	}

	private OffsetDateTime parseDateTime(String value, String fieldName) {
		if (value == null || value.isBlank()) {
			return null;
		}
		try {
			return OffsetDateTime.parse(value);
		} catch (DateTimeParseException ex) {
			throw invalidRequest(fieldName + " 값을 확인해주세요.");
		}
	}

	private int parsePage(String page) {
		int parsed = parseInt(page, "page");
		if (parsed < 0) {
			throw invalidRequest("page 값은 0 이상이어야 합니다.");
		}
		return parsed;
	}

	private int parseSize(String size) {
		int parsed = parseInt(size, "size");
		if (parsed < 1) {
			throw invalidRequest("size 값은 1 이상이어야 합니다.");
		}
		return parsed;
	}

	private int parseInt(String value, String fieldName) {
		try {
			return Integer.parseInt(value);
		} catch (NumberFormatException ex) {
			throw invalidRequest(fieldName + " 값을 확인해주세요.");
		}
	}

	private ApiException invalidRequest(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
	}

	private LocalDateTime toLocalDateTime(OffsetDateTime dateTime) {
		return dateTime.atZoneSameInstant(SERVICE_OFFSET).toLocalDateTime();
	}

	private OffsetDateTime toOffsetDateTime(LocalDateTime dateTime) {
		return dateTime == null ? null : dateTime.atOffset(SERVICE_OFFSET);
	}

	private JdbcTemplate jdbcTemplate() {
		return this.jdbcTemplateProvider.getIfAvailable();
	}

	public record EventPage(List<EventItem> items, int page, int size, long totalElements) {
	}

	public record EventItem(
		long eventId,
		Long alertId,
		AlertType type,
		Severity severity,
		String title,
		String deviceName,
		OffsetDateTime occurredAt,
		AlertStatus alertStatus
	) {
	}
}
