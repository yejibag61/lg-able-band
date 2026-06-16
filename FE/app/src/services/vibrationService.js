const vibrationPatterns = {
  LOW: [120],
  MEDIUM: [140, 90, 140],
  HIGH: [90, 60, 90, 60, 90],
  CRITICAL: [220, 120, 220, 120, 220],
}

export function triggerAppAlertVibration(alert) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false
  }

  const pattern = vibrationPatterns[alert?.severity] || vibrationPatterns.MEDIUM
  return navigator.vibrate(pattern)
}
