# LG Able Band User Voice Chatbot

This ML service is for conversation with the wearable user.

It does not detect environmental sounds such as doorbells, sirens, broadcasts,
glass breaking, or screams. That responsibility stays in `ML/sound_event_detection`.

## Scope

- User speech text from STT
- Simple conversation
- Status check
- Alert explanation
- Guardian contact request
- Emergency help request
- TTS-ready response text

## Location

- Environmental sound detection: `ML/sound_event_detection`
- User conversation chatbot: `ML/sound_chatbot`
- BE, FE, `ML/context`, and `ML/warning` are not modified.

## Run

```powershell
cd ML/sound_chatbot
pip install -r requirements.txt
python server.py
```

Default endpoints:

- Health: `GET http://127.0.0.1:8002/health`
- Swagger: `http://127.0.0.1:8002/docs`
- Chat: `POST http://127.0.0.1:8002/api/ai/voice-chat`

## Request Example

```json
{
  "sessionId": "wearable-001",
  "text": "보호자에게 연락해줘",
  "language": "ko-KR",
  "user": {
    "userId": 1,
    "name": "민수",
    "accessibilityType": "VISUAL",
    "guardianLinked": true
  },
  "context": {
    "batteryLevel": 82,
    "location": "거실",
    "safetyStatusLevel": "SAFE"
  }
}
```

## Response Example

```json
{
  "sessionId": "wearable-001",
  "intent": "CONTACT_GUARDIAN",
  "answerText": "보호자에게 현재 상황을 알릴게요.",
  "voiceText": "보호자에게 현재 상황을 알릴게요.",
  "action": "NOTIFY_GUARDIAN",
  "quickReplies": ["보호자 연락", "취소"],
  "needsBackendAction": true,
  "backendAction": {
    "type": "GUARDIAN_NOTIFICATION",
    "message": "보호자에게 연락해줘"
  },
  "confidence": 0.9,
  "createdAt": "2026-06-10T09:00:00+00:00"
}
```

## Test

```powershell
cd ML/sound_chatbot
python test_requests.py
```

## Local Client Demo

Run the server first:

```powershell
python server.py
```

Then open another terminal:

```powershell
python sample_client.py
```

Type a sentence such as `세탁기 몇 분 남았어?` and check the returned
`voiceText`.

## Browser Voice Demo

Run the server:

```powershell
python server.py
```

Then open:

```text
ML/sound_chatbot/web_demo/index.html
```

The browser demo uses microphone STT, calls the chatbot API, and reads
`voiceText` through browser TTS.

## Later Extensions

- Connect real STT and pass recognized text into `text` or `transcript`.
- Connect TTS and read `voiceText`.
- Replace rule-based intent detection with an LLM or trained intent model.
- Let BE process `backendAction` when `needsBackendAction` is `true`.
