import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import {
  getPairingPollIntervalMs,
  getPairingSuccessTransitionMs,
  getUwbPollIntervalMs,
} from './runtimeTiming'
import { mockAlerts, mockUwbSessions } from './mocks/wearableMock'

const originalFetch = globalThis.fetch
const pairingApiSession = {
  pairingSessionId: 'pairing-api-001',
  deviceId: 'able-band-api-001',
  deviceName: 'LG Able Band',
  pairingCode: 'ABLE-API-001',
  nonce: 'nonce-api-001',
  issuedAt: '2026-06-10T15:00:00+09:00',
  expiresAt: '2026-06-10T15:05:00+09:00',
  expiresInMinutes: 5,
  pairingPayload: 'lg-able-band://pair?pairingSessionId=pairing-api-001&from=backend',
}

describe('Wearable MVP', () => {
  beforeEach(() => {
    window.__ABLE_BAND_UWB_POLL_MS__ = 20
    window.__ABLE_BAND_PAIRING_POLL_MS__ = 10
    localStorage.clear()
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(() => true),
    })
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    delete window.__ABLE_BAND_UWB_POLL_MS__
    delete window.__ABLE_BAND_PAIRING_POLL_MS__
    delete window.__ABLE_BAND_PAIRING_SUCCESS_DELAY_MS__
    delete window.__ABLE_BAND_PAIRING_MANUAL__
    delete window.__ABLE_BAND_WEARABLE_FAIL_CONFIRM__
    delete window.__ABLE_BAND_WEARABLE_FALLBACK__
    delete window.__ABLE_BAND_WEARABLE_EMERGENCY_ERROR__
    delete navigator.vibrate
    localStorage.clear()
    if (originalFetch) {
      globalThis.fetch = originalFetch
    } else {
      delete globalThis.fetch
    }
    window.history.pushState({}, '', '/')
    delete import.meta.env.VITE_UWB_POLL_MS
    delete import.meta.env.VITE_PAIRING_POLL_MS
    delete import.meta.env.VITE_PAIRING_SUCCESS_TRANSITION_MS
    vi.useRealTimers()
  })

  it('keeps wearable runtime timing defaults explicit', () => {
    delete window.__ABLE_BAND_UWB_POLL_MS__
    delete window.__ABLE_BAND_PAIRING_POLL_MS__
    delete window.__ABLE_BAND_PAIRING_SUCCESS_DELAY_MS__

    expect(getPairingPollIntervalMs()).toBe(1000)
    expect(getUwbPollIntervalMs()).toBe(2000)
    expect(getPairingSuccessTransitionMs()).toBe(500)
    expect(getPairingSuccessTransitionMs()).toBeGreaterThanOrEqual(300)
    expect(getPairingSuccessTransitionMs()).toBeLessThanOrEqual(800)
  })

  it('uses Vite timing env values when window overrides are absent', () => {
    delete window.__ABLE_BAND_UWB_POLL_MS__
    delete window.__ABLE_BAND_PAIRING_POLL_MS__
    delete window.__ABLE_BAND_PAIRING_SUCCESS_DELAY_MS__
    import.meta.env.VITE_UWB_POLL_MS = '2222'
    import.meta.env.VITE_PAIRING_POLL_MS = '111'
    import.meta.env.VITE_PAIRING_SUCCESS_TRANSITION_MS = '333'

    expect(getPairingPollIntervalMs()).toBe(111)
    expect(getUwbPollIntervalMs()).toBe(2222)
    expect(getPairingSuccessTransitionMs()).toBe(333)
  })

  it('falls back to timing defaults for malformed overrides', () => {
    window.__ABLE_BAND_UWB_POLL_MS__ = 'abc'
    window.__ABLE_BAND_PAIRING_POLL_MS__ = 0
    window.__ABLE_BAND_PAIRING_SUCCESS_DELAY_MS__ = -1

    expect(getPairingPollIntervalMs()).toBe(1000)
    expect(getUwbPollIntervalMs()).toBe(2000)
    expect(getPairingSuccessTransitionMs()).toBe(500)
  })

  it('shows QR pairing first so a phone can link the wearable', async () => {
    setupPairingApi({ statuses: ['WAITING'] })
    render(<App />)

    expect(await screen.findByRole('heading', { name: '휴대폰으로 연동' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('스캔 대기')
    const qrCode = screen.getByAltText('Able Band 연동 QR 코드')
    expect(qrCode.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(qrCode.getAttribute('data-pairing-payload')).toBe(pairingApiSession.pairingPayload)
    expect(screen.getByText('ABLE-API-001')).toBeTruthy()
    expect(screen.getByText(/5분 동안 유효/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '휴대폰 연동 완료' })).toBeNull()
  })

  it('syncs app alerts to the wearable after automatic backend pairing', async () => {
    const apiFetch = setupPairingApi()
    render(<App />)

    expect(await screen.findByRole('heading', { name: '연동 완료' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '전기레인지 과열 주의' })).toBeTruthy()
    expect(localStorage.getItem('lg-able-band.accessToken')).toBe('paired-api-token')
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/wearable/pairing-sessions/pairing-api-001?deviceId=able-band-api-001&nonce=nonce-api-001',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(screen.getByText('위험 알림')).toBeTruthy()
    expect(screen.getByText('안전 전기레인지')).toBeTruthy()
    expect(screen.getByLabelText('1/3')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('lg-able-band.pairingSession'))).toMatchObject({
      pairingSessionId: 'pairing-api-001',
      deviceId: 'able-band-api-001',
      nonce: 'nonce-api-001',
      accessToken: 'paired-api-token',
      status: 'success',
    })

    fireEvent.click(screen.getByRole('button', { name: '다음 알림' }))
    expect(screen.getByRole('heading', { name: '도어센서 열림' })).toBeTruthy()
    expect(screen.getByLabelText('2/3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '다음 알림' }))
    expect(screen.getByRole('heading', { name: '냉장고 문 열림' })).toBeTruthy()
    expect(screen.getByLabelText('3/3')).toBeTruthy()
  })

  it('restores paired wearable state after refresh without generating a new QR', async () => {
    localStorage.setItem('lg-able-band.accessToken', 'paired-api-token')
    localStorage.setItem(
      'lg-able-band.pairingSession',
      JSON.stringify({
        ...pairingApiSession,
        accessToken: 'paired-api-token',
        status: 'success',
      }),
    )
    const apiFetch = setupPairingApi({ statuses: ['WAITING'] })

    render(<App />)

    expect(await screen.findByRole('heading', { name: '전기레인지 과열 주의' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '휴대폰으로 연동' })).toBeNull()
    expect(
      apiFetch.mock.calls.find(
        ([url, options = {}]) =>
          String(url) === '/api/wearable/pairing-sessions' && options.method === 'POST',
      ),
    ).toBeUndefined()
  })

  it('clears stale paired state and shows QR when restored token is rejected', async () => {
    localStorage.setItem('lg-able-band.accessToken', 'expired-api-token')
    localStorage.setItem(
      'lg-able-band.pairingSession',
      JSON.stringify({
        ...pairingApiSession,
        accessToken: 'expired-api-token',
        status: 'success',
      }),
    )
    setupPairingApi({ alertUnauthorized: true, statuses: ['WAITING'] })

    render(<App />)

    expect(await screen.findByRole('heading', { name: '휴대폰으로 연동' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('스캔 대기')
    expect(screen.queryByRole('heading', { name: '알림 상태 확인 필요' })).toBeNull()
    expect(localStorage.getItem('lg-able-band.accessToken')).toBeNull()
    expect(localStorage.getItem('lg-able-band.pairingSession')).toBeNull()
  })

  it('usesConfiguredPairingPollInterval', async () => {
    vi.useFakeTimers()
    window.__ABLE_BAND_PAIRING_POLL_MS__ = 10
    window.__ABLE_BAND_PAIRING_SUCCESS_DELAY_MS__ = 1
    setupPairingApi({ statuses: ['PAIRED'] })
    render(<App />)

    await act(async () => {
      await flushAsyncWork()
    })
    expect(screen.getByRole('heading', { name: '휴대폰으로 연동' })).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(9)
      await flushAsyncWork()
    })
    expect(screen.queryByRole('heading', { name: '연동 완료' })).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await flushAsyncWork()
    })
    expect(screen.getByRole('heading', { name: '연동 완료' })).toBeTruthy()
  })

  it('uses the configured pairing success delay before showing alerts', async () => {
    window.__ABLE_BAND_PAIRING_SUCCESS_DELAY_MS__ = 200
    setupPairingApi({ statuses: ['PAIRED'] })
    render(<App />)

    expect(await screen.findByRole('heading', { name: '연동 완료' })).toBeTruthy()

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 120)
      })
    })

    expect(screen.getByRole('heading', { name: '연동 완료' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '전기레인지 과열 주의' })).toBeNull()
    expect(
      await screen.findByRole('heading', { name: '전기레인지 과열 주의' }, { timeout: 1000 }),
    ).toBeTruthy()
  })

  it('unpairs the current session, clears the token, and creates a new QR', async () => {
    const refreshedSession = createPairingApiSession({
      pairingSessionId: 'pairing-api-002',
      deviceId: 'able-band-api-002',
      pairingCode: 'ABLE-API-002',
      nonce: 'nonce-api-002',
      pairingPayload: 'lg-able-band://pair?pairingSessionId=pairing-api-002&nonce=nonce-api-002',
    })
    const apiFetch = setupPairingApi({
      createSessions: [pairingApiSession, refreshedSession],
      statusesBySession: {
        'pairing-api-001': ['PAIRED'],
        'pairing-api-002': ['WAITING'],
      },
    })
    render(<App />)

    const initialQrSrc = (await screen.findByAltText('Able Band 연동 QR 코드')).getAttribute('src')
    expect(await screen.findByRole('heading', { name: '전기레인지 과열 주의' })).toBeTruthy()
    expect(localStorage.getItem('lg-able-band.accessToken')).toBe('paired-api-token')

    fireEvent.click(screen.getByRole('button', { name: '대기' }))
    fireEvent.click(await screen.findByRole('button', { name: '연동 해제' }))

    expect(await screen.findByText('연결이 해제되었습니다')).toBeTruthy()
    expect(localStorage.getItem('lg-able-band.accessToken')).toBeNull()
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/wearable/pairing-sessions/pairing-api-001/unpair',
      expect.objectContaining({
        body: JSON.stringify({
          deviceId: 'able-band-api-001',
          nonce: 'nonce-api-001',
        }),
        headers: expect.any(Headers),
        method: 'POST',
      }),
    )
    const [, unpairOptions] = apiFetch.mock.calls.find(
      ([url, options = {}]) => options.method === 'POST' && String(url).endsWith('/unpair'),
    )
    expect(unpairOptions.headers.get('Authorization')).toBe('Bearer paired-api-token')
    expect(unpairOptions.headers.get('Content-Type')).toBe('application/json')

    await waitFor(() => {
      const regeneratedPayload = screen
        .getByAltText('Able Band 연동 QR 코드')
        .getAttribute('data-pairing-payload')
      const regeneratedQrSrc = screen.getByAltText('Able Band 연동 QR 코드').getAttribute('src')
      expect(regeneratedPayload).not.toBe(pairingApiSession.pairingPayload)
      expect(regeneratedPayload).toContain('pairing-api-002')
      expect(regeneratedPayload).toContain('nonce-api-002')
      expect(regeneratedQrSrc).not.toBe(initialQrSrc)
    })
  })

  it('creates a fresh QR after an expired pairing session is reset', async () => {
    const refreshedSession = createPairingApiSession({
      pairingSessionId: 'pairing-api-002',
      deviceId: 'able-band-api-002',
      pairingCode: 'ABLE-API-002',
      nonce: 'nonce-api-002',
      pairingPayload: 'lg-able-band://pair?pairingSessionId=pairing-api-002&nonce=nonce-api-002',
    })
    setupPairingApi({
      createSessions: [pairingApiSession, refreshedSession],
      statusesBySession: {
        'pairing-api-001': ['EXPIRED'],
        'pairing-api-002': ['WAITING'],
      },
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'QR 다시 발급 필요' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '새 QR 발급' }))

    expect(await screen.findByRole('heading', { name: '휴대폰으로 연동' })).toBeTruthy()
    await waitFor(() => {
      const regeneratedPayload = screen
        .getByAltText('Able Band 연동 QR 코드')
        .getAttribute('data-pairing-payload')
      expect(regeneratedPayload).not.toBe(pairingApiSession.pairingPayload)
      expect(regeneratedPayload).toContain('pairing-api-002')
      expect(regeneratedPayload).toContain('nonce-api-002')
    })
  })

  it('confirms the current synced alert and keeps the next app alert visible', async () => {
    await renderPairedApp()
    expect(await screen.findByRole('heading', { name: '전기레인지 과열 주의' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '확인' }))

    expect((await screen.findByRole('status')).textContent).toContain('확인한 알림을 삭제했습니다.')
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '전기레인지 과열 주의' })).toBeNull()
    })
    expect(screen.getByRole('heading', { name: '도어센서 열림' })).toBeTruthy()
  })

  it('opens UWB device selection after pairing', async () => {
    const user = userEvent.setup()
    await renderPairedApp()

    await screen.findByRole('button', { name: 'UWB' })
    await user.click(screen.getByRole('button', { name: 'UWB' }))

    expect(await screen.findByRole('heading', { name: '내 가전 목록' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /세탁기/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /안전 전기레인지/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /도어센서/ })).toBeTruthy()
  })

  it('does not show fallback UWB devices when backend target loading fails', async () => {
    const user = userEvent.setup()
    await renderPairedApp({ uwbTargetFailure: true })

    await screen.findByRole('button', { name: 'UWB' })
    await user.click(screen.getByRole('button', { name: 'UWB' }))

    expect(await screen.findByRole('heading', { name: '내 가전 목록' })).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toContain(
      '위치 안내 기기를 불러오지 못했습니다.',
    )
    expect(screen.queryByRole('button', { name: /세탁기/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /안전 전기레인지/ })).toBeNull()
  })

  it('shows standby and sends emergency requests after pairing', async () => {
    await renderPairedApp()

    await screen.findByRole('button', { name: '대기' })
    fireEvent.click(screen.getByRole('button', { name: '대기' }))

    expect(screen.getByRole('heading', { name: '손목에서 대기 중' })).toBeTruthy()
    expect(screen.getByText('배터리 82%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '긴급 요청' }))
    expect(await screen.findByRole('heading', { name: '긴급 요청' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '보호자에게 보내기' }))

    expect((await screen.findByRole('status')).textContent).toContain('보호자에게 긴급 요청을 보냈습니다.')
  })

  it('wearableEmergencyUsesPairedAccessToken', async () => {
    const apiFetch = await renderPairedApp()

    expect(localStorage.getItem('lg-able-band.accessToken')).toBe('paired-api-token')
    await screen.findByRole('button', { name: '대기' })
    fireEvent.click(screen.getByRole('button', { name: '대기' }))
    fireEvent.click(screen.getByRole('button', { name: '긴급 요청' }))
    expect(await screen.findByRole('heading', { name: '긴급 요청' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '보호자에게 보내기' }))

    await waitFor(() => {
      expect(findEmergencyRequestCall(apiFetch)).toBeTruthy()
    })
    const [, emergencyOptions] = findEmergencyRequestCall(apiFetch)
    expect(emergencyOptions.headers.get('Authorization')).toBe('Bearer paired-api-token')
    expect(JSON.parse(emergencyOptions.body)).toMatchObject({
      message: '손목 웨어러블에서 긴급 요청',
      source: 'WEARABLE',
    })
  })

  it('shows no guardian emergency failure', async () => {
    window.__ABLE_BAND_WEARABLE_EMERGENCY_ERROR__ = 'NO_GUARDIAN'
    await renderPairedApp()

    await screen.findByRole('button', { name: '대기' })
    fireEvent.click(screen.getByRole('button', { name: '대기' }))
    fireEvent.click(screen.getByRole('button', { name: '긴급 요청' }))
    expect(await screen.findByRole('heading', { name: '긴급 요청' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '보호자에게 보내기' }))

    expect((await screen.findByRole('status')).textContent).toContain('연결된 보호자가 없습니다.')
  })

  it('shows wearableEmergencyCooldownMessage from emergency duplicate cooldown', async () => {
    await renderPairedApp({ emergencyErrorCode: 'EMERGENCY_DUPLICATE_COOLDOWN' })

    await screen.findByRole('button', { name: '대기' })
    fireEvent.click(screen.getByRole('button', { name: '대기' }))
    fireEvent.click(screen.getByRole('button', { name: '긴급 요청' }))
    expect(await screen.findByRole('heading', { name: '긴급 요청' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '보호자에게 보내기' }))

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('이미 긴급 요청을 보냈습니다. 잠시 후 다시 시도해주세요.')
    expect(status.textContent).not.toContain('보호자에게 긴급 요청을 보냈습니다.')
  })

  it('shows alert load failure when fallback is disabled', async () => {
    window.__ABLE_BAND_WEARABLE_FALLBACK__ = false
    window.__ABLE_BAND_PAIRING_SUCCESS_DELAY_MS__ = 1
    const refreshedSession = createPairingApiSession({
      pairingSessionId: 'pairing-api-002',
      deviceId: 'able-band-api-002',
      pairingCode: 'ABLE-API-002',
      nonce: 'nonce-api-002',
      pairingPayload: 'lg-able-band://pair?pairingSessionId=pairing-api-002&nonce=nonce-api-002',
    })
    setupPairingApi({
      alertFailure: true,
      createSessions: [pairingApiSession, refreshedSession],
      statusesBySession: {
        'pairing-api-001': ['PAIRED'],
        'pairing-api-002': ['WAITING'],
      },
    })
    render(<App />)

    expect(await screen.findByRole('heading', { name: '알림 상태 확인 필요' })).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toContain('서버 연결 실패')

    fireEvent.click(screen.getByRole('button', { name: 'QR 생성' }))

    expect(await screen.findByRole('heading', { name: '휴대폰으로 연동' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('스캔 대기')
    expect(screen.getByAltText('Able Band 연동 QR 코드').getAttribute('data-pairing-payload')).toContain(
      'pairing-api-002',
    )
  })

  it('keeps terminal UWB sessions from polling again', async () => {
    window.history.pushState({}, '', '/?sessionId=9002')
    await renderPairedApp()

    await screen.findByRole('button', { name: 'UWB' })
    fireEvent.click(screen.getByRole('button', { name: 'UWB' }))
    expect(await screen.findByRole('heading', { name: '내 가전 목록' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /세탁기/ }))

    expect(await screen.findByRole('heading', { name: '세탁기 찾기' })).toBeTruthy()
    expect(screen.getAllByText('도착').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '탐색 종료' }).disabled).toBe(true)

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 50)
      })
    })

    expect(screen.getAllByText('도착').length).toBeGreaterThan(0)
  })

  it('shows the manual pairing fallback only for development tests', async () => {
    window.__ABLE_BAND_PAIRING_MANUAL__ = true
    setupPairingApi({ statuses: ['WAITING'] })
    render(<App />)

    expect(await screen.findByRole('button', { name: '휴대폰 연동 완료' })).toBeTruthy()
  })
})

