import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('Wearable MVP', () => {
  beforeEach(() => {
    window.__ABLE_BAND_UWB_POLL_MS__ = 20
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    delete window.__ABLE_BAND_UWB_POLL_MS__
    window.history.pushState({}, '', '/')
  })

  it('shows QR pairing first so a phone can link the wearable', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '휴대폰으로 연동' })).toBeTruthy()
    const qrCode = screen.getByAltText('Able Band 연동 QR 코드')
    expect(qrCode.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(qrCode.getAttribute('data-pairing-payload')).toContain('lg-able-band://pair')
    expect(screen.getByText('ABLE-4IN-260610')).toBeTruthy()
    expect(screen.getByText(/5분 동안 유효/)).toBeTruthy()
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
})
