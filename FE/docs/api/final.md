# LG Able Band API 명세서 v1.0

> 이 문서는 FE-BE 협의를 위한 **엔드포인트 중심 API 명세서**다.
> 
> 
> 화면별 API 명세서와 API 초안을 합쳐서, 백엔드 구현 시 필요한 요청값·응답값·Enum·상태 코드·데이터 모델을 한 번에 볼 수 있게 정리했다.
> 

---

## 0. 문서 기준

| 구분 | 기준 |
| --- | --- |
| 주 기준 문서 | `api-spec-by-screen.md` |
| 보조 기준 문서 | `api-spec-draft.md` |
| 문서 상태 | FE-BE 협의용 초안 |
| 원본 기준 | `최종_LG_Able_Band_개발산출물_260609.docx` |
| 사용 목적 | 화면별 기능, API, 데이터, 백엔드 응답 필드, 공통 규칙 정리 |
| 개발 환경 Base URL | `http://localhost:8080/api` |
| FE 환경변수 예시 | `VITE_API_BASE_URL=http://localhost:8080/api` |

---

---

## 0-1. 전체 API 목록 빠른 보기

| 구분 | Method | Endpoint | 목적 | 1차 MVP 여부 |
| --- | --- | --- | --- | --- |
| 인증 | POST | `/api/auth/signup` | 회원가입 | O |
| 인증 | POST | `/api/auth/login` | 로그인 및 accessToken 발급 | O |
| 사용자 | GET | `/api/users/me` | 로그인한 사용자 프로필 조회 | O |
| 접근성 | PUT | `/api/users/me/accessibility` | 접근성 설정 저장/수정 | O |
| 홈 | GET | `/api/app/home` | 홈 화면 요약 조회 | O |
| 기기 | GET | `/api/devices` | 연결 기기 목록 조회 | O |
| 기기 | POST | `/api/devices` | 기기 연결/mock 기기 추가 | △ |
| 기기 | DELETE | `/api/devices/{deviceId}` | 기기 연결 해제 | △ |
| 알림 | GET | `/api/alerts?type=&status=&limit=20` | 알림 목록 조회 | O |
| 알림 | GET | `/api/alerts/{alertId}` | 알림 상세 조회 | O |
| 알림 | POST | `/api/alerts/{alertId}/confirm` | 알림 확인 처리 | O |
| 알림 | POST | `/api/alerts/{alertId}/replay` | 다시 듣기 이력 저장/문구 반환 | △ |
| 이력 | GET | `/api/events?from=&to=&type=&page=0&size=20` | 이벤트/알림 이력 조회 | O |
| 보호자 | GET | `/api/guardians` | 보호자 목록 조회 | O |
| 보호자 | POST | `/api/guardians` | 보호자 등록 | O |
| 보호자 | PUT | `/api/guardians/{guardianId}` | 보호자 정보 수정 | △ |
| 긴급 | POST | `/api/emergency-requests` | 긴급 도움 요청 생성 | O |
| UWB | GET | `/api/uwb/targets` | UWB 위치 안내 대상 조회 | △ |
| UWB | POST | `/api/uwb/sessions` | UWB 탐색 시작 | △ |
| UWB | GET | `/api/uwb/sessions/{sessionId}` | UWB 탐색 상태 조회 | △ |
| UWB | POST | `/api/uwb/sessions/{sessionId}/stop` | UWB 탐색 종료 | △ |
| 외부 연동 | POST | `/api/integrations/events/life` | 생활 이벤트 수신 | 후순위 |
| 외부 연동 | POST | `/api/integrations/events/danger` | 위험 이벤트 수신 | 후순위 |
| 외부 연동 | POST | `/api/integrations/uwb/location` | UWB 위치 정보 수신 | 후순위 |
| ThinQ | POST | `/api/thinq/pat` | LG ThinQ PAT 등록 | 마지막 |

> `O`는 백엔드 1차 구현에 넣는 것을 추천한다. `△`는 화면 시연용으로 필요할 때 mock으로 먼저 처리할 수 있다.
> 

## 1. 제일 먼저 이해할 전체 구조

### 1-1. 프론트와 백엔드가 나눠서 하는 일

| 구분 | 하는 일 |
| --- | --- |
| 프론트엔드 | 화면을 보여주고, 사용자가 입력한 값을 백엔드 API로 보낸다. |
| 백엔드 | 프론트가 보낸 요청을 받아 DB 저장, 조회, 수정, 삭제를 처리하고 결과를 JSON으로 돌려준다. |
| 외부 API / 연동 | LG ThinQ, UWB, 센서, ML 등 외부에서 들어오는 정보를 백엔드가 받아서 Alert/Event 형태로 저장한다. |
| 웨어러블 | 앱과 같은 API를 우선 사용하고, 필요하면 나중에 경량 API로 분리한다. |

### 1-2. 전체 사용자 흐름

```
회원가입/로그인
↓
role 확인: USER 또는 GUARDIAN
↓
USER면 사용자 홈 / GUARDIAN이면 보호자 화면
↓
USER는 접근성 프로필 설정
↓
기기 연동, 알림 조회, 긴급 요청, UWB 위치 안내 사용
↓
위험/긴급 이벤트는 보호자에게 전달되거나 이력에 저장
```

### 1-3. 로그인 role 분기

| role | 의미 | 로그인 후 이동 |
| --- | --- | --- |
| `USER` | 서비스 사용자 | 사용자 홈 화면 |
| `GUARDIAN` | 보호자 | 보호자 위험 알림/이력 화면 |

