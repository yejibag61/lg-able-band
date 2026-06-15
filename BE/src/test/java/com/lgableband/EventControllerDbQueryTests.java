package com.lgableband;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.lgableband.common.AlertStatus;
import com.lgableband.common.AlertType;
import com.lgableband.common.Severity;
import com.lgableband.event.EventController;
import com.lgableband.event.EventService;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class EventControllerDbQueryTests {

	@Test
	void controllerPassesEventQueryParametersToService() {
		EventService eventService = mock(EventService.class);
		EventService.EventPage expected = new EventService.EventPage(List.of(new EventService.EventItem(
			701,
			301L,
			AlertType.EMERGENCY,
			Severity.CRITICAL,
			"긴급 도움 요청",
			"웨어러블 밴드",
			OffsetDateTime.parse("2026-06-10T10:30:00+09:00"),
			AlertStatus.ESCALATED
		)), 1, 2, 5);
		when(eventService.events(
			"Bearer db-user-token",
			"2026-06-10T00:00:00+09:00",
			"2026-06-11T00:00:00+09:00",
			"EMERGENCY",
			"1",
			"2"
		)).thenReturn(expected);

		EventController controller = new EventController(eventService);
		EventService.EventPage response = controller.events(
			"Bearer db-user-token",
			"2026-06-10T00:00:00+09:00",
			"2026-06-11T00:00:00+09:00",
			"EMERGENCY",
			"1",
			"2"
		);

		assertThat(response).isSameAs(expected);
		verify(eventService).events(
			"Bearer db-user-token",
			"2026-06-10T00:00:00+09:00",
			"2026-06-11T00:00:00+09:00",
			"EMERGENCY",
			"1",
			"2"
		);
	}
}
