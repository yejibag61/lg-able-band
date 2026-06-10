# 화면별 API 매핑

원본 API 명세: `docs/api/api-spec-draft.md`  
화면별 API 명세: `docs/api/api-spec-by-screen.md`  
화면 설계 기준: `docs/frontend/fe-screens.md`

이 문서는 전체 API 명세에서 각 화면이 실제로 골라 쓸 API만 정리한 화면 중심 참고 문서다.
화면을 만들 때는 이 문서를 먼저 보고, 예시 형식의 화면별 명세는 `docs/api/api-spec-by-screen.md`, 자세한 요청/응답 예시는 `docs/api/api-spec-draft.md`에서 확인한다.

## 읽는 방법

- 필수 API: 화면을 정상적으로 구성하려면 우선 필요한 API
- 선택 API: 화면 구성 방식에 따라 쓰거나, 나중에 붙여도 되는 API
- 필요한 데이터: 화면 UI를 구성하기 위해 FE가 실제로 사용할 값
- 백엔드 협의: 아직 확정이 필요한 부분

## 탭 기준 API 요약

LG ThinQ 레퍼런스를 반영한 `FE/app` 기본 탭은 `홈`, `알림`, `기기`, `메뉴`다.
API는 기능별로 흩어져 있지만, 화면 구현 시에는 아래 탭 기준으로 골라 쓴다.

로그인에서는 `USER`, `GUARDIAN` 역할을 구분한다.
`USER`는 홈 탭으로 진입하고, `GUARDIAN`은 보호자 위험 알림/이력 확인 흐름으로 진입한다.

| 탭 | 주요 화면 | 우선 API |
| --- | --- | --- |
| 로그인 | SCR-000 로그인/역할 선택 화면 | `POST /api/auth/login` |
| 홈 | SCR-001 홈 화면 | `GET /api/app/home`, `POST /api/emergency-requests` |
| 알림 | SCR-004, SCR-005, SCR-008, SCR-006 | `GET /api/alerts`, `GET /api/alerts/{alertId}`, `POST /api/alerts/{alertId}/confirm`, `POST /api/alerts/{alertId}/replay`, `GET /api/events` |
| 기기 | SCR-003, SCR-007 | `GET /api/devices`, `POST /api/devices`, `DELETE /api/devices/{deviceId}`, `GET /api/uwb/targets`, `POST /api/uwb/sessions`, `GET /api/uwb/sessions/{sessionId}` |
| 메뉴 | SCR-002, 보호자 연결 | `GET /api/users/me`, `PUT /api/users/me/accessibility`, `GET /api/guardians`, `POST /api/guardians` |

## SCR-000 로그인/역할 선택 화면

목적: 사용자와 보호자가 역할에 맞게 로그인하고, 로그인 결과에 따라 다른 첫 화면으로 이동한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `POST /api/auth/login` | 사용자/보호자 로그인 |

### 필요한 데이터

- 로그인 역할: `USER`, `GUARDIAN`
- 이메일
- 비밀번호
- access token
- 로그인 계정 요약
- 사용자 프로필 또는 보호자 프로필

### 화면 액션

- `USER` 로그인 성공 → SCR-001 홈 화면
- `GUARDIAN` 로그인 성공 → SCR-006 보호자 위험 알림 화면 또는 SCR-008 이벤트 이력 화면
- 로그인 실패 → 오류 메시지 표시

### 백엔드 협의

- 로그인 요청에 `role`을 포함한다.
- 로그인 응답에 `role`, `account`, `userProfile` 또는 `guardianProfile`을 포함한다.

## SCR-001 홈 화면

