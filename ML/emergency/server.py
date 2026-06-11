"""Independent LG Able Band SOS and emergency judgment AI server."""

import os
from typing import List, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


HOST = "127.0.0.1"
PORT = int(os.environ.get("EMERGENCY_PORT", "8003"))

app = FastAPI(
    title="LG Able Band Emergency AI Server",
    description="Rule-based SOS and emergency judgment server.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EmergencyRequest(BaseModel):
    userId: Optional[int] = None
    source: Optional[str] = None
    triggerType: Optional[str] = None
    pressCount: Optional[int] = None
    riskLevel: Optional[str] = None
    riskScore: Optional[int] = None
    location: Optional[str] = None
    userResponse: Optional[str] = None
    message: Optional[str] = None


class EmergencyResponse(BaseModel):
    emergencyLevel: str
    emergencyStatus: str
    notifyGuardian: bool
    callGuardian: bool
    saveEventHistory: bool
    alertType: str
    message: str
    recommendedChannels: List[str]
    vibrationPattern: str
    screenMode: str


def normalize(value: Optional[str], default: str) -> str:
    return value.strip().upper() if value and value.strip() else default


def add_channels(channels: List[str], *new_channels: str) -> None:
    for channel in new_channels:
        if channel not in channels:
            channels.append(channel)


def judge_emergency(request: EmergencyRequest) -> EmergencyResponse:
    source = normalize(request.source, "AI")
    trigger_type = normalize(request.triggerType, "UNKNOWN")
    risk_level = normalize(request.riskLevel, "LOW")
    user_response = normalize(request.userResponse, "UNKNOWN")
    press_count = request.pressCount if request.pressCount is not None else 0

    result = EmergencyResponse(
        emergencyLevel="NONE",
        emergencyStatus="NONE",
        notifyGuardian=False,
        callGuardian=False,
        saveEventHistory=True,
        alertType="LIFE",
        message="긴급 상황으로 판단되지 않았습니다. 기본 상태 확인 알림을 제공합니다.",
        recommendedChannels=["BAND_VIBRATION", "APP_SCREEN"],
        vibrationPattern="BASIC_SHORT",
        screenMode="SIMPLE_TEXT",
    )

    if trigger_type == "SOS_BUTTON" and press_count >= 3:
        result = EmergencyResponse(
            emergencyLevel="CRITICAL",
            emergencyStatus="SENT",
            notifyGuardian=True,
            callGuardian=True,
            saveEventHistory=True,
            alertType="EMERGENCY",
            message="SOS 버튼 입력으로 긴급 도움 요청이 발생했습니다. 보호자에게 즉시 알림을 전송합니다.",
            recommendedChannels=["GUARDIAN_PUSH", "GUARDIAN_CALL", "BAND_VIBRATION", "APP_SCREEN"],
            vibrationPattern="SOS_REPEAT",
            screenMode="EMERGENCY_FULL_SCREEN",
        )
    elif trigger_type == "SOS_BUTTON" and 1 <= press_count < 3:
        result = EmergencyResponse(
            emergencyLevel="WATCH",
            emergencyStatus="PENDING_CONFIRMATION",
            notifyGuardian=False,
            callGuardian=False,
            saveEventHistory=True,
            alertType="DANGER",
            message="SOS 입력이 감지되었습니다. 긴급 요청 여부를 확인합니다.",
            recommendedChannels=["BAND_VIBRATION", "BAND_SCREEN", "APP_SCREEN"],
            vibrationPattern="BASIC_REPEAT",
            screenMode="LARGE_TEXT",
        )
    elif trigger_type == "FALL_DETECTED" and user_response == "NO_RESPONSE":
        result = EmergencyResponse(
            emergencyLevel="CRITICAL",
            emergencyStatus="SENT",
            notifyGuardian=True,
            callGuardian=True,
            saveEventHistory=True,
            alertType="EMERGENCY",
            message="낙상 감지 후 사용자 응답이 없습니다. 보호자에게 긴급 알림을 전송합니다.",
            recommendedChannels=["GUARDIAN_PUSH", "GUARDIAN_CALL", "BAND_VIBRATION", "APP_SCREEN", "TV_POPUP"],
            vibrationPattern="SOS_REPEAT",
            screenMode="EMERGENCY_FULL_SCREEN",
        )
    elif trigger_type == "FALL_DETECTED" and user_response == "RESPONDED":
        result = EmergencyResponse(
            emergencyLevel="WARNING",
            emergencyStatus="WATCHING",
            notifyGuardian=False,
            callGuardian=False,
            saveEventHistory=True,
            alertType="DANGER",
            message="낙상이 감지되었지만 사용자가 응답했습니다. 상태를 확인합니다.",
            recommendedChannels=["BAND_VIBRATION", "BAND_SCREEN", "APP_SCREEN"],
            vibrationPattern="STRONG_REPEAT",
            screenMode="HIGH_CONTRAST_LARGE_TEXT",
        )
    elif trigger_type == "INACTIVITY" and user_response == "NO_RESPONSE":
        result = EmergencyResponse(
            emergencyLevel="HIGH",
            emergencyStatus="ESCALATED",
            notifyGuardian=True,
            callGuardian=False,
            saveEventHistory=True,
            alertType="EMERGENCY",
            message="장시간 무활동과 무응답이 감지되어 보호자 확인이 필요합니다.",
            recommendedChannels=["GUARDIAN_PUSH", "BAND_VIBRATION", "APP_SCREEN"],
            vibrationPattern="STRONG_REPEAT",
            screenMode="HIGH_CONTRAST_LARGE_TEXT",
        )
    elif trigger_type == "INACTIVITY" and user_response in {"RESPONDED", "UNKNOWN"}:
        result = EmergencyResponse(
            emergencyLevel="WATCH",
            emergencyStatus="WATCHING",
            notifyGuardian=False,
            callGuardian=False,
            saveEventHistory=True,
            alertType="DANGER",
            message="장시간 무활동이 감지되어 사용자 상태를 확인합니다.",
            recommendedChannels=["BAND_VIBRATION", "APP_SCREEN"],
            vibrationPattern="BASIC_REPEAT",
            screenMode="LARGE_TEXT",
        )
    elif (
        trigger_type == "DANGER_ESCALATED"
        and risk_level in {"HIGH", "CRITICAL"}
        and user_response == "NO_RESPONSE"
    ):
        result = EmergencyResponse(
            emergencyLevel="CRITICAL",
            emergencyStatus="ESCALATED",
            notifyGuardian=True,
            callGuardian=True,
            saveEventHistory=True,
            alertType="EMERGENCY",
            message="위험 상황 이후 사용자 응답이 없어 긴급 단계로 상승 처리합니다.",
            recommendedChannels=[
                "GUARDIAN_PUSH",
                "GUARDIAN_CALL",
                "BAND_VIBRATION",
                "APP_SCREEN",
                "TV_POPUP",
                "THINQ_ON_LIGHT",
            ],
            vibrationPattern="SOS_REPEAT",
            screenMode="EMERGENCY_FULL_SCREEN",
        )
    elif trigger_type == "DANGER_ESCALATED" and risk_level == "HIGH":
        result = EmergencyResponse(
            emergencyLevel="HIGH",
            emergencyStatus="WATCHING",
            notifyGuardian=True,
            callGuardian=False,
            saveEventHistory=True,
            alertType="DANGER",
            message="위험 상황이 감지되어 보호자에게 확인 알림을 전송합니다.",
            recommendedChannels=["GUARDIAN_PUSH", "BAND_VIBRATION", "APP_SCREEN", "TV_POPUP"],
            vibrationPattern="STRONG_REPEAT",
            screenMode="HIGH_CONTRAST_LARGE_TEXT",
        )
    elif trigger_type == "MANUAL_REQUEST" or source == "APP":
        result = EmergencyResponse(
            emergencyLevel="CRITICAL",
            emergencyStatus="SENT",
            notifyGuardian=True,
            callGuardian=False,
            saveEventHistory=True,
            alertType="EMERGENCY",
            message=request.message or "앱에서 긴급 도움 요청이 발생했습니다. 보호자에게 알림을 전송합니다.",
            recommendedChannels=["GUARDIAN_PUSH", "BAND_VIBRATION", "APP_SCREEN"],
            vibrationPattern="SOS_REPEAT",
            screenMode="EMERGENCY_FULL_SCREEN",
        )

    if risk_level == "CRITICAL":
        result.notifyGuardian = True
        result.saveEventHistory = True
        result.alertType = "EMERGENCY"
        result.vibrationPattern = "SOS_REPEAT"
        result.screenMode = "EMERGENCY_FULL_SCREEN"
        add_channels(result.recommendedChannels, "GUARDIAN_PUSH")
    elif risk_level == "HIGH" and user_response == "NO_RESPONSE":
        result.notifyGuardian = True
        result.saveEventHistory = True
        add_channels(result.recommendedChannels, "GUARDIAN_PUSH")

    return result


@app.get("/health")
def health():
    return {
        "service": "lg-able-band-emergency-ai-server",
        "status": "running",
        "port": PORT,
        "message": "LG Able Band emergency AI server is running.",
    }


@app.post("/api/ai/judge-emergency", response_model=EmergencyResponse)
def judge_emergency_endpoint(request: EmergencyRequest) -> EmergencyResponse:
    return judge_emergency(request)


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
