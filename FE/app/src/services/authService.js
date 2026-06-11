import { apiRequest, clearAccessToken, saveAccessToken } from './apiClient'

const SESSION_STORAGE_KEY = 'lg-able-band.session'

export async function login({ role, email, password }) {
  const session = await apiRequest('/api/auth/login', {
    method: 'POST',
    requireAuth: false,
    body: {
      role,
      email: email.trim(),
      password,
    },
  })

  if (session.accessToken) {
    saveAccessToken(session.accessToken)
  }
  saveSession(session)

  return session
}

export async function signup(form) {
  const payload = buildSignupPayload(form)

  return apiRequest('/api/auth/signup', {
    method: 'POST',
    requireAuth: false,
    body: payload,
  })
}

export function logout() {
  clearAccessToken()
  clearSession()
}

export function getStoredSession() {
  const rawValue = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue)
  } catch {
    clearSession()
    return null
  }
}

function saveSession(session) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

function clearSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
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
