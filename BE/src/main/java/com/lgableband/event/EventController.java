package com.lgableband.event;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/events")
public class EventController {

	private final EventService eventService;

	public EventController(EventService eventService) {
		this.eventService = eventService;
	}

	@GetMapping
	public EventService.EventPage events(
		@RequestHeader("Authorization") String authorization,
		@RequestParam(required = false) String from,
		@RequestParam(required = false) String to,
		@RequestParam(required = false) String type,
		@RequestParam(defaultValue = "0") String page,
		@RequestParam(defaultValue = "20") String size
	) {
		return this.eventService.events(authorization, from, to, type, page, size);
	}
}
