import { apiRequest } from './apiClient'

export async function getDevices() {
  const response = await apiRequest('/api/devices')
  return response?.items || []
}

export async function createDevice(device) {
  return apiRequest('/api/devices', {
    method: 'POST',
    body: device,
  })
}

export async function updateDevice(deviceId, device) {
  return apiRequest(`/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    body: device,
  })
}