---

## 2. 공통 규칙

### 2-1. Base URL

개발 환경 기준 백엔드 주소는 아래와 같다.

```
http://localhost:8080/api
```

FE에서는 주소를 코드에 직접 박지 않고 환경변수로 관리한다.

```
VITE_API_BASE_URL=http://localhost:8080/api
```

예를 들어 FE가 로그인 API를 호출하면 실제 주소는 아래처럼 된다.

```
http://localhost:8080/api/auth/login
```

---

### 2-2. 인증 방식

로그인 후 인증이 필요한 API는 헤더에 access token을 넣는다.

```
Authorization: Bearer <accessToken>
```

쉽게 말하면 `accessToken`은 로그인 성공 후 받은 **로그인 증표**다.

프론트가 이후 요청마다 이 증표를 같이 보내면, 백엔드는 “아, 이 사용자가 로그인했구나”라고 판단한다.

> 단, 세션 쿠키 방식으로 바뀔 수 있으므로 최종 인증 방식은 BE와 협의가 필요하다.
> 

---

### 2-3. 날짜/시간 형식

날짜와 시간은 ISO 8601 문자열을 사용한다.

```json
"occurredAt": "2026-06-10T14:30:00+09:00"
```

`+09:00`은 한국 시간대라는 뜻이다.

---

### 2-4. 공통 성공 응답

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

---

### 2-5. 공통 에러 응답

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "요청한 데이터를 찾을 수 없습니다.",
  "details": {}
}
```

| 필드 | 의미 |
| --- | --- |
| `code` | 프론트가 에러 종류를 구분하기 위한 코드 |
| `message` | 사용자에게 보여줄 수 있는 설명 |
| `details` | 어떤 필드가 문제였는지 같은 추가 정보 |

---

### 2-6. HTTP 상태 코드

| 상태 코드 | 의미 | 예시 |
| --- | --- | --- |
| 200 | 조회/수정 성공 | 로그인 성공, 조회 성공, 수정 성공 |
| 201 | 생성 성공 | 회원가입 성공, 기기 등록 성공, 긴급 요청 생성 성공 |
| 204 | 응답 본문 없는 성공 | 삭제 성공 |
| 400 | 요청값 오류 | 필수값 누락, 형식 오류 |
| 401 | 인증 필요 | 토큰 없음, 로그인 안 함 |
| 403 | 권한 없음 | 보호자가 접근하면 안 되는 사용자 데이터 요청 |
| 404 | 리소스 없음 | 존재하지 않는 알림/기기/사용자 |
| 409 | 중복 또는 상태 충돌 | 이미 가입된 이메일 |
| 500 | 서버 오류 | 백엔드 내부 오류 |

---

## 3. 공통 Enum 정리

Enum은 정해진 문자열 값이다.

프론트와 백엔드가 서로 다른 값을 쓰면 연결이 안 되니까 꼭 맞춰야 한다.

### 3-1. AccountRole

| 값 | 의미 |
| --- | --- |
| `USER` | 서비스 사용자 |
| `GUARDIAN` | 보호자 |

### 3-2. AccessibilityType

| 값 | 의미 |
| --- | --- |
| `VISUAL` | 시각장애인 |
| `HEARING` | 청각장애인 |

### 3-3. NotificationChannel

| 값 | 의미 |
| --- | --- |
| `VOICE` | 음성 |
| `VIBRATION` | 진동 |
| `SCREEN` | 화면 |
| `TEXT` | 텍스트 |
| `COLOR` | 색상 보조 |

### 3-4. AlertType

| 값 | 의미 |
| --- | --- |
| `LIFE` | 생활 알림 |
| `DANGER` | 위험 알림 |
| `EMERGENCY` | 긴급 알림 |
| `LOCATION` | 위치 안내 |

### 3-5. Severity

| 값 | 의미 |
| --- | --- |
| `LOW` | 낮음 |
| `MEDIUM` | 보통 |
| `HIGH` | 높음 |
| `CRITICAL` | 긴급 |

### 3-6. SafetyStatusLevel

| 값 | 의미 |
| --- | --- |
| `SAFE` | 안전 |
| `CAUTION` | 주의 |
| `DANGER` | 위험 |
| `EMERGENCY` | 긴급 |

### 3-7. AlertStatus

| 값 | 의미 |
| --- | --- |
| `UNREAD` | 미확인 |
| `CONFIRMED` | 확인 완료 |
| `REPLAYED` | 다시 듣기 실행 |
| `ESCALATED` | 보호자 알림 전환 |

### 3-8. DeviceType

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

### 3-9. ConnectionStatus

| 값 | 의미 |
| --- | --- |
| `CONNECTED` | 연결됨 |
| `DISCONNECTED` | 연결 끊김 |
| `WARNING` | 주의 필요 |
| `ERROR` | 오류 |

### 3-10. NavigationStatus

| 값 | 의미 |
| --- | --- |
| `READY` | 탐색 준비 |
| `ACTIVE` | 탐색 중 |
| `ARRIVED` | 도착 |
| `FAILED` | 실패 |
| `CANCELED` | 취소 |

### 3-11. VibrationPattern

| 값 | 의미 |
| --- | --- |
| `SLOW` | 느린 진동 |
| `MEDIUM` | 중간 간격 진동 |
| `FAST` | 빠른 진동 |
| `LONG_TWICE` | 긴 진동 2회 |
| `NONE` | 진동 없음 |

---

## 4. 공통 객체

반복되는 데이터는 화면마다 새로 만들지 않고 공통 객체로 맞춘다.

| 공통 객체 | 포함 데이터 | 사용하는 화면 |
| --- | --- | --- |
| `AccountSummary` | `accountId`, `role`, `name`, `email` | 로그인, 메뉴 |
| `UserSummary` | `userId`, `name`, `accessibilityType`, `notificationPrefs` | 홈, 접근성 설정 |
| `GuardianSummary` | `guardianId`, `name`, `phone`, `relationship`, `isPrimary`, `status` | 홈, 보호자 연결, 긴급 요청 |
| `AlertSummary` | `alertId`, `type`, `severity`, `title`, `message`, `deviceName`, `occurredAt`, `status` | 홈, 알림 목록, 이력, 웨어러블 |
| `DeviceSummary` | `deviceId`, `name`, `type`, `connectionStatus`, `uwbSupported`, `lastEventAt` | 홈, 기기 연동, UWB |
| `UwbSessionSummary` | `sessionId`, `targetDeviceId`, `targetDeviceName`, `distanceM`, `confidence`, `navigationStatus`, `vibrationPattern`, `voiceGuide` | UWB, 웨어러블 UWB |

### 4-1. 중복 방지 원칙

- 홈 API는 위 공통 객체의 요약본을 조합해서 내려준다.
- 상세 화면은 요약 객체의 ID를 기준으로 상세 API를 다시 조회한다.
- 같은 의미의 필드는 `id`, `name`, `status`처럼 화면마다 다른 이름으로 만들지 않는다.

---

# Part A. API 상세 명세

---

## A-1. 인증 API

인증 API는 회원가입과 로그인을 담당한다.

---

### A-1-1. 회원가입

```
POST /api/auth/signup
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 새 계정을 생성한다. |
| 인증 필요 여부 | 필요 없음 |
| FE 사용 화면 | 회원가입, 접근성 초기 설정 |
| 성공 상태 코드 | `201` |
| 주요 역할 | USER 또는 GUARDIAN 계정 생성 |