목적: 오늘의 상태 요약, 최근 알림, 기기 상태, 긴급 도움 요청 진입을 제공한다.
카드 구성 기준은 `docs/frontend/home-screen-plan.md`를 따른다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/app/home` | 홈 화면 요약 데이터 조회 |
| 선택 | `GET /api/alerts?limit=5` | 최근 알림을 별도 목록으로 조회할 때 사용 |
| 선택 | `GET /api/devices` | 기기 상태를 더 자세히 보여줄 때 사용 |
| 액션 | `POST /api/emergency-requests` | 긴급 도움 요청 버튼 |

### 필요한 데이터

- 사용자 이름
- 접근성 유형
- 오늘 안전 상태
- 최근 알림 3~5개
- 연결 기기 수
- 주의/오류 상태 기기 수
- UWB 위치 안내 가능 여부
- 긴급 요청 가능 여부
- 주 보호자 이름 또는 보호자 연결 여부

### 화면 액션

- 최근 알림 클릭 → SCR-005 알림 상세/다시 듣기 화면
- 긴급 도움 요청 → `POST /api/emergency-requests`
- 기기 상태 카드 클릭 → SCR-003 기기 연동 화면
- UWB 바로가기 → SCR-007 UWB 가전 위치 안내 화면

### 백엔드 협의

- 홈 데이터를 `GET /api/app/home` 하나로 받을지, 알림/기기 API를 조합할지 결정한다.
- `safetyStatus.level` 값 목록을 확정한다.

## SCR-002 접근성 프로필 설정 화면

목적: 장애 유형과 알림 선호를 설정한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/users/me` | 기존 접근성 설정 조회 |
| 액션 | `PUT /api/users/me/accessibility` | 접근성 설정 저장 |

### 필요한 데이터

- 사용자 ID
- 사용자 이름
- 장애 유형: `VISUAL`, `HEARING`
- 알림 채널: `VOICE`, `VIBRATION`, `SCREEN`, `TEXT`, `COLOR`
- 고대비 여부
- 큰 글씨 여부
- 보호자 연결 여부

### 화면 액션

- 저장
- 기본값 적용
- 저장 실패 시 오류 메시지 표시

### 백엔드 협의

- 기본 추천 설정을 백엔드에서 내려줄지, FE에서 기본값으로 둘지 결정한다.
- 알림 선호 구조를 `notificationPrefs.channels` 배열로 확정할지 확인한다.

## SCR-003 기기 연동 화면

목적: 가전, 센서, 웨어러블을 연결하고 연결 상태를 확인한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/devices` | 연결된 기기 목록 조회 |
| 액션 | `POST /api/devices` | 기기 연결 |
| 액션 | `DELETE /api/devices/{deviceId}` | 기기 연결 해제 |

### 필요한 데이터

- 기기 ID
- 기기 이름
- 기기 유형
- 연결 상태
- UWB 위치 안내 지원 여부
- 마지막 이벤트 시간

### 화면 액션

- 기기 연결
- 기기 연결 해제
- 기기 상태 갱신

### 백엔드 협의

- LG ThinQ 실제 연동 전 MVP에서 mock 기기 연결을 허용할지 결정한다.
- 연결 가능한 기기 목록 API가 별도로 필요한지 확인한다.

## SCR-004 실시간 알림 화면

목적: 생활/위험/긴급 알림을 확인하고 대응한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/alerts?type=&status=&limit=20` | 실시간/최근 알림 목록 조회 |
| 선택 | `GET /api/alerts/{alertId}` | 상세 보기 진입 전 상세 데이터 조회 |
| 액션 | `POST /api/alerts/{alertId}/confirm` | 알림 확인 처리 |
| 액션 | `POST /api/alerts/{alertId}/replay` | 다시 듣기 처리 |

### 필요한 데이터

- 알림 ID
- 알림 유형
- 위험도
- 제목
- 메시지
- 기기명
- 발생 위치
- 발생 시간
- 확인 상태
- 보호자 알림 필요 여부

### 화면 액션

- 알림 확인
- 다시 듣기
- 상세 보기
- 위험/긴급 알림 강조 표시

### 백엔드 협의

