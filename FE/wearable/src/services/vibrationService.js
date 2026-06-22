const vibrationPatterns = {
  SLOW: [180],
  MEDIUM: [140, 120, 140],
  FAST: [80, 70, 80, 70, 80],
  LONG_TWICE: [240, 160, 240],
  STRONG: [220, 90, 220, 90, 220],
  NONE: [],
}

export function triggerVibration(pattern = 'NONE') {
  const sequence = vibrationPatterns[pattern] || vibrationPatterns.NONE
  if (
    !sequence.length ||
    typeof navigator === 'undefined' ||
    !navigator.vibrate ||
    globalThis.__ABLE_BAND_VIBRATION_ENABLED__ !== true ||
    !canUseVibration()
  ) {
    return false
  }

  return safeVibrate(sequence)
}

export function vibrationPatternForAlert(alert) {
  if (!alert) {
    return 'NONE'
  }

  if (alert.vibrationPattern) {
    return alert.vibrationPattern
  }

  if (alert.severity === 'CRITICAL' || alert.type === 'EMERGENCY') {
    return 'STRONG'
  }

  if (alert.severity === 'HIGH') {
    return 'FAST'
  }

  if (alert.severity === 'MEDIUM') {
    return 'MEDIUM'
  }

  return 'SLOW'
}

export function vibrationLabelForAlert(alert) {
  const pattern = vibrationPatternForAlert(alert)
  const labels = {
    STRONG: '강한 긴급 진동',
    FAST: '빠른 위험 진동',
    MEDIUM: '중간 간격 진동',
    SLOW: '느린 생활 진동',
    NONE: '진동 없음',
  }

  return labels[pattern] || labels.NONE
}

export function stopVibration() {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function' ||
    !canUseVibration()
  ) {
    return false
  }

  return safeVibrate(0)
}

function canUseVibration() {
  const activation = globalThis.navigator?.userActivation || globalThis.userActivation
  if (!activation) {
    return true
  }

  return activation.isActive === true || activation.hasBeenActive === true
}

function safeVibrate(sequence) {
  try {
    return navigator.vibrate(sequence)
  } catch {
    return false
  }
}