### 요청 예시: USER 회원가입

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

### 요청 필드 설명

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `role` | string | O | 계정 역할. `USER` 또는 `GUARDIAN` |
| `name` | string | O | 이름 |
| `email` | string | O | 로그인 아이디로 사용할 이메일 |
| `password` | string | O | 로그인 비밀번호 |
| `accessibilityType` | string | USER일 때 O | 장애 유형. `VISUAL`, `HEARING` |
| `notificationPrefs` | object | USER일 때 O | 알림/접근성 기본 설정 |
| `notificationPrefs.channels` | string[] | O | 알림 채널 목록 |
| `notificationPrefs.highContrast` | boolean | O | 고대비 UI 사용 여부 |
| `notificationPrefs.largeText` | boolean | O | 큰 글씨 사용 여부 |

### 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `accountId` | 로그인 계정 자체의 ID |
| `role` | USER 또는 GUARDIAN |
| `userId` | USER 프로필 ID |
| `name` | 사용자 이름 |
| `email` | 사용자 이메일 |
| `accessibilityType` | 사용자 장애 유형 |

### 비고

- `role`은 `USER` 또는 `GUARDIAN`을 사용한다.
- `USER` 회원가입은 `accessibilityType`과 `notificationPrefs`를 포함한다.
- `GUARDIAN` 회원가입은 보호자 이름, 이메일, 비밀번호, 연락처를 중심으로 하고 접근성 설정은 포함하지 않는다.

---

### A-1-2. 로그인

```
POST /api/auth/login
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 가입된 계정으로 로그인한다. |
| 인증 필요 여부 | 필요 없음 |
| FE 사용 화면 | 로그인 화면 |
| 성공 상태 코드 | `200` |
| 주요 역할 | accessToken 발급, USER/GUARDIAN 화면 분기 |

### 요청 예시

```json
{
  "role": "USER",
  "email": "user@example.com",
  "password": "password1234"
}
```

### 요청 필드 설명

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `role` | string | O | USER 또는 GUARDIAN. 같은 이메일이어도 역할을 명확히 구분하기 위해 사용 |
| `email` | string | O | 로그인 이메일 |
| `password` | string | O | 로그인 비밀번호 |

### USER 로그인 응답 예시

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

### GUARDIAN 로그인 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `accessToken` | 로그인 이후 API 요청에 사용하는 토큰 |
| `role` | 화면 분기에 사용 |
| `account.accountId` | 로그인 계정 ID |
| `account.name` | 상단 프로필/메뉴에 표시할 이름 |
| `account.email` | 계정 정보 표시용 이메일 |
| `userProfile.userId` | USER일 때 사용자 데이터 조회 기준 |
| `userProfile.accessibilityType` | USER일 때 접근성 UI 적용 기준 |
| `guardianProfile.guardianId` | GUARDIAN일 때 보호자 데이터 조회 기준 |
| `guardianProfile.linkedUserId` | 보호자가 연결된 사용자 ID |
| `guardianProfile.relationship` | 보호자와 사용자 관계 |

### 로그인 후 화면 분기

```
role = USER
→ 사용자 홈 화면

role = GUARDIAN
→ 보호자 위험 알림/이력 화면
```

---

## A-2. 사용자/접근성 프로필 API

---

### A-2-1. 사용자 프로필 조회

```
GET /api/users/me
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 현재 로그인한 USER의 내 프로필을 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 홈, 접근성 설정, 보호자 연결 |
| 성공 상태 코드 | `200` |