- 실시간성 구현을 polling으로 할지 WebSocket/SSE로 할지 결정한다.
- 알림 목록 정렬 기준을 최신순으로 확정한다.

## SCR-005 알림 상세/다시 듣기 화면

목적: 알림 내용을 자세히 보고 다시 듣기와 확인 완료를 수행한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/alerts/{alertId}` | 알림 상세 조회 |
| 액션 | `POST /api/alerts/{alertId}/confirm` | 확인 완료 |
| 액션 | `POST /api/alerts/{alertId}/replay` | 다시 듣기 이력 저장 또는 음성 안내 문구 조회 |

### 필요한 데이터

- 상세 문구
- 음성 안내 문구
- 발생 시간
- 기기명
- 기기 유형
- 발생 위치
- 추천 후속 행동
- 확인 상태

### 화면 액션

- 다시 듣기
- 확인 완료
- 이력으로 돌아가기

### 백엔드 협의

- 음성 재생을 FE Web Speech API로 할지, 백엔드가 TTS URL을 줄지 결정한다.
- 다시 듣기 API가 이력 저장만 할지, 음성 안내 문구도 반환할지 확정한다.

## SCR-006 보호자 위험 알림 화면

목적: 보호자가 사용자에게 발생한 위험 상황을 확인한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/alerts/{alertId}` | 보호자 알림 상세 조회 |
| 선택 | `GET /api/events?from=&to=&type=&page=0&size=20` | 관련 이력 보기 |
| 액션 | `POST /api/alerts/{alertId}/confirm` | 보호자 확인 처리 |

### 필요한 데이터

- 위험 유형
- 위험도
- 사용자 상태
- 발생 시간
- 발생 위치
- 기기명
- 확인 상태
- 보호자 연락 정보

### 화면 액션

- 확인
- 연락
- 이력 보기

### 백엔드 협의

- 보호자 전용 로그인/권한이 필요한지 결정한다.
- 보호자 확인과 사용자 확인 상태를 같은 API로 처리할지 분리할지 결정한다.

## SCR-007 UWB 가전 위치 안내 화면

목적: 대상 가전까지 거리, 진동 상태, 음성 안내 문구를 제공한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/uwb/targets` | 위치 안내 대상 기기 조회 |
| 액션 | `POST /api/uwb/sessions` | UWB 탐색 시작 |
| 필수 | `GET /api/uwb/sessions/{sessionId}` | 탐색 상태/거리 갱신 |
| 액션 | `POST /api/uwb/sessions/{sessionId}/stop` | 탐색 종료 |

### 필요한 데이터

- 대상 기기 ID
- 대상 기기명
- UWB 지원 여부
- 탐색 세션 ID
- 탐색 상태
- 거리
- 신뢰도
- 음성 안내 문구
- 진동 패턴

### 화면 액션

- 대상 가전 선택
- 탐색 시작
- 탐색 중지
- 다시 안내

### 백엔드 협의

- 거리 갱신을 polling으로 할지 WebSocket/SSE로 할지 결정한다.
- `confidence`가 낮을 때 FE에 어떤 문구를 보여줄지 결정한다.

## SCR-008 이벤트 이력 화면

목적: 이전 알림과 이벤트를 기간별로 조회하고 상세/다시 듣기로 이동한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/events?from=&to=&type=&page=0&size=20` | 이벤트/알림 이력 조회 |
| 선택 | `GET /api/alerts/{alertId}` | 알림 상세 보기 |
| 액션 | `POST /api/alerts/{alertId}/replay` | 이력에서 다시 듣기 |

### 필요한 데이터

- 이벤트 ID
- 알림 ID
- 이벤트/알림 유형
- 위험도
- 제목
- 기기명
- 발생 시간
- 알림 확인 상태

### 화면 액션

- 기간 필터
- 유형 필터
- 상세 보기
- 다시 듣기

### 백엔드 협의

