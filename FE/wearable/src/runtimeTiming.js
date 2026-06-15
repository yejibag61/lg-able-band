const DEFAULT_UWB_POLL_INTERVAL_MS = 2000
const DEFAULT_PAIRING_POLL_INTERVAL_MS = 1000
const DEFAULT_PAIRING_SUCCESS_TRANSITION_MS = 500

export function getUwbPollIntervalMs() {
  return timingOverride({
    windowKey: '__ABLE_BAND_UWB_POLL_MS__',
    envKey: 'VITE_UWB_POLL_MS',
    defaultValue: DEFAULT_UWB_POLL_INTERVAL_MS,
  })
}

export function getPairingPollIntervalMs() {
  return timingOverride({
    windowKey: '__ABLE_BAND_PAIRING_POLL_MS__',
    envKey: 'VITE_PAIRING_POLL_MS',
    defaultValue: DEFAULT_PAIRING_POLL_INTERVAL_MS,
  })
}

export function getPairingSuccessTransitionMs() {
  return timingOverride({
    windowKey: '__ABLE_BAND_PAIRING_SUCCESS_DELAY_MS__',
    envKey: 'VITE_PAIRING_SUCCESS_TRANSITION_MS',
    defaultValue: DEFAULT_PAIRING_SUCCESS_TRANSITION_MS,
  })
}

function timingOverride({ windowKey, envKey, defaultValue }) {
  return (
    positiveNumber(globalThis.window?.[windowKey]) ??
    positiveNumber(import.meta.env?.[envKey]) ??
    defaultValue
  )
}

function positiveNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}
