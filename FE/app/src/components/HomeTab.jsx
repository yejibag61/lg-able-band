const severityLabels = {
  LOW: '생활',
  MEDIUM: '주의',
  HIGH: '위험',
  CRITICAL: '긴급',
}

export function HomeTab({
  emergencyMessage,
  emergencySubmitting,
  statusDisplay,
  summary,
  onEmergencyRequest,
  onOpenAlerts,
  onOpenDevices,
}) {
  const recentAlerts = summary.recentAlerts.slice(0, 1)
  const alertMetrics = createAlertMetrics(summary.recentAlerts)
  const guardianName = summary.emergency.primaryGuardianName || '보호자'

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
          <span className="status-badge">방금 전</span>
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
          <strong className="card-title">{guardianName}에게 바로 알림</strong>
          <p className="emergency-card-copy">버튼을 누르면 보호자에게 상황을 즉시 알립니다.</p>
        </div>
        <button
          className="sos-button"
          type="button"
          aria-busy={emergencySubmitting}
          disabled={!summary.quickActions.canRequestEmergency || emergencySubmitting}
          onClick={onEmergencyRequest}
        >
          {emergencySubmitting ? '요청 전송 중...' : '긴급 지원 요청'}
        </button>
        {emergencyMessage ? (
          <p className="emergency-message" role="status">
            {emergencyMessage}
          </p>
        ) : null}
      </section>

      <section className="content-card device-summary-card">
        <div className="section-title-row">
          <div>
            <p className="card-label">기기 연결 상태</p>
            <strong className="card-title">
              연결된 기기 {summary.deviceSummary.connectedCount}/{summary.deviceSummary.totalCount}개
            </strong>
          </div>
          <button className="device-inline-add-button" type="button" onClick={onOpenDevices}>
            기기 확인
          </button>
        </div>
        <div className="device-stat-grid" aria-label="기기 상태 요약">
          <span className="device-stat">주의 필요 {summary.deviceSummary.warningCount}개</span>
          <span className="device-stat">UWB 지원 {summary.deviceSummary.uwbSupportedCount}개</span>
        </div>
      </section>

      <section className="content-card alert-summary-card">
        <div className="section-title-row">
          <div>
            <p className="card-label">실시간 알림 요약</p>
            <strong className="card-title">최근 알림</strong>
          </div>
          <button className="device-inline-add-button" type="button" onClick={onOpenAlerts}>
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

function createAlertMetrics(alerts) {
  return {
    total: alerts.length,
    unread: alerts.filter((alert) => alert.status === 'UNREAD').length,
    danger: alerts.filter((alert) => alert.severity === 'HIGH' || alert.severity === 'CRITICAL').length,
  }
}
