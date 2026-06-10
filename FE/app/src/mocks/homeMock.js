export const mockHomeSummary = {
  user: {
    userId: 1,
    name: '홍길동',
    accessibilityType: 'VISUAL',
  },
  safetyStatus: {
    level: 'SAFE',
    message: '현재 위험 알림이 없습니다.',
    lastCheckedAt: '2026-06-10T14:30:00+09:00',
  },
  recentAlerts: [
    {
      alertId: 101,
      type: 'LIFE',
      severity: 'LOW',
      title: '세탁 완료',
      message: '세탁이 완료되었습니다. 건조기로 옮겨주세요.',
      deviceName: '세탁기',
      occurredAt: '2026-06-10T14:20:00+09:00',
      status: 'UNREAD',
    },
    {
      alertId: 102,
      type: 'DANGER',
      severity: 'HIGH',
      title: '가스레인지 확인',
      message: '주방에서 장시간 사용 신호가 감지되었습니다.',
      deviceName: '가스레인지',
      occurredAt: '2026-06-10T13:55:00+09:00',
      status: 'READ',
    },
  ],
  deviceSummary: {
    totalCount: 5,
    connectedCount: 4,
    warningCount: 1,
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
