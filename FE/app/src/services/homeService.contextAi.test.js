import { vi } from 'vitest'
import { applyContextAiSafetyStatus } from './homeService'

const summary = {
  user: {
    userId: 1,
    accessibilityType: 'VISUAL',
  },
  safetyStatus: {
    level: 'SAFE',
    message: 'Able Band is checking the current safety status.',
    lastCheckedAt: '2026-06-10T14:30:00+09:00',
  },
  recentAlerts: [],
  emergency: {
    enabled: true,
  },
  quickActions: {
    canRequestEmergency: true,
  },
}

const alerts = [
  {
    alertId: 201,
    type: 'DANGER',
    severity: 'HIGH',
    title: 'LG electric range warning',
    message: 'The range has been on for a long time.',
    deviceName: 'LG electric range',
    device: {
      type: 'RANGE',
    },
    eventType: 'LONG_ON',
    locationName: 'Kitchen',
    occurredAt: '2026-06-10T14:20:00+09:00',
    status: 'UNREAD',
  },
]

describe('applyContextAiSafetyStatus', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('overlays only the home safety status when context AI returns a judgment', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        safetyStatusLevel: 'DANGER',
        message: 'Kitchen range danger was detected.',
        riskScore: 82,
        alertType: 'DANGER',
        screenMode: 'FULL_SCREEN_DANGER',
        vibrationPattern: 'FAST',
      }),
    )

    const nextSummary = await applyContextAiSafetyStatus(summary, alerts)

    expect(nextSummary).toMatchObject({
      ...summary,
      safetyStatus: {
        level: 'DANGER',
        message: 'Kitchen range danger was detected.',
        ai: {
          riskScore: 82,
          alertType: 'DANGER',
        },
      },
    })
    expect(nextSummary.recentAlerts).toBe(summary.recentAlerts)
    expect(nextSummary.emergency).toBe(summary.emergency)
    expect(nextSummary.quickActions).toBe(summary.quickActions)
  })

  it('keeps the original summary when context AI is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    await expect(applyContextAiSafetyStatus(summary, alerts)).resolves.toBe(summary)
  })

  it('does not let the user SOS receipt override home safety status', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        safetyStatusLevel: 'EMERGENCY',
        message: 'Emergency popup was detected.',
        riskScore: 95,
        alertType: 'EMERGENCY',
      }),
    )

    const nextSummary = await applyContextAiSafetyStatus(summary, [
      {
        alertId: 301,
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        title: '긴급 도움 요청',
        message: '사용자가 앱에서 긴급 지원을 요청했습니다.',
        deviceName: 'LG TV',
        occurredAt: '2026-06-10T14:35:00+09:00',
        status: 'ESCALATED',
      },
    ])

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(nextSummary).toBe(summary)
  })

  it('combines all unconfirmed alert judgments and keeps the highest AI safety level', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        safetyStatusLevel: 'CAUTION',
        message: 'Indoor air quality caution was detected.',
        riskScore: 50,
        alertType: 'DANGER',
      }))
      .mockResolvedValueOnce(jsonResponse({
        safetyStatusLevel: 'EMERGENCY',
        message: 'Emergency popup was detected.',
        riskScore: 95,
        alertType: 'EMERGENCY',
      }))

    const nextSummary = await applyContextAiSafetyStatus(summary, [
      {
        alertId: 301,
        type: 'DANGER',
        severity: 'MEDIUM',
        title: 'Air quality warning',
        deviceType: 'AIR_SENSOR',
        eventType: 'AIR_QUALITY_BAD',
        locationName: 'Living room',
        status: 'UNREAD',
      },
      {
        alertId: 302,
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        title: 'Emergency popup',
        deviceType: 'TV',
        eventType: 'EMERGENCY_POPUP',
        locationName: 'Living room',
        status: 'UNREAD',
      },
      {
        alertId: 303,
        type: 'LIFE',
        severity: 'LOW',
        title: 'Confirmed alert',
        status: 'CONFIRMED',
      },
    ])

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(nextSummary.safetyStatus).toMatchObject({
      level: 'EMERGENCY',
      message: 'Emergency popup was detected.',
      ai: {
        evaluatedAlertCount: 2,
        combinedLevels: {
          CAUTION: 1,
          EMERGENCY: 1,
        },
      },
    })
  })
})

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
