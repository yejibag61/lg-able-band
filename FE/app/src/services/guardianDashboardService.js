import { mockAppPreview } from '../mocks/appPreviewMock'
import { apiRequest } from './apiClient'

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

function isGuardianDashboardStrictMode() {
  return (
    parseOptionalBoolean(window.__ABLE_BAND_GUARDIAN_DASHBOARD_STRICT__) ??
    parseOptionalBoolean(import.meta.env.VITE_GUARDIAN_DASHBOARD_STRICT_MODE) ??
    false
  )
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
      name: '소희',
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
