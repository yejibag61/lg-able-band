import { StatusBadge } from '../../components/StatusBadge'
import { vibrationLabelForAlert } from '../../services/vibrationService'
import { formatWearableTime } from '../../utils/formatWearableTime'
import { alertStatusLabels, alertTypeLabels, severityLabels } from './alertLabels'

export function CurrentAlertScreen({
  alert,
  actionMessage,
  isBusy,
  onConfirm,
  onReplay,
}) {
  if (!alert) {
    const hasActionMessage = Boolean(actionMessage)

    return (
      <section className="state-screen" aria-label="알림 없음">
        <p className="eyebrow">Able Band</p>
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
        <span>{formatWearableTime(alert.occurredAt)}</span>
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
      </dl>

      <div className={`vibration-feedback vibration-${tone}`} aria-label="진동 피드백">
        <span className="vibration-pulse" aria-hidden="true" />
        <div>
          <span>진동</span>
          <strong>{vibrationLabel}</strong>
        </div>
      </div>

      <div className="action-row">
        <button className="secondary-action" type="button" disabled={isBusy} onClick={onReplay}>
          다시 듣기
        </button>
        <button className="primary-action" type="button" disabled={isBusy} onClick={onConfirm}>
          확인
        </button>
      </div>

      {actionMessage ? (
        <p className="live-message" role="status">
          {actionMessage}
        </p>
      ) : null}
    </section>
  )
}
