export const mockHomeSummary = {
  user: {
    userId: 1,
    name: '엘지',
    accessibilityType: 'VISUAL',
  },
  safetyStatus: {
    level: 'SAFE',
    message: 'Able Band가 안전 상태를 확인하고 있습니다.',
    lastCheckedAt: '2026-06-10T14:30:00+09:00',
  },
  recentAlerts: [
    {
      alertId: 101,
      type: 'LIFE',
      severity: 'LOW',
      title: '세탁 완료',
      message: '세탁이 끝났습니다. 건조기로 옮겨주세요.',
      deviceName: '세탁기',
      occurredAt: '2026-06-10T14:20:00+09:00',
      status: 'UNREAD',
    },
    {
      alertId: 102,
      type: 'DANGER',
      severity: 'HIGH',
      title: '전기레인지 확인',
      message: '주방에서 위험 신호가 감지되었습니다.',
      deviceName: '안전 전기레인지',
      occurredAt: '2026-06-10T13:55:00+09:00',
      status: 'READ',
    },
  ],
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
    canStartUwbNavigation: true,
    canRequestEmergency: true,
  },
}
