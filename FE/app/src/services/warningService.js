import { apiRequest } from './apiClient'

export async function getWarningRecommendation(alert, accessibilityType = 'VISUAL') {
  try {
    const recommendation = await apiRequest('/api/warnings/recommendations', {
      method: 'POST',
      body: {
        accessibilityType,
        category: alert.type,
        riskLevel: alert.severity,
        riskScore: riskScore(alert.severity),
        eventType: alert.type,
      },
    })
    return normalizeRecommendation(recommendation, alert)
  } catch {
    return normalizeRecommendation(createMockRecommendation(alert.severity, accessibilityType), alert)
  }
}

function normalizeRecommendation(recommendation, alert) {
  const notifyGuardian = recommendation.notifyGuardian || Boolean(alert.requiresGuardianNotify)
  const channels = [...recommendation.recommendedChannels]

  if (notifyGuardian && !channels.includes('GUARDIAN_PUSH')) {
    channels.push('GUARDIAN_PUSH')
  }

  return {
    ...recommendation,
    recommendedChannels: channels,
    notifyGuardian,
  }
}

function createMockRecommendation(severity, accessibilityType) {
  const urgent = severity === 'HIGH' || severity === 'CRITICAL'
  const channels = ['BAND_VIBRATION', 'APP_SCREEN']

  if (accessibilityType === 'HEARING') {
    channels.push('TV_POPUP', 'THINQ_LIGHT')
  }
  if (urgent) {
    channels.push('GUARDIAN_PUSH')
  }

  return {
    recommendedChannels: channels,
    vibrationPattern: severity === 'CRITICAL' ? 'SOS_REPEAT' : urgent ? 'STRONG_REPEAT' : 'BASIC_REPEAT',
    screenMode: severity === 'CRITICAL' ? 'EMERGENCY_FULL_SCREEN' : 'HIGH_CONTRAST',
    voiceEnabled: accessibilityType === 'VISUAL',
    notifyGuardian: urgent,
  }
}

function riskScore(severity) {
  return {
    LOW: 20,
    MEDIUM: 55,
    HIGH: 85,
    CRITICAL: 100,
  }[severity] || 20
}
