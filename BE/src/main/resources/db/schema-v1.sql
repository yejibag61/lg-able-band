-- LG Able Band MySQL schema draft v1.
-- Based on the project ERD summary.
-- This file is intentionally not named schema.sql so Spring Boot will not auto-run it.

CREATE TABLE IF NOT EXISTS account (
	account_id BIGINT NOT NULL AUTO_INCREMENT,
	role VARCHAR(20) NOT NULL,
	email VARCHAR(255) NOT NULL,
	password_hash VARCHAR(255) NOT NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (account_id),
	UNIQUE KEY uk_account_role_email (role, email),
	CONSTRAINT ck_account_role CHECK (role IN ('USER', 'GUARDIAN'))
);

CREATE TABLE IF NOT EXISTS app_user (
	user_id BIGINT NOT NULL AUTO_INCREMENT,
	account_id BIGINT NULL,
	name VARCHAR(100) NOT NULL,
	accessibility_type VARCHAR(20) NOT NULL,
	high_contrast BOOLEAN NOT NULL DEFAULT FALSE,
	large_text BOOLEAN NOT NULL DEFAULT FALSE,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (user_id),
	UNIQUE KEY uk_app_user_account_id (account_id),
	CONSTRAINT fk_app_user_account_id FOREIGN KEY (account_id) REFERENCES account (account_id),
	CONSTRAINT ck_app_user_accessibility_type CHECK (accessibility_type IN ('VISUAL', 'HEARING'))
);

CREATE TABLE IF NOT EXISTS user_notification_channel (
	user_id BIGINT NOT NULL,
	channel VARCHAR(20) NOT NULL,
	PRIMARY KEY (user_id, channel),
	CONSTRAINT fk_user_notification_channel_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
	CONSTRAINT ck_user_notification_channel_channel CHECK (channel IN ('VOICE', 'VIBRATION', 'SCREEN', 'TEXT', 'COLOR'))
);

CREATE TABLE IF NOT EXISTS guardian (
	guardian_id BIGINT NOT NULL AUTO_INCREMENT,
	account_id BIGINT NULL,
	name VARCHAR(100) NOT NULL,
	phone VARCHAR(30) NOT NULL,
	relationship VARCHAR(50) NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (guardian_id),
	UNIQUE KEY uk_guardian_account_id (account_id),
	CONSTRAINT fk_guardian_account_id FOREIGN KEY (account_id) REFERENCES account (account_id)
);

