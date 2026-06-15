import {
  confirmAlert,
  createPairingPayload,
  createWearableService,
  getCurrentAlert,
  getPairingSession,
  getUwbSession,
  normalizeUwbSession,
  replayAlert,
  requestEmergencyHelp,
  unpairWearable,
} from './wearableService'

describe('wearableService', () => {
  afterEach(() => {
    localStorage.clear()
    delete globalThis.__ABLE_BAND_ALLOW_API_FAILURE_FALLBACK__
    delete globalThis.__ABLE_BAND_REQUIRE_PERSISTENT_PAIRING__
  })

  it('creates a stable QR pairing payload for phone linking', async () => {
    const session = await getPairingSession()
    const payload = createPairingPayload(session)

    expect(payload).toContain('pairingSessionId=pairing-able-260610-1440')
    expect(payload).toContain('deviceId=able-band-demo-001')
    expect(payload).toContain('pairingCode=ABLE-4IN-260610')
    expect(payload).toContain('nonce=demo-nonce-4inch-001')
    expect(payload).toContain('expiresAt=2026-06-10T14%3A45%3A00%2B09%3A00')
    expect(session.expiresInMinutes).toBe(5)
  })

  it('creates pairing sessions through the wearable final api', async () => {
    const apiFetch = vi.fn(async () =>
      jsonResponse({
        pairingSessionId: 'pairing-api-001',
        deviceId: 'able-band-api-001',
        pairingCode: 'ABLE-API-001',
        nonce: 'nonce-api-001',
        issuedAt: '2026-06-10T15:00:00+09:00',
        expiresAt: '2026-06-10T15:05:00+09:00',
        expiresInMinutes: 5,
        pairingPayload: 'lg-able-band://pair?pairingSessionId=pairing-api-001&from=backend',
        status: 'WAITING',
      }),
    )
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: apiFetch,
      fallbackEnabled: false,
    })

    const session = await service.createPairingSession()

    expect(apiFetch).toHaveBeenCalledWith(
      'http://api.test/api/wearable/pairing-sessions',
      expect.objectContaining({
        body: JSON.stringify({
          deviceId: 'able-band-demo-001',
          deviceName: 'LG Able Band',
          pairingCode: 'ABLE-4IN-260610',
        }),
        method: 'POST',
      }),
    )
    expect(session).toMatchObject({
      pairingSessionId: 'pairing-api-001',
      deviceId: 'able-band-api-001',
      pairingPayload: 'lg-able-band://pair?pairingSessionId=pairing-api-001&from=backend',
      status: 'waiting',
    })
  })

  it('uses the Vite proxy API path when no explicit API base URL is configured', async () => {
    const apiFetch = vi.fn(async () =>
      jsonResponse({
        pairingSessionId: 'pairing-api-relative-001',
        deviceId: 'able-band-relative-001',
        pairingCode: 'ABLE-REL-001',
        nonce: 'nonce-relative-001',
        pairingPayload: 'lg-able-band://pair?pairingSessionId=pairing-api-relative-001',
        status: 'WAITING',
      }),
    )
    const service = createWearableService({
      fetchImpl: apiFetch,
      fallbackEnabled: false,
    })

    await service.createPairingSession()

    expect(apiFetch).toHaveBeenCalledWith(
      '/api/wearable/pairing-sessions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('polls pairing session status with device id and nonce', async () => {
    const apiFetch = vi.fn(async () =>
      jsonResponse({
        pairingSessionId: 'pairing-api-001',
        deviceId: 'able-band-api-001',
        nonce: 'nonce-api-001',
        status: 'PAIRED',
        accessToken: 'paired-api-token',
      }),
    )
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: apiFetch,
      fallbackEnabled: false,
    })

    const status = await service.getPairingSessionStatus({
      pairingSessionId: 'pairing-api-001',
      deviceId: 'able-band-api-001',
      nonce: 'nonce-api-001',
    })

    expect(apiFetch).toHaveBeenCalledWith(
      'http://api.test/api/wearable/pairing-sessions/pairing-api-001?deviceId=able-band-api-001&nonce=nonce-api-001',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(status).toMatchObject({
      pairingSessionId: 'pairing-api-001',
      status: 'success',
      accessToken: 'paired-api-token',
    })
  })

  it('unpairs a wearable session through the final api and clears the stored token', async () => {
    localStorage.setItem('lg-able-band.accessToken', 'paired-api-token')
    const apiFetch = vi.fn(async () => jsonResponse({ status: 'UNPAIRED' }))
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: apiFetch,
      fallbackEnabled: false,
    })

    const response = await service.unpairWearable({
      pairingSessionId: 'pairing-api-001',
      deviceId: 'able-band-api-001',
      nonce: 'nonce-api-001',
    })

    expect(apiFetch).toHaveBeenCalledWith(
      'http://api.test/api/wearable/pairing-sessions/pairing-api-001/unpair',
      expect.objectContaining({
        body: JSON.stringify({
          deviceId: 'able-band-api-001',
          nonce: 'nonce-api-001',
        }),
        method: 'POST',
      }),
    )
    expect(response.status).toBe('UNPAIRED')
    expect(localStorage.getItem('lg-able-band.accessToken')).toBeNull()
  })

  it('falls back to a mock pairing session when explicit development fallback is enabled', async () => {
    globalThis.__ABLE_BAND_ALLOW_API_FAILURE_FALLBACK__ = true
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: vi.fn(async () => {
        throw new Error('network down')
      }),
      fallbackEnabled: true,
    })

    const session = await service.createPairingSession()

    expect(session.pairingSessionId).toBe('pairing-able-260610-1440')
    expect(session.pairingPayload).toContain('lg-able-band://pair')
    expect(session.status).toBe('waiting')
  })

  it('rejects phone pairing QR creation when the shared database is unavailable', async () => {
    globalThis.__ABLE_BAND_REQUIRE_PERSISTENT_PAIRING__ = true
    const apiFetch = vi.fn(async (url) => {
      if (url === 'http://api.test/api/db/status') {
        return jsonResponse({ connected: false, database: 'unconfigured' }, 503)
      }
      return jsonResponse({
        pairingSessionId: 'pairing-memory-only',
        deviceId: 'able-band-demo-001',
        pairingCode: 'ABLE-4IN-260610',
        nonce: 'memory-only-nonce',
        status: 'WAITING',
      })
    })
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: apiFetch,
      fallbackEnabled: true,
    })

    await expect(service.createPairingSession()).rejects.toThrow(
      '공유 DB에 연결된 백엔드가 필요합니다.',
    )
    expect(apiFetch).toHaveBeenCalledWith(
      'http://api.test/api/db/status',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(apiFetch).not.toHaveBeenCalledWith(
      'http://api.test/api/wearable/pairing-sessions',
      expect.anything(),
    )
  })

  it('selects the highest priority current alert', async () => {
    const alert = await getCurrentAlert()

    expect(alert.alertId).toBe(201)
    expect(alert.severity).toBe('HIGH')
    expect(alert.type).toBe('DANGER')
  })

  it('confirms and replays an alert without mutating the fixture', async () => {
    const confirmed = await confirmAlert(201)
    const replayed = await replayAlert(201)
    const current = await getCurrentAlert()

    expect(confirmed.status).toBe('CONFIRMED')
    expect(replayed.status).toBe('REPLAYED')
    expect(replayed.voiceGuide).toContain('전기레인지 과열 주의')
    expect(current.status).toBe('UNREAD')
  })

  it('normalizes UWB final API and mock session shapes', async () => {
    const finalApiShape = normalizeUwbSession({
      sessionId: 9002,
      targetDevice: { deviceId: 10, name: '세탁기' },
      status: 'ARRIVED',
      distanceM: 0,
      confidence: 0.94,
      voiceGuide: '세탁기 앞입니다.',
      vibrationPattern: 'LONG_TWICE',
    })
    const mockShape = await getUwbSession(9001)
    const arrivedMockShape = await getUwbSession(9002)

    expect(finalApiShape.targetDeviceName).toBe('세탁기')
    expect(finalApiShape.navigationStatus).toBe('ARRIVED')
    expect(mockShape.targetDeviceName).toBe('세탁기')
    expect(mockShape.navigationStatus).toBe('ACTIVE')
    expect(arrivedMockShape.navigationStatus).toBe('ARRIVED')
    expect(arrivedMockShape.vibrationPattern).toBe('LONG_TWICE')
  })

  it('normalizes DB UWB target and session shapes from the final api', async () => {
    const apiFetch = vi.fn(async (url, options = {}) => {
      if (url === 'http://api.test/api/uwb/targets') {
        return jsonResponse({
          items: [
            {
              deviceId: 44,
              name: '냉장고',
              type: 'REFRIGERATOR',
              connectionStatus: 'CONNECTED',
              locationSupported: true,
              updatedAt: '2026-06-10T14:00:00+09:00',
            },
          ],
        })
      }
      if (url === 'http://api.test/api/uwb/sessions' && options.method === 'POST') {
        return jsonResponse({
          sessionId: 9901,
          targetDevice: { deviceId: 44, name: '냉장고' },
          targetDeviceId: 44,
          targetDeviceName: '냉장고',
          status: 'ACTIVE',
          navigationStatus: 'ACTIVE',
          distanceM: 4,
          confidence: 0.86,
          voiceGuide: '냉장고까지 약 4미터입니다.',
          vibrationPattern: 'SLOW',
          updatedAt: '2026-06-10T14:01:00+09:00',
        })
      }
      throw new Error(`unexpected request: ${url}`)
    })
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: apiFetch,
      fallbackEnabled: false,
    })

    const targets = await service.getUwbTargets()
    const session = await service.startUwbSession(targets[0].deviceId)

    expect(apiFetch).toHaveBeenCalledWith(
      'http://api.test/api/uwb/targets',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(apiFetch).toHaveBeenCalledWith(
      'http://api.test/api/uwb/sessions',
      expect.objectContaining({
        body: JSON.stringify({ targetDeviceId: 44 }),
        method: 'POST',
      }),
    )
    expect(targets[0]).toMatchObject({
      deviceId: 44,
      name: '냉장고',
      locationSupported: true,
      status: '연결됨',
    })
    expect(session).toMatchObject({
      sessionId: 9901,
      targetDeviceName: '냉장고',
      navigationStatus: 'ACTIVE',
      distanceM: 4,
      confidence: 0.86,
      voiceGuide: '냉장고까지 약 4미터입니다.',
      vibrationPattern: 'SLOW',
    })
  })

  it('normalizesDbUwbSessionShape', () => {
    const session = normalizeUwbSession({
      sessionId: 9101,
      targetDevice: { deviceId: 10, name: '세탁기' },
      status: 'ACTIVE',
      distanceM: 2.4,
      confidence: 0.91,
      voiceGuide: '세탁기까지 약 2미터입니다.',
      vibrationPattern: 'MEDIUM',
    })

    expect(session).toMatchObject({
      sessionId: 9101,
      targetDeviceId: 10,
      targetDeviceName: '세탁기',
      status: 'ACTIVE',
      navigationStatus: 'ACTIVE',
      distanceM: 2.4,
      confidence: 0.91,
      voiceGuide: '세탁기까지 약 2미터입니다.',
      vibrationPattern: 'MEDIUM',
    })
  })

  it('fetches current alert from final api shape', async () => {
    const apiFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        items: [
          {
            alertId: 777,
            type: 'DANGER',
            severity: 'HIGH',
            title: '화재 위험',
            message: '주방 온도가 높습니다.',
            deviceName: '온도 센서',
            occurredAt: '2026-06-10T15:00:00+09:00',
            status: 'UNREAD',
          },
        ],
      }),
    }))
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: apiFetch,
      fallbackEnabled: false,
    })

    const alert = await service.getCurrentAlert()

    expect(apiFetch).toHaveBeenCalledWith(
      'http://api.test/api/alerts?limit=20',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(alert.alertId).toBe(777)
    expect(alert.voiceGuide).toContain('주방 온도가 높습니다.')
  })

  it('uses mock alerts only when no wearable api is configured', async () => {
    const service = createWearableService()

    const alert = await service.getCurrentAlert()

    expect(alert.alertId).toBe(201)
  })

  it('surfaces alert network failures when wearable api is configured', async () => {
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: vi.fn(async () => {
        throw new Error('network down')
      }),
      fallbackEnabled: true,
    })

    await expect(service.getCurrentAlert()).rejects.toThrow('network down')
  })

  it('surfaces emergency network failures instead of fallback success', async () => {
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: vi.fn(async () => {
        throw new Error('network down')
      }),
      fallbackEnabled: true,
    })

    await expect(service.requestEmergencyHelp('도움이 필요합니다.')).rejects.toThrow('network down')
  })

  it('surfaces UWB target and start network failures instead of fallback data', async () => {
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: vi.fn(async () => {
        throw new Error('network down')
      }),
      fallbackEnabled: true,
    })

    await expect(service.getUwbTargets()).rejects.toThrow('network down')
    await expect(service.startUwbSession(10)).rejects.toThrow('network down')
  })

  it('surfaces unpair network failures instead of local success', async () => {
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: vi.fn(async () => {
        throw new Error('network down')
      }),
      fallbackEnabled: true,
    })

    await expect(service.unpairWearable(await getPairingSession())).rejects.toThrow('network down')
  })

  it('sends final api confirm request body', async () => {
    const apiFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        alertId: 301,
        status: 'CONFIRMED',
        confirmedAt: '2026-06-10T14:43:00+09:00',
      }),
    }))
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: apiFetch,
      fallbackEnabled: false,
    })

    const confirmed = await service.confirmAlert(301)

    expect(apiFetch).toHaveBeenCalledWith(
      'http://api.test/api/alerts/301/confirm',
      expect.objectContaining({
        body: JSON.stringify({ responseType: 'CONFIRMED' }),
        method: 'POST',
      }),
    )
    expect(confirmed.status).toBe('CONFIRMED')
  })

  it('surfaces emergency api business errors instead of fallback success', async () => {
    const service = createWearableService({
      baseUrl: 'http://api.test',
      fetchImpl: vi.fn(async () => ({
        ok: false,
        status: 409,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ code: 'NO_GUARDIAN' }),
      })),
      fallbackEnabled: true,
    })

    await expect(service.requestEmergencyHelp('도움이 필요합니다.')).rejects.toMatchObject({
      code: 'NO_GUARDIAN',
    })
  })

  it('requests emergency help from the wearable', async () => {
    const response = await requestEmergencyHelp('도움이 필요합니다.')

    expect(response.status).toBe('SENT')
    expect(response.source).toBe('WEARABLE')
    expect(response.message).toContain('긴급 요청')
  })

  it('unpairs through the default service without a session and clears the token locally', async () => {
    localStorage.setItem('lg-able-band.accessToken', 'paired-api-token')

    const response = await unpairWearable(null)

    expect(response.status).toBe('UNPAIRED')
    expect(localStorage.getItem('lg-able-band.accessToken')).toBeNull()
  })
})

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
  }
}
