package com.lgableband;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class PairingSchemaContractTests {

	@Test
	void wearablePairingSchemaIncludesTask2ContractColumns() throws IOException {
		String schema = Files.readString(Path.of("src/main/resources/db/schema-v1.sql"));

		assertAll(
			() -> assertTrue(schema.contains("CREATE TABLE IF NOT EXISTS wearable_pairing_session")),
			() -> assertTrue(schema.contains("pairing_session_id VARCHAR(80) NOT NULL")),
			() -> assertTrue(schema.contains("device_id VARCHAR(255) NOT NULL")),
			() -> assertTrue(schema.contains("device_name VARCHAR(100) NOT NULL")),
			() -> assertTrue(schema.contains("pairing_code VARCHAR(80) NOT NULL")),
			() -> assertTrue(schema.contains("nonce VARCHAR(80) NOT NULL")),
			() -> assertTrue(schema.contains("linked_user_id BIGINT NULL")),
			() -> assertTrue(schema.contains("linked_device_id BIGINT NULL")),
			() -> assertTrue(schema.contains("wearable_access_token VARCHAR(255) NULL")),
			() -> assertTrue(schema.contains("issued_at DATETIME(6) NOT NULL")),
			() -> assertTrue(schema.contains("expires_at DATETIME(6) NOT NULL")),
			() -> assertTrue(schema.contains("paired_at DATETIME(6) NULL")),
			() -> assertTrue(schema.contains("unpaired_at DATETIME(6) NULL")),
			() -> assertTrue(schema.contains("ck_wearable_pairing_status CHECK (status IN ('WAITING', 'PAIRED', 'EXPIRED', 'UNPAIRED', 'INVALID'))"))
		);
	}
}
