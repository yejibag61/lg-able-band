const DEFAULT_API_BASE_URL = 'http://localhost:8080'
const ACCESS_TOKEN_STORAGE_KEY = 'lg-able-band.accessToken'

export async function wearableApiRequest(path, options = {}) {
  const {
    baseUrl = apiBaseUrl(),
    body,
    fetchImpl = globalThis.fetch,
    method = body === undefined ? 'GET' : 'POST',
    token = getWearableAccessToken(),
  } = options

  if (!fetchImpl) {
    throw new Error('브라우저 fetch를 사용할 수 없습니다.')
  }

  const headers = new Headers(options.headers)
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetchImpl(`${trimTrailingSlash(baseUrl)}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const data = await parseResponse(response)
  if (!response.ok) {
    throw createApiError(data, response)
  }

  return data
}

export function getWearableAccessToken() {
  const searchParams = new URLSearchParams(globalThis.location?.search || '')
  return searchParams.get('token') || globalThis.localStorage?.getItem(ACCESS_TOKEN_STORAGE_KEY) || ''
}

function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('Content-Type') || ''
  if (!contentType.includes('application/json')) {
    return null
  }

  return response.json()
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '')
}

function createApiError(data, response) {
  const error = new Error(data?.message || messageForStatus(response.status))
  error.code = data?.code || ''
  error.status = response.status
  return error
}

function messageForStatus(status) {
  if (status === 401 || status === 403) {
    return '연동 인증이 만료되었습니다.'
  }

  return '요청을 처리하지 못했습니다.'
}
