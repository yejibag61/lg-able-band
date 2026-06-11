package com.lgableband;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
	"db.host=",
	"db.port=",
	"db.name=",
	"db.user=",
	"db.password=",
	"emergency.ai.enabled=false"
})
class BackendApplicationTests {

	@Test
	void contextLoads() {
	}

}
