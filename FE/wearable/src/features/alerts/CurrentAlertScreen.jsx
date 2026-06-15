import { useRef } from 'react'
import { StatusBadge } from '../../components/StatusBadge'
import { vibrationLabelForAlert } from '../../services/vibrationService'
import { formatWearableTime } from '../../utils/formatWearableTime'
import { alertTypeLabels, severityLabels } from './alertLabels'

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
  onResetPairing,
}) {
  const swipeStartXRef = useRef(null)
  const swipeStartYRef = useRef(null)
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
        {hasActionMessage && onResetPairing ? (
          <div className="action-row">
            <button className="primary-action" type="button" onClick={onResetPairing}>
              QR 생성
            </button>
          </div>
        ) : null}
      </section>
    )
  }

  const typeLabel = alertTypeLabels[alert.type] || alert.type
  const guardianDeliveryLabel = getGuardianDeliveryLabel(alert)
  const severityLabel = severityLabels[alert.severity] || alert.severity
  const tone = alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? 'danger' : 'default'
  const vibrationLabel = vibrationLabelForAlert(alert)
  const canSwipe = alertTotal > 1

  function handleSwipeStart(event) {
    if (!canSwipe) {
      return
    }

    const point = getSwipePoint(event)
    swipeStartXRef.current = point.x
    swipeStartYRef.current = point.y
  }

  function handleSwipeEnd(event) {
    if (!canSwipe || swipeStartXRef.current === null || swipeStartYRef.current === null) {
      return
    }

    const point = getSwipePoint(event)
    const deltaX = point.x - swipeStartXRef.current
    const deltaY = point.y - swipeStartYRef.current
    swipeStartXRef.current = null
    swipeStartYRef.current = null

    if (Math.abs(deltaX) < 42 || Math.abs(deltaY) > 54) {
      return
    }

    if (deltaX < 0 && alertPage < alertTotal) {
      onNextAlert()
    }

    if (deltaX > 0 && alertPage > 1) {
      onPreviousAlert()
    }
  }

  return (
    <section
      className="alert-screen"
      aria-labelledby="alert-title"
      onMouseDown={handleSwipeStart}
      onMouseUp={handleSwipeEnd}
      onTouchEnd={handleSwipeEnd}
      onTouchStart={handleSwipeStart}
    >
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
          <dt>보호자</dt>
          <dd>{guardianDeliveryLabel}</dd>
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

      <div className="action-row">
        <button className="primary-action" type="button" disabled={isBusy} onClick={onConfirm}>
          확인
        </button>
      </div>

      {alertTotal > 1 ? (
        <div className="alert-pager" aria-label="알림 페이지">
          <button
            className="pager-arrow"
            type="button"
            aria-label="이전 알림"
            disabled={alertPage <= 1}
            onClick={onPreviousAlert}
          >
            &lt;
          </button>
          <div className="pager-dots" aria-label={`${alertPage}/${alertTotal}`}>
            {Array.from({ length: alertTotal }, (_, index) => (
              <span
                className={index + 1 === alertPage ? 'pager-dot active' : 'pager-dot'}
                key={`alert-page-${index + 1}`}
                aria-hidden="true"
              />
            ))}
          </div>
          <button
            className="pager-arrow"
            type="button"
            aria-label="다음 알림"
            disabled={alertPage >= alertTotal}
            onClick={onNextAlert}
          >
            &gt;
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

function getSwipePoint(event) {
  const touch = event.changedTouches?.[0] || event.touches?.[0]

  if (touch) {
    return {
      x: touch.clientX,
      y: touch.clientY,
    }
  }

  return {
    x: event.clientX,
    y: event.clientY,
  }
}

function getGuardianDeliveryLabel(alert) {
  if (alert.guardianNotified || alert.requiresGuardianNotify) {
    return '전달됨'
  }

  if (alert.type === 'EMERGENCY' || alert.type === 'DANGER' || ['HIGH', 'CRITICAL'].includes(alert.severity)) {
    return '자동 전달'
  }

  return '전달 안 함'
}
