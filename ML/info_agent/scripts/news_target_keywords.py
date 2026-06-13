"""News-only target keyword groups for underrepresented labels."""

NEWS_TARGET_KEYWORD_GROUPS = {
    "DEAFBLIND_TARGET": (
        "시청각장애", "농맹", "맹농", "deafblind", "헬렌켈러센터", "헬렌켈러",
        "촉수화", "점화", "촉각 수어",
    ),
    "RIGHTS_DISCRIMINATION_TARGET": (
        "장애인 권리", "장애인 차별", "장애 차별", "이동권", "접근권",
        "편의제공", "정당한 편의", "권리보장", "인권침해", "장애인 인권",
        "임시조치", "차별 진정",
    ),
    "ASSISTIVE_TECH_TARGET": (
        "보조기기", "보조공학", "정보통신 보조기기", "장애인 보조기기", "보청기",
        "인공와우", "점자정보단말기", "화면낭독", "음성안내", "ai 보조기기",
        "스마트 보조기기",
    ),
    "DISASTER_SAFETY_TARGET": (
        "장애인 재난", "재난 취약계층", "안전취약계층", "화재 대피", "장애인 대피",
        "폭염", "한파", "재난문자", "대피지원", "재난 안전", "안전교육",
    ),
    "HEARING_TARGET": (
        "청각장애", "농인", "수어통역", "문자통역", "자막", "초인등", "보청기",
        "인공와우", "청각 보조기기", "소리 알림", "진동 알림",
    ),
    "VISUAL_TARGET": (
        "시각장애", "점자", "음성안내", "화면낭독", "스크린리더", "보행지원",
        "안내견", "점자블록", "음성유도기", "시각 보조기기",
    ),
}

GROUP_PRIORITY = tuple(NEWS_TARGET_KEYWORD_GROUPS)


def infer_news_target_groups(text: str) -> list[str]:
    normalized = (text or "").lower()
    groups = [
        group
        for group in GROUP_PRIORITY
        if any(keyword in normalized for keyword in NEWS_TARGET_KEYWORD_GROUPS[group])
    ]
    if (
        "DEAFBLIND_TARGET" not in groups
        and "의사소통 지원" in normalized
        and any(keyword in normalized for keyword in ("시청각", "농맹", "맹농", "촉각"))
    ):
        groups.insert(0, "DEAFBLIND_TARGET")
    return groups


def news_target_group_value(text: str) -> str:
    return "|".join(infer_news_target_groups(text))
