import { selectPriorityAlert } from '../features/alerts/alertPriority'
import {
  mockAlerts,
  mockEmergencyResponse,
  mockPairingSession,
  mockUwbSessions,
} from '../mocks/wearableMock'
import { wearableApiRequest } from './wearableApiClient'

const DEFAULT_FALLBACK_ENABLED = true

const defaultService = createWearableService()

export function createWearableService({
  baseUrl,
  fallbackEnabled = DEFAULT_FALLBACK_ENABLED,
  fetchImpl,
  token,
} = {}) {
  const apiEnabled = Boolean(baseUrl || fetchImpl || token || import.meta.env.VITE_API_BASE_URL)
  const request = (path, options = {}) =>
    wearableApiRequest(path, {
      ...options,
      baseUrl,
      fetchImpl,
      token,
    })

  return {
    async getCurrentAlert() {
      const alerts = await this.getCurrentAlerts()
      return selectPriorityAlert(alerts)
    },
    async getCurrentAlerts() {
      return withFallback({
        apiEnabled,
        fallbackEnabled,
        fallback: getMockCurrentAlerts,
        request: async () => {
          const response = await request('/api/alerts?status=UNREAD&limit=20', { method: 'GET' })
          const alerts = normalizeListResponse(response).map(normalizeAlert)
          return sortAlerts(alerts)
        },
      })
    },
    async confirmAlert(alertId) {
      if (globalThis.__ABLE_BAND_WEARABLE_FAIL_CONFIRM__) {
        throw new Error('확인 처리에 실패했습니다.')
      }

      return withFallback({
        apiEnabled,
        fallbackEnabled,
        fallback: () => confirmMockAlert(alertId),
        request: async () =>
          request(`/api/alerts/${alertId}/confirm`, {
            method: 'POST',
            body: { responseType: 'CONFIRMED' },
          }),
      })
    },
    async replayAlert(alertId) {
      return withFallback({
        apiEnabled,
        fallbackEnabled,
        fallback: () => replayMockAlert(alertId),
        request: async () => request(`/api/alerts/${alertId}/replay`, { method: 'POST' }),
      })
    },
    async getUwbSession(sessionId) {
      return withFallback({
        apiEnabled,
        fallbackEnabled,
        fallback: () => getMockUwbSession(sessionId),
        request: async () => normalizeUwbSession(await request(`/api/uwb/sessions/${sessionId}`)),
      })
    },
    async stopUwbSession(sessionId) {
      return withFallback({
        apiEnabled,
        fallbackEnabled,
        fallback: () => stopMockUwbSession(sessionId),
        request: async () =>
          normalizeUwbSession(
            await request(`/api/uwb/sessions/${sessionId}/stop`, {
              method: 'POST',
            }),
          ),
      })
    },
    async requestEmergencyHelp(message = '도움이 필요합니다.') {
      return withFallback({
        apiEnabled,
        fallbackEnabled,
        fallback: () => requestMockEmergencyHelp(message),
        request: async () =>
          request('/api/emergency-requests', {
            method: 'POST',
            body: {
              message,
              source: 'WEARABLE',
            },
          }),
      })
    },
  }
}

export function getPairingSession() {
  return clone(mockPairingSession)
}

export function createPairingPayload(session) {
  const params = new URLSearchParams({
    pairingSessionId: session.pairingSessionId,
    deviceId: session.deviceId,
    pairingCode: session.pairingCode,
    nonce: session.nonce,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    source: 'wearable',
  })

  return `lg-able-band://pair?${params.toString()}`
}

export async function getCurrentAlert() {
  return defaultService.getCurrentAlert()
}

export async function getCurrentAlerts() {
  return defaultService.getCurrentAlerts()
}

export async function confirmAlert(alertId) {
  return defaultService.confirmAlert(alertId)
}

export async function replayAlert(alertId) {
  return defaultService.replayAlert(alertId)
}

export async function getUwbSession(sessionId) {
  return defaultService.getUwbSession(sessionId)
}

export async function stopUwbSession(sessionId) {
  return defaultService.stopUwbSession(sessionId)
}

export async function requestEmergencyHelp(message) {
  return defaultService.requestEmergencyHelp(message)
}

