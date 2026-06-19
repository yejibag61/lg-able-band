import { isEmergencyRequestAlert } from '../utils/homeSummaryUtils'

const DEFAULT_CONTEXT_AI_BASE_URL = 'http://127.0.0.1:8000'

const severityRank = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
}

const safetyRank = {
  SAFE: 1,
  CAUTION: 2,
  DANGER: 3,
  EMERGENCY: 4,
}

const fallbackEventsBySeverity = {
  LOW: { deviceType: 'WASHER', eventType: 'COMPLETE' },
  MEDIUM: { deviceType: 'AIR_SENSOR', eventType: 'AIR_QUALITY_BAD' },
  HIGH: { deviceType: 'RANGE', eventType: 'LONG_ON' },
  CRITICAL: { deviceType: 'TV', eventType: 'EMERGENCY_POPUP' },
}

export async function getContextSafetyStatus({ alerts = [], summary } = {}) {
  const sourceAlerts = selectContextSourceAlerts(alerts)
  if (sourceAlerts.length === 0) {
    return null
  }

  const judgments = (await Promise.all(sourceAlerts.map((alert) => requestContextJudgment(alert, summary))))
    .filter(Boolean)

  if (judgments.length === 0) {
    return null
  }

  return aggregateContextJudgments(judgments)
}

async function requestContextJudgment(alert, summary) {
  try {
    const response = await fetch(`${contextAiBaseUrl()}/api/ai/judge-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createContextAiRequest(alert, summary)),
    })

    if (!response.ok) {
      return null
    }

    return normalizeContextAiResponse(await response.json(), alert)
  } catch {
    return null
  }
}

function selectContextSourceAlerts(alerts) {
  return alerts
    .filter((alert) => alert && alert.status !== 'CONFIRMED' && !isEmergencyRequestAlert(alert))
    .sort((left, right) => {
      const rightRank = severityRank[right.severity] || 0
      const leftRank = severityRank[left.severity] || 0
      if (rightRank !== leftRank) {
        return rightRank - leftRank
      }

      return new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0)
    })
}

function createContextAiRequest(alert, summary) {
  const fallbackEvent = fallbackEventsBySeverity[alert.severity] || fallbackEventsBySeverity.LOW
  const deviceType = normalizeDeviceType(
    alert.eventDeviceType ||
      alert.deviceType ||
      alert.device?.type ||
      fallbackEvent.deviceType,
  )

  return {
    userId: summary?.user?.userId,
    accessibilityType: summary?.user?.accessibilityType || 'VISUAL',
    deviceType,
    deviceName: alert.deviceName || alert.device?.name,
    eventType: alert.eventType || alert.code || fallbackEvent.eventType,
    location: alert.locationName || alert.location,
    locationName: alert.locationName || alert.location,
    userResponse: alert.userResponse || 'UNKNOWN',
    occurredAt: alert.occurredAt,
  }
}

function normalizeContextAiResponse(response, alert) {
  const level = response?.safetyStatusLevel
  if (!['SAFE', 'CAUTION', 'DANGER', 'EMERGENCY'].includes(level)) {
    return null
  }

  return {
    level,
    message: response.message || '',
    lastCheckedAt: new Date().toISOString(),
    ai: {
      riskScore: response.riskScore,
      alertType: response.alertType,
      screenMode: response.screenMode,
      vibrationPattern: response.vibrationPattern,
      sourceAlertId: alert?.alertId,
      sourceAlertTitle: alert?.title,
    },
  }
}

function aggregateContextJudgments(judgments) {
  const selected = [...judgments].sort((left, right) => {
    const rightRank = safetyRank[right.level] || 0
    const leftRank = safetyRank[left.level] || 0
    if (rightRank !== leftRank) {
      return rightRank - leftRank
    }

    return Number(right.ai.riskScore || 0) - Number(left.ai.riskScore || 0)
  })[0]

  return {
    ...selected,
    ai: {
      ...selected.ai,
      evaluatedAlertCount: judgments.length,
      combinedLevels: countLevels(judgments),
    },
  }
}

function countLevels(judgments) {
  return judgments.reduce((counts, judgment) => ({
    ...counts,
    [judgment.level]: (counts[judgment.level] || 0) + 1,
  }), {})
}

function normalizeDeviceType(value) {
  if (value === 'FRIDGE') {
    return 'REFRIGERATOR'
  }

  if (value === 'INDUCTION') {
    return 'RANGE'
  }

  if (value === 'BAND') {
    return 'WEARABLE'
  }

  return value
}

function contextAiBaseUrl() {
  return (import.meta.env.VITE_CONTEXT_AI_BASE_URL || DEFAULT_CONTEXT_AI_BASE_URL).replace(/\/$/, '')
}
