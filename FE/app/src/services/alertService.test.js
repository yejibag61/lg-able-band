import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, apiRequest } from './apiClient'
import { deleteAlert } from './alertService'

vi.mock('./apiClient', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    constructor(message, { status = 0, code = '', details = null } = {}) {
      super(message)
      this.name = 'ApiRequestError'
      this.status = status
      this.code = code
      this.details = details
    }
  },
  apiRequest: vi.fn(),
}))

describe('alertService.deleteAlert', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the backend response when deletion succeeds', async () => {
    apiRequest.mockResolvedValue({ alertId: 101, deleted: true })

    await expect(deleteAlert(101)).resolves.toEqual({ alertId: 101, deleted: true })
  })

  it('throws when the backend responds with deleted false', async () => {
    apiRequest.mockResolvedValue({ alertId: 101, deleted: false })

    await expect(deleteAlert(101)).rejects.toMatchObject({
      message: '알림을 삭제하지 못했습니다.',
      code: 'ALERT_DELETE_FAILED',
      details: { alertId: 101, deleted: false },
    })
    expect(ApiRequestError).toBeTypeOf('function')
  })
})