### 요청

GET 요청이라 body는 없다.

대신 로그인 토큰을 헤더에 넣는다.

```
Authorization: Bearer <accessToken>
```

### 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `role` | 사용자 역할 |
| `userId` | 사용자 프로필 ID |
| `name` | 사용자 이름 |
| `email` | 이메일 |
| `accessibilityType` | 장애 유형 |
| `notificationPrefs.channels` | 알림 채널 |
| `notificationPrefs.highContrast` | 고대비 UI 사용 여부 |
| `notificationPrefs.largeText` | 큰 글씨 사용 여부 |
| `guardianLinked` | 보호자 연결 여부 |

### 비고

- `GET /api/users/me`는 `USER` role의 사용자 프로필 조회에 사용한다.
- `GUARDIAN` role은 로그인 응답의 `guardianProfile` 또는 보호자 API를 기준으로 화면을 구성한다.

---

### A-2-2. 접근성 설정 저장

```
PUT /api/users/me/accessibility
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 현재 로그인한 USER의 접근성 설정을 저장/수정한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 접근성 프로필 설정 화면 |
| 성공 상태 코드 | `200` |

### 요청 예시

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

### 요청 필드 설명

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `accessibilityType` | string | O | `VISUAL` 또는 `HEARING` |
| `notificationPrefs.channels` | string[] | O | 사용할 알림 채널 |
| `notificationPrefs.highContrast` | boolean | O | 고대비 사용 여부 |
| `notificationPrefs.largeText` | boolean | O | 큰 글씨 사용 여부 |

### 응답 예시

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

---

## A-3. 홈 API

### A-3-1. 홈 요약 조회

```
GET /api/app/home
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 홈 화면에 필요한 사용자 상태, 최근 알림, 기기 상태, 긴급 요청 가능 여부를 한 번에 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 홈 화면 |
| 성공 상태 코드 | `200` |
| 우선 결정값 | 홈은 `GET /api/app/home` 단일 API 우선 |

### 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `user` | 홈 상단 사용자 정보 |
| `safetyStatus.level` | 현재 안전 상태. `SAFE`, `CAUTION`, `DANGER`, `EMERGENCY` |
| `safetyStatus.message` | 홈 상태 카드에 표시할 문구 |
| `safetyStatus.lastCheckedAt` | 마지막 업데이트 시간 |
| `recentAlerts` | 최근 생활/위험/긴급 알림 목록 |
| `deviceSummary.totalCount` | 전체 연결 기기 수 |
| `deviceSummary.connectedCount` | 연결된 기기 수 |
| `deviceSummary.warningCount` | 주의/오류 기기 수 |
| `deviceSummary.uwbSupportedCount` | UWB 위치 안내 가능 기기 수 |
| `emergency.enabled` | 긴급 요청 가능 여부 |
| `emergency.primaryGuardianName` | 주 보호자 이름 |
| `quickActions.canStartUwbNavigation` | UWB 위치 안내 버튼 활성 여부 |
| `quickActions.canRequestEmergency` | SOS 버튼 활성 여부 |

### 협의 필요

- 홈 요약 API를 단일 API로 제공할지, 여러 API 조합으로 처리할지 결정
- `safetyStatus.level` 값 확정

---

## A-4. 기기 API

---

### A-4-1. 기기 목록 조회

```
GET /api/devices
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 연결된 가전, 센서, 웨어러블 목록을 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 홈, 기기 연동, UWB 위치 안내 대상 선택 |
| 성공 상태 코드 | `200` |

### 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `deviceId` | 기기 고유 ID |
| `name` | 기기명 |
| `type` | 기기 유형 |
| `connectionStatus` | 연결 상태 |
| `locationSupported` | 위치 안내 지원 여부 |
| `lastEventAt` | 마지막 이벤트 발생 시간 |

---

### A-4-2. 기기 연결

```
POST /api/devices
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 새 기기를 연결하거나 mock 기기를 추가한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 기기 연동 화면 |
| 성공 상태 코드 | `201` |

### 요청 예시

```json
{
  "vendor": "LG_THINQ",
  "vendorDeviceId": "thinq-device-id",
  "name": "세탁기",
  "type": "WASHER"
}
```

### 요청 필드 설명

| 필드 | 설명 |
| --- | --- |
| `vendor` | 외부 연동 공급자. 예: `LG_THINQ` |
| `vendorDeviceId` | LG ThinQ 등 외부 시스템에서 쓰는 기기 ID |
| `name` | 화면에 표시할 기기명 |
| `type` | 기기 유형 |

### 응답 예시

```json
{
  "deviceId": 10,
  "name": "세탁기",
  "type": "WASHER",
  "connectionStatus": "CONNECTED",
  "locationSupported": true
}
```

---

### A-4-3. 기기 연결 해제

```
DELETE /api/devices/{deviceId}
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 연결된 기기를 해제한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 기기 연동 화면 |
| 성공 상태 코드 | `204` |

### 요청

URL의 `{deviceId}` 자리에 해제할 기기 ID를 넣는다.

```
DELETE /api/devices/10
```

### 응답

```
204 No Content
```

응답 body는 없다.

---

## A-5. 알림 API

---

### A-5-1. 실시간/최근 알림 목록 조회

```
GET /api/alerts?type=&status=&limit=20
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 생활/위험/긴급/위치 안내 알림 목록을 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 홈 최근 알림, 실시간 알림 화면, 웨어러블 알림 화면 |
| 성공 상태 코드 | `200` |

