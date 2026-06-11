export const mockPairingSession = {
  pairingSessionId: 'pairing-able-260610-1440',
  deviceId: 'able-band-demo-001',
  deviceName: 'LG Able Band',
  pairingCode: 'ABLE-4IN-260610',
  nonce: 'demo-nonce-4inch-001',
  issuedAt: '2026-06-10T14:40:00+09:00',
  expiresAt: '2026-06-10T14:45:00+09:00',
  expiresInMinutes: 5,
}

export const mockAlerts = [
  {
    alertId: 301,
    type: 'EMERGENCY',
    severity: 'CRITICAL',
    title: '가스 위험 감지',
    message: '주방에서 가스 위험이 감지되었습니다. 즉시 확인하세요.',
    voiceGuide: '가스 위험이 감지되었습니다. 창문을 열고 안전한 곳으로 이동하세요.',
    deviceName: '가스 센서',
    locationName: '주방',
    occurredAt: '2026-06-10T14:42:00+09:00',
    status: 'UNREAD',
    vibrationPattern: 'STRONG',
  },
  {
    alertId: 302,
    type: 'LIFE',
    severity: 'LOW',
    title: '세탁 완료',
    message: '세탁이 끝났습니다.',
    voiceGuide: '세탁이 완료되었습니다. 세탁물을 건조기로 옮겨주세요.',
    deviceName: '세탁기',
    locationName: '세탁실',
    occurredAt: '2026-06-10T14:20:00+09:00',
    status: 'UNREAD',
    vibrationPattern: 'SLOW',
  },
]

export const mockEmergencyResponse = {
  emergencyRequestId: 501,
  status: 'SENT',
  source: 'WEARABLE',
  message: '보호자에게 긴급 요청을 보냈습니다.',
  guardianTargets: [
    {
      guardianId: 1,
      name: '김보호',
      deliveryStatus: 'SENT',
    },
  ],
}

export const mockUwbSessions = [
  {
    sessionId: 9001,
    targetDeviceName: '세탁기',
    distanceM: 2.4,
    confidence: 0.88,
    navigationStatus: 'ACTIVE',
    voiceGuide: '세탁기까지 약 2미터입니다. 가까워지고 있습니다.',
    vibrationPattern: 'MEDIUM',
    updatedAt: '2026-06-10T14:36:00+09:00',
  },
  {
    sessionId: 9002,
    targetDeviceName: '세탁기',
    distanceM: 0.3,
    confidence: 0.94,
    navigationStatus: 'ARRIVED',
    voiceGuide: '세탁기 앞에 도착했습니다.',
    vibrationPattern: 'LONG_TWICE',
    updatedAt: '2026-06-10T14:37:00+09:00',
  },
  {
    sessionId: 9003,
    targetDeviceName: '세탁기',
    distanceM: 2.4,
    confidence: 0.22,
    navigationStatus: 'FAILED',
    voiceGuide: '신호를 다시 확인해주세요.',
    vibrationPattern: 'NONE',
    updatedAt: '2026-06-10T14:38:00+09:00',
  },
]
