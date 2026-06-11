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
  if (!sequence.length || typeof navigator === 'undefined' || !navigator.vibrate) {
    return false
  }

  return navigator.vibrate(sequence)
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
