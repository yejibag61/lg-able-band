import { apiRequest, getAccessToken } from './apiClient'
import { mockHomeSummary } from '../mocks/homeMock'
import { mockAppPreview, resetMockDevices } from '../mocks/appPreviewMock'
import { getAlerts } from './alertService'
import { getContextSafetyStatus } from './contextAiService'
import { getDevices } from './deviceService'

export async function getHomeSummary() {
  try {
    return normalizeHomeSummary(await apiRequest('/api/app/home'))
  } catch (error) {
    if (!shouldUseMockFallback()) {
      throw error
    }

    return normalizeHomeSummary(structuredClone(mockHomeSummary))
  }
}

export async function getAppPreview() {
  if (import.meta.env.DEV) {
    resetMockDevices()
  }

  const preview = structuredClone(mockAppPreview)

  try {
    const alerts = await getAlerts()
    preview.alerts = alerts.map((alert) => normalizeAlert(alert, preview.alerts))
  } catch (error) {
    if (!shouldUseMockFallback()) {
      throw error
    }

    // Keep the preview usable while the backend alert API is unavailable.
  }

  try {
    const devices = await getDevices()
    preview.devices = devices
  } catch (error) {
    if (!shouldUseMockFallback()) {
      throw error
    }

    preview.devices = structuredClone(mockAppPreview.devices)
  }

  return preview
}

function shouldUseMockFallback() {
  return !getAccessToken()
}

export async function applyContextAiSafetyStatus(summary, alerts = []) {
  const aiSafetyStatus = await getContextSafetyStatus({ alerts, summary })
  if (!aiSafetyStatus) {
    return summary
  }

  return {
    ...summary,
    safetyStatus: {
      ...summary.safetyStatus,
      level: aiSafetyStatus.level,
      message: aiSafetyStatus.message || summary.safetyStatus.message,
      lastCheckedAt: aiSafetyStatus.lastCheckedAt,
      ai: aiSafetyStatus.ai,
    },
  }
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
    recommendedAction:
      alert.recommendedAction || fixture.recommendedAction || '현재 상황을 확인해 주세요.',
    requiresGuardianNotify:
      alert.requiresGuardianNotify ?? fixture.requiresGuardianNotify ?? alert.severity === 'CRITICAL',
  }
}

function normalizeHomeSummary(summary) {
  const safetyStatusFallback = summary.safetyStatus
    ? { ...mockHomeSummary.safetyStatus, lastCheckedAt: undefined }
    : mockHomeSummary.safetyStatus
  const emergencyEnabled =
    typeof summary.emergency?.enabled === 'boolean'
      ? summary.emergency.enabled
      : mockHomeSummary.emergency.enabled
  const canRequestEmergency =
    typeof summary.quickActions?.canRequestEmergency === 'boolean'
      ? summary.quickActions.canRequestEmergency
      : emergencyEnabled

  return {
    ...summary,
    user: summary.user || mockHomeSummary.user,
    safetyStatus: {
      ...safetyStatusFallback,
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
      enabled: emergencyEnabled,
      primaryGuardianName: summary.emergency?.primaryGuardianName || '보호자',
    },
    quickActions: {
      ...mockHomeSummary.quickActions,
      ...summary.quickActions,
      canRequestEmergency,
    },
  }
}
