import { useState } from 'react'
import { StatusBadge } from '../../components/StatusBadge'
import { vibrationLabelForAlert } from '../../services/vibrationService'
import { formatWearableTime } from '../../utils/formatWearableTime'
import { alertStatusLabels, alertTypeLabels, severityLabels } from './alertLabels'

export function CurrentAlertScreen({
  alert,
  alertPage = 0,
  alertTotal = 0,
  actionMessage,
  isBusy,
  syncedTime,
  onConfirm,
  onNextAlert,
  onPreviousAlert,
  onReplay,
}) {
  const [isChatbotOpen, setIsChatbotOpen] = useState(false)
  const [bandSettings, setBandSettings] = useState({
    sound: true,
    vibration: true,
  })
  const syncedTimeLabel = formatSyncedTime(syncedTime)

  if (!alert) {
    const hasActionMessage = Boolean(actionMessage)

    return (
      <section className="state-screen" aria-label="알림 없음">
        <div className="screen-topline">
          <p className="eyebrow">Able Band</p>
          <span>{syncedTimeLabel}</span>
        </div>
        <h1>{hasActionMessage ? '알림 상태 확인 필요' : '확인할 알림이 없습니다.'}</h1>
        <p>
          {hasActionMessage
            ? '휴대폰 연동 또는 네트워크 상태를 확인해주세요.'
            : '새 생활 신호나 위험 알림이 들어오면 바로 표시됩니다.'}
        </p>
        {hasActionMessage ? (
          <p className="live-message" role="status">
            {actionMessage}
          </p>
        ) : null}
      </section>
    )
  }

  const typeLabel = alertTypeLabels[alert.type] || alert.type
  const statusLabel = alertStatusLabels[alert.status] || alert.status
  const severityLabel = severityLabels[alert.severity] || alert.severity
  const tone = alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? 'danger' : 'default'
  const vibrationLabel = vibrationLabelForAlert(alert)

  return (
    <section className="alert-screen" aria-labelledby="alert-title">
      <div className="screen-topline">
        <StatusBadge tone={tone}>{typeLabel}</StatusBadge>
        <span>{severityLabel}</span>
        <span>{syncedTimeLabel}</span>
      </div>

      <div className="alert-copy">
        <h1 id="alert-title">{alert.title}</h1>
        <p>{alert.message}</p>
      </div>

      <dl className="compact-meta">
        <div>
          <dt>기기</dt>
          <dd>{alert.deviceName}</dd>
        </div>
        <div>
          <dt>위치</dt>
          <dd>{alert.locationName}</dd>
        </div>
        <div>
          <dt>상태</dt>
          <dd>{statusLabel}</dd>
        </div>
        <div>
          <dt>발생</dt>
          <dd>{formatWearableTime(alert.occurredAt)}</dd>
        </div>
      </dl>

      <div className={`vibration-feedback vibration-${tone}`} aria-label="진동 피드백">
        <span className="vibration-pulse" aria-hidden="true" />
        <div>
          <span>진동</span>
          <strong>{vibrationLabel}</strong>
        </div>
      </div>

      <div className="band-tool-row" aria-label="밴드 알림 도구">
        <button className="secondary-action mini-action" type="button" onClick={() => setIsChatbotOpen((current) => !current)}>
          챗봇
        </button>
        <label>
          <input
            type="checkbox"
            checked={bandSettings.vibration}
            onChange={(event) =>
              setBandSettings((current) => ({ ...current, vibration: event.target.checked }))
            }
          />
          진동
        </label>
        <label>
          <input
            type="checkbox"
            checked={bandSettings.sound}
            onChange={(event) =>
              setBandSettings((current) => ({ ...current, sound: event.target.checked }))
            }
          />
          소리
        </label>
      </div>

      {isChatbotOpen ? (
        <div className="chatbot-panel" aria-label="도움말 챗봇">
          <strong>도움말 챗봇</strong>
          <span>{alert.deviceName} 알림을 확인했어요. 위험하면 보호자에게 보내기 버튼을 눌러주세요.</span>
        </div>
      ) : null}

      <div className="action-row">
        <button className="secondary-action" type="button" disabled={isBusy} onClick={onReplay}>
          다시 듣기
        </button>
        <button className="primary-action" type="button" disabled={isBusy} onClick={onConfirm}>
          확인
        </button>
      </div>

      {alertTotal > 1 ? (
        <div className="alert-pager" aria-label="알림 페이지">
          <button
            className="secondary-action mini-action"
            type="button"
            disabled={alertPage <= 1}
            onClick={onPreviousAlert}
          >
            이전
          </button>
          <span>
            {alertPage}/{alertTotal}
          </span>
          <button
            className="secondary-action mini-action"
            type="button"
            disabled={alertPage >= alertTotal}
            onClick={onNextAlert}
          >
            다음
          </button>
        </div>
      ) : null}

      {actionMessage ? (
        <p className="live-message" role="status">
          {actionMessage}
        </p>
      ) : null}
    </section>
  )
}

function formatSyncedTime(value) {
  const date = value instanceof Date ? value : new Date()

  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
