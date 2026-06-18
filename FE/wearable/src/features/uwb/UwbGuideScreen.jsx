import { StatusBadge } from '../../components/StatusBadge'
import { navigationStatusLabels, vibrationLabels } from './uwbLabels'

export function UwbGuideScreen({ session, actionMessage = '', isBusy, onStandby, onStop }) {
  if (!session) {
    return (
      <section className="state-screen uwb-empty-screen" aria-label="UWB 안내 없음">
        <p className="eyebrow">UWB</p>
        <h1>위치 안내 없음</h1>
        <p>웨어러블에서 위치 안내를 시작하면 목표 가전과 거리, 진동 안내를 함께 보여드립니다.</p>
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
  const deviceName = session.targetDeviceName || '가전'

  const statusTone =
    session.navigationStatus === 'FAILED'
      ? 'critical'
      : session.navigationStatus === 'CANCELED'
        ? 'default'
        : 'guide'

  return (
    <section className="uwb-screen uwb-guide-screen" aria-label="내 가전 상세">
      <div className="uwb-main uwb-guide-hero">
        <div className="uwb-guide-heading">
          <StatusBadge tone={statusTone}>
            {statusLabel}
          </StatusBadge>
          <p className="uwb-guide-device-name">{deviceName}</p>
          <p className="uwb-guide-support">{vibrationLabel} 진동으로 안내 중</p>
        </div>

        <div className="uwb-guide-distance-block">
          <div className="uwb-guide-distance" aria-label={`현재 거리 ${session.distanceM}미터`}>
            <span>현재 거리</span>
            <strong>
              {session.distanceM}
              <small>m</small>
            </strong>
            {lowConfidence ? (
              <p className="uwb-guide-inline-warning">신호가 약해 정확도가 낮을 수 있어요.</p>
            ) : null}
          </div>
        </div>

        <div className="uwb-guide-copy-group">
          <p className="guide-copy uwb-guide-copy-inline">{session.voiceGuide}</p>
          {actionMessage ? (
            <p className="live-message uwb-guide-message" role="status">
              {actionMessage}
            </p>
          ) : null}
        </div>
      </div>

      <button
        className="secondary-action stop-action"
        type="button"
        disabled={isBusy || !canStop}
        onClick={() => onStop(session.sessionId)}
      >
        위치 안내 종료
      </button>
    </section>
  )
}
