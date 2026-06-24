-- Situation-based danger alerts for manual UI testing.
-- Change this to the email used to log in to the app before running the script.
SET @target_email = 'user@example.com';

START TRANSACTION;

SET @user_id = (
	SELECT au.user_id
	FROM app_user au
	JOIN account a ON a.account_id = au.account_id
	WHERE a.role = 'USER' AND a.email = @target_email
	LIMIT 1
);

-- Stop immediately with a foreign-key error if @target_email does not identify a USER.
SELECT @user_id AS target_user_id, @target_email AS target_email;

INSERT INTO device (
	user_id, device_type, vendor_device_id, name, connection_status, location_supported, remote_enabled
)
SELECT @user_id, 'RANGE', NULL, '전기레인지', 'WARNING', FALSE, FALSE
WHERE @user_id IS NOT NULL
  AND NOT EXISTS (
	SELECT 1 FROM device
	WHERE user_id = @user_id AND device_type = 'RANGE' AND name = '전기레인지'
);

SET @range_device_id = (
	SELECT device_id
	FROM device
	WHERE user_id = @user_id AND device_type = 'RANGE'
	ORDER BY device_id
	LIMIT 1
);

INSERT INTO device_event (device_id, event_type, event_level, payload_json, occurred_at)
VALUES (
	@range_device_id,
	'DANGER',
	'HIGH',
	JSON_OBJECT(
		'kind', 'RANGE_OVERHEAT',
		'locationName', '주방',
		'temperatureC', 285,
		'heatingDurationSec', 1800,
		'recommendedAction', '전원을 끄고 잔열이 사라질 때까지 전기레인지 주변 접근을 피하세요.',
		'requiresGuardianNotify', TRUE
	),
	NOW(6)
);
SET @range_event_id = LAST_INSERT_ID();

INSERT INTO alert (
	user_id, event_id, alert_type, severity, title, message, voice_guide, status, occurred_at
)
VALUES (
	@user_id,
	@range_event_id,
	'DANGER',
	'HIGH',
	'전기레인지 과열 위험',
	'전기레인지가 장시간 고온으로 가열되고 있습니다.',
	'전기레인지 과열 위험입니다. 즉시 전원을 확인하고 주변에서 떨어져 주세요.',
	'UNREAD',
	NOW(6)
);
SET @range_alert_id = LAST_INSERT_ID();

INSERT INTO alert_delivery (
	alert_id, channel, target_guardian_id, delivery_status, delivered_at
)
SELECT @range_alert_id, 'PUSH', ug.guardian_id, 'SENT', NOW(6)
FROM user_guardian ug
WHERE ug.user_id = @user_id;

INSERT INTO device (
	user_id, device_type, vendor_device_id, name, connection_status, location_supported, remote_enabled
)
SELECT @user_id, 'AIR_SENSOR', NULL, '실내 공기질 센서', 'WARNING', FALSE, FALSE
WHERE @user_id IS NOT NULL
  AND NOT EXISTS (
	SELECT 1 FROM device
	WHERE user_id = @user_id AND device_type = 'AIR_SENSOR' AND name = '실내 공기질 센서'
);

SET @air_device_id = (
	SELECT device_id
	FROM device
	WHERE user_id = @user_id AND device_type = 'AIR_SENSOR'
	ORDER BY device_id
	LIMIT 1
);

INSERT INTO device_event (device_id, event_type, event_level, payload_json, occurred_at)
VALUES (
	@air_device_id,
	'DANGER',
	'CRITICAL',
	JSON_OBJECT(
		'kind', 'CO2_HIGH',
		'locationName', '거실',
		'co2Ppm', 2500,
		'thresholdPpm', 1500,
		'recommendedAction', '창문을 열어 즉시 환기하고 공기질 수치가 정상으로 내려올 때까지 실내에 오래 머물지 마세요.',
		'requiresGuardianNotify', TRUE
	),
	DATE_SUB(NOW(6), INTERVAL 1 MINUTE)
);
SET @air_event_id = LAST_INSERT_ID();

INSERT INTO alert (
	user_id, event_id, alert_type, severity, title, message, voice_guide, status, occurred_at
)
VALUES (
	@user_id,
	@air_event_id,
	'DANGER',
	'CRITICAL',
	'실내 이산화탄소 농도 위험',
	'거실 이산화탄소 농도가 2500ppm으로 높습니다.',
	'실내 이산화탄소 농도가 위험 수준입니다. 즉시 환기하고 신선한 공기가 있는 곳으로 이동하세요.',
	'UNREAD',
	DATE_SUB(NOW(6), INTERVAL 1 MINUTE)
);
SET @air_alert_id = LAST_INSERT_ID();

INSERT INTO alert_delivery (
	alert_id, channel, target_guardian_id, delivery_status, delivered_at
)
SELECT @air_alert_id, 'PUSH', ug.guardian_id, 'SENT', NOW(6)
FROM user_guardian ug
WHERE ug.user_id = @user_id;

COMMIT;

SELECT
	a.alert_id,
	a.title,
	a.severity,
	a.status,
	d.name AS device_name,
	JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.locationName')) AS location_name,
	JSON_UNQUOTE(JSON_EXTRACT(de.payload_json, '$.recommendedAction')) AS recommended_action
FROM alert a
JOIN device_event de ON de.event_id = a.event_id
JOIN device d ON d.device_id = de.device_id
WHERE a.alert_id IN (@range_alert_id, @air_alert_id)
ORDER BY a.occurred_at DESC;
