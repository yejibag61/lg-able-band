# LG Able Band Database Schema v1

이 문서는 개발산출물의 ERD 요약도를 기준으로 정리한 MySQL 테이블 설계 초안이다.

API 구현에는 로그인이 필요하므로 ERD에는 없던 `ACCOUNT` 테이블을 보조로 추가했다.  
그 외 핵심 도메인 테이블은 산출물 ERD의 구조를 따른다.

SQL 초안은 `BE/src/main/resources/db/schema-v1.sql`에 있다.

## 1. ERD 기준 핵심 테이블

| ERD 테이블 | SQL 테이블 | 역할 |
|---|---|---|
| `USER` | `app_user` | 서비스 사용자 |
| `GUARDIAN` | `guardian` | 보호자 |
| `USER_GUARDIAN` | `user_guardian` | 사용자-보호자 연결 |
| `DEVICE` | `device` | 사용자 소유 기기 |
| `DEVICE_EVENT` | `device_event` | 기기에서 발생한 이벤트 |
| `ALERT` | `alert` | 사용자에게 보여줄 알림 |
| `ALERT_DELIVERY` | `alert_delivery` | 보호자/채널별 알림 전달 상태 |
| `EMERGENCY_REQUEST` | `emergency_request` | 긴급 요청 |
| `USER_FEEDBACK` | `user_feedback` | 사용자 피드백 |

> MySQL에서 `USER`는 혼동 가능성이 있어 실제 테이블명은 `app_user`로 잡았다.

## 2. 추가한 보조 테이블

| 테이블 | 이유 |
|---|---|
| `account` | 로그인 이메일, 비밀번호 해시, role 저장 |
| `user_notification_channel` | `notification_prefs` 중 채널 배열을 정규화해서 저장 |

ERD의 `USER.notification_prefs`는 JSON으로 저장할 수도 있지만, API 명세서의 `channels` 배열을 검색/수정하기 쉽게 별도 테이블로 분리했다.

## 3. 전체 관계

```text
ACCOUNT 1 ── 0..1 APP_USER
ACCOUNT 1 ── 0..1 GUARDIAN

APP_USER 1 ── N USER_GUARDIAN
GUARDIAN 1 ── N USER_GUARDIAN

APP_USER 1 ── N DEVICE
DEVICE 1 ── N DEVICE_EVENT
DEVICE_EVENT 1 ── N ALERT

APP_USER 1 ── N ALERT
APP_USER 1 ── N EMERGENCY_REQUEST
ALERT 1 ── N ALERT_DELIVERY
ALERT 1 ── N USER_FEEDBACK
```

## 4. 초보자용 흐름

1. 회원가입하면 `account`에 로그인 계정을 만든다.
2. role이 `USER`면 `app_user`를 만든다.
3. role이 `GUARDIAN`이면 `guardian`을 만든다.
4. 사용자가 보호자를 등록하면 `guardian`과 `user_guardian`을 만든다.
   `user_guardian`에는 주 보호자 여부와 위험 알림 수신 여부를 함께 저장한다.
5. 기기가 연결되면 `device`에 저장한다.
6. 기기 이벤트가 들어오면 `device_event`에 저장한다.
7. 사용자에게 보여줄 알림이 필요하면 `alert`를 만든다.
8. 알림을 보호자에게 보냈다면 `alert_delivery`에 저장한다.
9. 긴급 요청 버튼을 누르면 `emergency_request`에 저장한다.
10. 사용자가 피드백을 남기면 `user_feedback`에 저장한다.

## 5. API와 테이블 매핑

| API | 주 테이블 |
|---|---|
| `POST /api/auth/signup` | `account`, `app_user` 또는 `guardian` |
| `POST /api/auth/login` | `account` |
| `GET /api/users/me` | `account`, `app_user`, `user_notification_channel` |
| `PUT /api/users/me/accessibility` | `app_user`, `user_notification_channel` |
| `GET /api/app/home` | `app_user`, `alert`, `device`, `user_guardian` |
| `GET /api/devices` | `device` |
| `GET /api/alerts` | `alert` |
| `GET /api/alerts/{alertId}` | `alert`, `device_event`, `device` |
| `POST /api/alerts/{alertId}/confirm` | `alert`, `alert_delivery` |
| `GET /api/events` | `device_event`, `alert` |
| `GET /api/guardians` | `guardian`, `user_guardian` |
| `POST /api/guardians` | `guardian`, `user_guardian` |
| `POST /api/emergency-requests` | `emergency_request` |
| `GET /api/uwb/targets` | `device` |
| `POST /api/uwb/sessions` | 추후 `uwb_session` 추가 가능 |

## 6. 기존 초안에서 바뀐 점

| 이전 초안 | ERD 반영 후 |
|---|---|
| `accounts` | `account` |
| `user_profiles` | `app_user` |
| `guardian_profiles`, `user_guardians` | `guardian`, `user_guardian` |
| `devices` | `device` |
| `event_histories` | `device_event` 중심 |
| `alerts` | `alert` |
| `emergency_requests` | `emergency_request` |
| 없음 | `alert_delivery`, `user_feedback` 추가 |

## 7. 주의사항

- 비밀번호는 반드시 `password_hash`에 해시로 저장한다.
- ERD의 `USER`는 SQL 예약어/시스템 계정과 헷갈릴 수 있어 `app_user`로 사용한다.
- `notification_prefs`는 `app_user`의 화면 설정 컬럼과 `user_notification_channel`로 나눠 저장한다.
- 보호자의 `isPrimary`, `notifyOnDanger` 설정은 사용자별 연결 설정이므로 `user_guardian`에 저장한다.
- `device_event`는 외부 연동/ML/센서에서 들어온 원천 이벤트에 가깝다.
- `alert`는 사용자에게 실제로 보여주는 알림이다.
- `schema-v1.sql`은 초안이다. 운영 DB에 바로 실행하기 전 팀원과 확인한다.
