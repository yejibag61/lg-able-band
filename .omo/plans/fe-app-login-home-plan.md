# FE/app Login To Home Work Plan

## Objective

`FE/app`에서 LG Able Band 메인 앱의 첫 MVP 흐름을 로그인부터 사용자 홈 화면까지 구현한다.

## Source Of Truth

1. API 계약은 `docs/api/final.md`를 따른다.
2. FE 적용 순서는 `docs/frontend/fe-final-api-guide.md`를 따른다.
3. 화면 구성은 `docs/frontend/fe-screens.md`, `docs/frontend/home-screen-plan.md`, `docs/frontend/fe-design-reference.md`를 따른다.
4. `docs/api/final.md`, `BE/`, `ML/`, `FE/wearable`은 이 계획의 구현 대상이 아니다.

## Scope

### IN

- `FE/app` 로그인/역할 선택 화면
- `POST /api/auth/login` 계약에 맞춘 mock-first 로그인 서비스
- 로그인 성공 후 `USER`는 홈 화면으로 이동
- `GUARDIAN`은 이번 범위에서는 보호자 화면 예정 안내 또는 최소 placeholder로 분기
- `GET /api/app/home` 계약에 맞춘 mock-first 홈 데이터 서비스
- 홈 화면 카드: 오늘 상태, 긴급 도움 요청, 최근 알림, 기기 요약, UWB 안내, 보호자 연결
- 로딩, 실패, 빈 데이터에 가까운 상태 처리
- 모바일 우선 접근성 UI
- 개발 시작 전에 테스트 인프라 추가

### OUT

- 백엔드 API 구현 또는 `docs/api/final.md` 수정
- ML 기능 구현
- `FE/wearable` 구현
- 알림 상세, 알림 이력, 기기 관리, UWB 탐색, 접근성 설정의 완성 구현
- 실제 인증 토큰 저장 정책의 보안 고도화

## Defaults Applied

- 테스트 인프라는 `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`으로 구성한다.
- 테스트 의존성 추가 명령은 `npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`이다.
- 실제 API가 준비되지 않았을 때는 `src/mocks`와 `src/services`를 분리해 mock data를 사용한다.
- 첫 구현에서는 `USER` 로그인 후 홈 화면 완성에 집중한다.
- `GUARDIAN` 로그인은 로그인 분기 검증을 위해 placeholder 화면까지 구현한다.
- 라우터 라이브러리는 당장 추가하지 않고 React state 기반 화면 전환으로 시작한다.

## Mock Accounts

| role | email | password | expected route |
| --- | --- | --- | --- |
| `USER` | `user@example.com` | `password1234` | user home |
| `GUARDIAN` | `guardian@example.com` | `password1234` | guardian placeholder |
| invalid | `wrong@example.com` | `wrong` | login error |

These are mock-only credentials and must not be treated as real accounts.

## Implementation Waves

### Wave 1: Test And App Foundation

Ownership:

- `FE/app/package.json`
- `FE/app/vite.config.js`
- `FE/app/src/App.jsx`
- `FE/app/src/main.jsx`
- new test setup files under `FE/app/src`

Tasks:

1. Add test scripts and test dependencies.
2. Add a minimal test setup file if needed.
3. Restructure `App.jsx` from temporary Users Table into app state shell.
4. Define screen states: `login`, `userHome`, `guardianHome`.
5. Configure `vite.config.js` test environment with `jsdom` or create a separate Vitest config if preferred by the final implementation.

Acceptance Criteria:

- `npm run test` exists and runs.
- Temporary `/api/app/users` dependency is removed from first screen.
- App initially shows login screen, not Users Table.
- `npm run lint`, `npm run build`, and `npm run test` pass.

Automated Tests:

- `src/App.test.jsx`
  - `renders login screen by default`
  - `does not request /api/app/users on initial render`

Manual QA:

- Tool: Browser use.
- Invocation: start `npm run dev -- --host 127.0.0.1`, open `http://127.0.0.1:5173`.
- PASS observable: login heading, role choice, email input, password input, and login button are visible; text `Users Table` is absent.

### Wave 2: Final API Shaped Mock Service Layer

Ownership:

- `FE/app/src/services/authService.js`
- `FE/app/src/services/homeService.js`
- `FE/app/src/mocks/authMock.js`
- `FE/app/src/mocks/homeMock.js`

Tasks:

1. Create `login({ role, email, password })` shaped like `POST /api/auth/login`.
2. Create `getHomeSummary()` shaped like `GET /api/app/home`.
3. Return `USER` and `GUARDIAN` sample payloads matching `docs/api/final.md`.
4. Return predictable errors for invalid credentials.
5. Keep service functions async so real API replacement does not change UI code.

Acceptance Criteria:

- Mock login response contains `accessToken`, `role`, `account`, and matching profile object.
- Mock home response contains `user`, `safetyStatus`, `recentAlerts`, `deviceSummary`, `emergency`, and `quickActions`.
- Invalid login returns a user-facing error message.

Automated Tests:

- `src/services/authService.test.js`
  - `logs in USER with final API shaped response`
  - `logs in GUARDIAN with final API shaped response`
  - `rejects invalid credentials with message`
- `src/services/homeService.test.js`
  - `returns final API shaped home summary`

Manual QA:

