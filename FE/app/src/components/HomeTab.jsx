const severityLabels = {
  LOW: '생활',
  MEDIUM: '주의',
  HIGH: '위험',
  CRITICAL: '긴급',
}

export function HomeTab({
  emergencyMessage,
  emergencySubmitting,
  statusLabel,
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
      <section className="home-guide-card" aria-label="Able Band 상태 안내">
        <span className="guide-indicator" aria-hidden="true" />
        <div>
          <p className="card-label">실시간 케어</p>
          <h2>Able Band가 실시간 안전 상태를 확인 중입니다.</h2>
        </div>
      </section>

      <section className={`status-card status-${summary.safetyStatus.level.toLowerCase()}`}>
        <div className="status-card-header">
          <div>
            <p className="card-label">오늘의 안전 상태</p>
            <strong>{statusLabel}</strong>
          </div>
          <span className="status-badge">마지막 확인: 방금 전</span>
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
          <p className="card-label">긴급 도움 요청</p>
          <h2>{guardianName}에게 바로 알림</h2>
          <p>버튼을 누르면 보호자에게 현재 상황을 알립니다.</p>
        </div>
        <button
          className="sos-button"
          type="button"
          aria-busy={emergencySubmitting}
          disabled={!summary.quickActions.canRequestEmergency || emergencySubmitting}
          onClick={onEmergencyRequest}
        >
          {emergencySubmitting ? '요청 전송 중' : '긴급 지원 요청'}
        </button>
        {emergencyMessage ? (
          <p className="emergency-message" role="status">
            {emergencyMessage}
          </p>
        ) : null}
      </section>

      <section className="content-card alert-summary-card">
        <div className="section-title-row">
          <div>
            <p className="card-label">실시간 알림 요약</p>
            <h2>최근 알림</h2>
          </div>
          <button className="text-button" type="button" onClick={onOpenAlerts}>
            알림 전체 보기
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
                    {alert.status === 'UNREAD' ? '미확인' : '확인함'}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">최근 알림이 없습니다.</p>
          )}
        </div>
      </section>

      <section className="content-card device-summary-card">
        <div className="section-title-row">
          <div>
            <p className="card-label">기기 연결 상태</p>
            <h2>
              연결된 기기 {summary.deviceSummary.connectedCount}/{summary.deviceSummary.totalCount}개
            </h2>
          </div>
          <button className="secondary-button compact-button" type="button" onClick={onOpenDevices}>
            기기 확인
          </button>
        </div>
        <div className="device-stat-grid" aria-label="기기 상태 요약">
          <span className="device-stat">주의 필요 {summary.deviceSummary.warningCount}개</span>
          <span className="device-stat">UWB 가능 {summary.deviceSummary.uwbSupportedCount}개</span>
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
