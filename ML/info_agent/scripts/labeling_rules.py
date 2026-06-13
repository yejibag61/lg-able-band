"""Shared filtering and labeling rules for collected documents."""

DISABILITY_KEYWORDS = (
    "장애", "장애인", "발달장애", "중증장애", "장애정도", "등록장애", "장애등록",
    "장애인가구", "장애학생", "특수교육", "수어", "문자통역", "이동지원", "교통약자",
    "활동지원", "활동보조", "자립생활", "권익", "편의시설",
    "점자", "점자블록", "음향신호기", "보조기기", "보청기", "장애친화",
    "장애인복지", "장애인고용", "장애인연금", "장애수당", "장애아동", "발달재활",
    "언어발달", "안전취약계층", "휠체어", "의사소통기기",
)

CATEGORY_RULES = [
    ("재난/안전", ("폭염", "한파", "화재", "재난", "대피", "응급", "119", "안전취약계층", "긴급", "위험")),
    ("지원사업/모집", ("모집", "신청", "접수", "마감", "공모", "대상자", "지원사업")),
    ("보조기기", ("보조기기", "보청기", "점자", "음성안내", "알림기기", "의사소통기기", "음향신호기")),
    ("취업/교육", ("취업", "고용", "직업훈련", "직무", "채용", "일자리", "취업성공패키지", "교육", "구직")),
    ("의료/건강", ("의료", "건강", "재활", "검진", "진료", "병원", "장애친화 건강검진")),
    ("이동/교통", ("이동", "교통", "보행", "점자블록", "대중교통", "교통약자", "이동지원", "휠체어")),
    ("권리/차별", ("차별", "인권", "권리구제", "학대", "권익", "진정")),
    ("복지지원", ("장애인연금", "장애수당", "활동지원", "활동보조", "발달재활", "언어발달", "복지서비스", "돌봄", "자립생활")),
    ("일반뉴스", ("행사", "문화", "칼럼", "소식", "인터뷰", "뉴스")),
]

PRIORITY_RULES = [
    ("URGENT", ("폭염", "한파", "화재", "재난", "대피", "응급", "119", "위험", "긴급")),
    ("HIGH", ("모집", "신청", "접수", "마감", "지원사업", "보조기기", "대상자", "공모")),
    ("MEDIUM", ("활동지원", "장애인연금", "장애수당", "취업", "교육", "의료", "건강", "재활", "고용")),
    ("LOW", ("행사", "문화", "칼럼", "일반 소식", "인터뷰", "뉴스")),
]


def _best_label(text: str, rules: list[tuple[str, tuple[str, ...]]], default: str) -> str:
    normalized = (text or "").lower()
    label, matches = max(
        ((label, sum(keyword in normalized for keyword in keywords)) for label, keywords in rules),
        key=lambda result: result[1],
    )
    return label if matches else default


def is_disability_related_text(text: str) -> bool:
    normalized = (text or "").lower()
    return any(keyword in normalized for keyword in DISABILITY_KEYWORDS)


def infer_category(text: str) -> str:
    normalized = (text or "").lower()
    if any(keyword in normalized for keyword in ("차별", "권리구제", "인권침해", "학대", "정당한 편의제공", "보조견 출입 거부", "정보접근권")):
        return "권리/차별"
    if any(keyword in normalized for keyword in ("폭염", "한파", "화재", "대피", "응급", "119", "안전취약계층", "행동요령")):
        return "재난/안전"
    assistive = ("보조기기", "보조공학", "보청기", "점자정보단말기", "의사소통 보조기기", "문자통역", "수어통역", "진동알림", "aac", "보완대체의사소통")
    if any(keyword in normalized for keyword in assistive):
        if sum(keyword in normalized for keyword in ("모집", "신청", "접수", "마감", "지원사업")) >= 2:
            return "지원사업/모집"
        return "보조기기"
    return _best_label(text, CATEGORY_RULES, "일반뉴스")


def infer_priority(text: str) -> str:
    return _best_label(text, PRIORITY_RULES, "LOW")


