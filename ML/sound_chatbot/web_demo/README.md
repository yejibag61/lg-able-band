# Sound Chatbot Web Demo

This page tests the same flow that will later run on the wearable:

```text
browser microphone -> browser STT -> sound_chatbot API -> browser TTS
```

## Run

Start the chatbot server:

```powershell
cd ML/sound_chatbot
python server.py
```

Then open `web_demo/index.html` in a browser.

Chrome is recommended because Web Speech API support is best there.

## Test Sentences

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

## Notes

- The page uses demo context data in `app.js`.
- The chatbot server still owns intent detection and answer generation.
- The browser owns STT and TTS only for demo purposes.
