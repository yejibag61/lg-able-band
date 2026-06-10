# Draft: FE/app Login To Home Plan

## Requirements Confirmed

- User wants a plan before starting development.
- Scope is `FE/app` only.
- First implementation order is login first, then home screen.
- `docs/api/final.md` is the confirmed FE-BE contract and must not be edited.
- `BE/`, `ML/`, and `FE/wearable` are out of implementation scope for this plan.

## Skills Used

- `omo:ulw-plan`: user explicitly requested plan-first workflow.
- `omo:init-deep`: prior AGENTS hierarchy already defines FE-only and final API priority.
- `omo:programming`: will apply during implementation because React source edits are `.jsx`/JavaScript, but this turn is planning only.
- `omo:frontend-ui-ux`: relevant for the later LG ThinQ-inspired accessible UI, but this turn only records UI guardrails.

## Research Findings

- `FE/app` is a Vite React app with `dev`, `build`, `lint`, and `preview` scripts.
- No test script or test infrastructure is currently configured in `FE/app/package.json`.
- Current `FE/app/src/App.jsx` is a temporary Users Table view calling `/api/app/users`.
- `POST /api/auth/login` and `GET /api/app/home` are defined in `docs/api/final.md`.
- Login must branch by `USER` and `GUARDIAN`; the first implementation focuses on `USER -> home`.

## Technical Decisions

- Start with test infrastructure and mock-compatible API service structure.
- Keep mock data shaped like `docs/api/final.md` responses.
- Implement login, session state, and USER home before broader tabs.
- Use LG ThinQ-inspired layout only as visual reference, not as copied branding.

## Scope Boundaries

- INCLUDE: login screen, role selection, login loading/error states, USER home screen, home loading/error/empty-like states, mock service layer, first-pass layout.
- EXCLUDE: real backend changes, ML changes, wearable UI, full alert detail flow, device management, UWB implementation, guardian full dashboard.

## Open Questions

- Whether to add test dependencies immediately during implementation if they are not already installed.
- Whether GUARDIAN login should show a placeholder screen in this first wave or be blocked with a clear "next phase" message.
