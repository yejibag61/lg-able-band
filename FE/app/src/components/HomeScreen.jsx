import { useEffect, useState } from 'react'
import { getAppPreview, getHomeSummary } from '../services/homeService'

const statusLabels = {
  SAFE: '안전',
  CAUTION: '주의',
  DANGER: '위험',
  EMERGENCY: '긴급',
}

const tabs = [
  { id: 'home', label: '홈' },
  { id: 'alerts', label: '알림' },
  { id: 'devices', label: '기기' },
  { id: 'menu', label: '메뉴' },
]

const tabTitles = {
  home: 'Able Band 홈',
  alerts: '실시간 알림',
  devices: '기기와 UWB',
  menu: '메뉴',
}

export function HomeScreen({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('home')
  const [homeState, setHomeState] = useState({
    loading: true,
    error: '',
    summary: null,
    preview: null,
  })

  useEffect(() => {
    let isMounted = true

    async function loadHome() {
      try {
        const [summary, preview] = await Promise.all([getHomeSummary(), getAppPreview()])

        if (isMounted) {
          setHomeState({ loading: false, error: '', summary, preview })
        }
      } catch {
        if (isMounted) {
          setHomeState({
            loading: false,
            error: '홈 정보를 불러오지 못했습니다.',
            summary: null,
            preview: null,
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
      <main className="phone-screen home-screen app-screen">
        <p className="status-message">홈 정보를 불러오는 중입니다.</p>
      </main>
    )
  }

  if (homeState.error) {
    return (
      <main className="phone-screen home-screen app-screen">
        <p className="form-error" role="alert">
          {homeState.error}
        </p>
      </main>
    )
  }

  const { preview, summary } = homeState
  const statusLabel = statusLabels[summary.safetyStatus.level] || summary.safetyStatus.level

  return (
    <main className="phone-screen home-screen app-screen" aria-labelledby="home-title">
      <header className="home-header app-header">
        <div>
          <p className="eyebrow">{activeTab === 'home' ? '우리집' : 'Able Band'}</p>
          <h1 id="home-title">{tabTitles[activeTab]}</h1>
        </div>
        <button className="icon-button" type="button" onClick={onLogout} aria-label="로그아웃">
          ⋯
        </button>
      </header>

      <div className="app-content">
        {activeTab === 'home' ? (
          <HomeTab
            session={session}
            statusLabel={statusLabel}
            summary={summary}
            onOpenAlerts={() => setActiveTab('alerts')}
            onOpenDevices={() => setActiveTab('devices')}
          />
        ) : null}
        {activeTab === 'alerts' ? <AlertsTab alerts={preview.alerts} /> : null}
        {activeTab === 'devices' ? <DevicesTab devices={preview.devices} uwb={preview.uwb} /> : null}
        {activeTab === 'menu' ? (
          <MenuTab
            accessibility={preview.accessibility}
            guardian={preview.guardian}
            onLogout={onLogout}
            userName={session.account.name}
          />
        ) : null}
      </div>

      <nav className="bottom-tabs" aria-label="앱 주요 메뉴">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
            type="button"
            key={tab.id}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </main>
  )
}

function HomeTab({ session, statusLabel, summary, onOpenAlerts, onOpenDevices }) {
  return (
    <>
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
          <button className="text-button" type="button" onClick={onOpenAlerts}>
            {summary.recentAlerts.length}건 보기
          </button>
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
        <button className="mini-card mini-button" type="button" onClick={onOpenDevices}>
          <p className="card-label">기기</p>
          <strong>
            {summary.deviceSummary.connectedCount}/{summary.deviceSummary.totalCount}
          </strong>
          <span>연결됨 · 주의 {summary.deviceSummary.warningCount}</span>
        </button>
        <button className="mini-card mini-button" type="button" onClick={onOpenDevices}>
          <p className="card-label">UWB</p>
          <strong>{summary.deviceSummary.uwbSupportedCount}대</strong>
          <span>위치 안내 가능</span>
        </button>
      </section>

      <section className="soft-card guardian-card">
        <p className="card-label">보호자 연결</p>
        <h2>{summary.emergency.primaryGuardianName} 연결됨</h2>
        <p>{session.account.name}님의 위험 알림을 보호자가 함께 확인할 수 있어요.</p>
      </section>
    </>
  )
}

function AlertsTab({ alerts }) {
  return (
    <section className="tab-stack" aria-labelledby="alerts-title">
      <div className="content-card hero-card">
        <p className="card-label">실시간 알림</p>
        <h2 id="alerts-title">지금 확인할 알림을 모았어요.</h2>
        <p>위험도, 위치, 발생 시간을 보고 바로 확인하거나 다시 들을 수 있습니다.</p>
      </div>

      <div className="alert-list">
        {alerts.map((alert) => (
          <article className="content-card alert-detail-card" key={alert.alertId}>
            <div className="section-title-row">
              <span className={alert.severity === '긴급' ? 'severity severity-high' : 'severity'}>
                {alert.severity}
              </span>
              <small>{alert.status}</small>
            </div>
            <h3>{alert.title}</h3>
            <p>{alert.message}</p>
            <small>
              {alert.deviceName} · {alert.location} · {alert.occurredAt.slice(11, 16)}
            </small>
            <div className="action-row">
              <button className="secondary-button compact-button" type="button">
                다시 듣기
              </button>
              <button className="primary-button compact-button" type="button">
                확인 완료
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function DevicesTab({ devices, uwb }) {
  return (
    <section className="tab-stack" aria-labelledby="devices-title">
      <div className="content-card hero-card">
        <p className="card-label">기기와 UWB</p>
        <h2 id="devices-title">연동 기기를 한눈에 확인해요.</h2>
        <p>밴드, ThinQ 가전, UWB 안내 대상 상태를 빠르게 볼 수 있습니다.</p>
      </div>

      <section className="content-card">
        <div className="section-title-row">
          <h2>UWB 위치 안내</h2>
          <span>{uwb.distanceM}m</span>
        </div>
        <p>{uwb.targetName} · {uwb.vibrationPattern}</p>
        <p>{uwb.voiceGuide}</p>
        <button className="primary-button full-button" type="button">
          위치 안내 시작
        </button>
      </section>

      <div className="device-list">
        {devices.map((device) => (
          <article className="soft-card device-card" key={device.deviceId}>
            <div>
              <p className="card-label">{device.type}</p>
              <h3>{device.name}</h3>
              <p>{device.detail}</p>
            </div>
            <strong>{device.status}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

function MenuTab({ accessibility, guardian, onLogout, userName }) {
  return (
    <section className="tab-stack" aria-labelledby="menu-title">
      <div className="content-card hero-card">
        <p className="card-label">내 설정</p>
        <h2 id="menu-title">자주 바꾸는 설정만 모았어요.</h2>
        <p>{userName}님의 접근성, 보호자, 계정 기능을 확인합니다.</p>
      </div>

      <section className="content-card">
        <div className="section-title-row">
          <h2>접근성 설정</h2>
          <span>{accessibility.textSize}</span>
        </div>
        <div className="settings-grid">
          <span>{accessibility.disabilityType}</span>
          <span>{accessibility.voiceGuide ? '음성 안내 ON' : '음성 안내 OFF'}</span>
          <span>{accessibility.vibrationGuide ? '진동 안내 ON' : '진동 안내 OFF'}</span>
          <span>{accessibility.highContrast ? '고대비 ON' : '고대비 OFF'}</span>
        </div>
      </section>

      <section className="soft-card guardian-card">
        <p className="card-label">보호자 연결</p>
        <h2>{guardian.name} 연결됨</h2>
        <p>
          {guardian.relation} · {guardian.status}
        </p>
      </section>

      <button className="secondary-button full-button" type="button" onClick={onLogout}>
        로그인으로 돌아가기
      </button>
    </section>
  )
}