CREATE TABLE IF NOT EXISTS user_guardian (
	map_id BIGINT NOT NULL AUTO_INCREMENT,
	user_id BIGINT NOT NULL,
	guardian_id BIGINT NOT NULL,
	is_primary BOOLEAN NOT NULL DEFAULT FALSE,
	notify_on_danger BOOLEAN NOT NULL DEFAULT TRUE,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (map_id),
	UNIQUE KEY uk_user_guardian_user_guardian (user_id, guardian_id),
	KEY ix_user_guardian_user_id (user_id),
	KEY ix_user_guardian_guardian_id (guardian_id),
	CONSTRAINT fk_user_guardian_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
	CONSTRAINT fk_user_guardian_guardian_id FOREIGN KEY (guardian_id) REFERENCES guardian (guardian_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS living_signal_profile (
	user_id BIGINT NOT NULL,
	similarity_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.80,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (user_id),
	CONSTRAINT fk_living_signal_profile_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS living_signal_sound (
	sound_id BIGINT NOT NULL AUTO_INCREMENT,
	user_id BIGINT NOT NULL,
	registered_sound_name VARCHAR(150) NOT NULL,
	sound_type VARCHAR(50) NOT NULL,
	notes VARCHAR(1000) NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (sound_id),
	KEY ix_living_signal_sound_user_id (user_id),
	CONSTRAINT fk_living_signal_sound_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
	CONSTRAINT ck_living_signal_sound_type CHECK (sound_type IN ('apartment_announcement', 'doorbell', 'fire_alarm', 'appliance_done', 'background_noise'))
);

CREATE TABLE IF NOT EXISTS living_signal_recording (
	recording_id BIGINT NOT NULL AUTO_INCREMENT,
	sound_id BIGINT NOT NULL,
	label VARCHAR(150) NOT NULL,
	duration_sec DECIMAL(6,2) NOT NULL,
	audio_data_url LONGTEXT NULL,
	embedding_json JSON NULL,
	created_at DATETIME(6) NOT NULL,
	PRIMARY KEY (recording_id),
	KEY ix_living_signal_recording_sound_id (sound_id),
	CONSTRAINT fk_living_signal_recording_sound_id FOREIGN KEY (sound_id) REFERENCES living_signal_sound (sound_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device (
	device_id BIGINT NOT NULL AUTO_INCREMENT,
	user_id BIGINT NOT NULL,
	device_type VARCHAR(30) NOT NULL,
	vendor_device_id VARCHAR(255) NULL,
	name VARCHAR(100) NOT NULL,
	room VARCHAR(100) NULL,
	connection_status VARCHAR(20) NOT NULL DEFAULT 'CONNECTED',
	location_supported BOOLEAN NOT NULL DEFAULT FALSE,
	remote_enabled BOOLEAN NOT NULL DEFAULT FALSE,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (device_id),
	KEY ix_device_user_id (user_id),
	UNIQUE KEY uk_device_vendor_device_id (vendor_device_id),
	CONSTRAINT fk_device_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
	CONSTRAINT ck_device_type CHECK (device_type IN ('WASHER', 'REFRIGERATOR', 'AIR_SENSOR', 'TV', 'RANGE', 'DOOR_SENSOR', 'WEARABLE', 'UWB_TAG')),
	CONSTRAINT ck_device_connection_status CHECK (connection_status IN ('CONNECTED', 'DISCONNECTED', 'WARNING', 'ERROR'))
);

CREATE TABLE IF NOT EXISTS device_event (
	event_id BIGINT NOT NULL AUTO_INCREMENT,
	device_id BIGINT NOT NULL,
	event_type VARCHAR(30) NOT NULL,
	event_level VARCHAR(20) NOT NULL,
	payload_json JSON NULL,
	occurred_at DATETIME(6) NOT NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	PRIMARY KEY (event_id),
	KEY ix_device_event_device_occurred_at (device_id, occurred_at DESC),
	KEY ix_device_event_type_level (event_type, event_level),
	CONSTRAINT fk_device_event_device_id FOREIGN KEY (device_id) REFERENCES device (device_id) ON DELETE CASCADE,
	CONSTRAINT ck_device_event_type CHECK (event_type IN ('LIFE', 'DANGER', 'EMERGENCY', 'LOCATION')),
	CONSTRAINT ck_device_event_level CHECK (event_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE TABLE IF NOT EXISTS wearable_pairing_session (
	pairing_session_id VARCHAR(80) NOT NULL,
	device_id VARCHAR(255) NOT NULL,
	device_name VARCHAR(100) NOT NULL,
	pairing_code VARCHAR(80) NOT NULL,
	nonce VARCHAR(80) NOT NULL,
	status VARCHAR(20) NOT NULL DEFAULT 'WAITING',
	linked_user_id BIGINT NULL,
	linked_device_id BIGINT NULL,
	wearable_access_token VARCHAR(255) NULL,
	issued_at DATETIME(6) NOT NULL,
	expires_at DATETIME(6) NOT NULL,
	paired_at DATETIME(6) NULL,
	unpaired_at DATETIME(6) NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (pairing_session_id),
	UNIQUE KEY uk_wearable_pairing_nonce (nonce),
	KEY ix_wearable_pairing_device_id (device_id),
	KEY ix_wearable_pairing_linked_user_id (linked_user_id),
	KEY ix_wearable_pairing_linked_device_id (linked_device_id),
	CONSTRAINT fk_wearable_pairing_linked_user_id FOREIGN KEY (linked_user_id) REFERENCES app_user (user_id) ON DELETE SET NULL,
	CONSTRAINT fk_wearable_pairing_linked_device_id FOREIGN KEY (linked_device_id) REFERENCES device (device_id) ON DELETE SET NULL,
	CONSTRAINT ck_wearable_pairing_status CHECK (status IN ('WAITING', 'PAIRED', 'EXPIRED', 'UNPAIRED', 'INVALID'))
);

CREATE TABLE IF NOT EXISTS alert (
	alert_id BIGINT NOT NULL AUTO_INCREMENT,
	user_id BIGINT NOT NULL,
	event_id BIGINT NULL,
	alert_type VARCHAR(20) NOT NULL,
	severity VARCHAR(20) NOT NULL,
	title VARCHAR(150) NOT NULL,
	message VARCHAR(1000) NOT NULL,
	voice_guide VARCHAR(1000) NULL,
	status VARCHAR(20) NOT NULL DEFAULT 'UNREAD',
	occurred_at DATETIME(6) NOT NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	PRIMARY KEY (alert_id),
	KEY ix_alert_user_occurred_at (user_id, occurred_at DESC),
	KEY ix_alert_event_id (event_id),
	KEY ix_alert_type_status (alert_type, status),
	CONSTRAINT fk_alert_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
	CONSTRAINT fk_alert_event_id FOREIGN KEY (event_id) REFERENCES device_event (event_id),
	CONSTRAINT ck_alert_type CHECK (alert_type IN ('LIFE', 'DANGER', 'EMERGENCY', 'LOCATION')),
	CONSTRAINT ck_alert_severity CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
	CONSTRAINT ck_alert_status CHECK (status IN ('UNREAD', 'CONFIRMED', 'REPLAYED', 'ESCALATED'))
);

CREATE TABLE IF NOT EXISTS alert_delivery (
	delivery_id BIGINT NOT NULL AUTO_INCREMENT,
	alert_id BIGINT NOT NULL,
	channel VARCHAR(30) NOT NULL,
	target_guardian_id BIGINT NULL,
	delivery_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
	delivered_at DATETIME(6) NULL,
	confirmed_at DATETIME(6) NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	PRIMARY KEY (delivery_id),
	KEY ix_alert_delivery_alert_id (alert_id),
	KEY ix_alert_delivery_target_guardian_id (target_guardian_id),
	CONSTRAINT fk_alert_delivery_alert_id FOREIGN KEY (alert_id) REFERENCES alert (alert_id) ON DELETE CASCADE,
	CONSTRAINT fk_alert_delivery_target_guardian_id FOREIGN KEY (target_guardian_id) REFERENCES guardian (guardian_id),
	CONSTRAINT ck_alert_delivery_channel CHECK (channel IN ('VOICE', 'VIBRATION', 'SCREEN', 'TEXT', 'COLOR', 'PUSH', 'SMS')),
	CONSTRAINT ck_alert_delivery_status CHECK (delivery_status IN ('PENDING', 'SENT', 'FAILED', 'CONFIRMED'))
);

CREATE TABLE IF NOT EXISTS emergency_request (
	emergency_id BIGINT NOT NULL AUTO_INCREMENT,
	user_id BIGINT NOT NULL,
	alert_id BIGINT NULL,
	message VARCHAR(1000) NOT NULL,
	source VARCHAR(30) NOT NULL,
	status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
	requested_at DATETIME(6) NOT NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	PRIMARY KEY (emergency_id),
	KEY ix_emergency_request_user_requested_at (user_id, requested_at DESC),
	KEY ix_emergency_request_alert_id (alert_id),
	CONSTRAINT fk_emergency_request_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
	CONSTRAINT fk_emergency_request_alert_id FOREIGN KEY (alert_id) REFERENCES alert (alert_id),
	CONSTRAINT ck_emergency_request_source CHECK (source IN ('APP', 'WEARABLE')),
	CONSTRAINT ck_emergency_request_status CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELED'))
);

CREATE TABLE IF NOT EXISTS user_feedback (
	feedback_id BIGINT NOT NULL AUTO_INCREMENT,
	user_id BIGINT NOT NULL,
	alert_id BIGINT NULL,
	feedback_type VARCHAR(50) NOT NULL,
	message VARCHAR(1000) NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	PRIMARY KEY (feedback_id),
	KEY ix_user_feedback_user_id (user_id),
	KEY ix_user_feedback_alert_id (alert_id),
	CONSTRAINT fk_user_feedback_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
	CONSTRAINT fk_user_feedback_alert_id FOREIGN KEY (alert_id) REFERENCES alert (alert_id)
);

-- Extension table for the API spec. This table is not shown in the ERD summary,
-- but the API has UWB session endpoints.
CREATE TABLE IF NOT EXISTS uwb_session (
	session_id BIGINT NOT NULL AUTO_INCREMENT,
	user_id BIGINT NOT NULL,
	target_device_id BIGINT NOT NULL,
	status VARCHAR(20) NOT NULL,
	distance_m DECIMAL(6,2) NULL,
	confidence DECIMAL(5,4) NULL,
	voice_guide VARCHAR(1000) NULL,
	vibration_pattern VARCHAR(30) NOT NULL,
	updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
	stopped_at DATETIME(6) NULL,
	created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
	PRIMARY KEY (session_id),
	KEY ix_uwb_session_user_id (user_id),
	KEY ix_uwb_session_target_device_id (target_device_id),
	CONSTRAINT fk_uwb_session_user_id FOREIGN KEY (user_id) REFERENCES app_user (user_id) ON DELETE CASCADE,
	CONSTRAINT fk_uwb_session_target_device_id FOREIGN KEY (target_device_id) REFERENCES device (device_id),
	CONSTRAINT ck_uwb_session_status CHECK (status IN ('READY', 'ACTIVE', 'ARRIVED', 'FAILED', 'CANCELED')),
	CONSTRAINT ck_uwb_session_vibration_pattern CHECK (vibration_pattern IN ('SLOW', 'MEDIUM', 'FAST', 'LONG_TWICE', 'NONE'))
);
