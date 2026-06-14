import { useMemo, useState } from 'react'
import { confirmAlert, replayAlert } from '../services/alertService'
import { getWarningRecommendation } from '../services/warningService'

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
  REPLAYED: '다시 듣기',
  ESCALATED: '보호자 전달',
}

const filters = [
  { id: 'ALL', label: '전체' },
  { id: 'UNREAD', label: '미확인' },
  { id: 'DANGER', label: '위험' },
  { id: 'LIFE', label: '생활' },
]

const channelLabels = {
  BAND_VIBRATION: '밴드 진동',
  BAND_SCREEN: '밴드 화면',
  APP_SCREEN: '앱 화면',
  APP_VOICE: '음성 안내',
  TV_POPUP: 'TV 팝업',
  THINQ_LIGHT: 'ThinQ 조명',
  THINQ_ON_LIGHT: 'ThinQ 조명',
  GUARDIAN_PUSH: '보호자 알림',
  GUARDIAN_CALL: '보호자 전화',
}

const vibrationLabels = {
  BASIC_SHORT: '짧은 진동',
  BASIC_REPEAT: '반복 진동',
  STRONG_REPEAT: '강한 반복 진동',
  SOS_REPEAT: '긴급 반복 진동',
}

const screenModeLabels = {
  SIMPLE_TEXT: '간단 안내 화면',
  LARGE_TEXT: '큰 글씨 화면',
  HIGH_CONTRAST: '고대비 화면',
  HIGH_CONTRAST_LARGE_TEXT: '고대비 큰 글씨 화면',
  EMERGENCY_FULL_SCREEN: '긴급 전체 화면',
}

export function AlertsTab({ accessibilityType, alerts }) {
  const [alertItems, setAlertItems] = useState(alerts)
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [selectedAlertId, setSelectedAlertId] = useState(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [warningRecommendation, setWarningRecommendation] = useState(null)

  const selectedAlert =
    selectedAlertId === null
      ? null
      : alertItems.find((alert) => alert.alertId === selectedAlertId) || alertItems[0]

  const filteredAlerts = useMemo(
    () => alertItems.filter((alert) => filterAlert(alert, activeFilter)),
    [activeFilter, alertItems],
  )

  async function handleSelectAlert(alertId) {
    setSelectedAlertId(alertId)
    setFeedbackMessage('')
    setWarningRecommendation(null)

    const alert = alertItems.find((item) => item.alertId === alertId)
    if (alert) {
      setWarningRecommendation(await getWarningRecommendation(alert, accessibilityType))
    }
  }

  async function handleConfirmAlert(alertId) {
    try {
      await confirmAlert(alertId)
      setAlertItems((currentAlerts) => currentAlerts.filter((alert) => alert.alertId !== alertId))
      setSelectedAlertId(null)
      setFeedbackMessage('알림을 확인 처리했습니다.')
    } catch (error) {
      setFeedbackMessage(error.message || '알림 확인 처리에 실패했습니다.')
    }
  }

  async function handleReplayAlert(alert) {
    const guide = createAlertGuide(alert)
    const speechStarted = speakAlert(guide)

    setFeedbackMessage(
      speechStarted
        ? '알림 안내를 다시 들려드리고 있습니다.'
        : '이 브라우저에서는 음성 안내를 사용할 수 없습니다.',
    )

    try {
      await replayAlert(alert.alertId)
      setAlertItems((currentAlerts) =>
        currentAlerts.map((item) =>
          item.alertId === alert.alertId
            ? {
                ...item,
                status: 'REPLAYED',
              }
            : item,
        ),
      )
    } catch (error) {
      if (!speechStarted) {
        setFeedbackMessage(error.message || '알림 다시 듣기에 실패했습니다.')
      }
    }
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
          warningRecommendation={warningRecommendation}
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
                      aria-label={`${alert.title} 확인 완료`}
                      onClick={() => handleConfirmAlert(alert.alertId)}
                    >
                      확인 완료
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

function AlertDetail({ alert, feedbackMessage, onBack, onConfirm, onReplay, warningRecommendation }) {
  const guide = createAlertGuide(alert)

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
      <p aria-label="알림 안내">{guide}</p>

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

      {warningRecommendation ? (
        <WarningRecommendationCard recommendation={warningRecommendation} />
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

function WarningRecommendationCard({ recommendation }) {
  const channelNames = recommendation.recommendedChannels.map(
    (channel) => channelLabels[channel] || channel,
  )

  return (
    <section className="warning-recommendation-card" aria-label="전달된 알림 방식">
      <div className="warning-recommendation-header">
        <div>
          <p className="card-label">전달된 알림</p>
          <strong>이 알림은 아래 방식으로 전달되었습니다.</strong>
        </div>
        <span className={recommendation.notifyGuardian ? 'guardian-badge active' : 'guardian-badge'}>
          {recommendation.notifyGuardian ? '보호자에게도 전달됨' : '사용자에게만 전달됨'}
        </span>
      </div>

      <div className="warning-channel-list" aria-label="사용된 전달 수단">
        {channelNames.map((channel) => (
          <span key={channel}>{channel}</span>
        ))}
      </div>

      <dl className="warning-setting-grid">
        <div>
          <dt>진동 방식</dt>
          <dd>{vibrationLabels[recommendation.vibrationPattern] || recommendation.vibrationPattern}</dd>
        </div>
        <div>
          <dt>표시 화면</dt>
          <dd>{screenModeLabels[recommendation.screenMode] || recommendation.screenMode}</dd>
        </div>
        <div>
          <dt>음성 안내</dt>
          <dd>{recommendation.voiceEnabled ? '사용함' : '사용하지 않음'}</dd>
        </div>
      </dl>
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

function createAlertGuide(alert) {
  return [alert.voiceGuide || alert.message, alert.recommendedAction]
    .filter(Boolean)
    .filter((message, index, messages) => messages.indexOf(message) === index)
    .join(' ')
}

function speakAlert(text) {
  if (
    typeof window === 'undefined' ||
    !window.speechSynthesis ||
    typeof window.SpeechSynthesisUtterance !== 'function'
  ) {
    return false
  }

  const synthesis = window.speechSynthesis
  const utterance = new window.SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.volume = 1
  utterance.rate = 0.9
  utterance.pitch = 1

  const voices = synthesis.getVoices()
  const koreanVoice = voices.find((voice) => voice.lang?.toLowerCase().startsWith('ko'))
  if (koreanVoice) {
    utterance.voice = koreanVoice
  }

  synthesis.cancel()
  synthesis.resume()
  synthesis.speak(utterance)
  return true
}
