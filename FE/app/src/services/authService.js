import { mockAccounts } from '../mocks/authMock'

const LOGIN_DELAY_MS = 40

export async function login({ role, email, password }) {
  await delay(LOGIN_DELAY_MS)

  const account = mockAccounts.find(
    (candidate) =>
      candidate.role === role &&
      candidate.email === email.trim() &&
      candidate.password === password,
  )

  if (!account) {
    throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
  }

  return structuredClone(account.response)
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
