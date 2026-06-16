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
  GUARDIAN_CALL: '보호자 통화',
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

export function AlertsTab({
  accessibilityType,
  alerts,
  alertView = 'list',
  onCloseStats = () => {},
}) {
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

  const alertStats = useMemo(() => buildAlertStats(alertItems), [alertItems])

  async function handleSelectAlert(alertId) {
    setSelectedAlertId(alertId)
    setFeedbackMessage('')
    setWarningRecommendation(null)

    const alert = alertItems.find((item) => item.alertId === alertId)
    if (!alert) {
      return
    }

    setWarningRecommendation(await getWarningRecommendation(alert, accessibilityType))
  }

  async function handleConfirmAlert(alertId) {
    try {
      await confirmAlert(alertId)
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

  function handleDeleteAlert(alertId) {
    setAlertItems((currentAlerts) => currentAlerts.filter((alert) => alert.alertId !== alertId))
    if (selectedAlertId === alertId) {
      setSelectedAlertId(null)
    }
    setFeedbackMessage('알림을 목록에서 삭제했습니다.')
  }

  if (alertView === 'stats' && !selectedAlert) {
    return <AlertStatsPanel stats={alertStats} onBack={onCloseStats} />
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
                  className={[
                    'content-card alert-card',
                    isUrgentAlert(alert) ? 'urgent' : '',
                    alert.status === 'UNREAD' ? 'unread' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={alert.alertId}
                >
                  <div className="alert-card-main no-icon">
                    <div className="alert-card-copy">
                      <div className="alert-card-topline">
                        <span className={`severity severity-${alert.severity.toLowerCase()}`}>
                          {severityLabels[alert.severity] || alert.severity}
                        </span>
                        <button
                          className="device-inline-add-button alert-delete-button"
                          type="button"
                          aria-label={`${alert.title} 삭제`}
                          onClick={() => handleDeleteAlert(alert.alertId)}
                        >
                          삭제
                        </button>
                      </div>
                      <h3>{alert.title}</h3>
                      <p className="alert-card-message">{alert.message}</p>
                      <small className="alert-meta-line">
                        {alert.deviceName} · {alert.locationName} · {formatAlertTime(alert.occurredAt)}
                      </small>
                    </div>
                  </div>
                  <div
                    className={
                      alert.status === 'CONFIRMED'
                        ? 'alert-card-actions single-action'
                        : 'alert-card-actions'
                    }
                  >
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      aria-label={`${alert.title} 상세 보기`}
                      onClick={() => handleSelectAlert(alert.alertId)}
                    >
                      상세 보기
                    </button>
                    {alert.status !== 'CONFIRMED' ? (
                      <button
                        className="primary-button compact-button"
                        type="button"
                        aria-label={`${alert.title} 확인 완료`}
                        onClick={() => handleConfirmAlert(alert.alertId)}
                      >
                        확인 완료
                      </button>
                    ) : null}
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

function AlertStatsPanel({ stats, onBack }) {
  return (
    <section className="tab-stack alert-tab" aria-labelledby="alert-stats-title">
      <section className="content-card alert-stats-panel">
        <div className="alert-detail-hero">
          <button
            className="text-button back-button alert-detail-back"
            type="button"
            aria-label="목록으로 돌아가기"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
          </button>
          <strong className="card-title" id="alert-stats-title">
            통계
          </strong>
        </div>

        <div className="alert-stats-grid">
          {stats.summaryCards.map((item) => (
            <article className="alert-stats-card" key={item.label}>
              <p>{item.label}</p>
              <strong>{item.value}</strong>
              <span>{item.description}</span>
            </article>
          ))}
        </div>

        <div className="alert-stats-note">
          <p className="card-label">요약</p>
          <p>{stats.summaryMessage}</p>
        </div>
      </section>
    </section>
  )
}

function AlertDetail({ alert, feedbackMessage, onBack, onConfirm, onReplay, warningRecommendation }) {
  const guide = createAlertGuide(alert)

  return (
    <section className="content-card alert-detail-panel" aria-labelledby="alert-detail-title">
      <div className="alert-detail-hero">
        <button
          className="text-button back-button alert-detail-back"
          type="button"
          aria-label="목록으로 돌아가기"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
        <strong className="card-title">알림 상세</strong>
      </div>

      <div className="alert-detail-heading">
        <div>
          <span className={`severity severity-${alert.severity.toLowerCase()}`}>
            {severityLabels[alert.severity] || alert.severity}
          </span>
          <strong className="card-title" id="alert-detail-title">
            {alert.title}
          </strong>
        </div>
        <span className={`alert-status-chip alert-status-${alert.status.toLowerCase()}`}>
          {statusLabels[alert.status] || alert.status}
        </span>
      </div>

      <p className="alert-detail-summary">{alert.message}</p>

      <div className="alert-guide-box" aria-label="알림 안내">
        <p>{guide}</p>
      </div>

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

      {alert.recommendedAction ? (
        <div className="alert-followup-box">
          <p className="card-label">추천 행동</p>
          <p>{alert.recommendedAction}</p>
        </div>
      ) : null}

      {warningRecommendation ? <WarningRecommendationCard recommendation={warningRecommendation} /> : null}

      <div className={alert.status === 'CONFIRMED' ? 'action-row single-action' : 'action-row'}>
        <button className="secondary-button compact-button" type="button" onClick={onReplay}>
          다시 듣기
        </button>
        {alert.status !== 'CONFIRMED' ? (
          <button className="primary-button compact-button" type="button" onClick={onConfirm}>
            확인 완료
          </button>
        ) : null}
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
  const deliverySummary = channelNames.join(' · ')
  const guidanceSummary = [
    vibrationLabels[recommendation.vibrationPattern] || recommendation.vibrationPattern,
    screenModeLabels[recommendation.screenMode] || recommendation.screenMode,
    recommendation.voiceEnabled ? '음성 안내 사용' : '음성 안내 없음',
  ].join(' · ')

  return (
    <section className="warning-recommendation-card" aria-label="전달 방식">
      <div className="warning-recommendation-header">
        <div>
          <p className="card-label">전달 방식</p>
          <strong className="card-title">이 알림은 이렇게 전달돼요.</strong>
        </div>
      </div>

      <dl className="warning-summary-grid">
        <div>
          <dt>전달 수단</dt>
          <dd>{deliverySummary}</dd>
        </div>
        <div>
          <dt>보조 안내</dt>
          <dd>{guidanceSummary}</dd>
        </div>
      </dl>
    </section>
  )
}

function buildAlertStats(alerts) {
  const unreadCount = alerts.filter((alert) => alert.status === 'UNREAD').length
  const dangerCount = alerts.filter((alert) => isUrgentAlert(alert)).length
  const guardianCount = alerts.filter((alert) => alert.requiresGuardianNotify).length
  const lifeCount = alerts.filter((alert) => alert.type === 'LIFE').length

  return {
    summaryCards: [
      {
        label: '전체 알림',
        value: `${alerts.length}건`,
        description: '최근 수신된 알림',
      },
      {
        label: '미확인',
        value: `${unreadCount}건`,
        description: '아직 확인 전',
      },
      {
        label: '위험 알림',
        value: `${dangerCount}건`,
        description: '긴급 대응 필요',
      },
      {
        label: '보호자 전달',
        value: `${guardianCount}건`,
        description: '보호자 알림 대상',
      },
      {
        label: '생활 알림',
        value: `${lifeCount}건`,
        description: '일상 안내 중심',
      },
    ],
    summaryMessage:
      unreadCount > 0
        ? `현재 미확인 알림 ${unreadCount}건이 있어 먼저 확인이 필요합니다.`
        : '현재 미확인 알림은 없고, 최근 알림 흐름을 한눈에 확인할 수 있습니다.',
  }
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
