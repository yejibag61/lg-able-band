export function WearableEmergencyScreen({
  actionMessage = '',
  isBusy,
  onCancel,
  onRequest,
}) {
  return (
    <section className="emergency-screen" aria-labelledby="emergency-title">
      <div className="emergency-mark" aria-hidden="true">
        SOS
      </div>
      <p className="eyebrow">Able Band</p>
      <h1 id="emergency-title">긴급 요청</h1>
      <p className="emergency-copy">보호자에게 지금 도움이 필요하다는 알림을 보냅니다.</p>

      <div className="action-row">
        <button className="secondary-action" type="button" disabled={isBusy} onClick={onCancel}>
          취소
        </button>
        <button className="primary-action" type="button" disabled={isBusy} onClick={onRequest}>
          보호자에게 보내기
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
