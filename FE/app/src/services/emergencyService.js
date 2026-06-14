import { apiRequest } from './apiClient'

export async function createEmergencyRequest(message = '긴급한 도움이 필요합니다.') {
  return apiRequest('/api/emergency-requests', {
    method: 'POST',
    body: {
      message,
      source: 'APP',
      triggerType: 'MANUAL_REQUEST',
    },
  })
}
