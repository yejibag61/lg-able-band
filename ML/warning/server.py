"""Independent LG Able Band notification method recommendation AI server."""

import os
from typing import List, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


HOST = "127.0.0.1"
PORT = int(os.environ.get("WARNING_PORT", "8001"))

app = FastAPI(
    title="LG Able Band Warning Recommendation AI Server",
    description="Recommends accessible notification methods without accessing the DB or ThinQ APIs.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WarningRequest(BaseModel):
    userId: Optional[int] = None
    accessibilityType: Optional[str] = None
    category: Optional[str] = None
    riskLevel: Optional[str] = None
    riskScore: Optional[int] = None
    deviceType: Optional[str] = None
    eventType: Optional[str] = None
    location: Optional[str] = None
    userResponse: Optional[str] = None


class WarningResponse(BaseModel):
    recommendedChannels: List[str]
    vibrationPattern: str
    screenMode: str
    voiceEnabled: bool
    notifyGuardian: bool
    escalationRequired: bool
    message: str


ACCESSIBILITY_ALIASES = {
    # FE-BE app specification values
    "VISUAL": "VISUALLY_IMPAIRED",
    "HEARING": "HEARING_IMPAIRED",
    # Situation judgment AI compatibility values
    "VISUAL_IMPAIRMENT": "VISUALLY_IMPAIRED",
    "HEARING_IMPAIRMENT": "HEARING_IMPAIRED",
    "DEAFBLIND": "DEAF_BLIND",
}

CATEGORY_ALIASES = {
    # Situation judgment AI category and alertType compatibility values
    "생활편의": "LIFE",
    "상태확인": "LIFE",
    "안전": "DANGER",
    "긴급": "EMERGENCY",
    "NORMAL": "LIFE",
}

RISK_ALIASES = {
    # Situation judgment AI severity, judgmentLevel, and Korean riskLevel values
    "낮음": "LOW",
    "주의": "MEDIUM",
    "위험": "HIGH",
    "긴급": "CRITICAL",
    "NORMAL": "LOW",
    "WARNING": "MEDIUM",
    "DANGER": "HIGH",
    "EMERGENCY": "CRITICAL",
}


def normalize(value: Optional[str], default: str) -> str:
    return value.strip().upper() if value else default


def normalize_accessibility(value: Optional[str]) -> str:
    normalized = normalize(value, "NONE")
    return ACCESSIBILITY_ALIASES.get(normalized, normalized)


def normalize_category(value: Optional[str]) -> str:
    normalized = normalize(value, "LIFE")
    return CATEGORY_ALIASES.get(normalized, normalized)


def normalize_risk(value: Optional[str], risk_score: Optional[int]) -> str:
    normalized = normalize(value, "")
    if normalized:
        return RISK_ALIASES.get(normalized, normalized)
    score = risk_score or 0
    if score >= 90:
        return "CRITICAL"
    if score >= 70:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def add_channels(channels: List[str], *new_channels: str) -> None:
    for channel in new_channels:
        if channel not in channels:
            channels.append(channel)


def recommend_warning(request: WarningRequest) -> WarningResponse:
    accessibility = normalize_accessibility(request.accessibilityType)
    category = normalize_category(request.category)
    risk_level = normalize_risk(request.riskLevel, request.riskScore)
    user_response = normalize(request.userResponse, "UNKNOWN")

    if accessibility == "HEARING_IMPAIRED":
        channels = ["BAND_VIBRATION", "BAND_SCREEN", "APP_SCREEN"]
        voice_enabled = False
        screen_mode = "HIGH_CONTRAST_LARGE_TEXT"
        message = "청각장애 사용자에게 위험 상황을 진동, 화면, 조명 중심으로 전달합니다."
    elif accessibility == "VISUALLY_IMPAIRED":
        channels = ["BAND_VIBRATION", "APP_VOICE"]
        voice_enabled = True
        screen_mode = "SIMPLE_TEXT"
        message = "시각장애 사용자에게 음성 안내와 진동 중심으로 전달합니다."
    elif accessibility == "DEAF_BLIND":
        channels = ["BAND_VIBRATION", "BAND_SCREEN", "APP_SCREEN"]
        voice_enabled = False
        screen_mode = "HIGH_CONTRAST_LARGE_TEXT"
        message = "시청각장애 사용자에게 강한 진동과 보호자 알림 중심으로 전달합니다."
    else:
        channels = ["BAND_VIBRATION", "APP_SCREEN"]
        voice_enabled = False
        screen_mode = "LARGE_TEXT"
        message = "기본 알림 방식으로 상황을 전달합니다."

    notify_guardian = accessibility == "DEAF_BLIND"
    escalation_required = False

    if risk_level == "CRITICAL":
        vibration_pattern = "SOS_REPEAT"
        screen_mode = "EMERGENCY_FULL_SCREEN"
        notify_guardian = True
        escalation_required = True
        add_channels(channels, "GUARDIAN_PUSH", "GUARDIAN_CALL", "TV_POPUP", "THINQ_ON_LIGHT")
    elif risk_level == "HIGH":
        vibration_pattern = "STRONG_REPEAT"
        notify_guardian = True
        escalation_required = True
        add_channels(channels, "TV_POPUP", "THINQ_ON_LIGHT")
    elif risk_level == "MEDIUM":
        vibration_pattern = "BASIC_REPEAT"
        add_channels(channels, "APP_SCREEN")
    else:
        vibration_pattern = "BASIC_SHORT"

    if user_response == "NO_RESPONSE" and risk_level in {"HIGH", "CRITICAL"}:
        notify_guardian = True
        escalation_required = True
        add_channels(channels, "GUARDIAN_PUSH")

    if category == "EMERGENCY":
        notify_guardian = True
        escalation_required = True
        vibration_pattern = "SOS_REPEAT"
        screen_mode = "EMERGENCY_FULL_SCREEN"
        add_channels(channels, "GUARDIAN_PUSH")
    elif category == "LIFE" and risk_level not in {"HIGH", "CRITICAL"}:
        notify_guardian = accessibility == "DEAF_BLIND"
    elif category == "LOCATION":
        add_channels(channels, "BAND_VIBRATION", "BAND_SCREEN", "APP_SCREEN")

    if notify_guardian:
        add_channels(channels, "GUARDIAN_PUSH")

    return WarningResponse(
        recommendedChannels=channels,
        vibrationPattern=vibration_pattern,
        screenMode=screen_mode,
        voiceEnabled=voice_enabled,
        notifyGuardian=notify_guardian,
        escalationRequired=escalation_required,
        message=message,
    )


@app.get("/")
@app.get("/health")
def health():
    return {
        "service": "lg-able-band-warning-ai-server",
        "status": "running",
        "port": PORT,
        "message": "LG Able Band warning recommendation AI server is running.",
    }


@app.post("/api/ai/recommend-warning", response_model=WarningResponse)
def recommend_warning_endpoint(request: WarningRequest) -> WarningResponse:
    return recommend_warning(request)


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
