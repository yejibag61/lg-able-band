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
    expect(screen.getByLabelText('1/2')).toBeTruthy()
    expect(screen.queryByLabelText('진동')).toBeNull()
    expect(screen.queryByLabelText('소리')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 듣기' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '음성 챗봇 열기' }))
    expect(screen.getByLabelText('음성 챗봇')).toBeTruthy()
    expect(screen.getByText('무엇을 확인할까요?')).toBeTruthy()
    expect(screen.getByRole('button', { name: '음성 미지원' })).toBeTruthy()
    expect(screen.getByPlaceholderText('예: 지금 알림 뭐야?')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '다음 알림' }))
    expect(screen.getByRole('heading', { name: '세탁 완료' })).toBeTruthy()
    expect(screen.getByLabelText('2/2')).toBeTruthy()
    fireEvent.mouseDown(screen.getByLabelText('알림 페이지').closest('.alert-screen'), {
      clientX: 220,
      clientY: 180,
    })
    fireEvent.mouseUp(screen.getByLabelText('알림 페이지').closest('.alert-screen'), {
      clientX: 320,
      clientY: 184,
    })
    expect(screen.getByRole('heading', { name: '가스 위험 감지' })).toBeTruthy()
    fireEvent.mouseDown(screen.getByLabelText('알림 페이지').closest('.alert-screen'), {
      clientX: 320,
      clientY: 184,
    })
    fireEvent.mouseUp(screen.getByLabelText('알림 페이지').closest('.alert-screen'), {
      clientX: 200,
      clientY: 180,
    })
    expect(screen.getByRole('heading', { name: '세탁 완료' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '이전 알림' }))
    expect(screen.getByRole('heading', { name: '가스 위험 감지' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect((await screen.findByRole('status')).textContent).toContain('확인한 알림을 삭제했습니다.')
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '가스 위험 감지' })).toBeNull(),
    )
    expect(screen.getByRole('heading', { name: '세탁 완료' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'UWB' }))
    expect(await screen.findByRole('heading', { name: '세탁기 찾기' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '알림' }))
    expect(await screen.findByRole('heading', { name: '세탁 완료' })).toBeTruthy()
  })

  it('shows UWB distance, room, and vibration guidance in the 4-inch frame', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    await screen.findByRole('button', { name: 'UWB' })
    await user.click(screen.getByRole('button', { name: 'UWB' }))

    expect(await screen.findByRole('heading', { name: '세탁기 찾기' })).toBeTruthy()
    expect(screen.getByText('2.4m')).toBeTruthy()
    expect(screen.getByText('세탁실')).toBeTruthy()
    expect(screen.getByText('중간 간격 진동 표시 중')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '탐색 종료' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '내 가전 목록' })).toBeTruthy())

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 50)
      })
    })

    expect(screen.getByText('탐색을 종료했습니다. 다른 가전을 선택할 수 있습니다.')).toBeTruthy()
    expect(screen.getAllByText('UWB').length).toBeGreaterThan(0)
    expect(screen.getByText('4개')).toBeTruthy()
    expect(screen.getByRole('button', { name: /안전 전기레인지/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /도어센서/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'UWB' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByText('중간 간격 진동 표시 중')).toBeNull()
  })

  it('keeps terminal UWB sessions from polling again', async () => {
    window.history.pushState({}, '', '/?sessionId=9002')
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '휴대폰 연동 완료' }))
    await screen.findByRole('button', { name: 'UWB' })
    fireEvent.click(screen.getByRole('button', { name: 'UWB' }))

    expect(await screen.findByRole('heading', { name: '세탁기 찾기' })).toBeTruthy()
    expect(screen.getAllByText('도착').length).toBeGreaterThan(0)
    expect(screen.getByText('세탁실')).toBeTruthy()
    expect(screen.getByText('긴 진동 2회 표시 중')).toBeTruthy()
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
    expect(screen.getByText('자동 전달')).toBeTruthy()
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
