import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App login to home flow', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network call'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders login screen by default and does not request legacy users table', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
    expect(screen.getByLabelText('이메일')).toBeTruthy()
    expect(screen.getByLabelText('비밀번호')).toBeTruthy()
    expect(screen.getByRole('button', { name: '로그인' })).toBeTruthy()
    expect(screen.queryByText('Users Table')).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('shows required-field error on empty login submit', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      '이메일과 비밀번호를 모두 입력해주세요.',
    )
  })

  it('routes USER login to the home screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: /able band 홈/i })).toBeTruthy()
    expect(screen.getByText('현재 위험 알림이 없습니다.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '긴급 도움 요청' })).toBeTruthy()
  })

  it('routes GUARDIAN login to guardian placeholder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 화면 준비 중' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /able band 홈/i })).toBeNull()
  })

  it('shows invalid login error and keeps the user on login screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('이메일'), 'wrong@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'wrong')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    )
    expect(screen.getByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
  })

  it('keeps login button disabled while submitting', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(screen.getByRole('button', { name: '로그인 중...' }).disabled).toBe(true)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /able band 홈/i })).toBeTruthy()
    })
  })
})
