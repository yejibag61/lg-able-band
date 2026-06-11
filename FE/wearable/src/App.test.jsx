import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('Wearable MVP', () => {
  beforeEach(() => {
    window.__ABLE_BAND_UWB_POLL_MS__ = 20
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: vi.fn(() => true),
    })
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    delete window.__ABLE_BAND_UWB_POLL_MS__
    delete window.__ABLE_BAND_WEARABLE_FAIL_CONFIRM__
    delete window.__ABLE_BAND_WEARABLE_FALLBACK__
    delete window.__ABLE_BAND_WEARABLE_EMERGENCY_ERROR__
    delete navigator.vibrate
    window.history.pushState({}, '', '/')
  })

  it('shows QR pairing first so a phone can link the wearable', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '휴대폰으로 연동' })).toBeTruthy()
    expect(screen.getByText('스캔 대기 중')).toBeTruthy()
    const qrCode = screen.getByAltText('Able Band 연동 QR 코드')
    expect(qrCode.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(qrCode.getAttribute('data-pairing-payload')).toContain('lg-able-band://pair')
    expect(screen.getByText('ABLE-4IN-260610')).toBeTruthy()
    expect(screen.getByText(/5분 동안 유효/)).toBeTruthy()
  })

  it('shows pairing success, expired, and invalid states', async () => {
    let rendered = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    expect(screen.getByRole('heading', { name: '연동 완료' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '가스 위험 감지' })).toBeTruthy()

    rendered.unmount()
    window.history.pushState({}, '', '/?pairing=expired')
    rendered = render(<App />)

    expect(screen.getByRole('heading', { name: 'QR 다시 발급 필요' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '새 QR 발급' }))
    expect(screen.getByText('스캔 대기 중')).toBeTruthy()

    rendered.unmount()
    window.history.pushState({}, '', '/?pairing=invalid')
    render(<App />)

    expect(screen.getByRole('heading', { name: '연동 정보 오류' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'QR 다시 보기' }))
    expect(screen.getByText('스캔 대기 중')).toBeTruthy()
  })

  it('opens the current alert after pairing and supports replay and confirm', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))

    expect(await screen.findByRole('heading', { name: '가스 위험 감지' })).toBeTruthy()
    expect(screen.getByText('긴급 알림')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '다시 듣기' }))
    expect((await screen.findByRole('status')).textContent).toContain(
      '가스 위험이 감지되었습니다',
    )

    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect((await screen.findByRole('status')).textContent).toContain('확인 완료')

    fireEvent.click(screen.getByRole('button', { name: 'UWB' }))
    expect(await screen.findByRole('heading', { name: '세탁기 찾기' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '알림' }))
    expect(await screen.findByRole('heading', { name: '가스 위험 감지' })).toBeTruthy()
    expect(screen.getAllByText('확인 완료').length).toBeGreaterThan(0)
  })

  it('shows UWB distance and vibration guidance in the 4-inch frame', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    await screen.findByRole('button', { name: 'UWB' })
    await user.click(screen.getByRole('button', { name: 'UWB' }))

    expect(await screen.findByRole('heading', { name: '세탁기 찾기' })).toBeTruthy()
    expect(screen.getByText('2.4m')).toBeTruthy()
    expect(screen.getByText('중간 간격 진동')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '탐색 종료' }))
    await waitFor(() => expect(screen.getByText('진동 없음')).toBeTruthy())

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 50)
      })
    })

    expect(screen.getByText('진동 없음')).toBeTruthy()
    expect(screen.getAllByText('탐색 종료').length).toBeGreaterThan(0)
    expect(screen.queryByText('중간 간격 진동')).toBeNull()
  })

  it('keeps terminal UWB sessions from polling again', async () => {
    window.history.pushState({}, '', '/?sessionId=9002')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    await screen.findByRole('button', { name: 'UWB' })
    fireEvent.click(screen.getByRole('button', { name: 'UWB' }))

    expect(await screen.findByRole('heading', { name: '세탁기 찾기' })).toBeTruthy()
    expect(screen.getAllByText('도착').length).toBeGreaterThan(0)
    expect(screen.getByText('긴 진동 2회')).toBeTruthy()
    expect(screen.getByRole('button', { name: '탐색 종료' }).disabled).toBe(true)

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 50)
      })
    })

    expect(screen.getAllByText('도착').length).toBeGreaterThan(0)
  })

  it('shows visual vibration feedback for critical alert', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))

    expect(await screen.findByText('강한 긴급 진동')).toBeTruthy()
    expect(screen.getByLabelText('진동 피드백')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '다시 듣기' }))

    await waitFor(() => expect(navigator.vibrate).toHaveBeenCalled())
  })

  it('keeps alert unconfirmed when confirm fails', async () => {
    window.__ABLE_BAND_WEARABLE_FAIL_CONFIRM__ = true
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    expect(await screen.findByRole('heading', { name: '가스 위험 감지' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '확인' }))

    expect((await screen.findByRole('status')).textContent).toContain(
      '확인 처리에 실패했습니다.',
    )
    expect(screen.getByText('미확인')).toBeTruthy()
  })

  it('shows alert load failure when fallback is disabled', async () => {
    window.__ABLE_BAND_WEARABLE_FALLBACK__ = false
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ message: '서버 연결 실패' }),
    }))

    try {
      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))

      expect(await screen.findByRole('heading', { name: '알림 상태 확인 필요' })).toBeTruthy()
      expect((await screen.findByRole('status')).textContent).toContain('서버 연결 실패')
    } finally {
      if (originalFetch) {
        globalThis.fetch = originalFetch
      } else {
        delete globalThis.fetch
      }
    }
  })

  it('shows uwb no-session and failed recovery states', async () => {
    window.history.pushState({}, '', '/?sessionId=9999')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    await screen.findByRole('button', { name: 'UWB' })
    fireEvent.click(screen.getByRole('button', { name: 'UWB' }))

    expect(await screen.findByRole('heading', { name: '위치 안내 없음' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '대기 화면으로' })).toBeTruthy()

    window.history.pushState({}, '', '/?sessionId=9003')
    fireEvent.click(screen.getByRole('button', { name: '알림' }))
    await screen.findByRole('button', { name: 'UWB' })
    fireEvent.click(screen.getByRole('button', { name: 'UWB' }))

    expect(await screen.findByText('신호를 다시 확인해주세요.')).toBeTruthy()
    expect(screen.getByText('신호 낮음')).toBeTruthy()
  })

  it('idle screen shows standby status and emergency request succeeds', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    await screen.findByRole('button', { name: '대기' })
    fireEvent.click(screen.getByRole('button', { name: '대기' }))

    expect(screen.getByRole('heading', { name: '손목에서 대기 중' })).toBeTruthy()
    expect(screen.getByText('배터리 82%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '긴급 요청' }))
    expect(await screen.findByRole('heading', { name: '긴급 요청' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '보호자에게 보내기' }))

    expect((await screen.findByRole('status')).textContent).toContain(
      '보호자에게 긴급 요청을 보냈습니다.',
    )
  })

  it('shows no guardian emergency failure', async () => {
    window.__ABLE_BAND_WEARABLE_EMERGENCY_ERROR__ = 'NO_GUARDIAN'
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    await screen.findByRole('button', { name: '대기' })
    fireEvent.click(screen.getByRole('button', { name: '대기' }))
    fireEvent.click(screen.getByRole('button', { name: '긴급 요청' }))
    expect(await screen.findByRole('heading', { name: '긴급 요청' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '보호자에게 보내기' }))

    expect((await screen.findByRole('status')).textContent).toContain(
      '연결된 보호자가 없습니다.',
    )
  })
})
