export const SAFETY_STATUS_DISPLAYS = {
  SAFE: { label: '안전', emoji: '🙂' },
  CAUTION: { label: '주의', emoji: '😐' },
  DANGER: { label: '위험', emoji: '😟' },
  EMERGENCY: { label: '긴급', emoji: '😨' },
}

const ACTIONABLE_ALERT_LIMIT = 1

export function getSafetyStatusDisplay(level) {
  return SAFETY_STATUS_DISPLAYS[level] || {
    label: '상태 확인 필요',
    emoji: '🙂',
  }
}

export function formatStatusUpdatedAt(value, now = new Date()) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const currentDate = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(currentDate.getTime())) {
    return ''
  }

  const elapsedMinutes = Math.floor((currentDate.getTime() - date.getTime()) / 60_000)
  if (elapsedMinutes < 1) {
    return '방금 업데이트'
  }

  if (elapsedMinutes < 10) {
    return `${elapsedMinutes}분 전 업데이트`
  }

  if (elapsedMinutes < 60) {
    return `${Math.floor(elapsedMinutes / 10) * 10}분 전 업데이트`
  }

  return `${Math.floor(elapsedMinutes / 60)}시간 전 업데이트`
}

export function getActionableRecentAlerts(alerts, limit = ACTIONABLE_ALERT_LIMIT) {
  return alerts.filter(isActionableAlert).slice(0, limit)
}

export function createHomeAlertMetrics(alerts) {
  const actionableAlerts = alerts.filter(isActionableAlert)

  return {
    total: actionableAlerts.length,
    unread: actionableAlerts.filter((alert) => alert.status === 'UNREAD').length,
    danger: actionableAlerts.filter(isDangerAlert).length,
  }
}

export function mergeAlertStatusIntoHomeSummary(summary, alertId, status) {
  return {
    ...summary,
    recentAlerts: summary.recentAlerts.map((alert) =>
      alert.alertId === alertId ? { ...alert, status } : alert,
    ),
  }
}

export function updateAlertsWithStatus(alerts, alertId, status) {
  return alerts.map((alert) => (alert.alertId === alertId ? { ...alert, status } : alert))
}

export function getEmergencyAvailability(summary) {
  if (!summary.emergency?.enabled) {
    return {
      canRequest: false,
      reason: '긴급 지원 요청은 보호자를 등록한 뒤 사용할 수 있습니다.',
    }
  }

  if (!summary.quickActions?.canRequestEmergency) {
    return {
      canRequest: false,
      reason: '긴급 지원 요청은 보호자를 등록한 뒤 사용할 수 있습니다.',
    }
  }

  return { canRequest: true, reason: '' }
}

export function getDeviceWarningSummary(deviceSummary) {
  const warningCount = Number(deviceSummary?.warningCount || 0)

  return {
    count: warningCount,
    label: warningCount > 0 ? `주의/오류 ${warningCount}개` : '주의/오류 없음',
  }
}

export function isEmergencyRequestAlert(alert) {
  const normalizedText = normalizeAlertSearchText([
    alert.category,
    alert.code,
    alert.eventType,
    alert.requestType,
    alert.source,
    alert.title,
    alert.message,
  ])

  return [
    'EMERGENCYREQUEST',
    'SOSREQUEST',
    'HELPREQUEST',
    '긴급지원요청',
    '긴급도움요청',
    '긴급요청',
    '도움요청',
  ].some((keyword) => normalizedText.includes(keyword))
}

function isActionableAlert(alert) {
  return alert.status !== 'CONFIRMED' && !isEmergencyRequestAlert(alert)
}

function isDangerAlert(alert) {
  return (
    alert.type === 'DANGER' ||
    alert.type === 'EMERGENCY' ||
    alert.severity === 'HIGH' ||
    alert.severity === 'CRITICAL'
  )
}

function normalizeAlertSearchText(values) {
  return values
    .filter(Boolean)
    .map((value) => String(value))
    .join(' ')
    .replace(/\s+/g, '')
    .toUpperCase()
}