### 쿼리 파라미터

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `type` | N | `LIFE`, `DANGER`, `EMERGENCY`, `LOCATION` |
| `status` | N | `UNREAD`, `CONFIRMED`, `REPLAYED`, `ESCALATED` |
| `limit` | N | 조회 개수 |

### 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `alertId` | 알림 ID |
| `type` | 알림 유형 |
| `severity` | 위험도 |
| `title` | 알림 제목 |
| `message` | 짧은 메시지 |
| `deviceName` | 발생 기기명 |
| `locationName` | 발생 위치 |
| `occurredAt` | 발생 시간 |
| `status` | 확인 상태 |
| `requiresGuardianNotify` | 보호자 알림 필요 여부 |

---

### A-5-2. 알림 상세 조회

```
GET /api/alerts/{alertId}
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 특정 알림의 상세 정보를 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 알림 상세/다시 듣기 화면 |
| 성공 상태 코드 | `200` |

### 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `alertId` | 알림 ID |
| `type` | 알림 유형 |
| `severity` | 위험도 |
| `title` | 제목 |
| `message` | 상세 메시지 |
| `voiceGuide` | 다시 듣기 또는 음성 안내 문구 |
| `device` | 발생 기기 정보 |
| `locationName` | 발생 위치 |
| `occurredAt` | 발생 시간 |
| `status` | 확인 상태 |
| `recommendedAction` | 추천 후속 행동 |

---

### A-5-3. 알림 확인 처리

```
POST /api/alerts/{alertId}/confirm
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 사용자가 알림을 확인했음을 저장한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 실시간 알림, 알림 상세, 웨어러블 확인 응답 |
| 성공 상태 코드 | `200` |

### 요청 예시

```json
{
  "responseType": "CONFIRMED"
}
```

### 응답 예시

```json
{
  "alertId": 101,
  "status": "CONFIRMED",
  "confirmedAt": "2026-06-10T14:31:00+09:00"
}
```

### 비고

- 같은 confirm API를 USER와 GUARDIAN이 함께 쓸 수 있다.
- 백엔드는 토큰의 role을 기준으로 확인 주체를 저장한다.

---

### A-5-4. 알림 다시 듣기 처리

```
POST /api/alerts/{alertId}/replay
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 다시 듣기 실행 이력을 저장하거나 음성 안내 문구를 제공한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 알림 상세/다시 듣기, 이벤트 이력, 웨어러블 다시 듣기 |
| 성공 상태 코드 | `200` |

### 응답 예시

```json
{
  "alertId": 101,
  "status": "REPLAYED",
  "voiceGuide": "가스 위험이 감지되었습니다. 즉시 대피하세요.",
  "replayedAt": "2026-06-10T14:32:00+09:00"
}
```

### 비고

- 다시 듣기 자체는 FE에서 Web Speech API 또는 오디오 재생으로 처리할 수 있다.
- 백엔드는 다시 듣기 이력 저장 또는 안내 문구 제공을 담당한다.
- 백엔드가 TTS 오디오 URL을 제공할 경우 `voiceGuideText`와 `ttsUrl` 중 어떤 값을 사용할지 협의한다.

---

## A-6. 이벤트 이력 API

### A-6-1. 이벤트/알림 이력 조회

```
GET /api/events?from=&to=&type=&page=0&size=20
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 날짜 범위와 유형 기준으로 이벤트/알림 이력을 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 이벤트/알림 이력 화면, 보호자 이력 보기 |
| 성공 상태 코드 | `200` |

### 쿼리 파라미터

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `from` | N | 시작 일시 |
| `to` | N | 종료 일시 |
| `type` | N | 이벤트/알림 유형 |
| `page` | N | 페이지 번호 |
| `size` | N | 페이지 크기 |

### 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `eventId` | 이벤트 ID |
| `alertId` | 알림 상세/다시 듣기 요청에 사용할 ID |
| `type` | 이벤트/알림 유형 |
| `severity` | 위험도 |
| `title` | 이력 제목 |
| `deviceName` | 발생 기기명 |
| `occurredAt` | 발생 시간 |
| `alertStatus` | 알림 확인 상태 |
| `page` | 현재 페이지 번호 |
| `size` | 페이지 크기 |
| `totalElements` | 전체 이력 개수 |

### 비고

- 이벤트와 알림을 하나의 이력 API로 내려줄지, 별도 API를 조합할지 BE와 결정한다.
- 기본 조회 기간은 최근 7일 또는 최근 30일 중 하나로 정한다.

---

## A-7. 보호자 API

---

### A-7-1. 보호자 목록 조회

```
GET /api/guardians
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 연결된 보호자 목록을 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 보호자 연결 화면, 홈 긴급 요청 가능 여부 |
| 성공 상태 코드 | `200` |

### 응답 예시

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

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `guardianId` | 보호자 ID |
| `name` | 보호자 이름 |
| `phone` | 연락처 |
| `isPrimary` | 주 보호자 여부 |
| `notifyOnDanger` | 위험 알림 수신 여부 |
| `connectionStatus` | 연결 상태 |

---

### A-7-2. 보호자 등록

```
POST /api/guardians
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 새 보호자를 등록한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 보호자 연결 화면 |
| 성공 상태 코드 | `201` |

### 요청 예시

```json
{
  "name": "김보호",
  "phone": "010-0000-0000",
  "isPrimary": true,
  "notifyOnDanger": true
}
```

