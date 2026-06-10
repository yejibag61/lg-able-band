"""LG Able Band rule-based situation risk judgment AI server."""

import os
from typing import Any, Dict, List, Optional, Tuple

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


HOST = "127.0.0.1"
PORT = int(os.environ.get("ML_PORT", "8000"))

app = FastAPI(
    title="LG Able Band AI Judgment Server",
    description="Backend events are evaluated without directly accessing ThinQ APIs or a database.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EventRequest(BaseModel):
    # Fields are optional so partially normalized backend events receive a safe default judgment.
    userId: Optional[int] = None
    accessibilityType: Optional[str] = None
    deviceType: Optional[str] = None
    deviceId: Optional[int] = None
    deviceName: Optional[str] = None
    eventType: Optional[str] = None
    location: Optional[str] = None
    locationName: Optional[str] = None
    value: Optional[str] = None
    durationSec: Optional[float] = None
    userResponse: Optional[str] = None
    notificationPrefs: Optional["NotificationPrefs"] = None
    confidence: Optional[float] = None
    sensorValue: Optional[float] = None
    unit: Optional[str] = None
    batteryLevel: Optional[float] = None
    occurredAt: Optional[str] = None
    timestamp: Optional[str] = None


class NotificationPrefs(BaseModel):
    channels: Optional[List[str]] = None
    highContrast: Optional[bool] = None
    largeText: Optional[bool] = None


class JudgmentResponse(BaseModel):
    title: str
    alertType: str
    severity: str
    safetyStatusLevel: str
    judgmentLevel: str
    category: str
    riskLevel: str
    riskScore: int
    message: str
    voiceGuide: Optional[str]
    requiresGuardianNotify: bool
    notifyGuardian: bool
    recommendedAction: str
    notificationChannels: List[str]
    deliveryTargets: List[str]
    recommendedChannels: List[str]
    vibrationPattern: str
    screenMode: str
    voiceEnabled: bool


Rule = Tuple[str, str, str, str]

# New device types can be added here later: BAND, SOUND_MODEL, UWB, FIRE_SENSOR, GAS_SENSOR.
EVENT_RULES: Dict[str, Dict[str, Rule]] = {
    "WASHER": {
        "COMPLETE": ("세탁 완료", "생활편의", "낮음", "세탁이 완료되었습니다."),
        "STATUS_CHECK": ("세탁 진행 상태 확인", "생활편의", "낮음", "세탁 진행 상태를 확인했습니다."),
        "LAUNDRY_LEFT": ("종료 후 세탁물 방치", "생활편의", "주의", "세탁이 끝난 뒤 세탁물이 남아 있습니다. 세탁물을 꺼내주세요."),
        "TAKE_OUT_GUIDE": ("세탁물 꺼내기 안내", "생활편의", "낮음", "세탁물을 꺼낼 시간입니다."),
        "ERROR": ("세탁기 에러 또는 케어 알림", "생활편의", "주의", "세탁기에 확인이 필요한 알림이 있습니다."),
    },
    "TV": {
        "DANGER_POPUP": ("큰 화면 위험 안내 출력", "안전", "위험", "TV 화면에 위험 안내를 표시합니다."),
        "EMERGENCY_POPUP": ("긴급 도움 요청 팝업", "긴급", "긴급", "TV 화면에 긴급 도움 요청을 표시합니다."),
        "HOME_STATUS_SUMMARY": ("집 상태 요약 화면 출력", "상태확인", "낮음", "TV 화면에 집 상태 요약을 표시합니다."),
        "GUARDIAN_STATUS_DISPLAY": ("보호자 연결 상태 표시", "긴급", "긴급", "TV 화면에 보호자 연결 상태를 표시합니다."),
    },
    "RANGE": {
        "POWER_ON": ("전기레인지 켜짐", "안전", "주의", "전기레인지가 켜져 있습니다."),
        "BURNER_ON": ("화구 사용 중", "안전", "주의", "전기레인지 화구가 사용 중입니다."),
        "LONG_ON": ("장시간 사용", "안전", "위험", "전기레인지가 장시간 사용 중입니다. 확인이 필요합니다."),
        "OUTING_CHECK": ("외출 전 화구 확인 필요", "안전", "주의", "외출 전 전기레인지 상태를 확인하세요."),
        "POWER_USAGE_HIGH": ("전력 사용량 증가", "안전", "주의", "전기레인지 전력 사용량이 증가했습니다."),
        "COOK_COMPLETE": ("조리 완료", "생활편의", "낮음", "조리가 완료되었습니다."),
        # 잔열은 제품 자체 표시가 가능하지만 ThinQ 앱 잔열 푸시 알림 근거는 약하므로 MVP 핵심 판단 이벤트에서는 제외.
    },
    "DOOR_SENSOR": {
        "DOOR_OPEN": ("문 열림", "안전", "주의", "문이 열렸습니다."),
        "DOOR_CLOSED": ("문 닫힘", "상태확인", "낮음", "문이 닫혔습니다."),
        "LONG_OPEN": ("장시간 문열림", "안전", "위험", "문이 장시간 열려 있습니다."),
        "OUTING_OPEN": ("외출 중 문열림", "안전", "위험", "외출 중 문 열림이 감지되었습니다."),
        "RETURN_HOME": ("귀가 감지", "상태확인", "낮음", "귀가가 감지되었습니다."),
        "LEAVE_HOME": ("외출 감지", "상태확인", "낮음", "외출이 감지되었습니다."),
    },
    "AIR_SENSOR": {
        "AIR_QUALITY_BAD": ("공기질 나쁨", "상태확인", "주의", "실내 공기질이 나쁩니다."),
        "PM_HIGH": ("미세먼지 높음", "상태확인", "주의", "미세먼지 농도가 높습니다."),
        "CO2_HIGH": ("이산화탄소 높음", "상태확인", "주의", "이산화탄소 농도가 높습니다. 환기가 필요합니다."),
        "TEMP_ABNORMAL": ("온도 이상", "상태확인", "주의", "실내 온도 확인이 필요합니다."),
        "HUMIDITY_ABNORMAL": ("습도 이상", "상태확인", "주의", "실내 습도 확인이 필요합니다."),
        "VENTILATION_NEEDED": ("환기 필요", "상태확인", "주의", "실내 환기가 필요합니다."),
    },
    "REFRIGERATOR": {
        "TEMP_CHECK": ("냉장고 온도 확인", "상태확인", "낮음", "냉장고 온도를 확인했습니다."),
        "TEMP_ABNORMAL": ("냉장실 또는 냉동실 온도 이상", "상태확인", "위험", "냉장고 온도 이상이 감지되었습니다."),
        "CARE_ALERT": ("냉장고 에러 또는 케어 알림", "상태확인", "주의", "냉장고에 확인이 필요한 알림이 있습니다."),
        "ENERGY_USAGE_CHECK": ("전력 사용량 확인", "상태확인", "낮음", "냉장고 전력 사용량을 확인했습니다."),
        # 냉장고 문열림 알림은 모델별 지원 기능이므로 백엔드에서 지원 모델일 때만 해당 이벤트를 전달한다.
        "DOOR_OPEN": ("냉장고 문열림", "상태확인", "주의", "냉장고 문이 열려 있습니다."),
        "LONG_OPEN": ("냉장고 문 장시간 열림", "상태확인", "위험", "냉장고 문이 오래 열려 있습니다."),
    },
}

RISK_CONFIG: Dict[str, Dict[str, Any]] = {
    "낮음": {
        "score": 20, "judgment": "NORMAL", "alert": "LIFE", "severity": "LOW",
        "safety": "SAFE", "vibration": "SLOW", "screen": "NORMAL",
        "action": "알림 내용을 확인해주세요.",
    },
    "주의": {
        "score": 50, "judgment": "WARNING", "alert": "DANGER", "severity": "MEDIUM",
        "safety": "CAUTION", "vibration": "MEDIUM", "screen": "WARNING_CARD",
        "action": "기기 또는 주변 상태를 확인해주세요.",
    },
    "위험": {
        "score": 82, "judgment": "DANGER", "alert": "DANGER", "severity": "HIGH",
        "safety": "DANGER", "vibration": "FAST", "screen": "FULL_SCREEN_DANGER",
        "action": "즉시 상황을 확인하고 필요한 안전 조치를 취해주세요.",
    },
    "긴급": {
        "score": 95, "judgment": "EMERGENCY", "alert": "EMERGENCY", "severity": "CRITICAL",
        "safety": "EMERGENCY", "vibration": "LONG_TWICE", "screen": "FULL_SCREEN_EMERGENCY",
        "action": "즉시 도움을 요청하고 보호자에게 상황을 전달해주세요.",
    },
}

DEFAULT_RULE: Rule = (
    "알 수 없는 이벤트",
    "상태확인",
    "낮음",
    "지원되지 않거나 정보가 부족한 이벤트입니다. 상태를 확인해주세요.",
)


def normalize(value: Optional[str]) -> str:
    return value.strip().upper() if value else ""


DEVICE_ALIASES = {
    "TV_DISPLAY": "TV",
    "INDUCTION": "RANGE",
    "BAND": "WEARABLE",
    "UWB": "UWB_TAG",
}

ACCESSIBILITY_ALIASES = {
    "VISUAL_IMPAIRMENT": "VISUAL",
    "HEARING_IMPAIRMENT": "HEARING",
}


def normalize_device(value: Optional[str]) -> str:
    normalized = normalize(value)
    return DEVICE_ALIASES.get(normalized, normalized)


def normalize_accessibility(value: Optional[str]) -> str:
    normalized = normalize(value)
    return ACCESSIBILITY_ALIASES.get(normalized, normalized)


def make_delivery_targets(risk_level: str) -> List[str]:
    targets = ["APP", "WEARABLE"]
    if risk_level in {"위험", "긴급"}:
        targets.extend(["TV", "THINQ_ON"])
    return targets


def make_notification_channels(
    accessibility_type: str,
    preferred_channels: Optional[List[str]],
) -> List[str]:
    if preferred_channels:
        allowed = {"VOICE", "VIBRATION", "SCREEN", "TEXT", "COLOR"}
        normalized = [normalize(channel) for channel in preferred_channels]
        selected = [channel for channel in normalized if channel in allowed]
        if selected:
            return list(dict.fromkeys(selected))
    if accessibility_type == "VISUAL":
        return ["VOICE", "VIBRATION"]
    if accessibility_type == "HEARING":
        return ["VIBRATION", "SCREEN", "TEXT", "COLOR"]
    if accessibility_type == "DEAFBLIND":
        return ["VIBRATION", "SCREEN", "TEXT", "COLOR"]
    return ["VOICE", "VIBRATION", "SCREEN", "TEXT"]


def make_vibration(accessibility_type: str, risk_level: str) -> str:
    if accessibility_type == "DEAFBLIND" and risk_level in {"낮음", "주의"}:
        return "FAST"
    return RISK_CONFIG[risk_level]["vibration"]


def should_notify_guardian(accessibility_type: str, risk_level: str, user_response: str) -> bool:
    if risk_level == "긴급":
        return True
    if risk_level == "위험":
        return accessibility_type == "DEAFBLIND" or user_response == "NO_RESPONSE"
    return False


def judge_event(event: EventRequest) -> JudgmentResponse:
    device_type = normalize_device(event.deviceType)
    event_type = normalize(event.eventType)
    accessibility_type = normalize_accessibility(event.accessibilityType)
    user_response = normalize(event.userResponse)

    title, category, risk_level, base_message = EVENT_RULES.get(device_type, {}).get(event_type, DEFAULT_RULE)
    config = RISK_CONFIG[risk_level]
    location = event.locationName or event.location
    message = f"{location} {base_message}" if location else base_message
    preferred_channels = event.notificationPrefs.channels if event.notificationPrefs else None
    notification_channels = make_notification_channels(accessibility_type, preferred_channels)
    delivery_targets = make_delivery_targets(risk_level)
    voice_enabled = "VOICE" in notification_channels
    notify_guardian = should_notify_guardian(accessibility_type, risk_level, user_response)

    return JudgmentResponse(
        title=title,
        alertType=config["alert"],
        severity=config["severity"],
        safetyStatusLevel=config["safety"],
        judgmentLevel=config["judgment"],
        category=category,
        riskLevel=risk_level,
        riskScore=config["score"],
        message=message,
        voiceGuide=message if voice_enabled else None,
        requiresGuardianNotify=notify_guardian,
        notifyGuardian=notify_guardian,
        recommendedAction=config["action"],
        notificationChannels=notification_channels,
        deliveryTargets=delivery_targets,
        recommendedChannels=delivery_targets,
        vibrationPattern=make_vibration(accessibility_type, risk_level),
        screenMode=config["screen"],
        voiceEnabled=voice_enabled,
    )


@app.get("/")
@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "service": "lg-able-band-ai-server",
        "status": "running",
        "port": PORT,
        "message": "LG Able Band AI judgment server is running.",
    }


@app.post("/api/ai/judge-event", response_model=JudgmentResponse)
def judge_event_endpoint(event: EventRequest) -> JudgmentResponse:
    return judge_event(event)


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
