package com.lgableband.home;

import com.lgableband.auth.MvpDataService;
import com.lgableband.common.ConnectionStatus;
import com.lgableband.common.SafetyStatusLevel;
import com.lgableband.mock.MockDataStore;
import com.lgableband.mock.MockDataStore.Alert;
import com.lgableband.mock.MockDataStore.Device;
import com.lgableband.mock.MockDataStore.UserProfile;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/app")
public class HomeController {

	private final MvpDataService dataService;

	public HomeController(MvpDataService dataService) {
		this.dataService = dataService;
	}

	@GetMapping("/home")
	public MvpDataService.HomeData home(@RequestHeader("Authorization") String authorization) {
		return this.dataService.home(authorization);
	}
}
