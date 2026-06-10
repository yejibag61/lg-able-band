import { useEffect, useState } from 'react'
import { getHomeSummary } from '../services/homeService'

const statusLabels = {
  SAFE: '안전',
  CAUTION: '주의',
  DANGER: '위험',
  EMERGENCY: '긴급',
}

export function HomeScreen({ session, onLogout }) {
  const [homeState, setHomeState] = useState({
    loading: true,
    error: '',
    summary: null,
  })

  useEffect(() => {
    let isMounted = true

    async function loadHome() {
      try {
        const summary = await getHomeSummary()

        if (isMounted) {
          setHomeState({ loading: false, error: '', summary })
        }
      } catch {
        if (isMounted) {
          setHomeState({
            loading: false,
            error: '홈 정보를 불러오지 못했습니다.',
            summary: null,
          })
        }
      }
    }

    loadHome()

    return () => {
      isMounted = false
    }
  }, [])

  if (homeState.loading) {
    return (
      <main className="phone-screen home-screen">
        <p className="status-message">홈 정보를 불러오는 중입니다.</p>
      </main>
    )
  }

  if (homeState.error) {
    return (
      <main className="phone-screen home-screen">
        <p className="form-error" role="alert">
          {homeState.error}
        </p>
      </main>
    )
  }

  const { summary } = homeState
  const statusLabel = statusLabels[summary.safetyStatus.level] || summary.safetyStatus.level

  return (
    <main className="phone-screen home-screen" aria-labelledby="home-title">
      <header className="home-header">
        <div>
          <p className="eyebrow">우리집</p>
          <h1 id="home-title">Able Band 홈</h1>
        </div>
        <button className="icon-button" type="button" onClick={onLogout} aria-label="로그아웃">
          ⋯
        </button>
      </header>

      <section className={`status-card status-${summary.safetyStatus.level.toLowerCase()}`}>
        <p className="card-label">오늘의 상태</p>
        <div className="status-row">
          <strong>{statusLabel}</strong>
          <span>{summary.safetyStatus.lastCheckedAt.slice(11, 16)} 업데이트</span>
        </div>
        <p>{summary.safetyStatus.message}</p>
      </section>

      <section className="emergency-card">
        <div>
          <p className="card-label">긴급 도움</p>
          <h2>{summary.emergency.primaryGuardianName}에게 바로 알림</h2>
        </div>
        <button className="sos-button" type="button" disabled={!summary.quickActions.canRequestEmergency}>
          긴급 도움 요청
        </button>
      </section>

      <section className="content-card">
        <div className="section-title-row">
          <h2>최근 알림</h2>
          <span>{summary.recentAlerts.length}건</span>
        </div>
        <div className="alert-list">
          {summary.recentAlerts.length > 0 ? (
            summary.recentAlerts.map((alert) => (
              <article className="alert-item" key={alert.alertId}>
                <span className={`severity severity-${alert.severity.toLowerCase()}`}>
                  {alert.severity}
                </span>
                <div>
                  <h3>{alert.title}</h3>
                  <p>{alert.message}</p>
                  <small>
                    {alert.deviceName} · {alert.occurredAt.slice(11, 16)} ·{' '}
                    {alert.status === 'UNREAD' ? '미확인' : '확인됨'}
                  </small>
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">최근 알림이 없습니다.</p>
          )}
        </div>
      </section>

      <section className="summary-grid" aria-label="홈 요약">
        <article className="mini-card">
          <p className="card-label">기기</p>
          <strong>
            {summary.deviceSummary.connectedCount}/{summary.deviceSummary.totalCount}
          </strong>
          <span>연결됨 · 주의 {summary.deviceSummary.warningCount}</span>
        </article>
        <article className="mini-card">
          <p className="card-label">UWB</p>
          <strong>{summary.deviceSummary.uwbSupportedCount}대</strong>
          <span>위치 안내 가능</span>
        </article>
      </section>

      <section className="soft-card guardian-card">
        <p className="card-label">보호자 연결</p>
        <h2>{summary.emergency.primaryGuardianName} 연결됨</h2>
        <p>{session.account.name}님의 위험 알림을 보호자가 함께 확인할 수 있어요.</p>
      </section>
    </main>
  )
}
