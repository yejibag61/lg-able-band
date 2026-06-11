from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UserProfile(BaseModel):
    userId: Optional[int] = None
    name: Optional[str] = None
    accessibilityType: Optional[str] = None
    guardianLinked: Optional[bool] = None


class AlertSummary(BaseModel):
    id: Optional[int] = None
    deviceType: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    severity: Optional[str] = None
    createdAt: Optional[str] = None


class WasherState(BaseModel):
    status: Optional[str] = None
    remainingMinutes: Optional[int] = None
    error: Optional[bool] = None


class RefrigeratorState(BaseModel):
    doorOpen: Optional[bool] = None
    temperatureStatus: Optional[str] = None
    error: Optional[bool] = None


class AirSensorState(BaseModel):
    airQuality: Optional[str] = None
    pmLevel: Optional[str] = None
    ventilationNeeded: Optional[bool] = None
    co2Status: Optional[str] = None


class TvState(BaseModel):
    hasPopup: Optional[bool] = None
    popupMessage: Optional[str] = None


class RangeState(BaseModel):
    powerOn: Optional[bool] = None
    longOn: Optional[bool] = None


class DoorSensorState(BaseModel):
    doorOpen: Optional[bool] = None
    securityEvent: Optional[bool] = None


class DeviceStates(BaseModel):
    washer: Optional[WasherState] = None
    refrigerator: Optional[RefrigeratorState] = None
    airSensor: Optional[AirSensorState] = None
    tv: Optional[TvState] = None
    range: Optional[RangeState] = None
    doorSensor: Optional[DoorSensorState] = None


class ChatContext(BaseModel):
    unreadAlerts: List[AlertSummary] = Field(default_factory=list)
    dangerAlerts: List[AlertSummary] = Field(default_factory=list)
    recentAlert: Optional[AlertSummary] = None
    lastSpokenAlert: Optional[AlertSummary] = None
    devices: DeviceStates = Field(default_factory=DeviceStates)


class ChatMessage(BaseModel):
    role: str = Field(..., description="user, assistant, or system")
    content: str


class ChatRequest(BaseModel):
    text: Optional[str] = Field(None, description="User speech text from STT.")
    transcript: Optional[str] = Field(None, description="Alias for text.")
    sessionId: Optional[str] = None
    language: Optional[str] = "ko-KR"
    intentHint: Optional[str] = None
    user: Optional[UserProfile] = None
    context: Optional[ChatContext] = None
    history: Optional[List[ChatMessage]] = None


class ChatResponse(BaseModel):
    sessionId: Optional[str]
    intent: str
    deviceType: Optional[str]
    answerText: str
    voiceText: str
    action: str
    quickReplies: List[str]
    needsBackendAction: bool
    backendAction: Optional[Dict[str, Any]]
    confidence: float
    createdAt: str
