import { wearableApiRequest } from './wearableApiClient'

const DEFAULT_NOTIFICATION_SETTINGS = {
  voiceGuide: true,
  vibrationGuide: true,
}

const APP_ACCESSIBILITY_STORAGE_PREFIX = 'lg-able-band.accessibilitySettings.'

export async function getWearableNotificationSettings() {
  try {
    const profile = await wearableApiRequest('/api/users/me', { method: 'GET' })
    const channels = profile?.notificationPrefs?.channels

    if (Array.isArray(channels)) {
      return normalizeNotificationSettings({
        voiceGuide: channels.includes('VOICE'),
        vibrationGuide: channels.includes('VIBRATION'),
      })
    }
  } catch {
    return loadLocalNotificationSettings()
  }

  return loadLocalNotificationSettings()
}

export function loadLocalNotificationSettings() {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }

  const storageKey = storageKeys()
    .filter((key) => key?.startsWith(APP_ACCESSIBILITY_STORAGE_PREFIX))
    .sort()
    .at(-1)

  if (!storageKey) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }

  try {
    return normalizeNotificationSettings(JSON.parse(localStorage.getItem(storageKey)))
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS }
  }
}

function storageKeys() {
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
}

function normalizeNotificationSettings(settings) {
  return {
    voiceGuide:
      typeof settings?.voiceGuide === 'boolean'
        ? settings.voiceGuide
        : DEFAULT_NOTIFICATION_SETTINGS.voiceGuide,
    vibrationGuide:
      typeof settings?.vibrationGuide === 'boolean'
        ? settings.vibrationGuide
        : DEFAULT_NOTIFICATION_SETTINGS.vibrationGuide,
  }
}
