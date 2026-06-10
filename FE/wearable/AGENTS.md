# FE/wearable 작업 지침

`FE/wearable`은 LG Able Band의 웨어러블 밴드용 표시 앱이다.
작은 화면에서 사용자가 알림을 즉시 인지하고 간단히 반응하는 흐름을 담당한다.

## 우선 참고 문서

- API 계약: `../../docs/api/final.md`
- 웨어러블 mock/API 교체 기준: `../../docs/frontend/fe-final-api-guide.md`
- 화면과 UWB 흐름: `../../docs/frontend/fe-screens.md`, `../../docs/frontend/screen-api-map.md`, `../../docs/frontend/fe-user-flows.md`
- 보조 참고: `../../docs/api/api-spec-by-screen.md`, `../../docs/api/api-spec-draft.md`, `../../docs/reference/ml-reference.md`

`../../docs/api/final.md`가 백엔드와 합의된 확정본이다. 웨어러블 구현 중 이 파일은 수정하지 않는다.

## 담당 화면과 기능

- 실시간 알림 표시
  - 생활/위험/긴급 알림을 짧고 명확하게 표시
  - 알림 유형, 핵심 메시지, 상태 색상 표시
- 위험/긴급 알림 표시
  - 강한 시각 강조
  - 진동 상태 표현
  - 보호자 연결 또는 긴급 요청 상태 요약
- 다시 듣기
  - 현재 알림의 음성 안내를 다시 재생하는 액션
  - 재생 실패 시 짧은 오류 안내
- 확인 응답
  - 사용자가 알림을 확인했음을 표시
  - 확인 완료 상태를 명확히 보여줌
- UWB 거리/진동 안내 요약
  - 대상 가전명
  - 현재 거리 또는 근접 상태
  - 진동 패턴 상태
  - 도착 안내

## 추천 구현 순서

1. 기본 웨어러블 프레임
2. 실시간 알림 표시
3. 위험/긴급 알림 표시
4. 확인 응답
5. 다시 듣기
6. UWB 거리/진동 안내 요약

## UWB 안내 기준

| 거리 | 진동 | 표시/음성 안내 |
| --- | --- | --- |
| 3m 이상 | 느린 진동 | 세탁기까지 약 4미터입니다. |
| 1~3m | 중간 간격 진동 | 세탁기까지 약 2미터입니다. 가까워지고 있습니다. |
| 1m 이내 | 빠른 진동 | 세탁기 근처입니다. |
| 도착 | 긴 진동 2회 | 세탁기 앞입니다. |

## 필요한 데이터 기준

- 현재 알림: `id`, `type`, `severity`, `title`, `message`, `deviceName`, `occurredAt`, `status`
- 다시 듣기: 음성 안내 문구 또는 오디오 참조, 재생 상태
- 확인 응답: 확인 성공 여부, 응답 시간
- UWB: `targetDeviceName`, `distanceM`, `confidence`, `navigationStatus`, `voiceGuide`, `vibrationPattern`

## 구현 원칙

- `FE/wearable`은 작은 화면, 짧은 문구, 즉시 반응을 우선한다.
- 복잡한 설정, 긴 목록, 보호자 관리 화면은 `FE/app`에서 담당한다.
- 핵심 정보는 한 화면에 들어오게 만들고, 버튼 수는 최소화한다.
- 시각/청각 사용자를 위해 색상만으로 상태를 전달하지 않고 텍스트와 상태 라벨을 함께 제공한다.
- API가 없으면 mock data로 알림 수신, 확인, 다시 듣기, UWB 거리 변화 흐름을 먼저 구현한다.
- 위험/긴급 상태는 문구, 크기, 대비, 상태 라벨을 함께 사용해 즉시 인지되게 한다.
- `src/App.jsx`, `src/App.css`, `src/index.css`가 현재 주요 진입점이며, 기능이 커지면 알림 데이터와 UI 컴포넌트를 분리한다.

## 검증

- `npm run lint`
- `npm run build`
- 작은 화면 폭에서 알림, 확인, 다시 듣기, UWB 상태가 한눈에 들어오는지 확인
