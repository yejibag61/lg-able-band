const DEFAULT_API_BASE_URL = 'http://localhost:8080'
const ACCESS_TOKEN_STORAGE_KEY = 'lg-able-band.accessToken'

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
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...fetchOptions,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('백엔드 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.')
  }

  const data = await parseResponse(response)

  if (!response.ok) {
    throw new Error(data?.message || '요청을 처리하지 못했습니다.')
  }

  return data
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
