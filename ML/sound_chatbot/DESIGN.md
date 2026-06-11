# LG Able Band Sound Chatbot Design

## Purpose

`ML/sound_chatbot` handles questions spoken by the wearable user.

It does not detect environmental sounds. Environmental sound detection, such as
doorbells, broadcasts, sirens, glass breaking, or screams, belongs to
`ML/sound_event_detection`.

## Concept

The chatbot recognizes a user sentence by combining:

```text
device or sensor keyword + question or request pattern -> intent
```

Examples:

| User speech | Recognition | Intent |
|---|---|---|
| 세탁기 몇 분 남았어? | WASHER + TIME_LEFT | `WASHER_TIME_CHECK` |
| 세탁기 상태 알려줘 | WASHER + STATUS | `WASHER_STATUS_CHECK` |
| 냉장고 문 열려 있어? | REFRIGERATOR + DOOR_OPEN | `REFRIGERATOR_DOOR_CHECK` |
| 공기질 괜찮아? | AIR_SENSOR + STATUS | `AIR_QUALITY_CHECK` |
| 인덕션 켜져 있어? | RANGE + POWER | `RANGE_POWER_CHECK` |
| 현관문 열려 있어? | DOOR_SENSOR + DOOR_OPEN | `DOOR_OPEN_CHECK` |
| TV에 알림 있어? | TV + ALERT | `TV_ALERT_CHECK` |
| 위험 알림 있어? | ALERT + DANGER | `DANGER_ALERTS_CHECK` |
| 미확인 알림 있어? | ALERT + UNREAD | `UNREAD_ALERTS_CHECK` |
| 최근 알림 읽어줘 | ALERT + RECENT | `READ_RECENT_ALERT` |
| 방금 알림 다시 말해줘 | ALERT + REPEAT | `REPEAT_LAST_ALERT` |
| 보호자한테 알려줘 | GUARDIAN + NOTIFY | `NOTIFY_GUARDIAN` |

## Processing Flow

1. The user speaks to the wearable.
2. STT converts speech into text.
3. FE or BE calls `POST /api/ai/voice-chat`.
4. The chatbot detects device or sensor keywords.
5. The chatbot detects question or request patterns.
6. The chatbot maps the combination to an intent.
7. The chatbot reads values from `context`.
8. The chatbot returns `answerText` and `voiceText`.
9. The wearable reads `voiceText` through TTS.

## Device And Sensor Keywords

| Device | Keywords |
|---|---|
| `WASHER` | 세탁기, 빨래, 세탁물 |
| `REFRIGERATOR` | 냉장고, 냉장실, 냉동실 |
| `AIR_SENSOR` | 공기, 공기질, 미세먼지, 환기, 이산화탄소, 온도, 습도 |
| `TV` | TV, 티비, 화면, 팝업 |
| `RANGE` | 인덕션, 가스레인지, 불, 화구, 주방 |
| `DOOR_SENSOR` | 문, 현관문, 도어 |
| `ALERT` | 알림, 알람 |
| `GUARDIAN` | 보호자, 엄마, 아빠, 가족 |

## Question And Request Patterns

| Pattern | Keywords |
|---|---|
| `STATUS` | 상태, 어때, 괜찮아, 문제, 확인 |
| `TIME_LEFT` | 몇 분, 남았어, 얼마나, 언제 끝나, 다 됐어 |
| `POWER` | 켜져, 꺼져, 전원, 불 |
| `DOOR_OPEN` | 열려, 닫혀, 문 |
| `ALERT` | 알림, 알람, 뭐 왔어, 있어 |
| `DANGER` | 위험, 긴급, 위험한 |
| `UNREAD` | 미확인, 안 읽은, 새 |
| `RECENT` | 최근, 마지막, 읽어줘 |
| `REPEAT` | 다시, 방금, 못 들었어, 한번 더 |
| `NOTIFY` | 알려줘, 연락, 전화, 보내줘 |
| `HELP` | 도움말, 뭐 할 수, 사용법, 기능 |

## MVP Intents

