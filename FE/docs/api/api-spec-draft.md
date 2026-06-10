# LG Able Band API 명세서 초안

상태: FE-BE 협의용 초안  
원본 기준: `최종_LG_Able_Band_개발산출물_260609.docx`  
FE 참고 문서: `docs/api/api-spec-by-screen.md`, `docs/frontend/fe-api-needs.md`, `docs/frontend/fe-screens.md`, `docs/reference/be-reference.md`, `docs/reference/ml-reference.md`

이 문서는 FE 화면 구현과 백엔드 병렬 개발을 맞추기 위한 API 명세 초안이다.
실제 URL, 필드명, 인증 방식은 백엔드 담당자와 협의 후 확정한다.

화면별로 `구현 기능`, `API`, `데이터`, `백엔드가 프론트에 보내는 데이터`를 빠르게 보려면 `docs/api/api-spec-by-screen.md`를 먼저 확인한다.

## 공통 규칙

### Base URL

개발 환경 기준:

```text
http://localhost:8080/api
```

FE에서는 환경변수로 API 주소를 관리한다.

```text
VITE_API_BASE_URL=http://localhost:8080/api
```

### 인증

로그인 이후 인증이 필요한 API는 아래 헤더를 사용한다.

```http
Authorization: Bearer <accessToken>
```

세션 쿠키 방식으로 변경될 수 있으므로 백엔드와 최종 확정이 필요하다.

### 날짜 형식

날짜/시간은 ISO 8601 문자열을 사용한다.

```json
"occurredAt": "2026-06-10T14:30:00+09:00"
```

### 공통 성공 응답

단건 조회는 객체를 바로 반환한다.

```json
{
  "id": 1,
  "name": "홍길동"
}
```

목록 조회는 `items`를 사용한다.

```json
{
  "items": [],
  "page": 0,
  "size": 20,
  "totalElements": 0
}
```

