export function StatusPanel({
  applianceName,
  powerState,
  operatingState,
  modeLabel,
  statusLines,
  latestEvent,
  notificationResult,
  children,
}) {
  return (
    <section className="status-panel">
      <div className="status-panel-header">
        <div>
          <p className="status-eyebrow">상태 패널</p>
          <h2>{applianceName}</h2>
        </div>
      </div>

      <div className="status-grid">
        <article className="status-card">
          <span>전원 상태</span>
          <strong>{powerState}</strong>
        </article>
        <article className="status-card">
          <span>동작 상태</span>
          <strong>{operatingState}</strong>
        </article>
        <article className="status-card">
          <span>현재 모드</span>
          <strong>{modeLabel}</strong>
        </article>
      </div>

      {statusLines?.length ? (
        <div className="status-copy-list">
          {statusLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      <div className="control-panel">{children}</div>

      <div className="result-panel">
        <div>
          <span>최근 생성 이벤트</span>
          <strong>{latestEvent || '아직 없음'}</strong>
        </div>
        <div>
          <span>알림 전송 결과</span>
          <strong className={notificationResult?.type === 'error' ? 'is-error' : 'is-success'}>
            {notificationResult?.message || '대기 중'}
          </strong>
        </div>
      </div>
    </section>
  )
}
