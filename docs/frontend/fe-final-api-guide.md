# FE 확정 API 적용 가이드

기준 문서: `docs/api/final.md`

이 문서는 백엔드와 협의된 `docs/api/final.md`를 프론트엔드 개발에 적용하기 위한 작업 가이드다.
API 계약 자체는 `docs/api/final.md`가 최우선이며, 이 문서는 계약을 바꾸지 않는다.

## 우선순위

| 우선순위 | 문서 | 사용 방식 |
| --- | --- | --- |
| 1 | `docs/api/final.md` | 확정 API 계약. endpoint, request, response, enum은 이 문서를 따른다. |
| 2 | `docs/frontend/fe-screens.md` | 어떤 화면을 만들지 확인한다. |
| 3 | `docs/frontend/screen-api-map.md` | 화면과 API 연결을 빠르게 확인한다. |
| 4 | `docs/api/api-spec-by-screen.md` | 화면별 API 이해를 돕는 보조 문서로만 사용한다. |
| 5 | `docs/api/api-spec-draft.md` | 초안/예시 확인용으로만 사용한다. |

`final.md`와 다른 문서가 충돌하면 항상 `final.md`를 우선한다.

## FE 개발 순서

1. `FE/app` 로그인/역할 선택 화면
2. `FE/app` 공통 API 클라이언트와 mock data 구조
3. `FE/app` 홈 화면
4. `FE/app` 알림 목록/상세/확인/다시 듣기
5. `FE/app` 접근성 설정
6. `FE/app` 기기 목록과 보호자 연결
7. `FE/app` 이벤트 이력
8. `FE/app` UWB 위치 안내
9. `FE/wearable` 알림 표시/확인/다시 듣기
10. `FE/wearable` UWB 거리/진동 안내

## 1차 MVP API

`final.md`에서 1차 MVP 여부가 `O`인 API를 먼저 기준으로 삼는다.

| 기능 | API | FE 사용 위치 |
| --- | --- | --- |
| 로그인 | `POST /api/auth/login` | 로그인/역할 선택 |
| 내 정보 조회 | `GET /api/users/me` | 홈, 메뉴, 접근성 설정 |
| 접근성 설정 저장 | `PUT /api/users/me/accessibility` | 접근성 설정 |
| 홈 요약 조회 | `GET /api/app/home` | 홈 |
| 기기 목록 조회 | `GET /api/devices` | 홈, 기기 |
| 알림 목록 조회 | `GET /api/alerts?type=&status=&limit=20` | 알림, 웨어러블 |
| 알림 상세 조회 | `GET /api/alerts/{alertId}` | 알림 상세, 보호자 알림 |
| 알림 확인 처리 | `POST /api/alerts/{alertId}/confirm` | 알림 상세, 웨어러블 |
| 이벤트 이력 조회 | `GET /api/events?from=&to=&type=&page=0&size=20` | 이력 |
| 보호자 목록 조회 | `GET /api/guardians` | 보호자 연결, 홈 요약 보조 |
| 보호자 등록 | `POST /api/guardians` | 보호자 연결 |
| 긴급 도움 요청 | `POST /api/emergency-requests` | 홈, 웨어러블 |

`△` API는 화면 시연이나 기능이 필요할 때 mock으로 먼저 구현하고, 백엔드 준비 후 실제 API로 교체한다.

## 공통 API 클라이언트 기준

FE에서는 API 주소를 코드에 직접 쓰지 않고 환경변수로 관리한다.

```text
VITE_API_BASE_URL=http://localhost:8080/api
```

API 호출 레이어는 다음 책임을 가진다.

| 책임 | 기준 |
| --- | --- |
| Base URL | `VITE_API_BASE_URL` 사용 |
| 인증 헤더 | 로그인 후 `Authorization: Bearer <accessToken>` 사용 |
| 날짜 처리 | ISO 8601 문자열을 그대로 표시하거나 포맷팅 |
| 목록 응답 | `items`, `page`, `size`, `totalElements` 기준 |
| 에러 응답 | `code`, `message`, `details` 기준 |

## Role 처리 기준

로그인 응답의 `role`로 첫 화면을 분기한다.

| role | FE 이동 |
| --- | --- |
| `USER` | 사용자 홈 화면 |
| `GUARDIAN` | 보호자 위험 알림/이력 화면 |

`GUARDIAN`은 접근성 설정 대상이 아니므로 사용자 접근성 설정 화면으로 보내지 않는다.

## Mock Data 기준

mock data는 `final.md`의 Part E를 기준으로 만든다.
화면 안에 데이터를 직접 박지 않고, mock 파일이나 API 서비스 레이어에서 관리한다.

추천 데이터 묶음:

| mock | 용도 |
| --- | --- |
| `mockUser` | 사용자 프로필 |
| `mockAccessibilityProfile` | 접근성 설정 |
| `mockDevices` | 기기 목록 |
| `mockAlerts` | 홈/알림/웨어러블 알림 |
| `mockGuardians` | 보호자 연결 |
| `mockEmergencyRequests` | 긴급 요청 결과 |
| `mockEventHistory` | 이벤트 이력 |
| `mockUwbSession` | UWB 거리 안내 |

## `FE/app` 적용 메모

- 홈은 `GET /api/app/home` 응답 구조에 맞춰 만든다.
- 알림 상세는 목록에서 받은 `alertId`로 `GET /api/alerts/{alertId}`를 조회하는 구조로 둔다.
- 확인 버튼은 `POST /api/alerts/{alertId}/confirm`으로 연결될 수 있게 만든다.
- 다시 듣기는 `POST /api/alerts/{alertId}/replay` 또는 FE 음성 재생으로 대체할 수 있게 분리한다.
- 접근성 설정은 `VISUAL`, `HEARING`만 사용한다.
- 긴급 요청은 성공, 보호자 없음, 전송 실패 상태를 모두 화면으로 준비한다.

## `FE/wearable` 적용 메모

- 앱과 같은 알림 API를 우선 사용한다.
- 작은 화면에서는 전체 목록보다 현재 가장 중요한 알림 1개를 먼저 보여준다.
- 확인 응답은 `POST /api/alerts/{alertId}/confirm`으로 연결될 수 있게 만든다.
- UWB 안내는 `UwbSession`의 `distanceM`, `voiceGuide`, `vibrationPattern`을 기준으로 표시한다.
- 웨어러블 전용 경량 API는 나중에 필요할 때 분리한다.

## 수정 금지

- `docs/api/final.md`는 백엔드와 협의된 확정본이므로 FE 개발 중 임의로 수정하지 않는다.
- API 계약 변경이 필요하면 `docs/api/final.md`를 직접 고치지 말고, 백엔드와 재협의할 요청사항으로 정리한다.
