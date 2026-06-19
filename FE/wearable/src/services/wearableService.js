import { selectPriorityAlert } from '../features/alerts/alertPriority'
import {
  mockAlerts,
  mockEmergencyResponse,
  mockPairingSession,
  mockUwbSessions,
} from '../mocks/wearableMock'
import {
  clearWearableAccessToken,
  getWearableAccessToken,
  storeWearableAccessToken,
  wearableApiRequest,
} from './wearableApiClient'

const DEFAULT_FALLBACK_ENABLED = true
const DEFAULT_PAIRING_EXPIRES_IN_MINUTES = 5

const defaultService = createWearableService()

export function createWearableService({
  baseUrl,
  fallbackEnabled = DEFAULT_FALLBACK_ENABLED,
  fetchImpl,
  token,
} = {}) {
  const isApiEnabled = () =>
    Boolean(baseUrl || fetchImpl || token || import.meta.env.VITE_API_BASE_URL || getWearableAccessToken())
  const isPairingApiEnabled = () =>
    Boolean(baseUrl || fetchImpl || globalThis.fetch || import.meta.env.VITE_API_BASE_URL)
  const request = (path, options = {}) =>
    wearableApiRequest(path, {
      ...options,
      baseUrl,
      fetchImpl,
      token,
    })

  return {
    async createPairingSession() {
      const pairingSession = getMockPairingSession()
      await assertPersistentPairingReady(request)
      return withFallback({
        apiEnabled: isPairingApiEnabled(),
        fallbackEnabled,
        fallback: getMockPairingSession,
        request: async () =>
          normalizePairingSession(
            await request('/api/wearable/pairing-sessions', {
              method: 'POST',
              body: pairingCreateBody(pairingSession),
            }),
          ),
      })
    },
    async getPairingSessionStatus(pairingSession) {
      return withFallback({
        apiEnabled: isPairingApiEnabled(),
        fallbackEnabled,
        fallback: () => normalizePairingSession(pairingSession),
        request: async () => normalizePairingSession(await request(pairingStatusPath(pairingSession))),
      })
    },
    async unpairWearable(pairingSession) {
      const pairingSessionId = getPairingSessionId(pairingSession)
      if (!pairingSessionId) {
        clearWearableAccessToken()
        return { status: 'UNPAIRED' }
      }

      try {
        return await withFallback({
          apiEnabled: isPairingApiEnabled(),
          fallbackEnabled,
          fallback: () => ({ pairingSessionId, status: 'UNPAIRED' }),
          request: async () => {
            const unpaired = await request(pairingUnpairPath(pairingSession), {
              method: 'POST',
              body: {
                deviceId: pairingSession?.deviceId,
                nonce: pairingSession?.nonce,
              },
            })
            return {
              pairingSessionId,
              status: unpaired?.status || 'UNPAIRED',
            }
          },
        })
      } finally {
        clearWearableAccessToken()
      }
    },
    async getCurrentAlert() {
      const alerts = await this.getCurrentAlerts()
      return selectPriorityAlert(alerts)
    },
    async getCurrentAlerts() {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: getMockCurrentAlerts,
        request: async () => {
          const response = await request('/api/alerts?limit=20', { method: 'GET' })
          const alerts = normalizeListResponse(response).map(normalizeAlert)
          return sortAlerts(alerts)
        },
      })
    },
    async getUnreadWearableAlerts() {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => getMockCurrentAlerts().filter(isUnreadAlert),
        request: async () => {
          const response = await request('/api/wearable/alerts/unread', { method: 'GET' })
          const alerts = normalizeListResponse(response).map(normalizeAlert)
          return sortAlerts(alerts)
        },
      })
    },
    async markWearableAlertsRead(alertIds = []) {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => ({
          status: 'CONFIRMED',
          alertIds,
          updatedCount: alertIds.length,
        }),
        request: async () =>
          request('/api/wearable/alerts/read', {
            method: 'PATCH',
            body: { alertIds },
          }),
      })
    },
    async getWearableAppliances() {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: getMockAppliances,
        request: async () => normalizeListResponse(await request('/api/wearable/appliances', { method: 'GET' })).map(normalizeAppliance),
      })
    },
    async confirmAlert(alertId) {
      if (globalThis.__ABLE_BAND_WEARABLE_FAIL_CONFIRM__) {
        throw new Error('확인 처리에 실패했습니다.')
      }

      return withFallback({
        apiEnabled: isApiEnabled(),
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
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => replayMockAlert(alertId),
        request: async () => request(`/api/alerts/${alertId}/replay`, { method: 'POST' }),
      })
    },
    async getUwbSession(sessionId) {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => getMockUwbSession(sessionId),
        request: async () => normalizeUwbSession(await request(`/api/uwb/sessions/${sessionId}`)),
      })
    },
    async getUwbTargets() {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: getMockUwbTargets,
        request: async () =>
          normalizeListResponse(await request('/api/uwb/targets', { method: 'GET' })).map(
            normalizeUwbTarget,
          ),
      })
    },
    async startUwbSession(targetDeviceId) {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => startMockUwbSession(targetDeviceId),
        request: async () =>
          normalizeUwbSession(
            await request('/api/uwb/sessions', {
              method: 'POST',
              body: { targetDeviceId: Number(targetDeviceId) },
            }),
          ),
      })
    },
    async startWearableUwbSession({ targetDeviceId, type, name } = {}) {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => {
          const target =
            getMockUwbTargets().find((item) => item.deviceId === Number(targetDeviceId)) ||
            getMockUwbTargets().find((item) => item.type === type || item.name === name)
          return startMockUwbSession(target?.deviceId || targetDeviceId)
        },
        request: async () =>
          normalizeUwbSession(
            await request('/api/wearable/uwb/start', {
              method: 'POST',
              body: {
                targetDeviceId: targetDeviceId ? Number(targetDeviceId) : undefined,
                type,
                name,
              },
            }),
          ),
      })
    },
    async getWearableUwbSession(sessionId) {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => getMockUwbSession(sessionId),
        request: async () => normalizeUwbSession(await request(`/api/wearable/uwb/session/${sessionId}`, { method: 'GET' })),
      })
    },
    async stopWearableUwbSession(sessionId) {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => stopMockUwbSession(sessionId),
        request: async () =>
          normalizeUwbSession(
            await request(`/api/wearable/uwb/session/${sessionId}`, {
              method: 'PATCH',
              body: { status: 'STOPPED' },
            }),
          ),
      })
    },
    async stopUwbSession(sessionId) {
      return withFallback({
        apiEnabled: isApiEnabled(),
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
        apiEnabled: isApiEnabled(),
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
    async requestWearableEmergencyHelp(message = '도움이 필요합니다.') {
      return withFallback({
        apiEnabled: isApiEnabled(),
        fallbackEnabled,
        fallback: () => requestMockEmergencyHelp(message),
        request: async () =>
          request('/api/wearable/emergency/request', {
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
  return getMockPairingSession()
}

export function createPairingPayload(session) {
  const params = new URLSearchParams()
  appendQueryParam(params, 'pairingSessionId', session.pairingSessionId)
  appendQueryParam(params, 'deviceId', session.deviceId)
  appendQueryParam(params, 'pairingCode', session.pairingCode)
  appendQueryParam(params, 'nonce', session.nonce)
  appendQueryParam(params, 'issuedAt', session.issuedAt)
  appendQueryParam(params, 'expiresAt', session.expiresAt)
  params.set('source', 'wearable')

  return `lg-able-band://pair?${params.toString()}`
}

export async function createPairingSession() {
  return defaultService.createPairingSession()
}

export async function getPairingSessionStatus(pairingSession) {
  return defaultService.getPairingSessionStatus(pairingSession)
}

export async function unpairWearable(pairingSession) {
  return defaultService.unpairWearable(pairingSession)
}

export function saveWearableAccessToken(accessToken) {
  storeWearableAccessToken(accessToken)
}

export async function getCurrentAlert() {
  return defaultService.getCurrentAlert()
}

export async function getCurrentAlerts() {
  return defaultService.getCurrentAlerts()
}

export async function getUnreadWearableAlerts() {
  return defaultService.getUnreadWearableAlerts()
}

export async function markWearableAlertsRead(alertIds) {
  return defaultService.markWearableAlertsRead(alertIds)
}

export async function getWearableAppliances() {
  return defaultService.getWearableAppliances()
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

export async function getUwbTargets() {
  return defaultService.getUwbTargets()
}

export async function startUwbSession(targetDeviceId) {
  return defaultService.startUwbSession(targetDeviceId)
}

export async function startWearableUwbSession(options) {
  return defaultService.startWearableUwbSession(options)
}

export async function getWearableUwbSession(sessionId) {
  return defaultService.getWearableUwbSession(sessionId)
}

export async function stopWearableUwbSession(sessionId) {
  return defaultService.stopWearableUwbSession(sessionId)
}

export async function stopUwbSession(sessionId) {
  return defaultService.stopUwbSession(sessionId)
}

export async function requestEmergencyHelp(message) {
  return defaultService.requestEmergencyHelp(message)
}

export async function requestWearableEmergencyHelp(message) {
  return defaultService.requestWearableEmergencyHelp(message)
}

export function normalizeUwbSession(session) {
  return {
    sessionId: session.sessionId,
    targetDeviceId: session.targetDeviceId || session.targetDevice?.deviceId,
    targetDeviceName: session.targetDeviceName || session.targetDevice?.name || '대상 기기',
    status: session.status || session.navigationStatus,
    distanceM: session.distanceM ?? session.distanceMeter,
    distanceMeter: session.distanceMeter ?? session.distanceM,
    confidence: session.confidence,
    navigationStatus: session.navigationStatus || session.status,
    voiceGuide: session.voiceGuide,
    vibrationPattern: session.vibrationPattern || 'NONE',
    updatedAt: session.updatedAt || '',
  }
}

function normalizeApplianceDisplayName(name) {
  if (name === '안전 전기레인지') {
    return '전기레인지'
  }

  return name
}
export function normalizeUwbTarget(target) {
  const connectionStatus = target.connectionStatus || 'CONNECTED'
  return {
    deviceId: target.deviceId,
    name: normalizeApplianceDisplayName(target.name) || '위치 안내 기기',
    type: target.type || target.deviceType || 'UWB_TAG',
    connectionStatus,
    locationSupported: target.locationSupported !== false,
    updatedAt: target.updatedAt || target.lastEventAt || '',
    status: connectionStatus === 'CONNECTED' ? '연결됨' : '연결 확인 필요',
    statusTone: connectionStatus === 'CONNECTED' ? 'connected' : 'warning',
    icon: deviceIcon(target.type || target.deviceType),
    iconTone: deviceIconTone(target.type || target.deviceType),
  }
}

export function normalizeAppliance(appliance) {
  const type = appliance.type || appliance.deviceType || appliance.applianceType || 'APPLIANCE'
  const connectionStatus = appliance.connectionStatus || appliance.status || 'CONNECTED'

  return {
    applianceId: appliance.applianceId || appliance.deviceId || appliance.id,
    deviceId: appliance.deviceId || appliance.applianceId || appliance.id,
    name: normalizeApplianceDisplayName(appliance.name || appliance.deviceName) || '가전',
    type,
    connectionStatus,
    locationName: appliance.locationName || appliance.location || appliance.roomName || '집 안',
    uwbSupported: appliance.uwbSupported !== false,
    status: connectionStatus,
  }
}

export function getInitialUwbSessionId(searchParams = new URLSearchParams(window.location.search)) {
  const sessionId = Number(searchParams.get('sessionId'))
  return Number.isFinite(sessionId) && sessionId > 0 ? sessionId : 9001
}

function getMockPairingSession() {
  return normalizePairingSession(mockPairingSession)
}

function normalizePairingSession(session) {
  const pairingSessionId = getPairingSessionId(session)
  const normalized = {
    pairingSessionId,
    deviceId: session?.deviceId || session?.device?.deviceId || '',
    deviceName: session?.deviceName || session?.device?.name || 'LG Able Band',
    pairingCode: session?.pairingCode || '',
    nonce: session?.nonce || '',
    issuedAt: session?.issuedAt || '',
    expiresAt: session?.expiresAt || '',
    expiresInMinutes: getPairingExpiresInMinutes(session),
    pairingPayload: session?.pairingPayload || '',
    status: normalizePairingStatus(session?.status),
    accessToken: session?.accessToken || '',
  }

  return {
    ...normalized,
    pairingPayload: normalized.pairingPayload || createPairingPayload(normalized),
  }
}

function getPairingSessionId(session) {
  return String(session?.pairingSessionId || session?.sessionId || session?.id || '')
}

function getPairingExpiresInMinutes(session) {
  if (Number.isFinite(Number(session?.expiresInMinutes))) {
    return Number(session.expiresInMinutes)
  }

  const issuedAt = Date.parse(session?.issuedAt || '')
  const expiresAt = Date.parse(session?.expiresAt || '')
  if (Number.isFinite(issuedAt) && Number.isFinite(expiresAt) && expiresAt > issuedAt) {
    return Math.max(1, Math.ceil((expiresAt - issuedAt) / 60000))
  }

  return DEFAULT_PAIRING_EXPIRES_IN_MINUTES
}

function normalizePairingStatus(status) {
  if (!status) {
    return 'waiting'
  }

  const normalizedStatus = String(status).toUpperCase()
  if (normalizedStatus === 'PAIRED' || normalizedStatus === 'SUCCESS') {
    return 'success'
  }
  if (normalizedStatus === 'EXPIRED') {
    return 'expired'
  }
  if (normalizedStatus === 'INVALID') {
    return 'invalid'
  }
  if (normalizedStatus === 'WAITING') {
    return 'waiting'
  }

  return 'invalid'
}

function pairingStatusPath(pairingSession) {
  const pairingSessionId = getPairingSessionId(pairingSession)
  if (!pairingSessionId) {
    throw new Error('연동 세션 정보를 찾을 수 없습니다.')
  }

  const params = new URLSearchParams()
  appendQueryParam(params, 'deviceId', pairingSession?.deviceId)
  appendQueryParam(params, 'nonce', pairingSession?.nonce)
  const queryString = params.toString()
  return `/api/wearable/pairing-sessions/${encodeURIComponent(pairingSessionId)}${
    queryString ? `?${queryString}` : ''
  }`
}

function pairingUnpairPath(pairingSession) {
  const pairingSessionId = getPairingSessionId(pairingSession)
  if (!pairingSessionId) {
    throw new Error('연동 세션 정보를 찾을 수 없습니다.')
  }

  return `/api/wearable/pairing-sessions/${encodeURIComponent(pairingSessionId)}/unpair`
}

function pairingCreateBody(pairingSession) {
  return {
    deviceId: pairingSession.deviceId,
    deviceName: pairingSession.deviceName,
    pairingCode: pairingSession.pairingCode,
  }
}

async function assertPersistentPairingReady(request) {
  if (!shouldRequirePersistentPairing()) {
    return
  }

  try {
    const status = await request('/api/db/status', { method: 'GET' })
    if (status?.connected === true) {
      return
    }
  } catch {
    throwPersistentPairingUnavailable()
  }

  throwPersistentPairingUnavailable()
}

function throwPersistentPairingUnavailable() {
  throw new Error(
    '공유 DB에 연결된 백엔드가 필요합니다. 앱과 웨어러블을 서로 다른 컴퓨터에서 실행한다면 QR을 띄우는 컴퓨터의 BE/.env도 같은 DB를 보게 설정한 뒤 새 QR을 발급해주세요.',
  )
}

function shouldRequirePersistentPairing() {
  const explicitFlag = globalThis.__ABLE_BAND_REQUIRE_PERSISTENT_PAIRING__
  if (explicitFlag === true || explicitFlag === false) {
    return explicitFlag
  }

  const configuredFlag = import.meta.env.VITE_REQUIRE_PERSISTENT_PAIRING
  if (configuredFlag === 'true') {
    return true
  }
  if (configuredFlag === 'false') {
    return false
  }

  return !allowsApiFailureFallback()
}

function appendQueryParam(params, key, value) {
  if (value !== undefined && value !== null && value !== '') {
    params.set(key, String(value))
  }
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
    alertId: alert.alertId || alert.id,
    type: alert.type || alert.alertType,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    voiceGuide: alert.voiceGuide || alert.message,
    deviceName: alert.deviceName || alert.device?.name || '연동 기기',
    locationName: alert.locationName || alert.location || '집 안',
    occurredAt: alert.occurredAt || alert.createdAt,
    status: alert.status || (alert.isRead === true ? 'CONFIRMED' : 'UNREAD'),
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

function getMockAppliances() {
  return [
    normalizeAppliance({ deviceId: 10, name: '세탁기', type: 'WASHER', connectionStatus: 'CONNECTED', locationName: '세탁실' }),
    normalizeAppliance({ deviceId: 14, name: '냉장고', type: 'FRIDGE', connectionStatus: 'CONNECTED', locationName: '주방' }),
  ]
}

function isUnreadAlert(alert) {
  return normalizeAlert(alert).status !== 'CONFIRMED'
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

function getMockUwbTargets() {
  return [
    normalizeUwbTarget({ deviceId: 10, name: '세탁기', type: 'WASHER', connectionStatus: 'CONNECTED' }),
    normalizeUwbTarget({ deviceId: 14, name: '냉장고', type: 'FRIDGE', connectionStatus: 'CONNECTED' }),
    normalizeUwbTarget({ deviceId: 11, name: 'TV', type: 'TV', connectionStatus: 'CONNECTED' }),
    normalizeUwbTarget({ deviceId: 12, name: '안전 전기레인지', type: 'RANGE', connectionStatus: 'WARNING' }),
    normalizeUwbTarget({ deviceId: 13, name: '도어센서', type: 'DOOR_SENSOR', connectionStatus: 'CONNECTED' }),
  ]
}

function startMockUwbSession(targetDeviceId) {
  const target = getMockUwbTargets().find((item) => item.deviceId === Number(targetDeviceId))
  if (!target) {
    throw new Error('위치 안내 대상을 찾을 수 없습니다.')
  }

  const initialSessionId = getInitialUwbSessionId()
  const existingSession = mockUwbSessions.find((item) => item.sessionId === initialSessionId)
  if (existingSession) {
    return normalizeUwbSession({
      ...existingSession,
      targetDevice: { deviceId: target.deviceId, name: target.name },
      targetDeviceId: target.deviceId,
      targetDeviceName: target.name,
      status: existingSession.navigationStatus,
    })
  }

  return normalizeUwbSession({
    sessionId: initialSessionId,
    targetDevice: { deviceId: target.deviceId, name: target.name },
    targetDeviceId: target.deviceId,
    status: 'ACTIVE',
    distanceM: 2.4,
    confidence: 0.88,
    voiceGuide: `${target.name} 위치 안내를 시작합니다.`,
    vibrationPattern: 'MEDIUM',
    updatedAt: new Date().toISOString(),
  })
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
    if (!fallbackEnabled || shouldSurfaceApiError(error) || !allowsApiFailureFallback()) {
      throw error
    }

    return fallback()
  }
}

function allowsApiFailureFallback() {
  return globalThis.__ABLE_BAND_ALLOW_API_FAILURE_FALLBACK__ === true
}

function shouldSurfaceApiError(error) {
  return Boolean(error?.code) || error?.status === 401 || error?.status === 403
}

function createEmergencyError(code) {
  const error = new Error(emergencyErrorMessages[code] || emergencyErrorMessages.SERVER_ERROR)
  error.code = code
  return error
}

function deviceIcon(type) {
  const icons = {
    WASHER: '▣',
    TV: '▭',
    RANGE: '⌘',
    DOOR_SENSOR: '▯',
    REFRIGERATOR: '▤',
  }
  return icons[type] || '▣'
}

function deviceIconTone(type) {
  const tones = {
    WASHER: 'teal',
    TV: 'blue',
    RANGE: 'orange',
    DOOR_SENSOR: 'slate',
    REFRIGERATOR: 'teal',
  }
  return tones[type] || 'teal'
}

const emergencyErrorMessages = {
  EMERGENCY_DUPLICATE_COOLDOWN:
    '이미 긴급 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
  NO_GUARDIAN: '연결된 보호자가 없습니다. 휴대폰 앱에서 보호자를 먼저 연결해주세요.',
  DELIVERY_FAILED: '보호자에게 알림을 보내지 못했습니다. 잠시 후 다시 시도해주세요.',
  UNAUTHORIZED: '연동 인증이 만료되었습니다. 휴대폰에서 다시 연동해주세요.',
  SERVER_ERROR: '긴급 요청을 보내지 못했습니다. 잠시 후 다시 시도해주세요.',
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
