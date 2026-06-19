import { isEmergencyRequestAlert } from '../utils/homeSummaryUtils'
import { speakText } from '../utils/speech'

const vibrationPatterns = {
  LOW: [120],
  MEDIUM: [140, 120, 140],
  HIGH: [80, 70, 80, 70, 80],
  CRITICAL: [220, 90, 220, 90, 220],
}

export function isAlertFeedbackCandidate(alert) {
  return Boolean(alert) && alert.status !== 'CONFIRMED' && !isEmergencyRequestAlert(alert)
}

export function runAlertFeedback(alert, settings = {}) {
  if (!isAlertFeedbackCandidate(alert)) {
    return {
      voice: false,
      vibration: false,
    }
  }

  return {
    voice: settings.voiceGuide === true ? speakAlert(alert) : false,
    vibration: settings.vibrationGuide === true ? vibrateAlert(alert) : false,
  }
}

export function runAlertsFeedback(alerts, settings = {}) {
  const candidates = (alerts || []).filter(isAlertFeedbackCandidate)
  if (candidates.length === 0) {
    return {
      voice: false,
      vibrationCount: 0,
    }
  }

  return {
    voice: settings.voiceGuide === true
      ? speakText(candidates.map(createAlertVoiceText).filter(Boolean).join(' ')).ok
      : false,
    vibrationCount: settings.vibrationGuide === true
      ? candidates.filter(vibrateAlert).length
      : 0,
  }
}

function speakAlert(alert) {
  return speakText(createAlertVoiceText(alert)).ok
}

function createAlertVoiceText(alert) {
  return alert.voiceGuide || alert.message || alert.title || '새 알림이 도착했습니다.'
}

function vibrateAlert(alert) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false
  }

  const pattern = vibrationPatterns[alert.severity] || vibrationPatterns.LOW
  return navigator.vibrate(pattern)
}