- Tool: Browser use.
- Invocation: open `http://127.0.0.1:5173`, enter `wrong@example.com` / `wrong`, click login.
- PASS observable: login screen stays visible and shows a clear Korean error message.

### Wave 3: Login And Role Branch UI

Ownership:

- `FE/app/src/App.jsx`
- `FE/app/src/components/LoginScreen.jsx`
- `FE/app/src/components/GuardianPlaceholder.jsx`
- `FE/app/src/App.css`
- `FE/app/src/index.css`

Tasks:

1. Build a Korean login screen with `USER` and `GUARDIAN` role selection.
2. Add email/password fields and submit handling.
3. Show loading state while login is pending.
4. On `USER`, store session in React state and move to home screen.
5. On `GUARDIAN`, move to a minimal guardian placeholder screen explaining that the guardian dashboard is next phase.
6. Keep controls large and readable.

Acceptance Criteria:

- User can select `사용자` or `보호자`.
- Empty fields or invalid credentials show clear errors.
- Successful USER login moves to home.
- Successful GUARDIAN login does not incorrectly show USER home.
- Login UI remains usable at mobile width.

Automated Tests:

- `src/App.test.jsx`
  - `shows required-field error on empty login submit`
  - `routes USER login to home screen`
  - `routes GUARDIAN login to guardian placeholder`
  - `keeps login button disabled while submitting`

Manual QA:

- Tool: Browser use.
- Invocation: open `http://127.0.0.1:5173`, select `사용자`, enter `user@example.com` / `password1234`, click login.
- PASS observable: home screen appears with the mock user's name and safety status.

### Wave 4: User Home Screen

Ownership:

- `FE/app/src/components/HomeScreen.jsx`
- `FE/app/src/components/HomeStatusCard.jsx`
- `FE/app/src/components/HomeAlertList.jsx`
- `FE/app/src/components/HomeDeviceSummary.jsx`
- `FE/app/src/components/HomeQuickActions.jsx`
- `FE/app/src/App.css`

Tasks:

1. Fetch home summary through `homeService`.
2. Render top title and current user context.
3. Render safety status card using `SAFE`, `CAUTION`, `DANGER`, `EMERGENCY`.
4. Render emergency request card/button as UI-only first step.
5. Render recent alerts from `recentAlerts`.
6. Render connected device summary.
7. Render UWB and guardian connection cards as navigation-ready cards.
8. Add card-level loading and error states.

Acceptance Criteria:

- Home uses `GET /api/app/home` response shape.
- Safety state is shown with text label and visual emphasis.
- Recent alerts show title, message, device name, time, severity, and read status.
- Device summary shows total, connected, warning, and UWB supported counts.
- Emergency button is large and clear.
- Home remains readable at mobile width.

Automated Tests:

- `src/components/HomeScreen.test.jsx`
  - `renders safety status from home summary`
  - `renders recent alerts and device summary`
  - `renders empty alert state when recentAlerts is empty`
  - `renders home error state when service fails`

Manual QA:

- Tool: Browser use.
- Invocation: login as `user@example.com` / `password1234`.
- PASS observable: home screen shows safety status, emergency button, recent alerts, device summary, UWB card, and guardian card.

### Wave 5: Verification And Cleanup

Ownership:

- All touched `FE/app` files

Tasks:

1. Run `npm run lint`.
2. Run `npm run test`.
3. Run `npm run build`.
4. Run browser QA for login failure, USER login success, GUARDIAN branch, and mobile width.
5. Check `git status --short` and confirm only intended files changed.

Acceptance Criteria:

- Lint passes.
- Tests pass.
- Build passes.
- Browser QA passes.
- No `BE/`, `ML/`, `FE/wearable`, or `docs/api/final.md` changes.

Manual QA Scenarios:

1. Happy path: Browser use, `user@example.com` / `password1234` -> home. PASS if safety status and user name render.
2. Edge case: Browser use, `wrong@example.com` / `wrong` -> error. PASS if login remains and Korean error renders.
3. Adjacent branch: Browser use, `guardian@example.com` / `password1234` -> guardian placeholder. PASS if USER home cards do not render.
4. Responsive check: Browser use, viewport `390x844`. PASS if role controls, login form, and home cards are not clipped horizontally.

## Required Implementation Commands

Run from `FE/app`.

```bash
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
npm run test
npm run lint
npm run build
npm run dev -- --host 127.0.0.1
```

If dependency installation fails because of network access, stop and ask the user to approve the install before continuing.

## File Structure Target

```text
FE/app/src/
  App.jsx
  App.test.jsx
  main.jsx
  setupTests.js
  components/
    LoginScreen.jsx
    GuardianPlaceholder.jsx
    HomeScreen.jsx
    HomeStatusCard.jsx
    HomeAlertList.jsx
    HomeDeviceSummary.jsx
    HomeQuickActions.jsx
  mocks/
    authMock.js
    homeMock.js
  services/
    authService.js
    authService.test.js
    homeService.js
    homeService.test.js
```

## Notes For The Implementer

- Keep `docs/api/final.md` open as the API contract, but do not edit it.
- Write tests before production changes for each wave.
- Use mock data that can be replaced with `fetch('/api/...')` later.
- Do not introduce routing unless the state-based screen switch becomes painful.
- Keep Korean UI copy short and clear.
- Do not use LG ThinQ logos or promotional UI; only borrow layout patterns.

## Start Command For Next Step

When the user says to start implementation, begin with Wave 1.
