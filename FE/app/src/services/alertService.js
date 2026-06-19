import { ApiRequestError, apiRequest } from './apiClient'

export async function getAlerts({ type, status, limit = 20 } = {}) {
  const params = new URLSearchParams()

  if (type) {
    params.set('type', type)
  }

  if (status) {
    params.set('status', status)
  }

  if (limit) {
    params.set('limit', String(limit))
  }

  const query = params.toString()
  const response = await apiRequest(`/api/alerts${query ? `?${query}` : ''}`)
  return response?.items || []
}

export async function getAlertDetail(alertId) {
  return apiRequest(`/api/alerts/${alertId}`)
}

export async function confirmAlert(alertId) {
  return apiRequest(`/api/alerts/${alertId}/confirm`, {
    method: 'POST',
  })
}

export async function deleteAlert(alertId) {
  const response = await apiRequest(`/api/alerts/${alertId}`, {
    method: 'DELETE',
  })

  if (response?.deleted === false) {
    throw new ApiRequestError('알림을 삭제하지 못했습니다.', {
      code: 'ALERT_DELETE_FAILED',
      details: response,
    })
  }

  return response
}

export async function replayAlert(alertId) {
  return apiRequest(`/api/alerts/${alertId}/replay`, {
    method: 'POST',
  })
}
