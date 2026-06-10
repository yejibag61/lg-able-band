# LG Able Band 알림 방식 추천 AI

## 기능 설명

상황 위험도 판단 AI 결과와 사용자 접근성 유형을 입력받아 사용자에게 적합한 알림 채널, 진동 패턴, 화면 모드, 음성 안내 여부, 보호자 알림 및 에스컬레이션 여부를 추천하는 독립 FastAPI 서버다.

- 위치: `ML/warning`
- 기본 주소: `http://127.0.0.1:8001`
- 환경변수: `WARNING_PORT`
- 기존 `ML`, `ML/context`, FE, BE, DB 코드 및 설정을 수정하지 않는다.
- ThinQ API와 DB에 직접 접근하지 않는다.
- 실제 알림 발송과 보호자 설정 확인은 백엔드가 담당한다.

## 설치 및 실행

프로젝트 루트에서:

```powershell
pip install -r ML/warning/requirements.txt
python ML/warning/server.py
```

또는:

```powershell
cd ML/warning
pip install -r requirements.txt
uvicorn server:app --host 127.0.0.1 --port 8001 --reload
```

환경변수 사용:

```powershell
$env:WARNING_PORT="8001"
python ML/warning/server.py
```

## Health Check

```http
GET http://127.0.0.1:8001/health
```

응답:

```json
{
  "service": "lg-able-band-warning-ai-server",
  "status": "running",
  "port": 8001,
  "message": "LG Able Band warning recommendation AI server is running."
}
```

## 더미 데이터 테스트

가장 간단한 테스트 방법:

```powershell
python ML/warning/test_requests.py
```

`test_requests.py`는 `8001` 서버가 꺼져 있으면 자동으로 시작하고, 테스트 완료 후 자동 종료한다.

서버를 직접 실행한 상태에서 테스트하려면 터미널 1:

```powershell
python ML/warning/server.py
```

터미널 2:

```powershell
python ML/warning/test_requests.py
```

다음 시나리오를 순서대로 요청하고 요청 JSON, 응답 JSON, PASS/FAIL을 출력한다.

- 청각장애 사용자 고위험 무응답
- 시각장애 사용자 생활 알림
- 시청각장애 사용자 주의 알림
- 긴급 상황
- UWB 위치 안내
- 필드가 없는 기본 요청

모든 테스트가 성공하면 마지막에 다음 결과가 출력된다.

```text
테스트 결과: 6/6 PASS
```

`start-all.bat`는 기존 ML/FE/BE 서버만 실행하며 독립 warning 서버는 실행하지 않는다. 이는 기존 실행 구조를 수정하지 않기 위한 의도된 동작이다.

## 알림 추천 API

```http
POST http://127.0.0.1:8001/api/ai/recommend-warning
Content-Type: application/json
```

요청 예시:

```json
{
  "userId": 1,
  "accessibilityType": "HEARING",
  "category": "DANGER",
  "riskLevel": "HIGH",
  "riskScore": 85,
  "deviceType": "RANGE",
  "eventType": "LONG_ON",
  "location": "주방",
  "userResponse": "NO_RESPONSE"
}
```

응답 예시:

```json
{
  "recommendedChannels": [
    "BAND_VIBRATION",
    "BAND_SCREEN",
    "APP_SCREEN",
    "TV_POPUP",
    "THINQ_ON_LIGHT",
    "GUARDIAN_PUSH"
  ],
  "vibrationPattern": "STRONG_REPEAT",
  "screenMode": "HIGH_CONTRAST_LARGE_TEXT",
  "voiceEnabled": false,
  "notifyGuardian": true,
  "escalationRequired": true,
  "message": "청각장애 사용자에게 위험 상황을 진동, 화면, 조명 중심으로 전달합니다."
}
```

모든 요청 필드는 Optional이다. 값이 누락되면 다음 기본값을 적용한다.

- `accessibilityType`: `NONE`
- `category`: `LIFE`
- `riskLevel`: `riskScore` 기준 계산, 점수도 없으면 `LOW`
- `riskScore`: `0`
- `userResponse`: `UNKNOWN`

## FE-BE 앱 명세 반영

앱 명세의 공통 Enum을 신규 백엔드 연동의 우선값으로 사용한다.