async function renderPairedApp(options) {
  const apiFetch = setupPairingApi(options)
  render(<App />)
  await screen.findByRole('heading', { name: '전기레인지 과열 주의' })
  return apiFetch
}

function setupPairingApi({
  statuses = ['WAITING', 'PAIRED'],
  alertFailure = false,
  alertUnauthorized = false,
  createSessions = [pairingApiSession],
  emergencyErrorCode = '',
  statusesBySession = {},
  uwbTargetFailure = false,
} = {}) {
  const createQueue = [...createSessions]
  const sessions = new Map(createSessions.map((session) => [session.pairingSessionId, session]))
  const sessionStatusQueues = new Map(
    Object.entries(statusesBySession).map(([pairingSessionId, sessionStatuses]) => [
      pairingSessionId,
      {
        lastStatus: sessionStatuses[sessionStatuses.length - 1] || 'WAITING',
        queue: [...sessionStatuses],
      },
    ]),
  )
  const statusQueue = [...statuses]
  const lastStatus = statuses[statuses.length - 1] || 'WAITING'
  const apiFetch = vi.fn(async (url, options = {}) => {
    const endpoint = String(url)
    const method = options.method || 'GET'
    if (endpoint === '/api/db/status' && method === 'GET') {
      return jsonResponse({ connected: true, database: 'able_band' })
    }

    if (endpoint === '/api/wearable/pairing-sessions' && method === 'POST') {
      const session = createQueue.shift() || pairingApiSession
      sessions.set(session.pairingSessionId, session)
      return jsonResponse({
        ...session,
        status: 'WAITING',
      })
    }

    const pairingSessionMatch = endpoint.match(
      /^\/api\/wearable\/pairing-sessions\/([^?]+)/,
    )
    if (pairingSessionMatch) {
      const pairingSessionId = decodeURIComponent(pairingSessionMatch[1])
      const session = sessions.get(pairingSessionId) || pairingApiSession
      if (endpoint.endsWith('/unpair') && method === 'POST') {
        return jsonResponse({ pairingSessionId, status: 'UNPAIRED' })
      }

      const status = nextPairingStatus({
        defaultLastStatus: lastStatus,
        defaultQueue: statusQueue,
        pairingSessionId,
        sessionStatusQueues,
      })
      return jsonResponse({
        ...session,
        status,
        accessToken: status === 'PAIRED' ? 'paired-api-token' : undefined,
      })
    }

    if (endpoint === '/api/alerts?limit=20') {
      if (alertUnauthorized) {
        return jsonResponse({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, 401)
      }

      if (alertFailure) {
        return jsonResponse({ message: '서버 연결 실패' }, 500)
      }

      return jsonResponse({ items: mockAlerts })
    }

    const alertConfirmMatch = endpoint.match(
      /^\/api\/alerts\/(\d+)\/confirm$/,
    )
    if (alertConfirmMatch && method === 'POST') {
      return jsonResponse({
        alertId: Number(alertConfirmMatch[1]),
        status: 'CONFIRMED',
        confirmedAt: '2026-06-10T14:43:00+09:00',
      })
    }

    if (endpoint === '/api/emergency-requests' && method === 'POST') {
      const forcedEmergencyErrorCode =
        emergencyErrorCode || window.__ABLE_BAND_WEARABLE_EMERGENCY_ERROR__ || ''
      if (forcedEmergencyErrorCode) {
        return jsonResponse({ code: forcedEmergencyErrorCode }, 409)
      }

      return jsonResponse({
        emergencyRequestId: 501,
        status: 'SENT',
        source: 'WEARABLE',
        message: '보호자에게 긴급 요청을 보냈습니다.',
      })
    }

    if (endpoint === '/api/uwb/targets' && method === 'GET') {
      if (uwbTargetFailure) {
        return jsonResponse({ message: '서버 연결 실패' }, 500)
      }

      return jsonResponse({
        items: [
          {
            deviceId: 10,
            name: '세탁기',
            type: 'WASHER',
            connectionStatus: 'CONNECTED',
            locationSupported: true,
          },
          {
            deviceId: 12,
            name: '안전 전기레인지',
            type: 'RANGE',
            connectionStatus: 'WARNING',
            locationSupported: true,
          },
          {
            deviceId: 13,
            name: '도어센서',
            type: 'DOOR_SENSOR',
            connectionStatus: 'CONNECTED',
            locationSupported: true,
          },
        ],
      })
    }

    if (endpoint === '/api/uwb/sessions' && method === 'POST') {
      const requestedSession = getRequestedUwbSession()
      const requestBody = JSON.parse(options.body || '{}')
      return jsonResponse({
        ...requestedSession,
        targetDeviceId: Number(requestBody.targetDeviceId),
        targetDevice: {
          deviceId: Number(requestBody.targetDeviceId),
          name: requestedSession.targetDeviceName,
        },
      })
    }

    const uwbSessionMatch = endpoint.match(
      /^\/api\/uwb\/sessions\/(\d+)$/,
    )
    if (uwbSessionMatch && method === 'GET') {
      const requestedSession = findMockUwbSession(Number(uwbSessionMatch[1]))
      return jsonResponse(requestedSession)
    }

    throw new Error(`Unexpected API call: ${endpoint}`)
  })
  globalThis.fetch = apiFetch
  return apiFetch
}

function nextPairingStatus({
  defaultLastStatus,
  defaultQueue,
  pairingSessionId,
  sessionStatusQueues,
}) {
  const sessionStatuses = sessionStatusQueues.get(pairingSessionId)
  if (!sessionStatuses) {
    return defaultQueue.length > 0 ? defaultQueue.shift() : defaultLastStatus
  }

  return sessionStatuses.queue.length > 0
    ? sessionStatuses.queue.shift()
    : sessionStatuses.lastStatus
}

function findEmergencyRequestCall(apiFetch) {
  return apiFetch.mock.calls.find(
    ([url, options = {}]) =>
      String(url) === '/api/emergency-requests' &&
      options.method === 'POST',
  )
}

function createPairingApiSession(overrides = {}) {
  const session = {
    ...pairingApiSession,
    ...overrides,
  }

  return {
    ...session,
    pairingPayload:
      overrides.pairingPayload ||
      `lg-able-band://pair?pairingSessionId=${session.pairingSessionId}&nonce=${session.nonce}`,
  }
}

function getRequestedUwbSession() {
  const sessionId = Number(new URL(window.location.href).searchParams.get('sessionId') || '9001')
  return findMockUwbSession(sessionId)
}

function findMockUwbSession(sessionId) {
  return mockUwbSessions.find((session) => session.sessionId === sessionId) || mockUwbSessions[0]
}

async function flushAsyncWork() {
  await Promise.resolve()
  await Promise.resolve()
}

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
  }
}
