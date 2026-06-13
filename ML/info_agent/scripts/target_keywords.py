"""Target keyword groups for underrepresented real-data labels."""

TARGET_KEYWORD_GROUPS = {
    "ASSISTIVE_DEVICE": (
        "보조기기", "보조공학", "보청기", "점자정보단말기", "점자 단말기", "음성안내",
        "화면해설", "문자통역", "수어통역", "진동알림", "청각장애인 알림기기",
        "시각 알림장치", "정보접근", "접근성 기기", "aac", "보완대체의사소통",
        "의사소통 보조기기", "장애인 보조기기 교부", "보조기기 지원사업",
    ),
    "HEARING_IMPAIRED": (
        "청각장애인", "농인", "수어", "수어통역", "문자통역", "자막", "보청기",
        "인공와우", "진동알림", "시각 알림", "청각장애인 재난", "청각장애인 정보접근",
    ),
    "VISUAL_IMPAIRED": (
        "시각장애인", "점자", "점자블록", "음향신호기", "화면해설", "음성안내", "보행",
        "흰지팡이", "시각장애인 이동", "시각장애인 안전", "시각장애인 정보접근",
    ),
    "VISUAL_HEARING_IMPAIRED": (
        "시청각장애인", "시청각 장애", "농맹", "촉수화", "촉각 의사소통",
        "시청각장애인 지원", "시청각장애인 활동지원", "시청각장애인 재난",
        "시청각장애인 이동", "헬렌켈러",
    ),
    "SAFETY_ACTION": (
        "장애인 재난", "장애인 안전", "안전취약계층", "폭염 장애인", "한파 장애인",
        "화재 대피 장애인", "장애인 대피", "재난 행동요령", "응급", "119", "보호자 연락",
    ),
    "RIGHTS_SUPPORT": (
        "장애인 차별", "권리구제", "인권침해", "장애인 학대", "정당한 편의제공",
        "편의제공", "보조견 출입", "정보접근권", "이동권 침해", "수어통역 제공",
        "문자통역 제공",
    ),
}


def infer_target_keyword_groups(text: str) -> list[str]:
    normalized = (text or "").lower()
    return [
        group
        for group, keywords in TARGET_KEYWORD_GROUPS.items()
        if any(keyword in normalized for keyword in keywords)
    ]


def target_keyword_group_value(text: str) -> str:
    return "|".join(infer_target_keyword_groups(text))
