# Wearable Integration Guide

This guide explains how a wearable, FE app, or BE service can connect to
`ML/sound_chatbot`.

## Current Responsibility

`ML/sound_chatbot` receives user speech text and returns a chatbot response.

It does not record microphone audio, run STT, or play TTS audio by itself.

```text
wearable microphone
-> STT
-> POST /api/ai/voice-chat
-> chatbot response
-> TTS
-> wearable speaker
```

## Run The Chatbot Server

```powershell
cd ML/sound_chatbot
python server.py
```

Default URL:

```text
http://127.0.0.1:8002
```

## Health Check

```http
GET http://127.0.0.1:8002/health
```

Expected response:

```json
{
  "service": "lg-able-band-user-voice-chatbot",
  "status": "running",
  "port": 8002,
  "message": "LG Able Band user voice chatbot server is running."
}
```

## Chat API

```http
POST http://127.0.0.1:8002/api/ai/voice-chat
Content-Type: application/json
```

### Request

The wearable or FE should send STT result text in `text`.

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
    "devices": {
      "washer": {
        "status": "RUNNING",
        "remainingMinutes": 12
      }
    }
  }
}
```

### Response

The wearable should read `voiceText` through TTS.

```json
{
  "sessionId": "wearable-001",
  "intent": "WASHER_TIME_CHECK",
  "deviceType": "WASHER",
  "answerText": "세탁이 약 12분 남았어요.",
  "voiceText": "세탁이 약 12분 남았어요.",
  "action": "READ_DEVICE_STATUS",
  "quickReplies": [
    "미확인 알림 있어?",
    "위험 알림 있어?",
    "세탁기 몇 분 남았어?"
  ],
  "needsBackendAction": false,
  "backendAction": null,
  "confidence": 0.9,
  "createdAt": "2026-06-10T10:00:00+00:00"
}
```

## Backend Action Handling

When `needsBackendAction` is `true`, BE should process `backendAction`.

Example:

```json
{
  "intent": "NOTIFY_GUARDIAN",
  "needsBackendAction": true,
  "backendAction": {
    "type": "GUARDIAN_NOTIFICATION",
    "message": "보호자한테 알려줘"
  }
}
```

Recommended BE behavior:

1. Check whether the user has a linked guardian.
2. Check guardian notification settings.
3. Create alert or event history if needed.
4. Send push, call request, or app notification.
5. Return success or failure to the wearable/FE.

## STT/TTS Connection Points

### STT

STT can be implemented in the wearable, FE app, or BE.

Required output:

```json
{
  "text": "위험 알림 있어?"
}
```

### TTS

TTS should read:

```json
{
  "voiceText": "현재 위험 알림은 없어요."
}
```

## MVP Test Sentences

- 미확인 알림 있어?
- 위험 알림 있어?
- 최근 알림 읽어줘
- 방금 알림 다시 말해줘
- 세탁기 몇 분 남았어?
- 냉장고 문 열려 있어?
- 공기질 괜찮아?
- 인덕션 켜져 있어?
- 현관문 열려 있어?
- 보호자한테 알려줘

## Notes For Demo

For a local demo, STT can be mocked by typing text into a test UI or CLI.
The important integration contract is that the chatbot receives the recognized
text and returns `voiceText`.
