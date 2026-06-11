const STORAGE_KEY_PREFIX = 'lg-able-band.accessibilitySettings'

export const EMPTY_ACCESSIBILITY_SETTINGS = {
  voiceGuide: false,
  vibrationGuide: false,
  highContrast: false,
  largeText: false,
}

const VISUAL_TYPES = new Set([
  'VISUAL',
  'VISUALLY_IMPAIRED',
  'VISUAL_IMPAIRMENT',
  'BLIND',
  '시각장애',
  '시각장애인',
])

const HEARING_TYPES = new Set([
  'HEARING',
  'HEARING_IMPAIRED',
  'HEARING_IMPAIRMENT',
  'DEAF',
  '청각장애',
  '청각장애인',
])

export function getDefaultAccessibilitySettings(disabilityType) {
  const normalizedType = String(disabilityType || '').trim().toUpperCase()

  if (VISUAL_TYPES.has(normalizedType)) {
    return {
      voiceGuide: true,
      vibrationGuide: true,
      highContrast: true,
      largeText: true,
    }
  }

  if (HEARING_TYPES.has(normalizedType)) {
    return {
      voiceGuide: false,
      vibrationGuide: true,
      highContrast: true,
      largeText: true,
    }
  }

  return { ...EMPTY_ACCESSIBILITY_SETTINGS }
}

export function normalizeAccessibilitySettings(settings, disabilityType) {
  const defaults = getDefaultAccessibilitySettings(disabilityType)

  if (!settings || typeof settings !== 'object') {
    return defaults
  }

  return Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      typeof settings[key] === 'boolean' ? settings[key] : defaults[key],
    ]),
  )
}

export function accessibilitySettingsFromProfile(profile, disabilityType) {
  const channels = profile?.notificationPrefs?.channels

  if (!Array.isArray(channels)) {
    return getDefaultAccessibilitySettings(disabilityType)
  }

  return normalizeAccessibilitySettings(
    {
      voiceGuide: channels.includes('VOICE'),
      vibrationGuide: channels.includes('VIBRATION'),
      highContrast: profile.notificationPrefs.highContrast,
      largeText: profile.notificationPrefs.largeText,
    },
    disabilityType,
  )
}

export function loadStoredAccessibilitySettings(identity, disabilityType) {
  if (!identity || typeof window === 'undefined' || !window.localStorage) {
    return getDefaultAccessibilitySettings(disabilityType)
  }

  try {
    const value = window.localStorage.getItem(storageKey(identity))
    return value
      ? normalizeAccessibilitySettings(JSON.parse(value), disabilityType)
      : getDefaultAccessibilitySettings(disabilityType)
  } catch {
    return getDefaultAccessibilitySettings(disabilityType)
  }
}

export function hasStoredAccessibilitySettings(identity) {
  return Boolean(
    identity &&
      typeof window !== 'undefined' &&
      window.localStorage?.getItem(storageKey(identity)),
  )
}

export function storeAccessibilitySettings(identity, settings, disabilityType) {
  const normalizedSettings = normalizeAccessibilitySettings(settings, disabilityType)

  if (identity && typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(storageKey(identity), JSON.stringify(normalizedSettings))
  }

  return normalizedSettings
}

function storageKey(identity) {
  return `${STORAGE_KEY_PREFIX}.${String(identity).trim().toLowerCase()}`
}
