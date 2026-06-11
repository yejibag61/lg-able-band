import { apiRequest } from './apiClient'

export async function linkGuardianByEmail({ email, isPrimary = false, notifyOnDanger = true }) {
  return apiRequest('/api/guardians/link-by-email', {
    method: 'POST',
    body: {
      email,
      isPrimary,
      notifyOnDanger,
    },
  })
}
