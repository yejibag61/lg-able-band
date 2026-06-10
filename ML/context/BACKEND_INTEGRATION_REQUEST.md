# 상황 위험도 판단 AI 서버 백엔드 연동 요청사항

## 1. 연동 원칙

백엔드는 외부 이벤트를 수집해 AI 서버에 전달하고, AI 판단 결과를 앱 명세의 `Alert` 및 `EventHistory` 형태로 저장해야 합니다.

```text
ThinQ / 센서 / 웨어러블
→ 백엔드 공통 이벤트 생성
→ AI 위험도 판단
→ 백엔드가 Alert 및 EventHistory 저장
→ 앱 / 웨어러블 / 보호자에게 제공
```

AI 서버는 ThinQ API와 DB에 직접 접근하지 않습니다. 보호자 연결 상태, 보호자의 `notifyOnDanger`, 알림 저장 상태, 실제 푸시 발송은 백엔드가 담당합니다.

## 2. AI 판단 API

```http
POST http://127.0.0.1:8000/api/ai/judge-event
Content-Type: application/json
```

Health check:

```http
GET http://127.0.0.1:8000/health
```

AI 서버 주소와 포트는 환경설정으로 관리하고 현재 프로젝트의 기존 ML 연결 설정을 우선해주세요.

## 3. 백엔드 요청 계약

### 우선 사용 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `userId` | number | O | 이벤트 대상 사용자 ID |
| `accessibilityType` | string | O | `VISUAL` 또는 `HEARING` |
| `deviceType` | string | O | 앱 명세의 DeviceType |
| `eventType` | string | O | 기기별 발생 이벤트 |
| `locationName` | string | 권장 | 발생 위치 |
| `value` | string | 권장 | 이벤트 상세값 |
| `durationSec` | number | 권장 | 이벤트 지속 시간 |
| `userResponse` | string | 권장 | `NONE`, `NO_RESPONSE` 등 |
| `occurredAt` | string | 권장 | ISO 8601 발생 시각 |

### 선택 필드

| 필드 | 타입 | 설명 |
|---|---|---|
| `deviceId` | number | DB Device 연결 ID |
| `deviceName` | string | 앱에 표시할 기기명 |
| `notificationPrefs` | object | 사용자 접근성 알림 설정 |
| `notificationPrefs.channels` | string[] | `VOICE`, `VIBRATION`, `SCREEN`, `TEXT`, `COLOR` |
| `notificationPrefs.highContrast` | boolean | 고대비 사용 여부 |
| `notificationPrefs.largeText` | boolean | 큰 글씨 사용 여부 |
| `confidence` | number | 감지 신뢰도 |
| `sensorValue` | number | 센서 측정값 |
| `unit` | string | 측정 단위 |
| `batteryLevel` | number | 기기 배터리 잔량 |

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

## 4. Enum 정합성

### AccessibilityType

신규 연동에서는 앱 명세 값을 사용해주세요.

```text
VISUAL
HEARING
```

기존 `VISUAL_IMPAIRMENT`, `HEARING_IMPAIRMENT`, `DEAFBLIND` 요청도 AI 서버가 처리하지만 앱 명세에는 `DEAFBLIND`가 없습니다. `DEAFBLIND`를 제품 범위에 포함하려면 FE-BE 공통 명세에 먼저 추가해야 합니다.

### DeviceType

```text
WASHER
REFRIGERATOR
AIR_SENSOR
TV
RANGE
DOOR_SENSOR
WEARABLE
UWB_TAG
```

변경된 이름:

| 기존 AI 값 | 앱 명세 값 |
|---|---|
| `TV_DISPLAY` | `TV` |
| `INDUCTION` | `RANGE` |
| `BAND` | `WEARABLE` |
| `UWB` | `UWB_TAG` |

AI 서버는 기존 값도 별칭으로 허용하지만 백엔드는 앱 명세 값을 보내주세요.

## 5. AI 응답 계약

### 앱 명세 기준 필드