- 이벤트와 알림을 하나의 이력 API로 내려줄지, 별도 API를 조합할지 결정한다.
- 페이지네이션 방식과 기본 조회 기간을 확정한다.

## FE/wearable 실시간 알림 표시

목적: 작은 화면에서 현재 알림을 즉시 인지하게 한다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/alerts?type=&status=&limit=20` | 현재 표시할 알림 조회 |
| 액션 | `POST /api/alerts/{alertId}/confirm` | 확인 응답 |
| 액션 | `POST /api/alerts/{alertId}/replay` | 다시 듣기 |

### 필요한 데이터

- 알림 ID
- 유형
- 위험도
- 짧은 제목
- 핵심 메시지
- 기기명
- 발생 시간
- 진동/음성 안내 상태

### 백엔드 협의

- 웨어러블 전용 경량 API가 필요한지 확인한다.
- 위험/긴급 알림을 앱보다 우선 전달할지 정책을 정한다.

## FE/wearable UWB 거리/진동 안내

목적: 작은 화면에서 UWB 거리와 진동 상태를 간단히 보여준다.

### 사용 API

| 구분 | API | 용도 |
| --- | --- | --- |
| 필수 | `GET /api/uwb/sessions/{sessionId}` | 현재 거리/진동 상태 조회 |
| 액션 | `POST /api/uwb/sessions/{sessionId}/stop` | 탐색 종료 |

### 필요한 데이터

- 대상 기기명
- 거리
- 탐색 상태
- 신뢰도
- 음성 안내 문구
- 진동 패턴

### 거리별 표시 기준

| 거리 | 진동 | 문구 |
| --- | --- | --- |
| 3m 이상 | `SLOW` | 세탁기까지 약 4미터입니다. |
| 1~3m | `MEDIUM` | 세탁기까지 약 2미터입니다. 가까워지고 있습니다. |
| 1m 이내 | `FAST` | 세탁기 근처입니다. |
| 도착 | `LONG_TWICE` | 세탁기 앞입니다. |

## 화면별 우선 개발 순서

1. SCR-001 홈 화면: `GET /api/app/home`, `POST /api/emergency-requests`
2. SCR-004 실시간 알림 화면: `GET /api/alerts`, 알림 확인/다시 듣기
3. SCR-005 알림 상세/다시 듣기 화면
4. SCR-008 이벤트 이력 화면
5. SCR-002 접근성 설정 화면
6. SCR-003 기기 연동 화면
7. SCR-006 보호자 위험 알림 화면
8. SCR-007 UWB 가전 위치 안내 화면
9. FE/wearable 실시간 알림/확인/다시 듣기
10. FE/wearable UWB 거리/진동 안내

## 백엔드에 우선 공유할 API

백엔드와 가장 먼저 맞춰야 할 API는 다음이다.

| 우선순위 | API | 이유 |
| --- | --- | --- |
| 1 | `GET /api/app/home` | 홈 화면과 시연 첫 화면에 필요 |
| 2 | `GET /api/alerts?type=&status=&limit=20` | 홈 최근 알림, 실시간 알림, 웨어러블 알림에 공통 필요 |
| 3 | `GET /api/alerts/{alertId}` | 상세/다시 듣기/보호자 화면에 필요 |
| 4 | `POST /api/alerts/{alertId}/confirm` | 사용자 응답 흐름에 필요 |
| 5 | `POST /api/emergency-requests` | 긴급 도움 요청 핵심 액션 |
| 6 | `GET /api/devices` | 홈 기기 상태와 기기 연동 화면에 필요 |
| 7 | `GET /api/uwb/targets` | UWB 위치 안내 시작에 필요 |
| 8 | `POST /api/uwb/sessions` | UWB 위치 안내 시연에 필요 |
| 9 | `GET /api/uwb/sessions/{sessionId}` | UWB 거리 갱신에 필요 |
