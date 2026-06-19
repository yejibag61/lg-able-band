import { useEffect, useState } from 'react'
import {
  createHomeAlertMetrics,
  formatStatusUpdatedAt,
  getActionableRecentAlerts,
  getEmergencyAvailability,
} from '../utils/homeSummaryUtils'

const severityLabels = {
  LOW: '생활',
  MEDIUM: '주의',
  HIGH: '위험',
  CRITICAL: '긴급',
}

export function HomeTab({
  emergencyMessage,
  emergencySubmitting,
  alerts,
  refreshError,
  refreshing,
  statusDisplay,
  summary,
  onEmergencyRequest,
  onOpenAlerts,
  onRefreshHome,
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const homeAlerts = alerts || summary.recentAlerts
  const recentAlerts = getActionableRecentAlerts(homeAlerts)
  const alertMetrics = createHomeAlertMetrics(homeAlerts)
  const updatedAtLabel = formatStatusUpdatedAt(summary.safetyStatus.lastCheckedAt, currentTime)
  const emergencyAvailability = getEmergencyAvailability(summary)
  const emergencyStatusMessage = emergencyMessage
  const emergencyToastTone = getEmergencyToastTone(emergencyStatusMessage)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 60_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  function handleEmergencyClick() {
    onEmergencyRequest(emergencyAvailability)
  }

  return (
    <>
      <section className={`status-card home-safety-card status-${summary.safetyStatus.level.toLowerCase()}`}>
        <div className="status-card-header">
          <div>
            <p className="card-label">오늘의 안전 상태</p>
            <strong className="card-title safety-status-title">
              <span>{statusDisplay?.label || summary.safetyStatus.level}</span>
              <span className="safety-status-emoji" aria-hidden="true">
                {statusDisplay?.emoji || '🙂'}
              </span>
            </strong>
          </div>
          <div className="status-refresh-control">
            {updatedAtLabel ? <span className="status-badge">{updatedAtLabel}</span> : null}
          </div>
        </div>
        <p className="status-copy">{summary.safetyStatus.message}</p>
        {refreshError ? (
          <p className="status-refresh-error" role="alert">
            {refreshError}
          </p>
        ) : null}
        <div className="home-metric-row" aria-label="오늘 알림 요약">
          <div className="home-metric-pills">
            <span className="home-metric-pill">최근 알림 {alertMetrics.total}건</span>
            <span className="home-metric-pill">미확인 {alertMetrics.unread}건</span>
            <span className="home-metric-pill danger">위험 {alertMetrics.danger}건</span>
          </div>
          <button
            className="status-refresh-button home-metric-refresh-button"
            type="button"
            aria-label="홈 정보 새로고침"
            aria-busy={refreshing}
            disabled={refreshing}
            onClick={onRefreshHome}
          >
            <svg className={refreshing ? 'is-spinning' : undefined} viewBox="0 0 24 24" focusable="false">
              <path d="M20 11a8 8 0 0 0-14.7-4.4L4 8" />
              <path d="M4 4v4h4" />
              <path d="M4 13a8 8 0 0 0 14.7 4.4L20 16" />
              <path d="M20 20v-4h-4" />
            </svg>
          </button>
        </div>
      </section>

      <section className="emergency-card">
        <div>
          <p className="card-label">긴급 지원 요청</p>
          <strong className="card-title">보호자에게 바로 알림</strong>
          <p className="emergency-card-copy">버튼을 누르면 보호자에게 상황을 즉시 알립니다.</p>
        </div>
        <button
          className="sos-button"
          type="button"
          aria-busy={emergencySubmitting}
          disabled={emergencySubmitting}
          onClick={handleEmergencyClick}
        >
          {emergencySubmitting ? '요청 전송 중...' : '긴급 지원 요청'}
        </button>
      </section>

      <section className="content-card alert-summary-card">
        <div className="section-title-row">
          <div>
            <p className="card-label">실시간 알림 요약</p>
            <strong className="card-title">최근 알림</strong>
          </div>
          <button className="summary-action-button" type="button" onClick={onOpenAlerts}>
            전체 보기
          </button>
        </div>
        <div className="alert-list">
          {recentAlerts.length > 0 ? (
            recentAlerts.map((alert) => (
              <article className="alert-item" key={alert.alertId}>
                <span className={`severity severity-${alert.severity.toLowerCase()}`}>
                  {severityLabels[alert.severity] || alert.severity}
                </span>
                <div>
                  <h3>{alert.title}</h3>
                  <p>{alert.message}</p>
                  <small>
                    {alert.deviceName} · {formatCompactAlertTime(alert.occurredAt)} ·{' '}
                    {alert.status === 'UNREAD' ? '미확인' : '확인 완료'}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">최근 알림이 없습니다.</p>
          )}
        </div>
      </section>

      {emergencyStatusMessage ? (
        <div
          className="device-toast"
          role={emergencyToastTone === 'error' ? 'alert' : 'status'}
          aria-live={emergencyToastTone === 'error' ? 'assertive' : 'polite'}
        >
          <p className="device-toast-message">{emergencyStatusMessage}</p>
        </div>
      ) : null}
    </>
  )
}

function getEmergencyToastTone(message) {
  if (!message) {
    return 'success'
  }

  if (
    message.includes('등록한 뒤 사용할 수 있습니다') ||
    message.includes('먼저 등록') ||
    message.includes('실패') ||
    message.includes('못했습니다') ||
    message.includes('다시 시도')
  ) {
    return 'error'
  }

  return 'success'
}

function formatCompactAlertTime(value) {
  if (!value) {
    return '--:--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