| 필드 | 설명 |
|---|---|
| `title` | Alert 제목 |
| `alertType` | `LIFE`, `DANGER`, `EMERGENCY` |
| `severity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `safetyStatusLevel` | `SAFE`, `CAUTION`, `DANGER`, `EMERGENCY` |
| `message` | Alert 메시지 |
| `voiceGuide` | 음성 안내 문구. 음성 비활성 시 `null` |
| `requiresGuardianNotify` | 보호자 알림 권고 여부 |
| `recommendedAction` | 추천 후속 행동 |
| `notificationChannels` | 접근성 안내 채널 |
| `vibrationPattern` | `SLOW`, `MEDIUM`, `FAST`, `LONG_TWICE` |

### AI 상세 및 기존 계약 호환 필드

| 필드 | 설명 |
|---|---|
| `judgmentLevel` | `NORMAL`, `WARNING`, `DANGER`, `EMERGENCY` |
| `category` | 내부 상황 분류 |
| `riskLevel` | 한글 위험 단계 |
| `riskScore` | 0~100 위험 점수 |
| `deliveryTargets` | `APP`, `WEARABLE`, `TV`, `THINQ_ON` 출력 대상 |
| `notifyGuardian` | `requiresGuardianNotify` 호환 필드 |
| `recommendedChannels` | `deliveryTargets` 호환 필드 |
| `screenMode` | 상세 화면 표시 권고 |
| `voiceEnabled` | 음성 안내 활성 여부 |

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

## 6. Alert 및 EventHistory 저장 요청

백엔드는 원본 이벤트와 AI 응답을 다음처럼 조합해주세요.

| 앱 Alert 필드 | 값 출처 |
|---|---|
| `userId` | 원본 이벤트 `userId` |
| `deviceId` | 원본 이벤트 `deviceId` |
| `type` | AI 응답 `alertType` |
| `severity` | AI 응답 `severity` |
| `title` | AI 응답 `title` |
| `message` | AI 응답 `message` |
| `voiceGuide` | AI 응답 `voiceGuide` |
| `locationName` | 원본 이벤트 `locationName` |
| `occurredAt` | 원본 이벤트 `occurredAt` |
| `status` | 신규 저장 시 백엔드가 `UNREAD` 지정 |
| `requiresGuardianNotify` | AI 응답과 보호자 설정을 함께 확인 |
| `recommendedAction` | AI 응답 `recommendedAction` |

`EventHistory.type`, `EventHistory.severity`, `EventHistory.title`, `EventHistory.deviceName`, `EventHistory.occurredAt`도 같은 값으로 저장해주세요.

## 7. 보호자 알림 처리

AI의 `requiresGuardianNotify`는 발송 권고입니다. 실제 보호자 알림은 백엔드가 아래 조건을 모두 확인해야 합니다.

1. `requiresGuardianNotify == true`
2. 사용자의 `guardianLinked == true`
3. 대상 보호자의 `notifyOnDanger == true`
4. 보호자 연결 상태가 유효함

보호자에게 전달되면 Alert 상태를 필요에 따라 `ESCALATED`로 변경하고 전달 결과를 기록해주세요.

## 8. 알림 채널과 출력 대상 구분

두 필드는 의미가 다릅니다.

- `notificationChannels`: 앱 명세의 접근성 표현 방식
  - `VOICE`, `VIBRATION`, `SCREEN`, `TEXT`, `COLOR`
- `deliveryTargets`: 실제 결과를 전달할 기기·서비스
  - `APP`, `WEARABLE`, `TV`, `THINQ_ON`

백엔드는 사용자 `notificationPrefs.channels`를 AI 요청에 포함하고, AI 응답의 `notificationChannels`를 앱·웨어러블 표현 방식에 사용해주세요.

## 9. 위험도 매핑

| AI 판단 | `alertType` | `severity` | `safetyStatusLevel` | `vibrationPattern` |
|---|---|---|---|---|
| 낮음 | `LIFE` | `LOW` | `SAFE` | `SLOW` |
| 주의 | `DANGER` | `MEDIUM` | `CAUTION` | `MEDIUM` |
| 위험 | `DANGER` | `HIGH` | `DANGER` | `FAST` |
| 긴급 | `EMERGENCY` | `CRITICAL` | `EMERGENCY` | `LONG_TWICE` |

## 10. 기기별 전달 주의사항

- `RANGE`: `POWER_ON`, `BURNER_ON`, `LONG_ON`, `OUTING_CHECK`, `POWER_USAGE_HIGH`, `COOK_COMPLETE` 중심으로 전달합니다. `RESIDUAL_HEAT`는 MVP 핵심 판단 이벤트에서 제외합니다.
- `REFRIGERATOR`: 문열림 이벤트는 실제 지원 모델일 때만 `DOOR_OPEN`, `LONG_OPEN`을 전달합니다.
- `TV`: 일반 입력 기기보다 위험 안내와 상태 요약 출력 채널로 사용합니다.
- `WEARABLE`, `UWB_TAG`: 앱 명세에는 포함되지만 현재 위험도 판단 룰의 핵심 범위는 아닙니다. UWB는 `/api/uwb/*` 흐름을 우선합니다.

## 11. 오류 및 장애 처리

- AI 요청 연결 타임아웃 권장: 2초
- AI 응답 타임아웃 권장: 5초
- 호출 실패 시 원본 이벤트를 유실하지 말고 로그 또는 재처리 대기열에 저장
- 알 수 없는 기기·이벤트는 AI 서버가 `LIFE`/`LOW`/`SAFE` 기본 응답을 반환
- AI 서버 장애가 앱 API 전체 장애로 이어지지 않도록 기본 알림 정책 적용

## 12. 백엔드 완료 체크리스트

- [ ] 앱 명세 Enum으로 AI 요청 DTO 구성
- [ ] 기존 AI Enum을 앱 명세 Enum으로 변환
- [ ] 사용자 `notificationPrefs` 조회 후 AI 요청에 포함
- [ ] 원본 이벤트와 AI 응답을 조합해 Alert 저장
- [ ] EventHistory 저장
- [ ] `requiresGuardianNotify`와 보호자 설정을 함께 확인
- [ ] `notificationChannels`와 `deliveryTargets`를 구분해 처리
- [ ] `/api/integrations/events/life`, `/api/integrations/events/danger` 처리 흐름과 연결
- [ ] AI 장애 처리와 원본 이벤트 보존
- [ ] 대표 이벤트 통합 테스트
