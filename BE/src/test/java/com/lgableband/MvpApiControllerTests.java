package com.lgableband;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.blankOrNullString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(properties = {
	"db.host=",
	"db.port=",
	"db.name=",
	"db.user=",
	"db.password="
})
@AutoConfigureMockMvc
class MvpApiControllerTests {

	@Autowired
	private MockMvc mockMvc;

	@Test
	void userCanLoginAndLoadHome() throws Exception {
		MvcResult login = this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "email": "user@example.com",
					  "password": "password1234"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken", not(blankOrNullString())))
			.andExpect(jsonPath("$.role").value("USER"))
			.andReturn();

		String token = login.getResponse().getContentAsString()
			.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");

		this.mockMvc.perform(get("/api/app/home").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("홍길동"))
			.andExpect(jsonPath("$.recentAlerts[0].alertId").exists())
			.andExpect(jsonPath("$.quickActions.canRequestEmergency").value(true));
	}

	@Test
	void alertCanBeConfirmed() throws Exception {
		MvcResult login = this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "USER",
					  "email": "user@example.com",
					  "password": "password1234"
					}
					"""))
			.andExpect(status().isOk())
			.andReturn();

		String token = login.getResponse().getContentAsString()
			.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");

		this.mockMvc.perform(post("/api/alerts/101/confirm").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("CONFIRMED"));
	}

	@Test
	void guardianCanSignupAndLogin() throws Exception {
		this.mockMvc.perform(post("/api/auth/signup")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "GUARDIAN",
					  "name": "guardian",
					  "email": "guardian-new@example.com",
					  "password": "password1234",
					  "phone": "010-1234-5678",
					  "relationship": "FAMILY"
					}
					"""))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.role").value("GUARDIAN"));

		this.mockMvc.perform(post("/api/auth/login")
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
					{
					  "role": "GUARDIAN",
					  "email": "guardian-new@example.com",
					  "password": "password1234"
					}
					"""))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.accessToken", not(blankOrNullString())))
			.andExpect(jsonPath("$.role").value("GUARDIAN"))
			.andExpect(jsonPath("$.guardianProfile.relationship").value("FAMILY"));
	}
}
