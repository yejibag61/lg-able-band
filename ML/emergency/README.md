# LG Able Band SOS/긴급 도움 요청 AI

SOS 버튼 입력, 낙상 감지, 장시간 무활동, 위험 상황 후 무응답, 앱 수동 요청을 룰 기반으로 판단하는 독립 FastAPI 서버입니다.

이 서버는 기존 ML/FE/BE 서버 및 연동 코드를 수정하지 않으며, 별도 포트에서 독립 실행됩니다. 백엔드 연동 코드는 포함하지 않습니다.

## 설치 및 실행

프로젝트 루트에서 다음 명령을 실행합니다.

```bash
pip install -r ML/emergency/requirements.txt
python ML/emergency/server.py
```

기본 주소는 `http://127.0.0.1:8002`입니다. 포트를 변경하려면 `EMERGENCY_PORT` 환경변수만 사용합니다.

```powershell
$env:EMERGENCY_PORT = "8002"
python ML/emergency/server.py
```

## Health Check

```http
GET http://127.0.0.1:8002/health
```

응답 예시:

```json
{
  "service": "lg-able-band-emergency-ai-server",
  "status": "running",
  "port": 8002,
  "message": "LG Able Band emergency AI server is running."
}
```

## SOS/긴급 도움 요청 판단

향후 백엔드 연동 시 사용할 endpoint:

```http
POST http://127.0.0.1:8002/api/ai/judge-emergency
Content-Type: application/json
```

요청 예시:

```json
{
  "userId": 1,
  "source": "WEARABLE",
  "triggerType": "SOS_BUTTON",
  "pressCount": 3,
  "riskLevel": "CRITICAL",
  "riskScore": 100,
  "location": "LIVING_ROOM",
  "userResponse": "NO_RESPONSE",
  "message": "도움이 필요합니다."
}
```

응답 예시:

```json
{
  "emergencyLevel": "CRITICAL",
  "emergencyStatus": "SENT",
  "notifyGuardian": true,
  "callGuardian": true,
  "saveEventHistory": true,
  "alertType": "EMERGENCY",
  "message": "SOS 버튼 입력으로 긴급 도움 요청이 발생했습니다. 보호자에게 즉시 알림을 전송합니다.",
  "recommendedChannels": [
    "GUARDIAN_PUSH",
    "GUARDIAN_CALL",
    "BAND_VIBRATION",
    "APP_SCREEN"
  ],
  "vibrationPattern": "SOS_REPEAT",
  "screenMode": "EMERGENCY_FULL_SCREEN"
}
```

모든 요청 필드는 선택 사항입니다. 문자열 입력은 내부에서 대문자로 정규화하며, 정보가 부족하면 기본 상태 확인 결과를 반환합니다. CORS는 향후 연동을 위해 전체 허용되어 있습니다.
