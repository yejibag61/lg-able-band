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
  statusDisplay,
  summary,
  onEmergencyRequest,
  onOpenAlerts,
}) {
  const homeAlerts = alerts || summary.recentAlerts
  const recentAlerts = getActionableRecentAlerts(homeAlerts)
  const alertMetrics = createHomeAlertMetrics(homeAlerts)
  const updatedAtLabel = formatStatusUpdatedAt(summary.safetyStatus.lastCheckedAt)
  const emergencyAvailability = getEmergencyAvailability(summary)
  const emergencyStatusMessage = emergencyMessage

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
          {updatedAtLabel ? <span className="status-badge">{updatedAtLabel}</span> : null}
        </div>
        <p className="status-copy">{summary.safetyStatus.message}</p>
        <div className="home-metric-row" aria-label="오늘 알림 요약">
          <span className="home-metric-pill">최근 알림 {alertMetrics.total}건</span>
          <span className="home-metric-pill">미확인 {alertMetrics.unread}건</span>
          <span className="home-metric-pill danger">위험 {alertMetrics.danger}건</span>
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
        {emergencyStatusMessage ? (
          <p className="emergency-message" role="status">
            {emergencyStatusMessage}
          </p>
        ) : null}
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
                    {alert.deviceName} · {alert.occurredAt.slice(11, 16)} ·{' '}
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
    </>
  )
}
