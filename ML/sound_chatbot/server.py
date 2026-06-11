"""LG Able Band user voice chatbot server."""

import os
from typing import Any, Dict

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from intent_rules import detect_intent
from responses import build_response, request_text
from schemas import ChatRequest, ChatResponse


HOST = "127.0.0.1"
PORT = int(os.environ.get("SOUND_CHATBOT_PORT", "8002"))

app = FastAPI(
    title="LG Able Band User Voice Chatbot AI Server",
    description="Keyword and question-pattern chatbot for wearable user speech.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "service": "lg-able-band-user-voice-chatbot",
        "status": "running",
        "port": PORT,
        "message": "LG Able Band user voice chatbot server is running.",
    }


@app.post("/api/ai/voice-chat", response_model=ChatResponse)
def voice_chat(request: ChatRequest) -> ChatResponse:
    match = detect_intent(request_text(request), request.intentHint)
    return build_response(request, match)


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
