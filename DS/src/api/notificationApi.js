import { apiRequest, saveAccessToken } from './apiClient'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'password1234'

let adminLoginPromise = null

export async function ensureAdminSession() {
  if (adminLoginPromise) {
    return adminLoginPromise
  }

  adminLoginPromise = apiRequest('/api/auth/login', {
    method: 'POST',
    requireAuth: false,
    body: {
      role: 'USER',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  })
    .then((session) => {
      if (session?.accessToken) {
        saveAccessToken(session.accessToken)
      }
      return session
    })
    .finally(() => {
      adminLoginPromise = null
    })

  return adminLoginPromise
}

export async function sendSimulatorEvent(payload) {
  await ensureAdminSession()
  console.log('[DS] simulator event payload', payload)

  return apiRequest('/api/admin/simulator/events', {
    method: 'POST',
    body: payload,
  })
}
