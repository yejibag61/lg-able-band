import { StatusBadge } from '../../components/StatusBadge'
import { navigationStatusLabels, vibrationLabels } from './uwbLabels'

export function UwbGuideScreen({ session, actionMessage = '', isBusy, onStandby, onStop }) {
  if (!session) {
    return (
      <section className="state-screen" aria-label="UWB 안내 없음">
        <p className="eyebrow">UWB</p>
        <h1>위치 안내 없음</h1>
        <p>웨어러블에서 위치 안내를 시작하면 손목 화면에 거리와 진동이 표시됩니다.</p>
        {actionMessage ? (
          <p className="live-message" role="status">
            {actionMessage}
          </p>
        ) : null}
        <button className="secondary-action" type="button" onClick={onStandby}>
          대기 화면으로
        </button>
      </section>
    )
  }

  const statusLabel = navigationStatusLabels[session.navigationStatus] || session.navigationStatus
  const vibrationLabel = vibrationLabels[session.vibrationPattern] || session.vibrationPattern
  const confidence = Math.round(session.confidence * 100)
  const canStop = session.navigationStatus === 'ACTIVE'
  const lowConfidence = session.navigationStatus === 'FAILED' || confidence < 40
  const locationLabel = getRoomLabel(session)

  return (
    <section className="uwb-screen" aria-labelledby="uwb-title">
      <div className="screen-topline">
        <StatusBadge tone={session.navigationStatus === 'CANCELED' ? 'default' : 'guide'}>
          {statusLabel}
        </StatusBadge>
        {lowConfidence ? <span className="signal-warning">신호 낮음</span> : null}
        <span>신뢰도 {confidence}%</span>
      </div>

      <div className="uwb-main">
        <div>
          <p className="eyebrow">UWB 위치 안내</p>
          <h1 id="uwb-title">{session.targetDeviceName} 찾기</h1>
        </div>
        <strong>{session.distanceM}m</strong>
      </div>

      <p className="guide-copy">{session.voiceGuide}</p>
      {actionMessage ? (
        <p className="live-message" role="status">
          {actionMessage}
        </p>
      ) : null}

      <dl className="compact-meta">
        <div>
          <dt>위치</dt>
          <dd>{locationLabel}</dd>
        </div>
        <div>
          <dt>상태</dt>
          <dd>{statusLabel}</dd>
        </div>
      </dl>

      <div className="vibration-feedback vibration-guide" aria-label="진동 피드백">
        <span className="vibration-pulse" aria-hidden="true" />
        <div>
          <span>진동 패턴</span>
          <strong>{vibrationLabel} 표시 중</strong>
        </div>
      </div>

      <button
        className="secondary-action stop-action"
        type="button"
        disabled={isBusy || !canStop}
        onClick={() => onStop(session.sessionId)}
      >
        탐색 종료
      </button>
    </section>
  )
}

function getRoomLabel(session) {
  if (session.locationName || session.roomName || session.room) {
    return session.locationName || session.roomName || session.room
  }

  const targetName = session.targetDeviceName || ''

  if (targetName.includes('세탁')) {
    return '세탁실'
  }

  if (targetName.includes('냉장고')) {
    return '주방'
  }

  if (targetName.includes('공기질') || targetName.includes('TV')) {
    return '거실'
  }

  return '집 안'
}