| Intent | Description | Needs backend action |
|---|---|---|
| `UNREAD_ALERTS_CHECK` | Check unread alerts | No |
| `DANGER_ALERTS_CHECK` | Check dangerous alerts | No |
| `READ_RECENT_ALERT` | Read the most recent alert | No |
| `REPEAT_LAST_ALERT` | Repeat the last spoken alert | No |
| `WASHER_TIME_CHECK` | Read washer remaining time | No |
| `WASHER_STATUS_CHECK` | Read washer status | No |
| `REFRIGERATOR_DOOR_CHECK` | Check refrigerator door state | No |
| `REFRIGERATOR_STATUS_CHECK` | Read refrigerator state | No |
| `AIR_QUALITY_CHECK` | Read indoor air quality | No |
| `TV_ALERT_CHECK` | Check TV alert or popup | No |
| `RANGE_POWER_CHECK` | Check range or induction power state | No |
| `RANGE_DANGER_CHECK` | Check range danger state | No |
| `DOOR_OPEN_CHECK` | Check door open state | No |
| `DOOR_SECURITY_CHECK` | Check door security event | No |
| `NOTIFY_GUARDIAN` | Ask BE to notify guardian | Yes |
| `HELP` | Explain available commands | No |
| `UNKNOWN` | Fallback for unclear speech | No |

## Request JSON Draft

```json
{
  "sessionId": "wearable-001",
  "text": "세탁기 몇 분 남았어?",
  "language": "ko-KR",
  "user": {
    "userId": 1,
    "name": "민수",
    "accessibilityType": "VISUAL",
    "guardianLinked": true
  },
  "context": {
    "unreadAlerts": [
      {
        "id": 101,
        "deviceType": "WASHER",
        "title": "세탁 완료",
        "message": "세탁이 완료되었습니다.",
        "severity": "LOW",
        "createdAt": "2026-06-10T18:00:00+09:00"
      }
    ],
    "dangerAlerts": [],
    "recentAlert": {
      "id": 101,
      "deviceType": "WASHER",
      "title": "세탁 완료",
      "message": "세탁이 완료되었습니다."
    },
    "lastSpokenAlert": {
      "id": 101,
      "deviceType": "WASHER",
      "title": "세탁 완료",
      "message": "세탁이 완료되었습니다."
    },
    "devices": {
      "washer": {
        "status": "RUNNING",
        "remainingMinutes": 12
      },
      "refrigerator": {
        "doorOpen": false,
        "temperatureStatus": "NORMAL"
      },
      "airSensor": {
        "airQuality": "GOOD",
        "pmLevel": "LOW",
        "ventilationNeeded": false
      },
      "tv": {
        "hasPopup": false
      },
      "range": {
        "powerOn": false,
        "longOn": false
      },
      "doorSensor": {
        "doorOpen": false,
        "securityEvent": false
      }
    }
  }
}
```

## Response JSON Draft

```json
{
  "sessionId": "wearable-001",
  "intent": "WASHER_TIME_CHECK",
  "deviceType": "WASHER",
  "answerText": "세탁이 약 12분 남았어요.",
  "voiceText": "세탁이 약 12분 남았어요.",
  "action": "READ_DEVICE_STATUS",
  "needsBackendAction": false,
  "backendAction": null,
  "confidence": 0.9
}
```

## Response Templates

| Case | Template |
|---|---|
| Unread alerts exist | 미확인 알림이 {count}개 있어요. 최근 알림은 {title}입니다. |
| No unread alerts | 현재 미확인 알림은 없어요. |
| Danger alerts exist | 위험 알림이 {count}개 있어요. {title}. {message} |
| No danger alerts | 현재 위험 알림은 없어요. |
| Recent alert exists | 최근 알림은 {title}입니다. {message} |
| No recent alert | 최근 알림이 없어요. |
| Repeat alert exists | 방금 알림을 다시 말씀드릴게요. {message} |
| Washer time exists | 세탁이 약 {minutes}분 남았어요. |
| Guardian linked | 보호자에게 현재 상황을 알릴게요. |
| Guardian not linked | 연결된 보호자가 없어요. 앱에서 보호자를 먼저 등록해 주세요. |

## Implementation Plan

1. Keep rules in `intent_rules.py`.
2. Move request and response models to `schemas.py`.
3. Move answer generation to `responses.py`.
4. Keep `server.py` focused on FastAPI endpoints.
5. Add test cases for each MVP intent.
