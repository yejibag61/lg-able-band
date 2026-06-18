import {
  createHomeAlertMetrics,
  formatStatusUpdatedAt,
  getActionableRecentAlerts,
  getDeviceWarningSummary,
  getEmergencyAvailability,
  getSafetyStatusDisplay,
  mergeAlertStatusIntoHomeSummary,
  updateAlertsWithStatus,
} from './homeSummaryUtils'

describe('home summary utilities', () => {
  it('maps backend safety status levels to Korean labels', () => {
    expect(getSafetyStatusDisplay('SAFE').label).toBe('안전')
    expect(getSafetyStatusDisplay('CAUTION').label).toBe('주의')
    expect(getSafetyStatusDisplay('DANGER').label).toBe('위험')
    expect(getSafetyStatusDisplay('EMERGENCY').label).toBe('긴급')
    expect(getSafetyStatusDisplay('UNKNOWN')).toEqual({
      label: '상태 확인 필요',
      emoji: '🙂',
    })
  })

  it('formats last checked time and hides unreliable values', () => {
    const now = new Date('2026-06-10T15:30:00+09:00')

    expect(formatStatusUpdatedAt('2026-06-10T15:29:30+09:00', now)).toBe('방금 업데이트')
    expect(formatStatusUpdatedAt('2026-06-10T15:28:00+09:00', now)).toBe('2분 전 업데이트')
    expect(formatStatusUpdatedAt('2026-06-10T15:19:00+09:00', now)).toBe('10분 전 업데이트')
    expect(formatStatusUpdatedAt('2026-06-10T14:31:00+09:00', now)).toBe('50분 전 업데이트')
    expect(formatStatusUpdatedAt('2026-06-10T12:20:00+09:00', now)).toBe('3시간 전 업데이트')
    expect(formatStatusUpdatedAt('')).toBe('')
    expect(formatStatusUpdatedAt('not-a-date')).toBe('')
  })

  it('summarizes only actionable alerts for the home card', () => {
    const alerts = [
      { alertId: 1, type: 'LIFE', severity: 'LOW', status: 'CONFIRMED' },
      { alertId: 2, type: 'DANGER', severity: 'MEDIUM', status: 'UNREAD' },
      { alertId: 3, type: 'LIFE', severity: 'HIGH', status: 'REPLAYED' },
      { alertId: 4, type: 'EMERGENCY', severity: 'CRITICAL', status: 'ESCALATED' },
    ]

    expect(getActionableRecentAlerts(alerts).map((alert) => alert.alertId)).toEqual([2])
    expect(createHomeAlertMetrics(alerts)).toEqual({
      total: 3,
      unread: 1,
      danger: 3,
    })
  })

  it('excludes user emergency request receipts from home recent alerts', () => {
    const alerts = [
      {
        alertId: 301,
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        title: '긴급 지원 요청 접수',
        message: '사용자가 앱에서 긴급 지원을 요청했습니다.',
        status: 'ESCALATED',
      },
      {
        alertId: 302,
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        title: '가스 누출 긴급 감지',
        message: '주방 센서에서 긴급 위험 신호가 감지되었습니다.',
        status: 'UNREAD',
      },
    ]

    expect(getActionableRecentAlerts(alerts).map((alert) => alert.alertId)).toEqual([302])
    expect(createHomeAlertMetrics(alerts)).toEqual({
      total: 1,
      unread: 1,
      danger: 1,
    })
  })

  it('patches alert status into home and alert state immutably', () => {
    const summary = {
      recentAlerts: [
        { alertId: 1, title: '세탁 완료', status: 'UNREAD' },
        { alertId: 2, title: '도어센서', status: 'UNREAD' },
      ],
    }

    const nextSummary = mergeAlertStatusIntoHomeSummary(summary, 1, 'CONFIRMED')
    const nextAlerts = updateAlertsWithStatus(summary.recentAlerts, 2, 'REPLAYED')

    expect(nextSummary).not.toBe(summary)
    expect(nextSummary.recentAlerts[0].status).toBe('CONFIRMED')
    expect(summary.recentAlerts[0].status).toBe('UNREAD')
    expect(nextAlerts[1].status).toBe('REPLAYED')
  })

  it('explains emergency availability and device warning criteria', () => {
    expect(
      getEmergencyAvailability({
        emergency: { enabled: true },
        quickActions: { canRequestEmergency: true },
      }),
    ).toEqual({ canRequest: true, reason: '' })

    expect(
      getEmergencyAvailability({
        emergency: { enabled: false },
        quickActions: { canRequestEmergency: true },
      }).reason,
    ).toContain('보호자를 등록')

    expect(getDeviceWarningSummary({ warningCount: 0 }).label).toBe('주의/오류 없음')
    expect(getDeviceWarningSummary({ warningCount: '2' })).toEqual({
      count: 2,
      label: '주의/오류 2개',
    })
  })
})
