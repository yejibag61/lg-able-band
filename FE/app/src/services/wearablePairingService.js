import { ApiRequestError, apiRequest } from './apiClient'

const PAIRING_ERROR_MESSAGES = {
  PAIRING_SESSION_NOT_FOUND:
    '웨어러블 QR이 현재 앱 백엔드의 공유 DB에 등록되어 있지 않습니다. 앱과 웨어러블을 서로 다른 컴퓨터에서 실행한다면 두 컴퓨터의 BE/.env가 같은 DB를 보게 설정한 뒤 새 QR을 발급해주세요.',
  PAIRING_EXPIRED: 'QR 유효 시간이 지났습니다. 웨어러블에서 새 QR을 발급해주세요.',
  PAIRING_ALREADY_COMPLETED:
    '이미 다른 계정과 연결된 QR입니다. 웨어러블에서 연동 해제 후 새 QR을 스캔해주세요.',
  INVALID_PAIRING_PAYLOAD:
    '연동 QR 정보가 올바르지 않습니다. 웨어러블 첫 화면의 새 QR을 다시 스캔해주세요.',
}

export async function completeWearablePairing(pairing) {
  try {
    return await apiRequest(
      `/api/wearable/pairing-sessions/${encodeURIComponent(pairing.pairingSessionId)}/complete`,
      {
        method: 'POST',
        body: {
          deviceId: pairing.deviceId,
          pairingCode: pairing.pairingCode,
          nonce: pairing.nonce,
        },
      },
    )
  } catch (error) {
    if (error instanceof ApiRequestError && PAIRING_ERROR_MESSAGES[error.code]) {
      throw new ApiRequestError(PAIRING_ERROR_MESSAGES[error.code], {
        status: error.status,
        code: error.code,
        details: error.details,
      })
    }
    throw error
  }
}
