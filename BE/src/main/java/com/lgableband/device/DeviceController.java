package com.lgableband.device;

import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.Device;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

	private final MockDataStore store;

	public DeviceController(MockDataStore store) {
		this.store = store;
	}

	@GetMapping
	public DeviceListResponse devices(@RequestHeader("Authorization") String authorization) {
		long userId = this.store.requireUser(authorization).userId();
		return new DeviceListResponse(this.store.devices(userId));
	}

	public record DeviceListResponse(List<Device> items) {
	}
}
