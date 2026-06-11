import {
  getDefaultAccessibilitySettings,
  hasStoredAccessibilitySettings,
  loadStoredAccessibilitySettings,
  storeAccessibilitySettings,
} from './accessibilitySettings'

describe('accessibility settings', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('creates the requested defaults for visual and hearing disability types', () => {
    expect(getDefaultAccessibilitySettings('VISUAL')).toEqual({
      voiceGuide: true,
      vibrationGuide: true,
      highContrast: true,
      largeText: true,
    })
    expect(getDefaultAccessibilitySettings('청각장애인')).toEqual({
      voiceGuide: false,
      vibrationGuide: true,
      highContrast: true,
      largeText: true,
    })
  })

  it('keeps user changes in localStorage', () => {
    expect(hasStoredAccessibilitySettings('user@example.com')).toBe(false)

    storeAccessibilitySettings(
      'user@example.com',
      {
        voiceGuide: false,
        vibrationGuide: false,
        highContrast: true,
        largeText: false,
      },
      'VISUAL',
    )

    expect(loadStoredAccessibilitySettings('user@example.com', 'VISUAL')).toEqual({
      voiceGuide: false,
      vibrationGuide: false,
      highContrast: true,
      largeText: false,
    })
    expect(hasStoredAccessibilitySettings('user@example.com')).toBe(true)
  })
})