### 응답 예시

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

---

### A-7-3. 보호자 정보 수정

```
PUT /api/guardians/{guardianId}
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 보호자 이름, 연락처, 주 보호자 여부, 위험 알림 수신 여부를 수정한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 보호자 연결 화면 |
| 성공 상태 코드 | `200` |

### 요청 예시

```json
{
  "name": "김보호",
  "phone": "010-1111-2222",
  "isPrimary": true,
  "notifyOnDanger": true
}
```

### 응답 예시

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

---

### A-7-4. 보호자 삭제

```
DELETE /api/guardians/{guardianId}
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 연결된 보호자를 삭제한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 보호자 연결 화면 |
| 성공 상태 코드 | `204` |

### 요청 예시

```
DELETE /api/guardians/1
```

### 응답

```
204 No Content
```

---

## A-8. 긴급 도움 요청 API

### A-8-1. 긴급 요청 생성

```
POST /api/emergency-requests
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 사용자가 SOS/긴급 도움 요청을 보낸다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | 홈 긴급 도움 요청 버튼, 웨어러블 긴급 도움 요청, 이벤트 이력 |
| 성공 상태 코드 | `201` |

### 요청 예시

```json
{
  "message": "도움이 필요합니다.",
  "source": "APP"
}
```

### 요청 필드 설명

| 필드 | 설명 |
| --- | --- |
| `message` | 보호자에게 전달할 긴급 요청 메시지 |
| `source` | 요청 발생 위치. 예: `APP`, `WEARABLE` |

### 응답 예시

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

### 협의 필요

- `source` 값: `APP`, `WEARABLE` 등 확정
- 실제 문자/푸시 발송 여부

---

## A-9. UWB 위치 안내 API

---

### A-9-1. UWB 위치 안내 대상 조회

```
GET /api/uwb/targets
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 위치 안내 가능한 기기 목록을 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | UWB 가전 위치 안내 화면 |
| 성공 상태 코드 | `200` |

### 응답 예시

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

---

### A-9-2. UWB 탐색 시작

```
POST /api/uwb/sessions
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 특정 기기에 대한 UWB 탐색 세션을 시작한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | UWB 가전 위치 안내 화면, 웨어러블 UWB 거리/진동 안내 |
| 성공 상태 코드 | `201` |

### 요청 예시

```json
{
  "targetDeviceId": 10
}
```

### 응답 예시

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

---

### A-9-3. UWB 탐색 상태 조회

```
GET /api/uwb/sessions/{sessionId}
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 진행 중인 UWB 탐색의 거리, 상태, 진동 패턴을 조회한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | UWB 가전 위치 안내 화면, 웨어러블 UWB 거리/진동 안내 |
| 성공 상태 코드 | `200` |

### 응답 예시

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

### 거리별 진동 기준

| 거리 | 진동 패턴 |
| --- | --- |
| 3m 이상 | `SLOW` |
| 1m 이상 3m 미만 | `MEDIUM` |
| 1m 이내 | `FAST` |
| 도착 | `LONG_TWICE` |

---

### A-9-4. UWB 탐색 종료

```
POST /api/uwb/sessions/{sessionId}/stop
```

| 항목 | 내용 |
| --- | --- |
| 목적 | UWB 탐색을 종료한다. |
| 인증 필요 여부 | 필요 |
| FE 사용 화면 | UWB 가전 위치 안내 화면, 웨어러블 UWB 거리/진동 안내 |
| 성공 상태 코드 | `200` |

### 응답 예시

```json
{
  "sessionId": 9001,
  "status": "CANCELED",
  "stoppedAt": "2026-06-10T14:37:00+09:00"
}
```

---

## A-10. 외부 이벤트 수신 API 참고

아래 API는 FE가 직접 호출하지 않는다.

BE, 외부 연동, ML 작업을 이해하기 위한 참고 항목이다.

### A-10-1. 생활 이벤트 수신

```
POST /api/integrations/events/life
```

### A-10-2. 위험 이벤트 수신

```
POST /api/integrations/events/danger
```

### A-10-3. UWB 위치 정보 수신

```
POST /api/integrations/uwb/location
```

### FE 참고

- 이 API들의 결과가 `Alert`, `Event`, `UwbNavigationSession` 형태로 FE에 전달된다.
- FE는 이 API를 구현하거나 직접 호출하지 않는다.

---

---

## A-11. LG ThinQ PAT 등록 API

이 API는 LG ThinQ 실제 연동을 붙일 때 사용하는 후순위 API다. 1차 회원가입/로그인 구현이 끝난 뒤 마지막에 붙이면 된다.

### A-11-1. PAT 등록

```
POST /api/thinq/pat
```

| 항목 | 내용 |
| --- | --- |
| 목적 | 로그인한 사용자의 LG ThinQ PAT를 백엔드에 저장한다. |
| 인증 필요 여부 | 필요함 |
| FE 사용 화면 | 기기 연동 화면, ThinQ 연동 설정 화면 |
| 성공 상태 코드 | `200` 또는 `201` |
| 주요 역할 | 백엔드가 이후 LG ThinQ API를 호출할 수 있게 한다. |

### 요청 헤더

```
Authorization: Bearer <accessToken>
```

### 요청 예시

```json
{
  "patToken": "lg-thinq-personal-access-token"
}
```

### 요청 필드 설명

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `patToken` | string | O | 사용자가 LG ThinQ PAT 발급 페이지에서 발급받은 토큰 |

