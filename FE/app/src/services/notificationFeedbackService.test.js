import { vi } from 'vitest'
import { runAlertFeedback, runAlertsFeedback } from './notificationFeedbackService'

const alert = {
  alertId: 201,
  type: 'DANGER',
  severity: 'HIGH',
  title: '전기레인지 과열 주의',
  message: '주방에서 위험 신호가 감지되었습니다.',
  voiceGuide: '전기레인지 과열 주의가 감지되었습니다.',
  status: 'UNREAD',
}

describe('notification feedback service', () => {
  beforeEach(() => {
    installSpeechSynthesisMock()
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(() => true),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete navigator.vibrate
    delete window.speechSynthesis
    delete window.SpeechSynthesisUtterance
  })

  it('runs both voice and vibration when both accessibility settings are enabled', () => {
    const result = runAlertFeedback(alert, {
      voiceGuide: true,
      vibrationGuide: true,
    })

    expect(result).toEqual({ voice: true, vibration: true })
    expect(window.speechSynthesis.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: '전기레인지 과열 주의가 감지되었습니다.' }),
    )
    expect(navigator.vibrate).toHaveBeenCalledWith([80, 70, 80, 70, 80])
  })

  it('does not run disabled accessibility channels', () => {
    const result = runAlertFeedback(alert, {
      voiceGuide: false,
      vibrationGuide: false,
    })

    expect(result).toEqual({ voice: false, vibration: false })
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })

  it('runs feedback for every new alert in a batch', () => {
    const secondAlert = {
      ...alert,
      alertId: 202,
      severity: 'MEDIUM',
      voiceGuide: '현관문 열림 알림입니다.',
    }

    const result = runAlertsFeedback([alert, secondAlert], {
      voiceGuide: true,
      vibrationGuide: true,
    })

    expect(result).toEqual({ voice: true, vibrationCount: 2 })
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(window.speechSynthesis.speak).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '전기레인지 과열 주의가 감지되었습니다. 현관문 열림 알림입니다.',
      }),
    )
    expect(navigator.vibrate).toHaveBeenCalledTimes(2)
  })
})

function installSpeechSynthesisMock() {
  class MockSpeechSynthesisUtterance {
    constructor(text) {
      this.text = text
    }
  }

  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: MockSpeechSynthesisUtterance,
  })
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      speak: vi.fn(),
    },
  })
}
