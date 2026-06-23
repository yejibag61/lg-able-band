import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const { createAmbientDetectionSessionMock } = vi.hoisted(() => ({
  createAmbientDetectionSessionMock: vi.fn(),
}))

vi.mock('../features/living-signal/livingSignalAudio', async () => {
  const actual = await vi.importActual('../features/living-signal/livingSignalAudio')

  return {
    ...actual,
    isMicrophoneSupported: () => true,
    createAmbientDetectionSession: createAmbientDetectionSessionMock,
  }
})

import { HomeScreen } from './HomeScreen'

const API_BASE_URL = 'http://localhost:8080'

const session = {
  account: {
    name: '한빛',
    email: 'user@example.com',
  },
  userProfile: {
    accessibilityType: 'VISUAL',
  },
}

const homeSummary = {
  user: {
    name: '한빛',
    accessibilityType: 'VISUAL',
  },
  safetyStatus: {
    level: 'SAFE',
    message: 'Able Band가 안전 상태를 확인하고 있습니다.',
    lastCheckedAt: '2026-06-10T14:30:00+09:00',
  },
  recentAlerts: [],
  deviceSummary: {
    totalCount: 1,
    connectedCount: 1,
    warningCount: 0,
    uwbSupportedCount: 1,
  },
  emergency: {
    enabled: true,
    primaryGuardianName: '보호자',
  },
  quickActions: {
    canRequestEmergency: true,
  },
}

const appPreview = {
  alerts: [],
  devices: [],
  accessibility: {
    disabilityType: '시각장애',
    voiceGuide: true,
    vibrationGuide: true,
    highContrast: true,
    textSize: '크게',
  },
  livingSignals: {
    summary: {
      registeredSoundCount: 1,
      enrolledClipCount: 1,
      threshold: 0.8,
    },
    sounds: [
      {
        soundId: 701,
        registeredSoundName: '현관 초인종',
        soundType: 'doorbell',
        soundTypeLabel: '초인종',
        notes: '',
        updatedAt: '2026-06-10T14:20:00+09:00',
        recordings: [
          {
            recordingId: 801,
            label: 'doorbell-1',
            createdAt: '2026-06-10T14:00:00+09:00',
            durationSec: 1.2,
            audioDataUrl: '',
            embedding: [0.11, 0.22, 0.33, 0.44, 0.2, 0.1, 0.05, 0.02],
          },
        ],
      },
    ],
    workflow: [],
  },
}

describe('HomeScreen living signal detection', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('lg-able-band.accessToken', 'api-user-token')
    window.scrollTo = vi.fn()
    window.HTMLElement.prototype.scrollTo = vi.fn()
    createAmbientDetectionSessionMock.mockReset()
    createAmbientDetectionSessionMock.mockResolvedValue({
      stop: vi.fn().mockResolvedValue(undefined),
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('creates and renders an alert when a living signal match is detected in the app', async () => {
    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '한빛 홈' })

    await waitFor(() => {
      expect(createAmbientDetectionSessionMock).toHaveBeenCalled()
    })

    const [{ onMatch }] = createAmbientDetectionSessionMock.mock.calls[0]

    await onMatch({
      predicted: true,
      registeredSoundName: '현관 초인종',
      soundType: 'doorbell',
      soundTypeLabel: '초인종',
      similarity: 0.91,
      detectedAt: '2026-06-10T14:45:00+09:00',
    })

    await waitFor(() => {
      expect(findDetectionCall()).toBeTruthy()
    })

    expect(screen.getByText('현관 초인종 감지')).toBeTruthy()
  })
})

async function mockFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url
  const method = (init.method || 'GET').toUpperCase()

  if (url === `${API_BASE_URL}/api/app/home` && method === 'GET') {
    return jsonResponse(homeSummary)
  }

  if (url === `${API_BASE_URL}/api/alerts?limit=20` && method === 'GET') {
    return jsonResponse({ items: [] })
  }

  if (url === `${API_BASE_URL}/api/devices` && method === 'GET') {
    return jsonResponse({ items: [] })
  }

  if (url === `${API_BASE_URL}/api/guardians` && method === 'GET') {
    return jsonResponse({ items: [] })
  }

  if (url === `${API_BASE_URL}/api/users/me` && method === 'GET') {
    return jsonResponse({
      role: 'USER',
      userId: 1,
      name: '한빛',
      email: 'user@example.com',
      accessibilityType: 'VISUAL',
      notificationPrefs: {
        channels: ['VOICE', 'VIBRATION'],
        highContrast: true,
        largeText: true,
      },
    })
  }

  if (url === `${API_BASE_URL}/api/living-signals` && method === 'GET') {
    return jsonResponse({
      threshold: 0.8,
      workflow: [],
      sounds: appPreview.livingSignals.sounds,
    })
  }

  if (url === `${API_BASE_URL}/api/living-signals/detections` && method === 'POST') {
    const body = JSON.parse(init.body)
    if (body.targetUserEmail !== 'user@example.com') {
      return jsonResponse({ message: 'bad request' }, { status: 400 })
    }
    return jsonResponse({
      alertId: 9901,
      type: 'LIFE',
      severity: 'MEDIUM',
      title: '현관 초인종 감지',
      message: '현관 초인종 생활 알림음이 감지되었습니다.',
      voiceGuide: '현관 초인종 생활 알림음이 감지되었습니다.',
      deviceName: 'Able Band',
      occurredAt: '2026-06-10T14:45:00+09:00',
      status: 'UNREAD',
    })
  }

  if (url === `${API_BASE_URL}/api/app/preview` && method === 'GET') {
    return jsonResponse(appPreview)
  }

  return jsonResponse({ message: 'not found' }, { status: 404 })
}

function findDetectionCall() {
  return globalThis.fetch.mock.calls.find(([url, init = {}]) => {
    return url === `${API_BASE_URL}/api/living-signals/detections` && init.method === 'POST'
  })
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
