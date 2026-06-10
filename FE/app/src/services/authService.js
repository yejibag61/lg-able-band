import {
  createMockLoginResponse,
  createMockPasswordHash,
  createMockSignupResponse,
  mockAccounts,
} from '../mocks/authMock'

const LOGIN_DELAY_MS = 40
const SIGNUP_DELAY_MS = 40

export async function login({ role, email, password }) {
  await delay(LOGIN_DELAY_MS)

  const account = mockAccounts.find(
    (candidate) =>
      candidate.role === role &&
      candidate.email === email.trim() &&
      candidate.passwordHash === createMockPasswordHash(password),
  )

  if (!account) {
    throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
  }

  return structuredClone(account.response)
}

export async function signup(form) {
  await delay(SIGNUP_DELAY_MS)

  const payload = buildSignupPayload(form)

  if (mockAccounts.some((account) => account.email === payload.email)) {
    throw new Error('이미 가입된 이메일입니다.')
  }

  const signupResponse = createMockSignupResponse(payload)
  mockAccounts.push({
    role: payload.role,
    email: payload.email,
    passwordHash: createMockPasswordHash(payload.password),
    response: createMockLoginResponse(signupResponse),
  })

  return structuredClone(signupResponse)
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function buildSignupPayload(form) {
  const basePayload = {
    role: form.role,
    name: form.name.trim(),
    email: form.email.trim(),
    password: form.password,
  }

  if (form.role === 'GUARDIAN') {
    return {
      ...basePayload,
      phone: form.phone.trim(),
      relationship: form.relationship.trim(),
    }
  }

  return {
    ...basePayload,
    accessibilityType: form.accessibilityType,
    notificationPrefs: {
      channels: [
        ...(form.voiceGuide ? ['VOICE'] : []),
        ...(form.vibrationGuide ? ['VIBRATION'] : []),
      ],
      highContrast: form.highContrast,
      largeText: form.largeText,
    },
  }
}
