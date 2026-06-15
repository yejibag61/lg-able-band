import { ApiRequestError, apiRequest } from './apiClient'

const EMERGENCY_ERROR_MESSAGES = {
  NO_GUARDIAN: '긴급 요청을 받을 보호자가 없습니다. 보호자 연결에서 보호자를 먼저 등록해주세요.',
  EMERGENCY_DUPLICATE_COOLDOWN: '이미 긴급 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
}

export async function createEmergencyRequest(message = '긴급한 도움이 필요합니다.') {
  try {
    return await apiRequest('/api/emergency-requests', {
      method: 'POST',
      body: {
        message,
        source: 'APP',
        triggerType: 'MANUAL_REQUEST',
      },
    })
  } catch (error) {
    if (error instanceof ApiRequestError && EMERGENCY_ERROR_MESSAGES[error.code]) {
      throw new ApiRequestError(EMERGENCY_ERROR_MESSAGES[error.code], {
        status: error.status,
        code: error.code,
        details: error.details,
      })
    }

    throw error
  }
}
