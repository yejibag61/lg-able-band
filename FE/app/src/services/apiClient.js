const DEFAULT_API_BASE_URL = 'http://localhost:8080'
const ACCESS_TOKEN_STORAGE_KEY = 'lg-able-band.accessToken'
export const AUTHENTICATION_EXPIRED_EVENT = 'lg-able-band:authentication-expired'

export class ApiRequestError extends Error {
  constructor(message, { status = 0, code = '', details = null } = {}) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function getAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || ''
}

export function saveAccessToken(accessToken) {
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken)
}

export function clearAccessToken() {
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
}

export async function apiRequest(path, options = {}) {
  const { body, requireAuth = true, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers)

  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (requireAuth) {
    const accessToken = getAccessToken()
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  let response
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...fetchOptions,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiRequestError('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.', {
      code: 'NETWORK_ERROR',
    })
  }

  const data = await parseResponse(response)

  if (!response.ok) {
    if (requireAuth && response.status === 401) {
      window.dispatchEvent(new CustomEvent(AUTHENTICATION_EXPIRED_EVENT))
    }

    throw new ApiRequestError(data?.message || '요청을 처리하지 못했습니다.', {
      status: response.status,
      code: data?.code || '',
      details: data?.details || null,
    })
  }

  return data
}

export function getApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  if (import.meta.env.MODE === 'test') {
    return DEFAULT_API_BASE_URL
  }

  return ''
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
