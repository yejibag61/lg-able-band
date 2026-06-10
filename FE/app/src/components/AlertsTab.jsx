import { useMemo, useState } from 'react'

const typeLabels = {
  LIFE: '생활',
  DANGER: '위험',
  EMERGENCY: '긴급',
  LOCATION: '위치',
}

const severityLabels = {
  LOW: '생활',
  MEDIUM: '주의',
  HIGH: '위험',
  CRITICAL: '긴급',
}

const statusLabels = {
  UNREAD: '미확인',
  CONFIRMED: '확인 완료',
  REPLAYED: '다시 들음',
  ESCALATED: '보호자 전달',
}

const filters = [
  { id: 'ALL', label: '전체' },
  { id: 'UNREAD', label: '미확인' },
  { id: 'DANGER', label: '위험' },
  { id: 'LIFE', label: '생활' },
]

export function AlertsTab({ alerts }) {
  const [alertItems, setAlertItems] = useState(alerts)
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [selectedAlertId, setSelectedAlertId] = useState(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const selectedAlert =
    selectedAlertId === null
      ? null
      : alertItems.find((alert) => alert.alertId === selectedAlertId) || alertItems[0]
  const filteredAlerts = useMemo(
    () => alertItems.filter((alert) => filterAlert(alert, activeFilter)),
    [activeFilter, alertItems],
  )

  function handleSelectAlert(alertId) {
    setSelectedAlertId(alertId)
    setFeedbackMessage('')
  }

  function handleConfirmAlert(alertId) {
    setAlertItems((currentAlerts) =>
      currentAlerts.map((alert) =>
        alert.alertId === alertId
          ? {
              ...alert,
              status: 'CONFIRMED',
            }
          : alert,
      ),
    )
    setFeedbackMessage('확인 완료 처리했습니다.')
  }

  function handleReplayAlert(alert) {
    setAlertItems((currentAlerts) =>
      currentAlerts.map((item) =>
        item.alertId === alert.alertId && item.status === 'UNREAD'
          ? {
              ...item,
              status: 'REPLAYED',
            }
          : item,
      ),
    )
    speakAlert(alert.voiceGuide || alert.message)
    setFeedbackMessage(`다시 듣기: ${alert.voiceGuide || alert.message}`)
  }

  return (
    <section
      className="tab-stack alert-tab"
      aria-label={selectedAlert ? undefined : '실시간 알림 목록'}
      aria-labelledby={selectedAlert ? 'alert-detail-title' : undefined}
    >
      {selectedAlert ? (
        <AlertDetail
          alert={selectedAlert}
          feedbackMessage={feedbackMessage}
          onBack={() => {
            setSelectedAlertId(null)
            setFeedbackMessage('')
          }}
          onConfirm={() => handleConfirmAlert(selectedAlert.alertId)}
          onReplay={() => handleReplayAlert(selectedAlert)}
        />
      ) : (
        <>
          <div className="alert-filter-row" aria-label="알림 필터">
            {filters.map((filter) => (
              <button
                className={activeFilter === filter.id ? 'filter-chip active' : 'filter-chip'}
                type="button"
                key={filter.id}
                aria-pressed={activeFilter === filter.id}
                onClick={() => {
                  setActiveFilter(filter.id)
                  setFeedbackMessage('')
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="alert-list" aria-label="알림 목록">
            {filteredAlerts.length > 0 ? (
              filteredAlerts.map((alert) => (
                <article
                  className={isUrgentAlert(alert) ? 'content-card alert-card urgent' : 'content-card alert-card'}
                  key={alert.alertId}
                >
                  <div className="alert-card-main">
                    <span className="alert-card-icon" aria-hidden="true">
                      {isUrgentAlert(alert) ? '!' : 'i'}
                    </span>
                    <div className="alert-card-copy">
                      <div className="alert-card-topline">
                        <span className={`severity severity-${alert.severity.toLowerCase()}`}>
                          {severityLabels[alert.severity] || alert.severity}
                        </span>
                        <small>{statusLabels[alert.status] || alert.status}</small>
                      </div>
                      <h3>{alert.title}</h3>
                      <p className="alert-card-message">{alert.message}</p>
                      <small className="alert-meta-line">
                        {alert.deviceName} · {alert.locationName} · {formatAlertTime(alert.occurredAt)}
                      </small>
                    </div>
                  </div>
                  <div className="alert-card-actions">
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      aria-label={`${alert.title} 상세 보기`}
                      onClick={() => handleSelectAlert(alert.alertId)}
                    >
                      상세 보기
                    </button>
                    <button
                      className="primary-button compact-button"
                      type="button"
                      disabled={alert.status === 'CONFIRMED'}
                      aria-label={`${alert.title} ${alert.status === 'CONFIRMED' ? '확인 완료됨' : '확인 완료'}`}
                      onClick={() => handleConfirmAlert(alert.alertId)}
                    >
                      {alert.status === 'CONFIRMED' ? '확인 완료됨' : '확인 완료'}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">조건에 맞는 알림이 없습니다.</p>
            )}
          </div>

          {feedbackMessage ? (
            <p className="status-message" role="status">
              {feedbackMessage}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

function AlertDetail({ alert, feedbackMessage, onBack, onConfirm, onReplay }) {
  return (
    <section className="content-card alert-detail-panel" aria-labelledby="alert-detail-title">
      <button className="text-button back-button" type="button" onClick={onBack}>
        목록으로 돌아가기
      </button>
      <div className="section-title-row">
        <span className={`severity severity-${alert.severity.toLowerCase()}`}>
          {severityLabels[alert.severity] || alert.severity}
        </span>
        <span>{statusLabels[alert.status] || alert.status}</span>
      </div>
      <h2 id="alert-detail-title">{alert.title}</h2>
      <p>{alert.message}</p>

      <dl className="alert-detail-grid">
        <div>
          <dt>알림 유형</dt>
          <dd>{typeLabels[alert.type] || alert.type}</dd>
        </div>
        <div>
          <dt>발생 위치</dt>
          <dd>{alert.locationName}</dd>
        </div>
        <div>
          <dt>발생 기기</dt>
          <dd>{alert.device?.name || alert.deviceName}</dd>
        </div>
        <div>
          <dt>발생 시간</dt>
          <dd>{formatAlertTime(alert.occurredAt)}</dd>
        </div>
      </dl>

      <section className="voice-guide-card" aria-label="음성 안내 문구">
        <p className="card-label">다시 듣기 문구</p>
        <strong>{alert.voiceGuide}</strong>
      </section>

      <section className="recommended-action-card" aria-label="추천 후속 행동">
        <p className="card-label">추천 행동</p>
        <strong>{alert.recommendedAction}</strong>
      </section>

      {alert.requiresGuardianNotify ? (
        <p className="guardian-notify-note">위험 상황으로 보호자에게도 전달되는 알림입니다.</p>
      ) : null}

      <div className="action-row">
        <button className="secondary-button compact-button" type="button" onClick={onReplay}>
          다시 듣기
        </button>
        <button
          className="primary-button compact-button"
          type="button"
          disabled={alert.status === 'CONFIRMED'}
          onClick={onConfirm}
        >
          {alert.status === 'CONFIRMED' ? '확인 완료됨' : '확인 완료'}
        </button>
      </div>

      {feedbackMessage ? (
        <p className="status-message" role="status">
          {feedbackMessage}
        </p>
      ) : null}
    </section>
  )
}

function filterAlert(alert, activeFilter) {
  if (activeFilter === 'UNREAD') {
    return alert.status === 'UNREAD'
  }

  if (activeFilter === 'DANGER') {
    return isUrgentAlert(alert)
  }

  if (activeFilter === 'LIFE') {
    return alert.type === 'LIFE'
  }

  return true
}

function isUrgentAlert(alert) {
  return (
    alert.type === 'DANGER' ||
    alert.type === 'EMERGENCY' ||
    alert.severity === 'HIGH' ||
    alert.severity === 'CRITICAL'
  )
}

function formatAlertTime(isoString) {
  return isoString.slice(11, 16)
}

function speakAlert(text) {
  if (
    typeof window === 'undefined' ||
    !window.speechSynthesis ||
    typeof window.SpeechSynthesisUtterance !== 'function'
  ) {
    return
  }

  const utterance = new window.SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
