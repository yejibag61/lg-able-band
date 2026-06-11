import { apiRequest } from './apiClient'
import { mockHomeSummary } from '../mocks/homeMock'
import { mockAppPreview } from '../mocks/appPreviewMock'
import { getAlerts } from './alertService'

export async function getHomeSummary() {
  try {
    return normalizeHomeSummary(await apiRequest('/api/app/home'))
  } catch {
    // Keep the home screen usable while the backend home API is unavailable.
    return normalizeHomeSummary(structuredClone(mockHomeSummary))
  }
}

export async function getAppPreview() {
  const preview = structuredClone(mockAppPreview)

  try {
    const alerts = await getAlerts()
    preview.alerts = alerts.map((alert) => normalizeAlert(alert, preview.alerts))
  } catch {
    // Keep the separate preview fixture available while the backend is offline.
  }

  return preview
}

function normalizeAlert(alert, fixtures) {
  const fixture = fixtures.find((item) => item.alertId === alert.alertId) || {}
  return {
    ...fixture,
    ...alert,
    locationName: alert.locationName || fixture.locationName || '집 안',
    device: alert.device || fixture.device || {
      name: alert.deviceName,
    },
    voiceGuide: alert.voiceGuide || alert.message,
    recommendedAction: alert.recommendedAction || fixture.recommendedAction || '현재 상황을 확인해 주세요.',
    requiresGuardianNotify:
      alert.requiresGuardianNotify ?? fixture.requiresGuardianNotify ?? alert.severity === 'CRITICAL',
  }
}

function normalizeHomeSummary(summary) {
  return {
    ...summary,
    user: summary.user || mockHomeSummary.user,
    safetyStatus: {
      ...mockHomeSummary.safetyStatus,
      ...summary.safetyStatus,
    },
    recentAlerts: summary.recentAlerts || [],
    deviceSummary: {
      ...mockHomeSummary.deviceSummary,
      ...summary.deviceSummary,
    },
    emergency: {
      ...mockHomeSummary.emergency,
      ...summary.emergency,
      primaryGuardianName: summary.emergency?.primaryGuardianName || '보호자',
    },
    quickActions: {
      ...mockHomeSummary.quickActions,
      ...summary.quickActions,
    },
  }
}
