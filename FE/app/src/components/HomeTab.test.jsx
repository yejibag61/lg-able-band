import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { HomeTab } from './HomeTab'
import { getSafetyStatusDisplay } from '../utils/homeSummaryUtils'

const baseSummary = {
  safetyStatus: {
    level: 'CAUTION',
    message: '도어센서 확인이 필요합니다.',
    lastCheckedAt: '2026-06-10T14:30:00+09:00',
  },
  recentAlerts: [
    {
      alertId: 1,
      type: 'LIFE',
      severity: 'LOW',
      title: '세탁 완료',
      message: '세탁이 끝났습니다.',
      deviceName: '세탁기',
      occurredAt: '2026-06-10T14:20:00+09:00',
      status: 'CONFIRMED',
    },
    {
      alertId: 2,
      type: 'DANGER',
      severity: 'HIGH',
      title: '전기레인지 과열 주의',
      message: '주방에서 위험 신호가 감지되었습니다.',
      deviceName: '전기레인지',
      occurredAt: '2026-06-10T14:10:00+09:00',
      status: 'UNREAD',
    },
  ],
  deviceSummary: {
    totalCount: 4,
    connectedCount: 4,
    warningCount: 0,
    uwbSupportedCount: 1,
  },
  emergency: {
    enabled: true,
    primaryGuardianName: '보호자',
  },
  quickActions: {
    canRequestEmergency: false,
  },
}

describe('HomeTab', () => {
  it('renders backend status freshness and actionable alert metrics', () => {
    renderHomeTab()

    expect(screen.getByText('주의')).toBeTruthy()
    expect(screen.queryByText('방금 전')).toBeNull()
    expect(screen.getByText(/업데이트/)).toBeTruthy()
    expect(screen.getByText('최근 알림 1건')).toBeTruthy()
    expect(screen.getByText('미확인 1건')).toBeTruthy()
    expect(screen.getByText('위험 1건')).toBeTruthy()
    expect(screen.getByText('전기레인지 과열 주의')).toBeTruthy()
    expect(screen.queryByText('세탁 완료')).toBeNull()
    expect(screen.queryByText('기기 연결 상태')).toBeNull()
    expect(screen.queryByText('주의/오류 없음')).toBeNull()
  })

  it('keeps the SOS button clickable when a guardian must be registered first', async () => {
    const user = userEvent.setup()
    const handleEmergencyRequest = vi.fn()
    renderHomeTab(baseSummary, { onEmergencyRequest: handleEmergencyRequest })

    const sosButton = screen.getByRole('button', { name: '긴급 지원 요청' })

    expect(sosButton.disabled).toBe(false)

    await user.click(sosButton)

    expect(handleEmergencyRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        canRequest: false,
        reason: expect.stringContaining('보호자를 등록'),
      }),
    )
  })

  it('refreshes the home data from the status control', async () => {
    const user = userEvent.setup()
    const handleRefreshHome = vi.fn()
    renderHomeTab(baseSummary, { onRefreshHome: handleRefreshHome })

    await user.click(screen.getByRole('button', { name: '홈 정보 새로고침' }))

    expect(handleRefreshHome).toHaveBeenCalledTimes(1)
  })

  it('shows a disabled syncing control while the home data refreshes', () => {
    renderHomeTab(baseSummary, { refreshing: true })

    const refreshButton = screen.getByRole('button', { name: '홈 정보 새로고침' })
    expect(refreshButton.disabled).toBe(true)
    expect(screen.getByText('동기화 중')).toBeTruthy()
  })

  it('sends the emergency request action when SOS is available', async () => {
    const user = userEvent.setup()
    const handleEmergencyRequest = vi.fn()
    renderHomeTab(
      {
        ...baseSummary,
        quickActions: { canRequestEmergency: true },
      },
      { onEmergencyRequest: handleEmergencyRequest },
    )

    await user.click(screen.getByRole('button', { name: '긴급 지원 요청' }))

    expect(handleEmergencyRequest).toHaveBeenCalledTimes(1)
  })
})

function renderHomeTab(summary = baseSummary, options = {}) {
  return render(
    <HomeTab
      emergencyMessage={options.emergencyMessage || ''}
      emergencySubmitting={false}
      refreshing={options.refreshing || false}
      statusDisplay={getSafetyStatusDisplay(summary.safetyStatus.level)}
      summary={summary}
      onEmergencyRequest={options.onEmergencyRequest || (() => {})}
      onOpenAlerts={() => {}}
      onRefreshHome={options.onRefreshHome || (() => {})}
    />,
  )
}
