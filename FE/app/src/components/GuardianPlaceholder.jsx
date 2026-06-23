import { useCallback, useEffect, useRef, useState } from 'react'
import {
  confirmGuardianHistoryItem,
  getGuardianDashboard,
  subscribeGuardianDashboardEvents,
} from '../services/guardianDashboardService'
import { formatStatusUpdatedAt, getSafetyStatusDisplay } from '../utils/homeSummaryUtils'

const severityLabels = {
  CRITICAL: '긴급',
  HIGH: '위험',
  MEDIUM: '주의',
  LOW: '생활',
}

const sourceLabels = {
  APP: '앱',
  WEARABLE: '웨어러블',
  DEVICE: '기기',
}

const CONFIRMED_HISTORY_STORAGE_PREFIX = 'lg-able-band.guardianHistory.confirmed'
const SAFE_GUARDIAN_MESSAGE = '오늘은 전달된 위험 알림이 없습니다.'
const GUARDIAN_DASHBOARD_POLL_INTERVAL_MS = 3_000
const GUARDIAN_ALERT_TOAST_DURATION_MS = 10_000
const GUARDIAN_ALERT_VIBRATION_PATTERN = [240, 100, 240, 100, 480]

export function GuardianPlaceholder({ account, onLogout }) {
  const isMountedRef = useRef(true)
  const hasInitializedLiveAlertsRef = useRef(false)
  const seenHistoryKeysRef = useRef(new Set())
  const liveAlertTimerRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [liveAlert, setLiveAlert] = useState(null)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const confirmedHistoryStorageKey = getConfirmedHistoryStorageKey(account)
  const [confirmedHistoryKeys, setConfirmedHistoryKeys] = useState(() =>
    readConfirmedHistoryKeys(confirmedHistoryStorageKey),
  )
  const [dashboardState, setDashboardState] = useState({
    loading: true,
    error: '',
    data: null,
    refreshing: false,
    lastUpdatedAt: null,
  })

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    setDashboardState((current) => ({
      ...current,
      error: '',
      refreshing: silent ? current.refreshing : Boolean(current.data),
    }))

    try {
      const data = await getGuardianDashboard()
      if (!isMountedRef.current) {
        return
      }

      setDashboardState({
        loading: false,
        error: '',
        data,
        refreshing: false,
        lastUpdatedAt: new Date().toISOString(),
      })
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setDashboardState((current) => ({
        loading: false,
        error: current.data
          ? '최신 보호자 정보를 다시 확인하지 못했습니다.'
          : error.message || '보호자 정보를 불러오지 못했습니다.',
        data: current.data,
        refreshing: false,
        lastUpdatedAt: current.lastUpdatedAt,
      }))
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (dashboardState.loading) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      loadDashboard({ silent: true })
    }, guardianDashboardPollInterval())

    return () => {
      window.clearInterval(intervalId)
    }
  }, [dashboardState.loading, loadDashboard])

  useEffect(() => {
    if (dashboardState.loading) {
      return undefined
    }

    return subscribeGuardianDashboardEvents((event) => {
      if (event.type === 'guardian-alert') {
        loadDashboard({ silent: true })
      }
    })
  }, [dashboardState.loading, loadDashboard])

  useEffect(() => {
    setConfirmedHistoryKeys(readConfirmedHistoryKeys(confirmedHistoryStorageKey))
  }, [confirmedHistoryStorageKey])

  const dashboard = dashboardState.data
  const allHistoryItems = createGuardianHistoryItems(dashboard)
  const historyItems = allHistoryItems.filter(
    (item) => !confirmedHistoryKeys.includes(item.key),
  )
  const visibleDangerAlertKeys = new Set(
    historyItems.filter((item) => item.kind === 'danger').map((item) => item.key),
  )
  const visibleDangerAlerts = (dashboard?.dangerAlerts || []).filter((alert) =>
    visibleDangerAlertKeys.has(getDangerHistoryKey(alert)),
  )
  const latestDangerAlert = visibleDangerAlerts[0] || null
  const displayedHistoryItems = isHistoryExpanded ? historyItems : historyItems.slice(0, 2)
  const canExpandHistory = historyItems.length > 2
  const hasActiveHistory = historyItems.length > 0
  const safetyLevel = hasActiveHistory ? 'EMERGENCY' : 'SAFE'
  const safetyDisplay = getSafetyStatusDisplay(safetyLevel)
  const protectedUserName = dashboard?.user?.name || '사용자'
  const updatedAtLabel = formatStatusUpdatedAt(dashboardState.lastUpdatedAt, currentTime)
  const safetyMessage = hasActiveHistory
    ? dashboard.summary?.safetyMessage || `${protectedUserName}님의 오늘 상태입니다.`
    : SAFE_GUARDIAN_MESSAGE
  const historySignature = historyItems.map((item) => item.key).join('|')

  useEffect(() => {
    if (!dashboard) {
      return
    }

    const currentHistoryKeys = historyItems.map((item) => item.key)
    if (!hasInitializedLiveAlertsRef.current) {
      seenHistoryKeysRef.current = new Set(currentHistoryKeys)
      hasInitializedLiveAlertsRef.current = true
      return
    }

    const newLiveAlert = historyItems.find((item) => !seenHistoryKeysRef.current.has(item.key))
    seenHistoryKeysRef.current = new Set([
      ...seenHistoryKeysRef.current,
      ...currentHistoryKeys,
    ])

    if (!newLiveAlert) {
      return
    }

    notifyGuardianLiveAlert(newLiveAlert, protectedUserName)
    setLiveAlert(newLiveAlert)

    if (liveAlertTimerRef.current) {
      window.clearTimeout(liveAlertTimerRef.current)
    }
    liveAlertTimerRef.current = window.setTimeout(() => {
      setLiveAlert(null)
    }, GUARDIAN_ALERT_TOAST_DURATION_MS)
  }, [dashboard, historyItems, historySignature, protectedUserName])

  useEffect(() => {
    return () => {
      if (liveAlertTimerRef.current) {
        window.clearTimeout(liveAlertTimerRef.current)
      }
    }
  }, [])

  const confirmHistoryItem = useCallback(async (item) => {
    const itemKey = item.key
    const relatedHistoryKeys = historyItems
      .filter((historyItem) => {
        if (historyItem.key === itemKey) {
          return true
        }
        if (!item.alertId || !historyItem.alertId) {
          return false
        }
        return historyItem.alertId === item.alertId
      })
      .map((historyItem) => historyItem.key)
    const nextConfirmedKeys = (currentKeys) =>
      Array.from(new Set([...currentKeys, ...relatedHistoryKeys]))

    setConfirmedHistoryKeys((currentKeys) =>
      persistConfirmedHistoryKeys(confirmedHistoryStorageKey, nextConfirmedKeys(currentKeys)),
    )

    try {
      await confirmGuardianHistoryItem(item)
      if (!isMountedRef.current) {
        return
      }

      await loadDashboard()
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setDashboardState((current) => ({
        ...current,
        error: error.message || '알림 확인 상태를 저장하지 못했습니다.',
      }))
    }
  }, [confirmedHistoryStorageKey, historyItems, loadDashboard])

  if (dashboardState.loading) {
    return (
      <main className="phone-screen home-screen guardian-screen app-screen home-loading-screen guardian-loading-screen">
        <div className="home-loading-group" role="status">
          <img
            className="home-loading-logo"
            src="/LG_Able_Band_wordmark_transparent.png"
            alt="LG Able Band"
          />
          <p className="home-loading-message">
            보호자 홈화면으로 이동하는 중입니다
            <span className="home-loading-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p>
        </div>
      </main>
    )
  }

  if (dashboardState.error && !dashboardState.data) {
    return (
      <main className="phone-screen home-screen guardian-screen app-screen home-loading-screen guardian-loading-screen">
        <div className="home-loading-group guardian-error-group" role="alert">
          <img
            className="home-loading-logo"
            src="/LG_Able_Band_wordmark_transparent.png"
            alt="LG Able Band"
          />
          <p className="home-loading-message guardian-loading-error">{dashboardState.error}</p>
          <button className="summary-action-button guardian-loading-action" type="button" onClick={onLogout}>
            로그인으로 돌아가기
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="phone-screen home-screen guardian-screen app-screen" aria-labelledby="guardian-title">
      <header className="home-header app-header">
        <div>
          <span className="home-brand-logo-frame" aria-hidden="true">
            <img
              className="home-brand-logo"
              src="/LG_Able_Band_wordmark_transparent.png"
              alt="LG Able Band"
            />
          </span>
          <h1 id="guardian-title">보호자 홈</h1>
          <p className="header-summary">{protectedUserName}님의 현재 안전 상태를 간단히 확인해요.</p>
        </div>
      </header>

      <div className="app-content guardian-content">
        <section
          className={`status-card home-safety-card guardian-home-status-card status-${safetyLevel.toLowerCase()}`}
        >
          <div className="status-card-header">
            <div>
              <p className="card-label">오늘의 안전 상태</p>
              <strong className="card-title safety-status-title">
                <span>{safetyDisplay.label}</span>
                <span className="safety-status-emoji" aria-hidden="true">
                  {safetyDisplay.emoji}
                </span>
              </strong>
            </div>
            <div className="status-refresh-control">
              {updatedAtLabel ? <span className="status-badge">{updatedAtLabel}</span> : null}
              <button
                className="status-refresh-button"
                type="button"
                aria-label="홈 정보 새로고침"
                aria-busy={dashboardState.refreshing}
                disabled={dashboardState.refreshing}
                onClick={() => loadDashboard()}
              >
                <svg
                  className={dashboardState.refreshing ? 'is-spinning' : undefined}
                  viewBox="0 0 24 24"
                  focusable="false"
                >
                  <path d="M20 11a8 8 0 0 0-14.7-4.4L4 8" />
                  <path d="M4 4v4h4" />
                  <path d="M4 13a8 8 0 0 0 14.7 4.4L20 16" />
                  <path d="M20 20v-4h-4" />
                </svg>
              </button>
            </div>
          </div>
          <p className="status-copy">{safetyMessage}</p>
          {dashboardState.error ? (
            <p className="guardian-refresh-note error" role="alert">
              {dashboardState.error}
            </p>
          ) : null}
        </section>

        {liveAlert ? (
          <section className="guardian-live-alert" role="alert" aria-live="assertive">
            <span className="guardian-live-alert-badge">긴급</span>
            <div>
              <strong>{liveAlert.title}</strong>
              <p>{liveAlert.message}</p>
            </div>
          </section>
        ) : null}

        <section className="content-card alert-summary-card guardian-home-alert-card" aria-labelledby="guardian-alert-title">
          <div className="section-title-row">
            <div>
              <p className="card-label">위험 알림</p>
              <strong className="card-title" id="guardian-alert-title">
                {latestDangerAlert ? latestDangerAlert.title : '최근 위험 알림이 없습니다.'}
              </strong>
            </div>
            {latestDangerAlert ? (
              <span className={`severity severity-${latestDangerAlert.severity.toLowerCase()}`}>
                {severityLabels[latestDangerAlert.severity] || latestDangerAlert.severity}
              </span>
            ) : (
              <span className="severity severity-low">안전</span>
            )}
          </div>
          {latestDangerAlert ? (
            <>
              <p className="guardian-home-copy">{latestDangerAlert.message}</p>
              <dl className="guardian-detail-grid guardian-home-detail-grid">
                <div>
                  <dt>발생 기기</dt>
                  <dd>{latestDangerAlert.deviceName || '연동 기기'}</dd>
                </div>
                <div>
                  <dt>발생 시간</dt>
                  <dd>{formatGuardianTime(latestDangerAlert.occurredAt)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="empty-state">새로운 위험 알림이 들어오면 이 카드에서 바로 확인할 수 있습니다.</p>
          )}
        </section>

        <section className="content-card device-summary-card guardian-home-history-card" aria-labelledby="guardian-history-title">
          <div className="section-title-row">
            <div>
              <p className="card-label">최근 전달 이력</p>
              <strong className="card-title" id="guardian-history-title">
                최근 전달 알림
              </strong>
            </div>
            {historyItems.length > 0 ? (
              <span>{historyItems.length}건</span>
            ) : allHistoryItems.length > 0 ? (
              <span className="severity severity-low">안전</span>
            ) : (
              <span className="severity severity-low">안전</span>
            )}
          </div>
          <div className="guardian-event-list">
            {historyItems.length > 0 ? (
              displayedHistoryItems.map((item) => (
                <article className="guardian-event-item" key={item.key}>
                  <div className="guardian-event-item-header">
                    <strong>{item.title}</strong>
                    <button
                      className="guardian-event-confirm-button"
                      type="button"
                      aria-label={`${item.title} 확인`}
                      onClick={() => confirmHistoryItem(item)}
                    >
                      확인
                    </button>
                  </div>
                  <p>{item.message}</p>
                  <span>{item.meta}</span>
                </article>
              ))
            ) : (
              <p className="empty-state">최근 전달된 알림이 없습니다. 현재 상태는 안전입니다.</p>
            )}
            {canExpandHistory ? (
              <button
                className="guardian-history-toggle-button"
                type="button"
                aria-expanded={isHistoryExpanded}
                onClick={() => setIsHistoryExpanded((current) => !current)}
              >
                {isHistoryExpanded ? '▲ 접기' : '▼ 전체 알림 보기'}
              </button>
            ) : null}
          </div>
        </section>

        <section className="content-card guardian-home-session-card" aria-labelledby="guardian-session-title">
          <div className="section-title-row">
            <div>
              <p className="card-label">계정</p>
              <strong className="card-title" id="guardian-session-title">
                {account.name} 보호자 계정
              </strong>
            </div>
            <button className="summary-action-button" type="button" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

function createGuardianHistoryItems(dashboard) {
  const dangerItems = (dashboard?.dangerAlerts || [])
    .filter(isActiveDangerAlert)
    .map((alert) => ({
      kind: 'danger',
      key: getDangerHistoryKey(alert),
      alertId: alert.alertId,
      title: alert.title,
      message: alert.message,
      occurredAt: alert.occurredAt,
      meta: `${severityLabels[alert.severity] || alert.severity} · ${alert.deviceName || '연동 기기'} · ${formatGuardianTime(alert.occurredAt)}`,
    }))
  const emergencyItems = (dashboard?.emergencyRequests || [])
    .filter(isActiveEmergencyRequest)
    .map((request) => ({
      kind: 'emergency',
      key: getEmergencyHistoryKey(request),
      alertId: request.alertId,
      emergencyRequestId: request.emergencyRequestId,
      title: '긴급 도움 요청',
      message: request.message || '사용자가 긴급 도움을 요청했습니다.',
      occurredAt: request.sentAt,
      meta: `긴급 · ${sourceLabels[request.source] || request.source || '시스템'} · ${formatGuardianTime(request.sentAt)}`,
    }))

  return [...dangerItems, ...emergencyItems].sort((firstItem, secondItem) => {
    const firstTime = new Date(firstItem.occurredAt || 0).getTime()
    const secondTime = new Date(secondItem.occurredAt || 0).getTime()

    return secondTime - firstTime
  })
}

function isActiveDangerAlert(alert) {
  return alert.status !== 'CONFIRMED'
}

function isActiveEmergencyRequest(request) {
  return request.status !== 'RESOLVED' && request.status !== 'CANCELED'
}

function getDangerHistoryKey(alert) {
  return `danger:${alert.alertId}`
}

function getEmergencyHistoryKey(request) {
  return `emergency:${request.emergencyRequestId}`
}

function getConfirmedHistoryStorageKey(account) {
  return `${CONFIRMED_HISTORY_STORAGE_PREFIX}:${account?.email || account?.name || 'guardian'}`
}

function readConfirmedHistoryKeys(storageKey) {
  try {
    const rawValue = window.localStorage.getItem(storageKey)
    const parsedValue = JSON.parse(rawValue || '[]')

    return Array.isArray(parsedValue) ? parsedValue.filter((value) => typeof value === 'string') : []
  } catch {
    return []
  }
}

function persistConfirmedHistoryKeys(storageKey, historyKeys) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(historyKeys))
  } catch {
    return historyKeys
  }

  return historyKeys
}

function notifyGuardianLiveAlert(item, protectedUserName) {
  vibrateGuardianAlert()
  showGuardianNotification(item, protectedUserName)
}

function guardianDashboardPollInterval() {
  const configuredInterval = Number(window.__ABLE_BAND_GUARDIAN_DASHBOARD_POLL_MS)

  return Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : GUARDIAN_DASHBOARD_POLL_INTERVAL_MS
}

function vibrateGuardianAlert() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false
  }

  return navigator.vibrate(GUARDIAN_ALERT_VIBRATION_PATTERN)
}

function showGuardianNotification(item, protectedUserName) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return
  }

  const showNotification = () => {
    if (window.Notification.permission !== 'granted') {
      return
    }

    new window.Notification(item.title || '긴급 알림', {
      body: item.message || `${protectedUserName}님의 긴급 알림이 도착했습니다.`,
      tag: item.key,
      renotify: true,
    })
  }

  if (window.Notification.permission === 'default') {
    window.Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        showNotification()
      }
    })
    return
  }

  showNotification()
}

function formatGuardianTime(value) {
  if (!value) {
    return '방금 전'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '시간 확인 필요'
  }

  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