| 앱 명세 값 | 추천 AI 내부 처리 |
|---|---|
| `VISUAL` | `VISUALLY_IMPAIRED` |
| `HEARING` | `HEARING_IMPAIRED` |
| `LIFE`, `DANGER`, `EMERGENCY`, `LOCATION` | `category`로 직접 사용 |
| `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | `riskLevel`로 직접 사용 |
| `WASHER`, `REFRIGERATOR`, `AIR_SENSOR`, `TV`, `RANGE`, `DOOR_SENSOR`, `WEARABLE`, `UWB_TAG` | `deviceType`로 직접 사용 |

기존 또는 다른 AI의 값도 호환한다.

- 접근성: `VISUAL_IMPAIRMENT`, `HEARING_IMPAIRMENT`, `DEAFBLIND`
- 접근성 추천 AI 원본 값: `VISUALLY_IMPAIRED`, `HEARING_IMPAIRED`, `DEAF_BLIND`, `NONE`
- 위험 단계: `NORMAL`, `WARNING`, `DANGER`, `EMERGENCY`, `낮음`, `주의`, `위험`, `긴급`
- 카테고리: `생활편의`, `상태확인`, `안전`, `긴급`

## 백엔드 연동 요청사항

현재는 백엔드 코드를 수정하지 않는다. 백엔드 연동 단계에서 아래 흐름을 구현해달라고 요청한다.

```text
외부 이벤트
→ 상황 위험도 판단 AI: POST http://127.0.0.1:8000/api/ai/judge-event
→ 알림 방식 추천 AI: POST http://127.0.0.1:8001/api/ai/recommend-warning
→ Alert / EventHistory 저장
→ 앱 / 웨어러블 / TV / ThinQ ON / 보호자 전달
```

### 상황 판단 AI 응답에서 추천 AI 요청으로 매핑

| 추천 AI 요청 필드 | 값 출처 |
|---|---|
| `userId` | 원본 이벤트 `userId` |
| `accessibilityType` | 사용자 프로필 `accessibilityType` (`VISUAL`, `HEARING`) |
| `category` | 상황 판단 AI `alertType` 우선, 또는 백엔드 이벤트 분류 |
| `riskLevel` | 상황 판단 AI `severity` 우선 |
| `riskScore` | 상황 판단 AI `riskScore` |
| `deviceType` | 원본 이벤트의 앱 명세 DeviceType |
| `eventType` | 원본 이벤트 `eventType` |
| `location` | 원본 이벤트 `locationName` |
| `userResponse` | 원본 이벤트 또는 알림 확인 상태 |

상황 판단 AI의 앱 명세 기준 응답은 다음처럼 그대로 사용할 수 있다.

```json
{
  "alertType": "DANGER",
  "severity": "HIGH",
  "riskScore": 82
}
```

추천 AI 요청:

```json
{
  "userId": 1,
  "accessibilityType": "HEARING",
  "category": "DANGER",
  "riskLevel": "HIGH",
  "riskScore": 82,
  "deviceType": "RANGE",
  "eventType": "LONG_ON",
  "location": "주방",
  "userResponse": "NO_RESPONSE"
}
```

### FE-BE 명세 API와 연결 지점

백엔드 연동 시 FE-BE 앱 명세의 다음 API 흐름을 기준으로 연결한다.

| 앱 명세 API | 추천 AI 연동 시 백엔드 역할 |
|---|---|
| `GET /api/users/me` | 사용자 `accessibilityType`, `notificationPrefs`, `guardianLinked` 확인 |
| `POST /api/integrations/events/life` | 생활 이벤트를 상황 판단 AI와 추천 AI에 전달 |
| `POST /api/integrations/events/danger` | 위험 이벤트를 상황 판단 AI와 추천 AI에 전달 |
| `GET /api/guardians` | 실제 보호자 발송 전 `notifyOnDanger`, 연결 상태 확인 |
| `GET /api/alerts` | AI 처리 후 저장된 Alert를 앱·웨어러블에 제공 |
| `GET /api/alerts/{alertId}` | 추천 채널, 음성 안내, 후속 행동을 포함한 상세 알림 제공 |
| `POST /api/alerts/{alertId}/confirm` | 사용자 응답을 기록하고 `NO_RESPONSE` 에스컬레이션 중단 |
| `GET /api/events` | 처리된 이벤트와 알림 이력 제공 |

추천 AI는 위 API를 직접 호출하지 않는다. 백엔드가 해당 API 처리 과정에서 필요한 데이터를 조회하고 AI를 호출한 뒤 결과를 저장해야 한다.

### 추천 결과 처리 요청

| 추천 AI 응답 필드 | 백엔드 처리 |
|---|---|
| `recommendedChannels` | 채널별 알림 실행 대상을 결정 |
| `vibrationPattern` | 웨어러블 진동 명령으로 변환 |
| `screenMode` | 앱·웨어러블·TV 화면 표현 방식 결정 |
| `voiceEnabled` | 음성 안내 실행 여부 결정 |
| `notifyGuardian` | 보호자 알림 권고 여부 |
| `escalationRequired` | 무응답 또는 고위험 에스컬레이션 처리 |
| `message` | 추천 이유 로그 또는 운영 확인 정보로 사용 |

`notifyGuardian`은 실제 발송 명령이 아니라 권고값이다. 백엔드는 FE-BE 명세에 따라 다음을 확인한 뒤 실제 발송해야 한다.

1. 사용자의 `guardianLinked`
2. 보호자의 `notifyOnDanger`
3. 보호자 연결 상태
4. 이미 같은 알림을 발송했는지 여부

### recommendedChannels 처리

| 채널 | 백엔드 역할 |
|---|---|
| `BAND_VIBRATION` | 웨어러블 진동 |
| `BAND_SCREEN` | 웨어러블 화면 |
| `APP_SCREEN` | 앱 알림 및 화면 |
| `APP_VOICE` | 앱 음성 안내 또는 FE Web Speech API 사용 |
| `TV_POPUP` | TV 팝업 |
| `THINQ_ON_LIGHT` | ThinQ ON 조명 출력 |
| `GUARDIAN_PUSH` | 보호자 푸시 |
| `GUARDIAN_CALL` | 보호자 전화 요청. 실제 통화 연동 전에는 상태 기록 또는 mock 처리 |

### Alert 및 EventHistory 저장

기존 상황 판단 AI 결과로 Alert의 `type`, `severity`, `title`, `message`, `voiceGuide`, `requiresGuardianNotify`, `recommendedAction`을 구성한다. 알림 방식 추천 AI 결과는 Alert 전달 및 표현 메타데이터로 사용한다.

백엔드 데이터 모델에 필드가 없다면 다음 값을 JSON 메타데이터 또는 별도 전달 이력으로 저장하는 방식을 협의한다.

- `recommendedChannels`
- `vibrationPattern`
- `screenMode`
- `voiceEnabled`
- `escalationRequired`

### 백엔드 구현 시 주의사항

- AI 서버 주소를 하드코딩하지 말고 환경별 설정으로 관리한다.
- 상황 판단 AI 기본 포트는 `8000`, 알림 추천 AI 기본 포트는 `8001`이다.
- 추천 AI 호출 실패가 Alert 저장 실패로 이어지지 않도록 한다.
- 연결 타임아웃 2초, 응답 타임아웃 5초를 권장한다.
- 추천 AI 실패 시 사용자 `notificationPrefs.channels`를 이용한 기본 알림 방식을 적용한다.
- `NO_RESPONSE` 재평가 및 에스컬레이션 시 같은 보호자 알림이 중복 발송되지 않게 처리한다.
- 앱 명세의 `VISUAL`, `HEARING`, `LIFE`, `DANGER`, `EMERGENCY`, `LOCATION`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` Enum을 우선 사용한다.

## 추천 규칙 요약

### 접근성 유형

- `HEARING`: 진동, 화면, 조명 중심. 음성 비활성.
- `VISUAL`: 음성, 진동 중심.
- `DEAF_BLIND`: 강한 진동과 보호자 알림 중심.
- `NONE`: 기본 진동과 앱 화면 중심.

### 위험도

- `LOW`: `BASIC_SHORT`, 에스컬레이션 없음.
- `MEDIUM`: `BASIC_REPEAT`, 앱 화면 추가.
- `HIGH`: `STRONG_REPEAT`, TV·ThinQ ON·보호자 알림.
- `CRITICAL`: `SOS_REPEAT`, 긴급 전체 화면, 보호자 푸시·전화.

### 카테고리

- `LIFE`: 고위험이 아니면 보호자 알림 없음.
- `DANGER`: `HIGH` 이상이면 보호자 알림.
- `EMERGENCY`: 항상 보호자 알림과 에스컬레이션.
- `LOCATION`: 웨어러블 및 앱 위치 안내 중심.
