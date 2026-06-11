import { apiRequest } from './apiClient'
import {
  accessibilitySettingsFromProfile,
  hasStoredAccessibilitySettings,
  loadStoredAccessibilitySettings,
  storeAccessibilitySettings,
} from '../utils/accessibilitySettings'

export async function getAccessibilitySettings({ accessibilityType, identity }) {
  if (hasStoredAccessibilitySettings(identity)) {
    return loadStoredAccessibilitySettings(identity, accessibilityType)
  }

  try {
    const profile = await apiRequest('/api/users/me')
    const settings = accessibilitySettingsFromProfile(
      profile,
      profile.accessibilityType || accessibilityType,
    )
    return storeAccessibilitySettings(identity, settings, profile.accessibilityType || accessibilityType)
  } catch {
    return loadStoredAccessibilitySettings(identity, accessibilityType)
  }
}

export async function updateAccessibilitySettings({
  accessibilityType,
  identity,
  settings,
}) {
  const storedSettings = storeAccessibilitySettings(identity, settings, accessibilityType)

  const profile = await apiRequest('/api/users/me/accessibility', {
    method: 'PUT',
    body: {
      accessibilityType,
      notificationPrefs: {
        channels: [
          ...(storedSettings.voiceGuide ? ['VOICE'] : []),
          ...(storedSettings.vibrationGuide ? ['VIBRATION'] : []),
        ],
        highContrast: storedSettings.highContrast,
        largeText: storedSettings.largeText,
      },
    },
  })

  const savedSettings = accessibilitySettingsFromProfile(profile, accessibilityType)
  return storeAccessibilitySettings(identity, savedSettings, accessibilityType)
}
