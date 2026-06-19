import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { GuardianPlaceholder } from './GuardianPlaceholder'
import * as guardianDashboardService from '../services/guardianDashboardService'

const account = {
  name: '보호자',
  email: 'guardian@example.com',
}

const storageKey = 'lg-able-band.guardianHistory.confirmed:guardian@example.com'

describe('GuardianPlaceholder', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.spyOn(guardianDashboardService, 'getGuardianDashboard').mockResolvedValue(
      createGuardianDashboard(),
    )
    vi.spyOn(guardianDashboardService, 'confirmGuardianHistoryItem').mockResolvedValue({})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('keeps a server-backed active alert visible when local confirmed history is stale', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify(['danger:161']))

    render(<GuardianPlaceholder account={account} onLogout={() => {}} />)

    expect(await screen.findAllByText('아직 처리되지 않은 긴급 요청입니다.')).toHaveLength(2)
    expect(screen.getByText('1건')).toBeTruthy()
  })

  it('does not hide server-backed alerts with local confirmation state after confirming', async () => {
    const user = userEvent.setup()
    render(<GuardianPlaceholder account={account} onLogout={() => {}} />)

    await screen.findAllByText('아직 처리되지 않은 긴급 요청입니다.')
    await user.click(screen.getByRole('button', { name: '긴급 도움 요청 확인' }))

    await waitFor(() => {
      expect(guardianDashboardService.confirmGuardianHistoryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          alertId: 161,
          key: 'danger:161',
        }),
      )
    })

    expect(window.localStorage.getItem(storageKey)).toBeNull()
    expect(screen.getAllByText('아직 처리되지 않은 긴급 요청입니다.')).toHaveLength(2)
  })
})

function createGuardianDashboard() {
  return {
    user: {
      userId: 6,
      name: '홍길덩',
      accessibilityType: 'VISUAL',
    },
    dangerAlerts: [
      {
        alertId: 161,
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        title: '긴급 도움 요청',
        message: '아직 처리되지 않은 긴급 요청입니다.',
        deviceName: '앱',
        occurredAt: '2026-06-18T17:33:34+09:00',
        status: 'ESCALATED',
      },
    ],
    emergencyRequests: [],
    summary: {
      unreadDangerAlertCount: 1,
      emergencyRequestCount: 1,
      activeEmergency: true,
      safetyMessage: '긴급 도움 요청이 진행 중입니다.',
    },
  }
}