def infer_accessibility_target(text: str) -> str:
    normalized = (text or "").lower()
    if any(keyword in normalized for keyword in ("시청각장애인", "시청각 장애", "농맹", "촉수화", "촉각 의사소통")):
        return "VISUAL_HEARING_IMPAIRED"
    if any(keyword in normalized for keyword in ("지체", "휠체어", "이동지원", "교통약자")):
        return "PHYSICAL_IMPAIRED"
    if any(keyword in normalized for keyword in ("청각장애인", "농인", "수어", "문자통역", "자막", "보청기", "인공와우", "진동알림")):
        return "HEARING_IMPAIRED"
    if any(keyword in normalized for keyword in ("시각장애인", "점자", "점자블록", "음향신호기", "화면해설", "음성안내", "보행", "흰지팡이")):
        return "VISUAL_IMPAIRED"
    return "ALL"


ACTION_KEYWORDS = (
    "신청", "접수", "마감", "대상", "방법", "문의", "이용", "지원", "신고",
    "대피", "행동요령", "연락", "상담", "요청", "확인", "훈련", "검진",
)
LOW_VALUE_KEYWORDS = ("칼럼", "인터뷰", "행사 후기", "축제", "공연", "정치", "논평", "기고")
DIRECT_TARGET_KEYWORDS = ("시각장애", "청각장애", "시청각장애", "장애인", "교통약자", "안전취약계층")


def infer_app_relevance_score(text: str, category: str, priority: str, accessibility_target: str) -> int:
    normalized = (text or "").lower()
    disability_related = is_disability_related_text(normalized)
    action_count = sum(keyword in normalized for keyword in ACTION_KEYWORDS)
    direct_target = any(keyword in normalized for keyword in DIRECT_TARGET_KEYWORDS)
    if not disability_related and category != "재난/안전":
        score = 15
    else:
        score = {
            "재난/안전": 78, "지원사업/모집": 75, "보조기기": 80, "이동/교통": 72,
            "권리/차별": 70, "취업/교육": 62, "의료/건강": 60, "복지지원": 68,
            "일반뉴스": 35,
        }.get(category, 35)
        score += min(15, action_count * 4)
        score += 8 if direct_target else 0
        score += 5 if accessibility_target != "ALL" else 0
        score += 7 if priority == "URGENT" else 3 if priority == "HIGH" else 0
    score -= sum(keyword in normalized for keyword in LOW_VALUE_KEYWORDS) * 12
    if len(normalized) < 40:
        score -= 15
    if category == "재난/안전" and priority == "URGENT":
        score = max(score, 70)
    return max(0, min(100, int(score)))


def infer_app_use_case(text: str, category: str, priority: str, accessibility_target: str) -> str:
    normalized = (text or "").lower()
    if any(keyword in normalized for keyword in LOW_VALUE_KEYWORDS):
        return "NOT_RECOMMENDED"
    if priority == "URGENT" or (category == "재난/안전" and any(k in normalized for k in ("대피", "응급", "119", "화재"))):
        return "URGENT_ALERT"
    if accessibility_target == "VISUAL_IMPAIRED" and any(k in normalized for k in ("음성", "보행", "안내")):
        return "VOICE_GUIDE"
    if accessibility_target in {"HEARING_IMPAIRED", "VISUAL_HEARING_IMPAIRED"} and any(k in normalized for k in ("문자", "수어", "시각", "진동")):
        return "VISUAL_GUIDE"
    if priority == "HIGH" and any(k in normalized for k in ("마감", "신청", "접수", "모집")):
        return "IMPORTANT_ALERT"
    if priority in {"HIGH", "URGENT"} and any(k in normalized for k in ("보호자", "연락", "공유")):
        return "GUARDIAN_SHARE"
    if priority == "HIGH" or category == "보조기기":
        return "BAND_NOTIFICATION"
    if any(keyword in normalized for keyword in ("연구", "조사", "실태", "분석")):
        return "RESEARCH_REFERENCE"
    if any(keyword in normalized for keyword in ("정책", "제도", "법률", "권리", "이동권")):
        return "POLICY_REFERENCE"
    if category != "일반뉴스":
        return "INFO_CARD"
    if is_disability_related_text(normalized):
        return "NEWS_REFERENCE"
    return "BACKGROUND_INFO"


def is_app_relevant(text: str, category: str, priority: str, score: int) -> bool:
    normalized = (text or "").lower()
    if not is_disability_related_text(normalized) and category != "재난/안전":
        return False
    if category == "일반뉴스" and any(keyword in normalized for keyword in LOW_VALUE_KEYWORDS):
        return False
    if len(normalized) < 40:
        return False
    return score >= 60 or (category == "재난/안전" and priority == "URGENT")
