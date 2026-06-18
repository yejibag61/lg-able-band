package com.lgableband.device;

import com.lgableband.common.DeviceType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/devices")
public class DeviceController {

	private final DeviceService deviceService;

	public DeviceController(DeviceService deviceService) {
		this.deviceService = deviceService;
	}

	@GetMapping
	public DeviceListResponse devices(@RequestHeader("Authorization") String authorization) {
		return new DeviceListResponse(this.deviceService.devices(authorization));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public DeviceService.DeviceSummary createDevice(
		@RequestHeader("Authorization") String authorization,
		@Valid @RequestBody DeviceCreateRequest request
	) {
		return this.deviceService.createDevice(
			authorization,
			new DeviceService.DeviceCreateRequest(
				request.vendor(),
				request.vendorDeviceId(),
				request.name(),
				request.type(),
				request.room(),
				request.locationSupported(),
				request.remoteEnabled()
			)
		);
	}

	@PatchMapping("/{deviceId}")
	public DeviceService.DeviceSummary updateDevice(
		@RequestHeader("Authorization") String authorization,
		@PathVariable long deviceId,
		@RequestBody DeviceUpdateRequest request
	) {
		return this.deviceService.updateDevice(
			authorization,
			deviceId,
			new DeviceService.DeviceUpdateRequest(request.room())
		);
	}

	@DeleteMapping("/{deviceId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteDevice(
		@RequestHeader("Authorization") String authorization,
		@PathVariable long deviceId
	) {
		this.deviceService.deleteDevice(authorization, deviceId);
	}

	public record DeviceListResponse(List<DeviceService.DeviceSummary> items) {
	}

	public record DeviceCreateRequest(
		@NotBlank String vendor,
		String vendorDeviceId,
		@NotBlank String name,
		@NotNull DeviceType type,
		String room,
		boolean locationSupported,
		boolean remoteEnabled
	) {
	}

	public record DeviceUpdateRequest(String room) {
	}
}
