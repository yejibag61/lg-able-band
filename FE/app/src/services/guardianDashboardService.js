import { mockAppPreview } from '../mocks/appPreviewMock'
import { apiRequest, getAccessToken, getApiBaseUrl } from './apiClient'

export async function getGuardianDashboard() {
  try {
    return await apiRequest('/api/guardians/dashboard')
  } catch (error) {
    if (isGuardianDashboardStrictMode()) {
      throw error
    }

    return createMockGuardianDashboard()
  }
}

export async function confirmGuardianHistoryItem(item) {
  const alertId = item?.alertId
  if (!alertId) {
    return null
  }

  return apiRequest(`/api/alerts/${alertId}/confirm`, {
    method: 'POST',
  })
}

export function subscribeGuardianDashboardEvents(onEvent) {
  const accessToken = getAccessToken()
  if (!accessToken || typeof fetch !== 'function' || typeof AbortController === 'undefined') {
    return () => {}
  }

  const controller = new AbortController()
  let closed = false

  readGuardianDashboardEventStream({
    accessToken,
    signal: controller.signal,
    onEvent,
  }).catch(() => {
    // Polling remains as the fallback when the stream is unavailable.
  })

  return () => {
    closed = true
    controller.abort()
  }

  async function readGuardianDashboardEventStream({ accessToken, signal, onEvent }) {
    const response = await fetch(`${getApiBaseUrl()}/api/guardians/dashboard/stream`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    })

    if (!response.ok || !response.body) {
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (!closed) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split(/\r?\n\r?\n/)
      buffer = chunks.pop() || ''
      chunks.map(parseServerSentEvent).filter(Boolean).forEach(onEvent)
    }
  }
}

function isGuardianDashboardStrictMode() {
  return (
    parseOptionalBoolean(window.__ABLE_BAND_GUARDIAN_DASHBOARD_STRICT__) ??
    parseOptionalBoolean(import.meta.env.VITE_GUARDIAN_DASHBOARD_STRICT_MODE) ??
    false
  )
}

function parseServerSentEvent(chunk) {
  const event = {
    type: 'message',
    data: null,
  }
  const dataLines = []

  chunk.split(/\r?\n/).forEach((line) => {
    if (line.startsWith('event:')) {
      event.type = line.slice('event:'.length).trim()
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  })

  if (dataLines.length === 0) {
    return event
  }

  const rawData = dataLines.join('\n')
  try {
    event.data = JSON.parse(rawData)
  } catch {
    event.data = rawData
  }

  return event
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value === 'boolean') {
    return value
  }

  const normalizedValue = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false
  }

  return null
}

function createMockGuardianDashboard() {
  const dangerAlerts = mockAppPreview.alerts.filter(
    (alert) =>
      alert.type === 'DANGER' ||
      alert.type === 'EMERGENCY' ||
      alert.severity === 'HIGH' ||
      alert.severity === 'CRITICAL',
  )
  const emergencyRequests = [
    {
      emergencyRequestId: 301,
      status: 'SENT',
      message: '사용자가 앱에서 긴급 지원을 요청했습니다.',
      source: 'APP',
      sentAt: '2026-06-10T14:35:00+09:00',
      guardianNotified: true,
    },
  ]

  return {
    user: {
      userId: 1,
      name: '엘지',
      accessibilityType: mockAppPreview.accessibility.disabilityType,
    },
    dangerAlerts,
    emergencyRequests,
    summary: {
      unreadDangerAlertCount: dangerAlerts.filter((alert) => alert.status === 'UNREAD').length,
      emergencyRequestCount: emergencyRequests.length,
      activeEmergency: true,
      safetyMessage: '긴급 도움 요청이 진행 중입니다.',
    },
  }
}
