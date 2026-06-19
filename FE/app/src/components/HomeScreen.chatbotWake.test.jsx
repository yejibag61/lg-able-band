import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeScreen } from './HomeScreen'
import { startChatbotWakeService, stopChatbotWakeService } from '../services/chatbotWakeService'

vi.mock('../services/chatbotWakeService', () => ({
  startChatbotWakeService: vi.fn(() => true),
  stopChatbotWakeService: vi.fn(),
}))

vi.mock('./VoiceChatbot', () => ({
  CHATBOT_ACTIVITY_EVENT: 'lg-able-band:chatbot-activity',
  CHATBOT_INTERRUPT_EVENT: 'lg-able-band:interrupt-chatbot',
  VoiceChatbot: () => <div data-testid="voice-chatbot" />,
}))

vi.mock('../services/homeService', () => ({
  applyContextAiSafetyStatus: vi.fn((summary) => Promise.resolve(summary)),
  getAppPreview: vi.fn(() => Promise.resolve({
    accessibility: {},
    alerts: [],
    devices: [],
  })),
  getHomeSummary: vi.fn(() => Promise.resolve({
    user: {
      name: '소희',
      accessibilityType: 'VISUAL',
    },
    safetyStatus: {
      level: 'SAFE',
      message: '안전 상태를 확인 중입니다.',
    },
    recentAlerts: [],
    deviceSummary: {
      totalCount: 0,
      connectedCount: 0,
      warningCount: 0,
      uwbSupportedCount: 0,
    },
    emergency: {
      enabled: true,
    },
    quickActions: {
      canRequestEmergency: true,
    },
  })),
}))

vi.mock('../services/accessibilityService', () => ({
  getAccessibilitySettings: vi.fn(() => Promise.resolve({})),
  updateAccessibilitySettings: vi.fn(),
}))

vi.mock('../services/guardianService', () => ({
  createGuardian: vi.fn(),
  deleteGuardian: vi.fn(),
  getGuardians: vi.fn(() => Promise.resolve([])),
  updateGuardian: vi.fn(),
}))

vi.mock('../services/deviceService', () => ({
  getDevices: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../services/emergencyService', () => ({
  createEmergencyRequest: vi.fn(),
}))

vi.mock('../services/wearablePairingService', () => ({
  completeWearablePairing: vi.fn(),
}))

const session = {
  account: {
    email: 'user@example.com',
    name: '소희',
  },
  userProfile: {
    accessibilityType: 'VISUAL',
  },
}

describe('HomeScreen chatbot wake service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
  })

  it('starts wake listening while the user home screen is mounted', async () => {
    const { unmount } = render(<HomeScreen session={session} onLogout={() => {}} />)

    await waitFor(() => {
      expect(startChatbotWakeService).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(stopChatbotWakeService).toHaveBeenCalledTimes(1)
  })
})
