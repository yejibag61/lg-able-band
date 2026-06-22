const vibrationPatterns = {
  LOW: [120],
  MEDIUM: [140, 90, 140],
  HIGH: [90, 60, 90, 60, 90],
  CRITICAL: [220, 120, 220, 120, 220],
}

export function triggerAppAlertVibration(alert) {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function' ||
    !canUseVibration()
  ) {
    return false
  }

  const pattern = vibrationPatterns[alert?.severity] || vibrationPatterns.MEDIUM
  return safeVibrate(pattern)
}

function canUseVibration() {
  const activation = globalThis.navigator?.userActivation || globalThis.userActivation
  if (!activation) {
    return true
  }

  return activation.isActive === true || activation.hasBeenActive === true
}

function safeVibrate(pattern) {
  try {
    return navigator.vibrate(pattern)
  } catch {
    return false
  }
}
