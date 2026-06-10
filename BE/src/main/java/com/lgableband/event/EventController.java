package com.lgableband.event;

import com.lgableband.common.AlertType;
import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.EventHistory;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/events")
public class EventController {

	private final MockDataStore store;

	public EventController(MockDataStore store) {
		this.store = store;
	}

	@GetMapping
	public EventListResponse events(
		@RequestHeader("Authorization") String authorization,
		@RequestParam(required = false) AlertType type,
		@RequestParam(defaultValue = "0") int page,
		@RequestParam(defaultValue = "20") int size
	) {
		long userId = this.store.requireUser(authorization).userId();
		List<EventHistory> items = this.store.events(userId, type, page, size);
		return new EventListResponse(items, page, size, items.size());
	}

	public record EventListResponse(List<EventHistory> items, int page, int size, long totalElements) {
	}
}
