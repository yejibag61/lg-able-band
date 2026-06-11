from datetime import datetime, timezone
from typing import Any, Dict, Optional

from intent_rules import IntentMatch
from schemas import AlertSummary, ChatContext, ChatRequest, ChatResponse, UserProfile


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def request_text(request: ChatRequest) -> str:
    return (request.text or request.transcript or "").strip()


def alert_text(alert: AlertSummary) -> str:
    title = alert.title or "알림"
    message = alert.message or "상세 내용이 없습니다."
    return f"{title}입니다. {message}"


def bool_answer(value: Optional[bool], true_text: str, false_text: str, unknown_text: str) -> str:
    if value is True:
        return true_text
    if value is False:
        return false_text
    return unknown_text


def build_backend_action(action_type: str, message: str) -> Dict[str, Any]:
    return {
        "type": action_type,
        "message": message,
    }


def build_response(request: ChatRequest, match: IntentMatch) -> ChatResponse:
    user = request.user or UserProfile()
    context = request.context or ChatContext()
    devices = context.devices
    text = request_text(request)

    intent = match.intent
    action = "RESPOND"
    answer = "말씀하신 내용을 이해하지 못했어요. 미확인 알림, 위험 알림, 최근 알림, 세탁기 상태처럼 물어봐 주세요."
    quick_replies = ["미확인 알림 있어?", "위험 알림 있어?", "세탁기 몇 분 남았어?"]
    needs_backend_action = False
    backend_action: Optional[Dict[str, Any]] = None

    if intent == "EMPTY":
        answer = "말을 잘 듣지 못했어요. 다시 한 번 말씀해 주세요."
        action = "ASK_REPEAT"
        quick_replies = ["다시 말하기", "도움말"]
    elif intent == "HELP":
        answer = "미확인 알림, 위험 알림, 최근 알림, 세탁기 남은 시간, 기기 상태, 보호자 연락을 물어볼 수 있어요."
        action = "GUIDE_AVAILABLE_COMMANDS"
    elif intent == "UNREAD_ALERTS_CHECK":
        count = len(context.unreadAlerts)
        if count:
            answer = f"미확인 알림이 {count}개 있어요. 최근 알림은 {alert_text(context.unreadAlerts[0])}"
        else:
            answer = "현재 미확인 알림은 없어요."
        action = "READ_ALERT_SUMMARY"
    elif intent == "DANGER_ALERTS_CHECK":
        count = len(context.dangerAlerts)
        if count:
            answer = f"위험 알림이 {count}개 있어요. {alert_text(context.dangerAlerts[0])}"
        else:
            answer = "현재 위험 알림은 없어요."
        action = "READ_ALERT_SUMMARY"
    elif intent == "READ_RECENT_ALERT":
        if context.recentAlert:
            answer = f"최근 알림은 {alert_text(context.recentAlert)}"
        else:
            answer = "최근 알림이 없어요."
        action = "READ_RECENT_ALERT"
    elif intent == "REPEAT_LAST_ALERT":
        if context.lastSpokenAlert:
            answer = f"방금 알림을 다시 말씀드릴게요. {alert_text(context.lastSpokenAlert)}"
        else:
            answer = "다시 말해드릴 방금 알림이 없어요."
        action = "REPEAT_LAST_ALERT"
    elif intent == "WASHER_TIME_CHECK":
        washer = devices.washer
        if washer and washer.remainingMinutes is not None:
            answer = f"세탁이 약 {washer.remainingMinutes}분 남았어요."
        elif washer and washer.status == "COMPLETE":
            answer = "세탁이 완료되었어요."
        else:
            answer = "세탁기 남은 시간 정보가 없어요."
        action = "READ_DEVICE_STATUS"
    elif intent in {"WASHER_STATUS_CHECK", "WASHER_ALERT_CHECK"}:
        washer = devices.washer
        if washer and washer.error:
            answer = "세탁기에 확인이 필요한 오류가 있어요."
        elif washer and washer.status:
            answer = f"세탁기 상태는 {washer.status}입니다."
        else:
            answer = "세탁기 상태 정보가 없어요."
        action = "READ_DEVICE_STATUS"
    elif intent in {"REFRIGERATOR_DOOR_CHECK", "REFRIGERATOR_STATUS_CHECK", "REFRIGERATOR_ALERT_CHECK"}:
        refrigerator = devices.refrigerator
        if intent == "REFRIGERATOR_DOOR_CHECK":
            answer = bool_answer(
                refrigerator.doorOpen if refrigerator else None,
                "냉장고 문이 열려 있어요.",
                "냉장고 문은 닫혀 있어요.",
                "냉장고 문 상태 정보가 없어요.",
            )
        elif refrigerator and refrigerator.error:
            answer = "냉장고에 확인이 필요한 오류가 있어요."
        elif refrigerator and refrigerator.temperatureStatus:
            answer = f"냉장고 온도 상태는 {refrigerator.temperatureStatus}입니다."
        else:
            answer = "냉장고 상태 정보가 없어요."
        action = "READ_DEVICE_STATUS"
    elif intent == "AIR_QUALITY_CHECK":
        air = devices.airSensor
        if air and air.ventilationNeeded:
            answer = "실내 환기가 필요해요."
        elif air and air.airQuality:
            answer = f"현재 공기질은 {air.airQuality}입니다."
        else:
            answer = "공기질 정보가 없어요."
        action = "READ_DEVICE_STATUS"
    elif intent == "TV_ALERT_CHECK":
        tv = devices.tv
        if tv and tv.hasPopup:
            answer = tv.popupMessage or "TV에 알림이 표시되어 있어요."
        else:
            answer = "현재 TV 알림은 없어요."
        action = "READ_DEVICE_STATUS"
    elif intent in {"RANGE_POWER_CHECK", "RANGE_DANGER_CHECK"}:
        range_state = devices.range
        if intent == "RANGE_DANGER_CHECK" and range_state and range_state.longOn:
            answer = "인덕션 또는 가스레인지가 오래 켜져 있어요. 확인이 필요해요."
        else:
            answer = bool_answer(
                range_state.powerOn if range_state else None,
                "인덕션 또는 가스레인지가 켜져 있어요.",
                "인덕션 또는 가스레인지는 꺼져 있어요.",
                "인덕션 또는 가스레인지 상태 정보가 없어요.",
            )
        action = "READ_DEVICE_STATUS"
    elif intent in {"DOOR_OPEN_CHECK", "DOOR_SECURITY_CHECK"}:
        door = devices.doorSensor
        if intent == "DOOR_SECURITY_CHECK" and door and door.securityEvent:
            answer = "문 열림 보안 알림이 있어요."
        else:
            answer = bool_answer(
                door.doorOpen if door else None,
                "현관문이 열려 있어요.",
                "현관문은 닫혀 있어요.",
                "현관문 상태 정보가 없어요.",
            )
        action = "READ_DEVICE_STATUS"
    elif intent == "DEVICE_STATUS_CHECK":
        answer = "어떤 상태를 확인할지 조금 더 구체적으로 말해 주세요. 예를 들면 세탁기 상태, 냉장고 문, 공기질처럼 말할 수 있어요."
        action = "ASK_CLARIFY"
    elif intent == "NOTIFY_GUARDIAN":
        if user.guardianLinked is False:
            answer = "연결된 보호자가 없어요. 앱에서 보호자를 먼저 등록해 주세요."
            action = "GUIDE_GUARDIAN_SETUP"
            quick_replies = ["미확인 알림 있어?", "위험 알림 있어?"]
        else:
            answer = "보호자에게 현재 상황을 알릴게요."
            action = "NOTIFY_GUARDIAN"
            quick_replies = ["취소", "최근 알림 읽어줘"]
            needs_backend_action = True
            backend_action = build_backend_action(
                "GUARDIAN_NOTIFICATION",
                text or "사용자가 보호자 연락을 요청했습니다.",
            )

    return ChatResponse(
        sessionId=request.sessionId,
        intent=intent,
        deviceType=match.device,
        answerText=answer,
        voiceText=answer,
        action=action,
        quickReplies=quick_replies,
        needsBackendAction=needs_backend_action,
        backendAction=backend_action,
        confidence=match.confidence,
        createdAt=now_utc(),
    )