### 응답 예시

```json
{
  "userId": 1,
  "thinqConnected": true,
  "message": "LG ThinQ PAT가 등록되었습니다."
}
```

### 응답 필드 설명

| 필드 | 설명 |
| --- | --- |
| `userId` | PAT를 등록한 사용자 ID |
| `thinqConnected` | ThinQ 연동 여부 |
| `message` | FE에 보여줄 수 있는 결과 메시지 |

### 주의사항

- PAT는 비밀번호처럼 민감한 값이므로 프론트 코드, GitHub, 노션 공개 페이지에 그대로 올리면 안 된다.
- 백엔드는 PAT를 응답으로 다시 내려주지 않는다.
- 보호자 계정보다는 실제 가전을 소유한 `USER` 계정에 PAT를 연결하는 구조가 자연스럽다.
- PAT API는 LG ThinQ 실제 연동 단계에서 최종 확정한다.

# Part C. 백엔드 우선 구현 순서

지금 바로 백엔드 담당자가 처음 시작한다면 아래 순서가 제일 덜 헷갈린다.

## C-1. 1차 MVP 우선순위

| 순서 | 기능 | API |
| --- | --- | --- |
| 1 | 회원가입 | `POST /api/auth/signup` |
| 2 | 로그인 | `POST /api/auth/login` |
| 3 | 내 정보 조회 | `GET /api/users/me` |
| 4 | 접근성 설정 저장 | `PUT /api/users/me/accessibility` |
| 5 | 홈 요약 조회 | `GET /api/app/home` |
| 6 | 알림 목록 조회 | `GET /api/alerts?type=&status=&limit=20` |
| 7 | 알림 상세 조회 | `GET /api/alerts/{alertId}` |
| 8 | 알림 확인 처리 | `POST /api/alerts/{alertId}/confirm` |
| 9 | 기기 목록 조회 | `GET /api/devices` |
| 10 | 보호자 목록/등록 | `GET /api/guardians`, `POST /api/guardians` |
| 11 | 긴급 요청 생성 | `POST /api/emergency-requests` |
| 12 | 이벤트 이력 조회 | `GET /api/events?from=&to=&type=&page=0&size=20` |
| 13 | UWB 대상/세션 | `GET /api/uwb/targets`, `POST /api/uwb/sessions` |

## C-2. 처음에는 mock 데이터로 해도 되는 것

| 기능 | 이유 |
| --- | --- |
| 기기 연동 | LG ThinQ 실제 연결 전에도 FE 화면 개발 가능 |
| 알림 목록 | 위험/생활/긴급 케이스를 mock으로 만들면 UI 테스트 가능 |
| UWB 거리 | 실제 UWB 없이 거리 값만 바꿔서 시연 가능 |
| 긴급 요청 | 실제 문자/푸시 없이 DB 저장과 응답만으로 시연 가능 |
| 웨어러블 | 앱 API를 같이 쓰고 화면만 분리 가능 |

---

# Part D. 백엔드와 우선 협의할 항목

## D-1. 화면별 명세서 기준 협의 항목

| 우선순위 | 협의 항목 | 산출물 기준 결정값 | 이유 |
| --- | --- | --- | --- |
| 1 | 로그인 역할 | `USER`, `GUARDIAN` | 사용자 앱과 보호자 확인 흐름을 로그인 시점에 분기 |
| 2 | 장애 유형 | `VISUAL`, `HEARING` | 산출물 기준 대상은 시각장애인, 청각장애인 |
| 3 | `GET /api/app/home` 응답 구조 | 홈 요약 API 1개로 우선 구성 | 홈 화면과 시연 첫 화면에 필요 |
| 4 | `safetyStatus.level` 값 목록 | `SAFE`, `CAUTION`, `DANGER`, `EMERGENCY` | 홈 상태 카드와 위험 강조 기준 |
| 5 | 알림 유형 | `LIFE`, `DANGER`, `EMERGENCY`, `LOCATION` | 생활 신호, 위험 신호, 긴급 요청, 위치 안내 구분 |
| 6 | 위험도 값 | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | 위험/긴급 알림 강조 기준 |
| 7 | 알림 실시간성 방식 | MVP는 polling 우선 | WebSocket/SSE 없이도 병렬 개발 가능 |
| 8 | 다시 듣기 방식 | FE Web Speech API 우선 | 백엔드 TTS 없이도 접근성 흐름 시연 가능 |
| 9 | 긴급 요청 실패 사유 코드 | `NO_GUARDIAN`, `DELIVERY_FAILED`, `UNAUTHORIZED`, `SERVER_ERROR` | 보호자 없음, 전송 실패, 권한 없음 처리 |
| 10 | UWB 거리 갱신 방식 | MVP는 polling 우선 | 이후 WebSocket/SSE 확장 가능 |
| 11 | 보호자 권한 정책 | `GUARDIAN` role 로그인 후 연결된 사용자 알림만 조회 | 보호자 화면 접근 범위 명확화 |

## D-2. API 초안 기준 협의 항목

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

---

# Part E. FE mock data 최소 기준

FE는 API 확정 전 아래 데이터 묶음을 mock으로 준비한다.

- `mockUser`
- `mockAccessibilityProfile`
- `mockDevices`
- `mockAlerts`
- `mockGuardians`
- `mockEmergencyRequests`
- `mockEventHistory`
- `mockUwbSession`

## E-1. 알림 mock 최소 필드

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

## E-2. UWB mock 최소 필드

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

---

