# LG Able Band 상황 위험도 판단 AI 서버

## 역할

이 서버는 백엔드가 전달한 공통 이벤트 JSON을 룰 기반으로 판단하고, 앱 API 명세의 Alert 생성에 필요한 위험도와 접근성 안내 정보를 반환한다.

- ThinQ API를 직접 호출하지 않는다.
- DB에 직접 접근하지 않는다.
- 백엔드가 ThinQ, 센서, 웨어러블 등의 이벤트를 공통 JSON으로 변환해 전달한다.
- 백엔드는 원본 이벤트와 AI 응답을 조합해 `Alert`와 `EventHistory`를 저장한다.
- 보호자 연결 여부와 `notifyOnDanger` 설정 확인, 실제 알림 발송은 백엔드가 담당한다.

기존 연동 테스트 서버 `ML/server.py`는 유지하며 판단 서버는 `ML/context`에 있다.

## 앱 명세 반영

AI 서버의 우선 입력 Enum:

- `accessibilityType`: `VISUAL`, `HEARING`
- `deviceType`: `WASHER`, `REFRIGERATOR`, `AIR_SENSOR`, `TV`, `RANGE`, `DOOR_SENSOR`, `WEARABLE`, `UWB_TAG`
- `notificationPrefs.channels`: `VOICE`, `VIBRATION`, `SCREEN`, `TEXT`, `COLOR`

기존 연동 호환을 위해 아래 값도 별칭으로 허용한다.

- `VISUAL_IMPAIRMENT` → `VISUAL`
- `HEARING_IMPAIRMENT` → `HEARING`
- `TV_DISPLAY` → `TV`
- `INDUCTION` → `RANGE`
- `BAND` → `WEARABLE`
- `UWB` → `UWB_TAG`
- `timestamp`는 유지하며 신규 연동에서는 `occurredAt`을 우선한다.

## 설치와 실행

```powershell
cd ML/context
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8000 --reload
```

환경변수 사용:

```powershell
$env:ML_PORT="8000"
uvicorn server:app --host 127.0.0.1 --port $env:ML_PORT --reload
```

## 확인과 테스트

- Health: `http://127.0.0.1:8000/health`
- Swagger: `http://127.0.0.1:8000/docs`
- 대표 이벤트 테스트: `python test_requests.py`

요청 예시:

```json
{
  "userId": 1,
  "accessibilityType": "VISUAL",
  "notificationPrefs": {
    "channels": ["VOICE", "VIBRATION"],
    "highContrast": true,
    "largeText": true
  },
  "deviceType": "RANGE",
  "deviceId": 10,
  "deviceName": "주방 전기레인지",
  "eventType": "LONG_ON",
  "locationName": "주방",
  "value": "전기레인지 장시간 사용",
  "durationSec": 600,
  "userResponse": "NONE",
  "occurredAt": "2026-06-10T14:30:00+09:00"
}
```

응답 예시:

```json
{
  "title": "장시간 사용",
  "alertType": "DANGER",
  "severity": "HIGH",
  "safetyStatusLevel": "DANGER",
  "judgmentLevel": "DANGER",
  "category": "안전",
  "riskLevel": "위험",
  "riskScore": 82,
  "message": "주방 전기레인지가 장시간 사용 중입니다. 확인이 필요합니다.",
  "voiceGuide": "주방 전기레인지가 장시간 사용 중입니다. 확인이 필요합니다.",
  "requiresGuardianNotify": false,
  "notifyGuardian": false,
  "recommendedAction": "즉시 상황을 확인하고 필요한 안전 조치를 취해주세요.",
  "notificationChannels": ["VOICE", "VIBRATION"],
  "deliveryTargets": ["APP", "WEARABLE", "TV", "THINQ_ON"],
  "recommendedChannels": ["APP", "WEARABLE", "TV", "THINQ_ON"],
  "vibrationPattern": "FAST",
  "screenMode": "FULL_SCREEN_DANGER",
  "voiceEnabled": true
}
```

## 출력 Enum

| 필드 | 값 |
|---|---|
| `alertType` | `LIFE`, `DANGER`, `EMERGENCY` |
| `severity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `safetyStatusLevel` | `SAFE`, `CAUTION`, `DANGER`, `EMERGENCY` |
| `notificationChannels` | `VOICE`, `VIBRATION`, `SCREEN`, `TEXT`, `COLOR` |
| `vibrationPattern` | `SLOW`, `MEDIUM`, `FAST`, `LONG_TWICE` |

`judgmentLevel`, `riskLevel`, `riskScore`, `notifyGuardian`, `recommendedChannels`, `screenMode`, `voiceEnabled`는 기존 AI 계약 호환 및 상세 판단을 위해 유지한다.

## 중요 제한사항

- 전기레인지 잔열 경고는 ThinQ 앱 푸시 알림 근거가 약해 MVP 핵심 이벤트에서 제외한다.
- 냉장고 문열림 이벤트는 실제 지원 모델일 때만 백엔드가 전달한다.
- TV는 일반 입력 기기보다는 위험 안내와 상태 요약 출력 채널로 사용한다.
- UWB 위치 안내는 `/api/uwb/*` 흐름에서 처리하며 현재 위험도 판단 API의 핵심 범위가 아니다.