### 공통 에러 응답

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "요청한 데이터를 찾을 수 없습니다.",
  "details": {}
}
```

### 주요 HTTP 상태 코드

| 상태 코드 | 의미 |
| --- | --- |
| 200 | 조회/수정 성공 |
| 201 | 생성 성공 |
| 204 | 삭제 또는 응답 본문 없는 성공 |
| 400 | 요청값 오류 |
| 401 | 인증 필요 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 409 | 중복 또는 상태 충돌 |
| 500 | 서버 오류 |

## 공통 Enum

### AccountRole

| 값 | 의미 |
| --- | --- |
| `USER` | 서비스 사용자 |
| `GUARDIAN` | 보호자 |

### AccessibilityType

| 값 | 의미 |
| --- | --- |
| `VISUAL` | 시각장애인 |
| `HEARING` | 청각장애인 |

### NotificationChannel

| 값 | 의미 |
| --- | --- |
| `VOICE` | 음성 |
| `VIBRATION` | 진동 |
| `SCREEN` | 화면 |
| `TEXT` | 텍스트 |
| `COLOR` | 색상 보조 |

### AlertType

| 값 | 의미 |
| --- | --- |
| `LIFE` | 생활 알림 |
| `DANGER` | 위험 알림 |
| `EMERGENCY` | 긴급 알림 |
| `LOCATION` | 위치 안내 |

### Severity

| 값 | 의미 |
| --- | --- |
| `LOW` | 낮음 |
| `MEDIUM` | 보통 |
| `HIGH` | 높음 |
| `CRITICAL` | 긴급 |

### SafetyStatusLevel

| 값 | 의미 |
| --- | --- |
| `SAFE` | 안전 |
| `CAUTION` | 주의 |
| `DANGER` | 위험 |
| `EMERGENCY` | 긴급 |

### AlertStatus

| 값 | 의미 |
| --- | --- |
| `UNREAD` | 미확인 |
| `CONFIRMED` | 확인 완료 |
| `REPLAYED` | 다시 듣기 실행 |
| `ESCALATED` | 보호자 알림 전환 |

### DeviceType

| 값 | 의미 |
| --- | --- |
| `WASHER` | 세탁기 |
| `REFRIGERATOR` | 냉장고 |
| `AIR_SENSOR` | 공기질 센서 |
| `TV` | TV |
| `RANGE` | 전기레인지 |
| `DOOR_SENSOR` | 도어센서 |
| `WEARABLE` | 웨어러블 |
| `UWB_TAG` | UWB 태그 |

### ConnectionStatus

| 값 | 의미 |
| --- | --- |
| `CONNECTED` | 연결됨 |
| `DISCONNECTED` | 연결 끊김 |
| `WARNING` | 주의 필요 |
| `ERROR` | 오류 |

### NavigationStatus

| 값 | 의미 |
| --- | --- |
| `READY` | 탐색 준비 |
| `ACTIVE` | 탐색 중 |
| `ARRIVED` | 도착 |
| `FAILED` | 실패 |
| `CANCELED` | 취소 |

### VibrationPattern

| 값 | 의미 |
| --- | --- |
| `SLOW` | 느린 진동 |
| `MEDIUM` | 중간 간격 진동 |
| `FAST` | 빠른 진동 |
| `LONG_TWICE` | 긴 진동 2회 |
| `NONE` | 진동 없음 |

## 1. 인증 API

### 1.1 회원가입

```http
POST /api/auth/signup
```

요청:

```json
{
  "role": "USER",
  "name": "홍길동",
  "email": "user@example.com",
  "password": "password1234",
  "accessibilityType": "VISUAL",
  "notificationPrefs": {
    "channels": ["VOICE", "VIBRATION"],
    "highContrast": true,
    "largeText": true
  }
}
```

응답 `201`:

```json
{
  "accountId": 1,
  "role": "USER",
  "userId": 1,
  "name": "홍길동",
  "email": "user@example.com",
  "accessibilityType": "VISUAL"
}
```

FE 사용 화면:

- 회원가입
- 접근성 초기 설정

비고:

- `role`은 `USER` 또는 `GUARDIAN`을 사용한다.
- `USER` 회원가입은 `accessibilityType`과 `notificationPrefs`를 포함한다.
- `GUARDIAN` 회원가입은 보호자 이름, 이메일, 비밀번호, 연락처를 중심으로 하고 접근성 설정은 포함하지 않는다.

### 1.2 로그인

```http
POST /api/auth/login
```

요청:

```json
{
  "role": "USER",
  "email": "user@example.com",
  "password": "password1234"
}
```

응답 `200`:

```json
{
  "accessToken": "jwt-token",
  "role": "USER",
  "account": {
    "accountId": 1,
    "name": "홍길동",
    "email": "user@example.com"
  },
  "userProfile": {
    "userId": 1,
    "name": "홍길동",
    "accessibilityType": "VISUAL"
  }
}
```

FE 사용 화면:

- 로그인
- 사용자 로그인 성공 후 홈 진입
- 보호자 로그인 성공 후 보호자 알림/이력 화면 진입

보호자 로그인 응답 예시:

```json
{
  "accessToken": "jwt-token",
  "role": "GUARDIAN",
  "account": {
    "accountId": 2,
    "name": "보호자",
    "email": "guardian@example.com"
  },
  "guardianProfile": {
    "guardianId": 1,
    "linkedUserId": 1,
    "relationship": "FAMILY"
  }
}
```

## 2. 사용자/접근성 프로필 API

### 2.1 사용자 프로필 조회

```http
GET /api/users/me
```

응답 `200`:

```json
{
  "role": "USER",
  "userId": 1,
  "name": "홍길동",
  "email": "user@example.com",
  "accessibilityType": "VISUAL",
  "notificationPrefs": {
    "channels": ["VOICE", "VIBRATION"],
    "highContrast": true,
    "largeText": true
  },
  "guardianLinked": true
}
```

FE 사용 화면:

- 홈
- 접근성 설정
- 보호자 연결

비고:

- `GET /api/users/me`는 `USER` role의 사용자 프로필 조회에 사용한다.
- `GUARDIAN` role은 로그인 응답의 `guardianProfile` 또는 보호자 API를 기준으로 화면을 구성한다.

### 2.2 접근성 설정 저장

```http
PUT /api/users/me/accessibility
```

요청:

```json
{
  "accessibilityType": "HEARING",
  "notificationPrefs": {
    "channels": ["VIBRATION", "SCREEN", "TEXT", "COLOR"],
    "highContrast": true,
    "largeText": true
  }
}
```

응답 `200`:

```json
{
  "accessibilityType": "HEARING",
  "notificationPrefs": {
    "channels": ["VIBRATION", "SCREEN", "TEXT", "COLOR"],
    "highContrast": true,
    "largeText": true
  },
  "updatedAt": "2026-06-10T14:30:00+09:00"
}
```

FE 사용 화면:

- 접근성 프로필 설정 화면

## 3. 홈 API

### 3.1 홈 요약 조회

홈 화면에 필요한 사용자 상태, 최근 알림, 기기 상태, 긴급 요청 가능 여부를 한 번에 조회한다.

```http
GET /api/app/home
```

응답 `200`:

```json
{
  "user": {
    "userId": 1,
    "name": "홍길동",
    "accessibilityType": "VISUAL"
  },
  "safetyStatus": {
    "level": "SAFE",
    "message": "현재 위험 알림이 없습니다.",
    "lastCheckedAt": "2026-06-10T14:30:00+09:00"
  },
  "recentAlerts": [
    {
      "alertId": 101,
      "type": "LIFE",
      "severity": "LOW",
      "title": "세탁 완료",
      "message": "세탁이 완료되었습니다. 건조기로 옮겨주세요.",
      "deviceName": "세탁기",
      "occurredAt": "2026-06-10T14:20:00+09:00",
      "status": "UNREAD"
    }
  ],
  "deviceSummary": {
    "totalCount": 5,
    "connectedCount": 4,
    "warningCount": 1,
    "uwbSupportedCount": 1
  },
  "emergency": {
    "enabled": true,
    "primaryGuardianName": "보호자"
  },
  "quickActions": {
    "canStartUwbNavigation": true,
    "canRequestEmergency": true
  }
}
```

FE 사용 화면:

- 홈 화면

협의 필요:

- 홈 요약 API를 단일 API로 제공할지, 여러 API 조합으로 처리할지 결정
- `safetyStatus.level` 값 확정

## 4. 기기 API

### 4.1 기기 목록 조회

```http
GET /api/devices
```

응답 `200`:

```json
{
  "items": [
    {
      "deviceId": 10,
      "name": "세탁기",
      "type": "WASHER",
      "connectionStatus": "CONNECTED",
      "locationSupported": true,
      "lastEventAt": "2026-06-10T14:20:00+09:00"
    }
  ]
}
```

FE 사용 화면:

- 홈
- 기기 연동
- UWB 위치 안내 대상 선택

### 4.2 기기 연결

```http
POST /api/devices
```

요청:

```json
{
  "vendor": "LG_THINQ",
  "vendorDeviceId": "thinq-device-id",
  "name": "세탁기",
  "type": "WASHER"
}
```

응답 `201`:

```json
{
  "deviceId": 10,
  "name": "세탁기",
  "type": "WASHER",
  "connectionStatus": "CONNECTED",
  "locationSupported": true
}
```

FE 사용 화면:

- 기기 연동 화면

### 4.3 기기 연결 해제

```http
DELETE /api/devices/{deviceId}
```

응답 `204`

FE 사용 화면:

- 기기 연동 화면

## 5. 알림 API

### 5.1 실시간/최근 알림 목록 조회

```http
GET /api/alerts?type=&status=&limit=20
```

쿼리:

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `type` | N | `LIFE`, `DANGER`, `EMERGENCY`, `LOCATION` |
| `status` | N | `UNREAD`, `CONFIRMED`, `REPLAYED`, `ESCALATED` |
| `limit` | N | 조회 개수 |

응답 `200`:

```json
{
  "items": [
    {
      "alertId": 101,
      "type": "DANGER",
      "severity": "HIGH",
      "title": "가스 위험 감지",
      "message": "가스 위험이 감지되었습니다. 즉시 확인하세요.",
      "deviceName": "가스 센서",
      "locationName": "주방",
      "occurredAt": "2026-06-10T14:25:00+09:00",
      "status": "UNREAD",
      "requiresGuardianNotify": true
    }
  ]
}
```

FE 사용 화면:

- 홈 최근 알림
- 실시간 알림 화면
- 웨어러블 알림 화면

### 5.2 알림 상세 조회

```http
GET /api/alerts/{alertId}
```

응답 `200`:

```json
{
  "alertId": 101,
  "type": "DANGER",
  "severity": "HIGH",
  "title": "가스 위험 감지",
  "message": "가스 위험이 감지되었습니다. 즉시 확인하세요.",
  "voiceGuide": "가스 위험이 감지되었습니다. 즉시 대피하세요.",
  "device": {
    "deviceId": 20,
    "name": "가스 센서",
    "type": "AIR_SENSOR"
  },
  "locationName": "주방",
  "occurredAt": "2026-06-10T14:25:00+09:00",
  "status": "UNREAD",
  "recommendedAction": "창문을 열고 안전한 곳으로 이동하세요."
}
```

FE 사용 화면:

- 알림 상세/다시 듣기 화면

### 5.3 알림 확인 처리

```http
POST /api/alerts/{alertId}/confirm
```

요청:

```json
{
  "responseType": "CONFIRMED"
}
```

응답 `200`:

```json
{
  "alertId": 101,
  "status": "CONFIRMED",
  "confirmedAt": "2026-06-10T14:31:00+09:00"
}
```

FE 사용 화면:

- 실시간 알림
- 알림 상세
- 웨어러블 확인 응답

### 5.4 알림 다시 듣기 처리

다시 듣기 자체는 FE에서 Web Speech API 또는 오디오 재생으로 처리할 수 있다.
백엔드는 다시 듣기 이력 저장 또는 안내 문구 제공을 담당한다.

```http
POST /api/alerts/{alertId}/replay
```

응답 `200`:

```json
{
  "alertId": 101,
  "status": "REPLAYED",
  "voiceGuide": "가스 위험이 감지되었습니다. 즉시 대피하세요.",
  "replayedAt": "2026-06-10T14:32:00+09:00"
}
```

FE 사용 화면:

- 알림 상세/다시 듣기
- 이벤트 이력
- 웨어러블 다시 듣기

## 6. 이벤트 이력 API

### 6.1 이벤트/알림 이력 조회

```http
GET /api/events?from=&to=&type=&page=0&size=20
```

쿼리:

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `from` | N | 시작 일시 |
| `to` | N | 종료 일시 |
| `type` | N | 이벤트/알림 유형 |
| `page` | N | 페이지 번호 |
| `size` | N | 페이지 크기 |

응답 `200`:

```json
{
  "items": [
    {
      "eventId": 501,
      "alertId": 101,
      "type": "DANGER",
      "severity": "HIGH",
      "title": "가스 위험 감지",
      "deviceName": "가스 센서",
      "occurredAt": "2026-06-10T14:25:00+09:00",
      "alertStatus": "CONFIRMED"
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1
}
```

FE 사용 화면:

- 이벤트/알림 이력 화면
- 보호자 이력 보기

## 7. 보호자 API

### 7.1 보호자 목록 조회

```http
GET /api/guardians
```

응답 `200`:

```json
{
  "items": [
    {
      "guardianId": 1,
      "name": "김보호",
      "phone": "010-0000-0000",
      "isPrimary": true,
      "notifyOnDanger": true,
      "connectionStatus": "CONNECTED"
    }
  ]
}
```

FE 사용 화면:

- 보호자 연결 화면
- 홈 긴급 요청 가능 여부

### 7.2 보호자 등록

```http
POST /api/guardians
```

요청:

```json
{
  "name": "김보호",
  "phone": "010-0000-0000",
  "isPrimary": true,
  "notifyOnDanger": true
}
```

응답 `201`:

```json
{
  "guardianId": 1,
  "name": "김보호",
  "phone": "010-0000-0000",
  "isPrimary": true,
  "notifyOnDanger": true,
  "connectionStatus": "CONNECTED"
}
```

FE 사용 화면:

- 보호자 연결 화면

### 7.3 보호자 정보 수정

```http
PUT /api/guardians/{guardianId}
```

요청:

```json
{
  "name": "김보호",
  "phone": "010-1111-2222",
  "isPrimary": true,
  "notifyOnDanger": true
}
```

응답 `200`:

```json
{
  "guardianId": 1,
  "name": "김보호",
  "phone": "010-1111-2222",
  "isPrimary": true,
  "notifyOnDanger": true,
  "connectionStatus": "CONNECTED"
}
```

## 8. 긴급 도움 요청 API

### 8.1 긴급 요청 생성

```http
POST /api/emergency-requests
```

요청:

```json
{
  "message": "도움이 필요합니다.",
  "source": "APP"
}
```

응답 `201`:

```json
{
  "emergencyRequestId": 301,
  "status": "SENT",
  "message": "보호자에게 긴급 요청을 보냈습니다.",
  "sentAt": "2026-06-10T14:35:00+09:00",
  "guardianTargets": [
    {
      "guardianId": 1,
      "name": "김보호",
      "deliveryStatus": "SENT"
    }
  ]
}
```

FE 사용 화면:

- 홈 긴급 도움 요청 버튼
- 웨어러블 긴급 도움 요청
- 이벤트 이력

협의 필요:

- `source` 값: `APP`, `WEARABLE` 등 확정
- 실제 문자/푸시 발송 여부

## 9. UWB 위치 안내 API

### 9.1 UWB 위치 안내 대상 조회

```http
GET /api/uwb/targets
```

응답 `200`:

```json
{
  "items": [
    {
      "deviceId": 10,
      "name": "세탁기",
      "type": "WASHER",
      "locationSupported": true,
      "connectionStatus": "CONNECTED"
    }
  ]
}
```

FE 사용 화면:

- UWB 가전 위치 안내 화면

### 9.2 UWB 탐색 시작

```http
POST /api/uwb/sessions
```

요청:

```json
{
  "targetDeviceId": 10
}
```

응답 `201`:

```json
{
  "sessionId": 9001,
  "targetDevice": {
    "deviceId": 10,
    "name": "세탁기"
  },
  "status": "ACTIVE",
  "distanceM": 4.0,
  "confidence": 0.86,
  "voiceGuide": "세탁기까지 약 4미터입니다.",
  "vibrationPattern": "SLOW"
}
```

FE 사용 화면:

- UWB 가전 위치 안내 화면
- 웨어러블 UWB 거리/진동 안내

### 9.3 UWB 탐색 상태 조회

```http
GET /api/uwb/sessions/{sessionId}
```

응답 `200`:

```json
{
  "sessionId": 9001,
  "targetDevice": {
    "deviceId": 10,
    "name": "세탁기"
  },
  "status": "ACTIVE",
  "distanceM": 2.0,
  "confidence": 0.88,
  "voiceGuide": "세탁기까지 약 2미터입니다. 가까워지고 있습니다.",
  "vibrationPattern": "MEDIUM",
  "updatedAt": "2026-06-10T14:36:00+09:00"
}
```

FE 사용 화면:

- UWB 가전 위치 안내 화면
- 웨어러블 UWB 거리/진동 안내

### 9.4 UWB 탐색 종료

```http
POST /api/uwb/sessions/{sessionId}/stop
```

응답 `200`:

```json
{
  "sessionId": 9001,
  "status": "CANCELED",
  "stoppedAt": "2026-06-10T14:37:00+09:00"
}
```

FE 사용 화면:

- UWB 가전 위치 안내 화면

## 10. 외부 이벤트 수신 API 참고

아래 API는 FE가 직접 호출하지 않는다.
BE/외부 연동/ML 작업을 이해하기 위한 참고 항목이다.

### 10.1 생활 이벤트 수신

```http
POST /api/integrations/events/life
```

### 10.2 위험 이벤트 수신

```http
POST /api/integrations/events/danger
```

### 10.3 UWB 위치 정보 수신

```http
POST /api/integrations/uwb/location
```

FE 참고:

- 이 API들의 결과가 `Alert`, `Event`, `UwbNavigationSession` 형태로 FE에 전달된다.
- FE는 이 API를 구현하거나 직접 호출하지 않는다.

## 11. 백엔드와 협의할 산출물 기준 결정값

| 우선순위 | 항목 | 산출물 기준 결정값 | 비고 |
| --- | --- | --- | --- |
| 1 | 인증 방식 | JWT Bearer 토큰 우선 | 로그인 후 `Authorization: Bearer <accessToken>` 사용 |
| 2 | 로그인 역할 | `USER`, `GUARDIAN` | 사용자와 보호자 화면을 로그인 시점에 분기 |
| 3 | 장애 유형 | `VISUAL`, `HEARING` | 시각장애인, 청각장애인만 사용 |
| 4 | 홈 요약 API | `GET /api/app/home` 단일 API 우선 | 홈 화면 초기 로딩 단순화 |
| 5 | 알림 유형 | `LIFE`, `DANGER`, `EMERGENCY`, `LOCATION` | 생활/위험/긴급/위치 안내 |
| 6 | 위험도 값 | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | 카드 강조와 보호자 알림 기준 |
| 7 | 다시 듣기 | FE Web Speech API 우선 | 백엔드 TTS URL은 확장 옵션 |
| 8 | 웨어러블 API | 앱과 같은 API 우선 | 필요 시 이후 경량 API 분리 |
| 9 | UWB 거리 갱신 | MVP는 polling 우선 | WebSocket/SSE는 확장 옵션 |
| 10 | 긴급 요청 전달 | MVP는 요청 저장과 보호자 전달 상태 반환 | 실제 문자/푸시는 확장 가능 |
| 11 | 보호자 권한 | `GUARDIAN` role은 연결된 사용자 알림만 조회 | 보호자 전용 화면 권한 범위 |
| 12 | 공통 에러 코드 | `NO_GUARDIAN`, `DELIVERY_FAILED`, `UNAUTHORIZED`, `RESOURCE_NOT_FOUND`, `SERVER_ERROR` 우선 | FE 오류 메시지 매핑 기준 |

## 12. FE mock data 최소 기준

FE는 API 확정 전 아래 데이터 묶음을 mock으로 준비한다.

- `mockUser`
- `mockAccessibilityProfile`
- `mockDevices`
- `mockAlerts`
- `mockGuardians`
- `mockEmergencyRequests`
- `mockEventHistory`
- `mockUwbSession`

알림 mock 최소 필드:

```json
{
  "alertId": 101,
  "type": "LIFE",
  "severity": "LOW",
  "title": "세탁 완료",
  "message": "세탁이 완료되었습니다.",
  "deviceName": "세탁기",
  "occurredAt": "2026-06-10T14:20:00+09:00",
  "status": "UNREAD"
}
```

UWB mock 최소 필드:

```json
{
  "sessionId": 9001,
  "targetDeviceName": "세탁기",
  "distanceM": 2.0,
  "confidence": 0.88,
  "navigationStatus": "ACTIVE",
  "voiceGuide": "세탁기까지 약 2미터입니다. 가까워지고 있습니다.",
  "vibrationPattern": "MEDIUM"
}
```
