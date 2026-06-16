package com.lgableband.admin;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminAlertController {

	private final AdminAlertService adminAlertService;

	public AdminAlertController(AdminAlertService adminAlertService) {
		this.adminAlertService = adminAlertService;
	}

	@GetMapping("/alert-templates")
	public AlertTemplateListResponse alertTemplates(@RequestHeader("Authorization") String authorization) {
		return new AlertTemplateListResponse(this.adminAlertService.templates(authorization));
	}

	@PostMapping("/alerts/broadcast")
	public AdminAlertService.BroadcastResponse broadcast(
		@RequestHeader("Authorization") String authorization,
		@RequestBody BroadcastRequest request
	) {
		return this.adminAlertService.broadcast(authorization, request.templateId(), request.audience());
	}

	public record AlertTemplateListResponse(List<AdminAlertService.AlertTemplateView> items) {
	}

	public record BroadcastRequest(String templateId, AdminAlertService.BroadcastAudience audience) {
	}
}
