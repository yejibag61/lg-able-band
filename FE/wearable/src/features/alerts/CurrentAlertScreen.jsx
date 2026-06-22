import { useRef } from 'react'
import { formatWearableTime } from '../../utils/formatWearableTime'

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

  const canSwipe = alertTotal > 1
  const occurredTimeLabel = formatAlertDateTime(alert.occurredAt || syncedTime)
  const pagerCount = Math.max(alertTotal, 1)

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
      className="alert-screen alert-screen-simple"
      aria-labelledby="alert-title"
      onMouseDown={handleSwipeStart}
      onMouseUp={handleSwipeEnd}
      onTouchEnd={handleSwipeEnd}
      onTouchStart={handleSwipeStart}
    >
      <div className="alert-watch-card">
        <div className="alert-watch-time" aria-label="알림 시간">
          {occurredTimeLabel || syncedTimeLabel}
        </div>

        <div className="alert-copy alert-copy-simple">
          <h1 id="alert-title">{alert.title}</h1>
          <p>{alert.message}</p>
        </div>
      </div>

      <div className="action-row alert-action-row">
        <button className="primary-action" type="button" disabled={isBusy} onClick={onConfirm}>
          확인
        </button>
      </div>

      <div className="alert-pager alert-pager-dots-only" aria-label="알림 페이지">
        <div className="pager-dots" aria-label={`${Math.max(alertPage, 1)}/${pagerCount}`}>
          {Array.from({ length: pagerCount }, (_, index) => (
            <span
              className={index + 1 === Math.max(alertPage, 1) ? 'pager-dot active' : 'pager-dot'}
              key={`alert-page-${index + 1}`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
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

function formatAlertDateTime(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return formatWearableTime(value)
  }

  const dateLabel = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(date)

  return `${dateLabel} ${formatWearableTime(date)}`
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