# Part F. 백엔드 입장에서 필요한 데이터 모델 초안

아래는 API를 구현하려면 DB에 대략 어떤 테이블/객체가 있어야 하는지 감 잡기 위한 초안이다.

## F-1. Account

로그인 계정 자체.

| 필드 | 설명 |
| --- | --- |
| `accountId` | 계정 ID |
| `role` | `USER` 또는 `GUARDIAN` |
| `email` | 로그인 이메일 |
| `password` | 비밀번호. 실제 구현에서는 반드시 암호화 저장 |
| `name` | 이름 |

## F-2. UserProfile

서비스 사용자 프로필.

| 필드 | 설명 |
| --- | --- |
| `userId` | 사용자 ID |
| `accountId` | Account와 연결 |
| `accessibilityType` | `VISUAL` 또는 `HEARING` |
| `notificationPrefs` | 알림/접근성 설정 |
| `guardianLinked` | 보호자 연결 여부 |

## F-3. GuardianProfile

보호자 프로필.

| 필드 | 설명 |
| --- | --- |
| `guardianId` | 보호자 ID |
| `accountId` | Account와 연결 |
| `linkedUserId` | 연결된 사용자 ID |
| `relationship` | 관계 |
| `phone` | 연락처 |

## F-4. Device

연결 기기.

| 필드 | 설명 |
| --- | --- |
| `deviceId` | 기기 ID |
| `userId` | 기기 소유 사용자 ID |
| `name` | 기기명 |
| `type` | 기기 유형 |
| `connectionStatus` | 연결 상태 |
| `locationSupported` | 위치 안내 가능 여부 |
| `lastEventAt` | 마지막 이벤트 시간 |

## F-5. Alert

사용자에게 보여줄 알림.

| 필드 | 설명 |
| --- | --- |
| `alertId` | 알림 ID |
| `userId` | 사용자 ID |
| `deviceId` | 관련 기기 ID |
| `type` | 알림 유형 |
| `severity` | 위험도 |
| `title` | 제목 |
| `message` | 메시지 |
| `voiceGuide` | 음성 안내 문구 |
| `locationName` | 발생 위치 |
| `occurredAt` | 발생 시간 |
| `status` | 확인 상태 |
| `requiresGuardianNotify` | 보호자 알림 필요 여부 |
| `recommendedAction` | 추천 후속 행동 |

## F-6. EventHistory

이력 화면용 이벤트.

| 필드 | 설명 |
| --- | --- |
| `eventId` | 이벤트 ID |
| `alertId` | 연결된 알림 ID |
| `userId` | 사용자 ID |
| `type` | 이벤트 유형 |
| `severity` | 위험도 |
| `title` | 이력 제목 |
| `deviceName` | 기기명 |
| `occurredAt` | 발생 시간 |
| `alertStatus` | 알림 상태 |

## F-7. UwbSession

UWB 탐색 세션.

| 필드 | 설명 |
| --- | --- |
| `sessionId` | 세션 ID |
| `userId` | 사용자 ID |
| `targetDeviceId` | 대상 기기 ID |
| `status` | 탐색 상태 |
| `distanceM` | 거리 |
| `confidence` | 신뢰도 |
| `voiceGuide` | 안내 문구 |
| `vibrationPattern` | 진동 패턴 |
| `updatedAt` | 갱신 시간 |

## F-8. EmergencyRequest

긴급 도움 요청.

| 필드 | 설명 |
| --- | --- |
| `emergencyRequestId` | 긴급 요청 ID |
| `userId` | 사용자 ID |
| `message` | 요청 메시지 |
| `source` | APP 또는 WEARABLE |
| `status` | 전송 상태 |
| `sentAt` | 전송 시간 |

---

# Part G. 초보자용 핵심 용어 정리

| 용어 | 쉽게 말하면 |
| --- | --- |
| API | 프론트와 백엔드가 데이터를 주고받는 약속된 주소 |
| Endpoint | API 주소 하나. 예: `POST /api/auth/login` |
| Method | API 요청 방식. `GET`, `POST`, `PUT`, `DELETE` |
| GET | 데이터를 가져올 때 사용 |
| POST | 새 데이터를 만들거나 액션을 실행할 때 사용 |
| PUT | 기존 데이터를 수정할 때 사용 |
| DELETE | 데이터를 삭제할 때 사용 |
| Request | 프론트가 백엔드에 보내는 값 |
| Response | 백엔드가 프론트에 돌려주는 값 |
| JSON | 프론트-백엔드가 주고받는 데이터 형식 |
| Header | 요청에 붙이는 추가 정보. 로그인 토큰 등을 넣음 |
| Body | 요청의 본문. 회원가입 정보 같은 실제 데이터를 넣음 |
| Query parameter | URL 뒤에 붙는 조건값. 예: `?type=DANGER&limit=20` |
| Path variable | URL 중간에 들어가는 값. 예: `/api/alerts/{alertId}` |
| accessToken | 로그인 성공 후 받는 로그인 증표 |
| JWT | accessToken 방식 중 하나 |
| role | USER인지 GUARDIAN인지 구분하는 값 |
| Enum | 정해진 문자열 값 목록 |
| polling | 일정 시간마다 계속 API를 호출해서 새 데이터가 있는지 확인하는 방식 |
| WebSocket/SSE | 서버가 실시간으로 프론트에 데이터를 밀어주는 방식 |
| mock data | 백엔드 완성 전 프론트가 임시로 쓰는 가짜 데이터 |

---