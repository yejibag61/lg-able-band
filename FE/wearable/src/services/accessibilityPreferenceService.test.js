import { vi } from 'vitest'
import {
  getWearableNotificationSettings,
  loadLocalNotificationSettings,
} from './accessibilityPreferenceService'

describe('wearable accessibility notification preferences', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('maps user notification channels from the wearable token profile', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        notificationPrefs: {
          channels: ['VIBRATION'],
        },
      }),
    )

    await expect(getWearableNotificationSettings()).resolves.toEqual({
      voiceGuide: false,
      vibrationGuide: true,
    })
  })

  it('uses locally mirrored app accessibility settings when the API is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    localStorage.setItem(
      'lg-able-band.accessibilitySettings.user@example.com',
      JSON.stringify({
        voiceGuide: true,
        vibrationGuide: false,
      }),
    )

    await expect(getWearableNotificationSettings()).resolves.toEqual({
      voiceGuide: true,
      vibrationGuide: false,
    })
  })

  it('keeps both alert feedback channels enabled by default', () => {
    expect(loadLocalNotificationSettings()).toEqual({
      voiceGuide: true,
      vibrationGuide: true,
    })
  })
})

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
