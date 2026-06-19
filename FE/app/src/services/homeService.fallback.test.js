import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockAppPreview } from '../mocks/appPreviewMock'
import { mockHomeSummary } from '../mocks/homeMock'
import { getAppPreview, getHomeSummary } from './homeService'
import { apiRequest, getAccessToken } from './apiClient'
import { getAlerts } from './alertService'
import { getDevices } from './deviceService'

vi.mock('./apiClient', () => ({
  apiRequest: vi.fn(),
  getAccessToken: vi.fn(),
}))

vi.mock('./alertService', () => ({
  getAlerts: vi.fn(),
}))

vi.mock('./deviceService', () => ({
  getDevices: vi.fn(),
}))

describe('homeService fallback behavior', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to mock home data only when there is no access token', async () => {
    getAccessToken.mockReturnValue('')
    apiRequest.mockRejectedValue(new Error('offline'))

    await expect(getHomeSummary()).resolves.toMatchObject({
      user: mockHomeSummary.user,
      recentAlerts: mockHomeSummary.recentAlerts,
    })
  })

  it('surfaces home summary errors for authenticated sessions', async () => {
    const error = new Error('server failed')
    getAccessToken.mockReturnValue('api-user-token')
    apiRequest.mockRejectedValue(error)

    await expect(getHomeSummary()).rejects.toThrow('server failed')
  })

  it('surfaces alert loading errors for authenticated sessions instead of reviving mock alerts', async () => {
    getAccessToken.mockReturnValue('api-user-token')
    getAlerts.mockRejectedValue(new Error('alerts failed'))

    await expect(getAppPreview()).rejects.toThrow('alerts failed')
  })

  it('keeps mock preview data only for unauthenticated fallback mode', async () => {
    getAccessToken.mockReturnValue('')
    getAlerts.mockRejectedValue(new Error('alerts failed'))
    getDevices.mockRejectedValue(new Error('devices failed'))

    await expect(getAppPreview()).resolves.toMatchObject({
      alerts: mockAppPreview.alerts,
      devices: mockAppPreview.devices,
    })
  })
})