export function normalizeUwbSession(session) {
  return {
    sessionId: session.sessionId,
    targetDeviceName: session.targetDeviceName || session.targetDevice?.name || '대상 기기',
    distanceM: session.distanceM,
    confidence: session.confidence,
    navigationStatus: session.navigationStatus || session.status,
    voiceGuide: session.voiceGuide,
    vibrationPattern: session.vibrationPattern || 'NONE',
    updatedAt: session.updatedAt || '',
  }
}

export function getInitialUwbSessionId(searchParams = new URLSearchParams(window.location.search)) {
  const sessionId = Number(searchParams.get('sessionId'))
  return Number.isFinite(sessionId) && sessionId > 0 ? sessionId : 9001
}

function findAlert(alertId) {
  const alert = mockAlerts.find((item) => item.alertId === Number(alertId))
  if (!alert) {
    throw new Error('알림을 찾을 수 없습니다.')
  }

  return alert
}

function normalizeAlert(alert) {
  return {
    alertId: alert.alertId,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    voiceGuide: alert.voiceGuide || alert.message,
    deviceName: alert.deviceName || alert.device?.name || '연동 기기',
    locationName: alert.locationName || alert.location || '집 안',
    occurredAt: alert.occurredAt,
    status: alert.status || 'UNREAD',
    vibrationPattern: alert.vibrationPattern,
  }
}

function normalizeListResponse(response) {
  if (Array.isArray(response)) {
    return response
  }

  return response?.items || []
}

function getMockCurrentAlerts() {
  return sortAlerts(mockAlerts.map(clone))
}

function sortAlerts(alerts) {
  const priorityAlert = selectPriorityAlert(alerts)
  if (!priorityAlert) {
    return []
  }

  return [
    priorityAlert,
    ...alerts.filter((alert) => alert.alertId !== priorityAlert.alertId),
  ]
}

function confirmMockAlert(alertId) {
  findAlert(alertId)

  return {
    alertId,
    status: 'CONFIRMED',
    confirmedAt: '2026-06-10T14:43:00+09:00',
  }
}

function replayMockAlert(alertId) {
  const alert = findAlert(alertId)

  return {
    alertId,
    status: 'REPLAYED',
    voiceGuide: alert.voiceGuide,
    replayedAt: '2026-06-10T14:44:00+09:00',
  }
}

function getMockUwbSession(sessionId) {
  const session = mockUwbSessions.find((item) => item.sessionId === Number(sessionId))
  if (!session) {
    throw new Error('진행 중인 위치 안내가 없습니다.')
  }

  return normalizeUwbSession(session)
}

async function stopMockUwbSession(sessionId) {
  const session = await getMockUwbSession(sessionId)

  return {
    ...session,
    navigationStatus: 'CANCELED',
    vibrationPattern: 'NONE',
    voiceGuide: '탐색 종료',
  }
}

function requestMockEmergencyHelp(message) {
  const forcedErrorCode = globalThis.__ABLE_BAND_WEARABLE_EMERGENCY_ERROR__
  if (forcedErrorCode) {
    throw createEmergencyError(forcedErrorCode)
  }

  return {
    ...clone(mockEmergencyResponse),
    requestMessage: message,
  }
}

async function withFallback({ apiEnabled, fallbackEnabled, fallback, request }) {
  if (globalThis.__ABLE_BAND_WEARABLE_FALLBACK__ === false) {
    return request()
  }

  if (!apiEnabled) {
    return fallback()
  }

  try {
    return await request()
  } catch (error) {
    if (!fallbackEnabled || shouldSurfaceApiError(error)) {
      throw error
    }

    return fallback()
  }
}

function shouldSurfaceApiError(error) {
  return Boolean(error?.code) || error?.status === 401 || error?.status === 403
}

function createEmergencyError(code) {
  const error = new Error(emergencyErrorMessages[code] || emergencyErrorMessages.SERVER_ERROR)
  error.code = code
  return error
}

const emergencyErrorMessages = {
  NO_GUARDIAN: '연결된 보호자가 없습니다. 휴대폰 앱에서 보호자를 먼저 연결해주세요.',
  DELIVERY_FAILED: '보호자에게 알림을 보내지 못했습니다. 잠시 후 다시 시도해주세요.',
  UNAUTHORIZED: '연동 인증이 만료되었습니다. 휴대폰에서 다시 연동해주세요.',
  SERVER_ERROR: '긴급 요청을 보내지 못했습니다. 잠시 후 다시 시도해주세요.',
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
