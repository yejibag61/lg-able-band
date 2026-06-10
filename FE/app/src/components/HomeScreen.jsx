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

const severityLabels = {
  LOW: '생활',
  MEDIUM: '주의',
  HIGH: '위험',
  CRITICAL: '긴급',
}

const MAX_DEVICE_COUNT = 10

const mockDeviceNames = [
  '현관 센서',
  '거실 조명',
  '침실 공기청정기',
  '주방 감지기',
  '욕실 비상벨',
  '베란다 창문 센서',
  '복도 UWB 태그',
]

export function HomeScreen({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('home')
  const [emergencyMessage, setEmergencyMessage] = useState('')
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

  function handleAddMockDevice() {
    setHomeState((current) => {
      if (!current.preview || current.preview.devices.length >= MAX_DEVICE_COUNT) {
        return current
      }

      const nextDeviceNumber = current.preview.devices.length + 1
      const nextDeviceName = mockDeviceNames[(nextDeviceNumber - 4) % mockDeviceNames.length]
      const nextDevices = [
        ...current.preview.devices,
        {
          deviceId: nextDeviceNumber,
          name: nextDeviceName,
          type: 'Mock 기기',
          status: '연결됨',
          detail: '생활 알림 수신 준비 완료',
        },
      ]

      return {
        ...current,
        preview: {
          ...current.preview,
          devices: nextDevices,
        },
        summary: {
          ...current.summary,
          deviceSummary: {
            ...current.summary.deviceSummary,
            totalCount: nextDevices.length,
            connectedCount: nextDevices.length,
          },
        },
      }
    })
  }

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
  const todayMessage = `${session.account.name}님, ${summary.safetyStatus.message}`

  return (
    <main className="phone-screen home-screen app-screen" aria-labelledby="home-title">
      <header className="home-header app-header">
        <div>
          <p className="eyebrow">{activeTab === 'home' ? session.account.name : 'Able Band'}</p>
          <h1 id="home-title">{tabTitles[activeTab]}</h1>
          {activeTab === 'home' ? <p className="header-summary">{todayMessage}</p> : null}
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>
          로그아웃
        </button>
      </header>

      <div className="app-content">
        {activeTab === 'home' ? (
          <HomeTab
            emergencyMessage={emergencyMessage}
            statusLabel={statusLabel}
            summary={summary}
            onEmergencyRequest={() => setEmergencyMessage('보호자에게 도움 요청을 보냈습니다.')}
            onOpenAlerts={() => setActiveTab('alerts')}
            onOpenDevices={() => setActiveTab('devices')}
          />
        ) : null}
        {activeTab === 'alerts' ? <AlertsTab alerts={preview.alerts} /> : null}
        {activeTab === 'devices' ? (
          <DevicesTab
            devices={preview.devices}
            maxDeviceCount={MAX_DEVICE_COUNT}
            onAddMockDevice={handleAddMockDevice}
            uwb={preview.uwb}
          />
        ) : null}
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

function HomeTab({
  emergencyMessage,
  statusLabel,
  summary,
  onEmergencyRequest,
  onOpenAlerts,
  onOpenDevices,
}) {
  const recentAlerts = summary.recentAlerts.slice(0, 1)

  return (
    <>
      <section className={`status-card status-${summary.safetyStatus.level.toLowerCase()}`}>
        <p className="card-label">오늘의 안전 상태</p>
        <div className="status-row">
          <strong>{statusLabel}</strong>
          <span>마지막 확인: 방금 전</span>
        </div>
        <p>{summary.safetyStatus.message}</p>
      </section>

      <section className="emergency-card">
        <div>
          <p className="card-label">긴급 도움 요청</p>
          <h2>{summary.emergency.primaryGuardianName}에게 바로 알림</h2>
        </div>
        <button
          className="sos-button"
          type="button"
          disabled={!summary.quickActions.canRequestEmergency}
          onClick={onEmergencyRequest}
        >
          긴급 도움 요청
        </button>
        {emergencyMessage ? (
          <p className="emergency-message" role="status">
            {emergencyMessage}
          </p>
        ) : null}
      </section>

      <section className="content-card alert-summary-card">
        <div className="section-title-row">
          <div>
            <p className="card-label">실시간 알림 요약</p>
            <h2>최근 알림</h2>
          </div>
          <button className="text-button" type="button" onClick={onOpenAlerts}>
            알림 전체 보기
          </button>
        </div>
        <div className="alert-list">
          {recentAlerts.length > 0 ? (
            recentAlerts.map((alert) => (
              <article className="alert-item" key={alert.alertId}>
                <span className={`severity severity-${alert.severity.toLowerCase()}`}>
                  {severityLabels[alert.severity] || alert.severity}
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

      <section className="content-card device-summary-card">
        <div>
          <p className="card-label">기기 연결 상태</p>
          <h2>연결된 기기 {summary.deviceSummary.connectedCount}/{summary.deviceSummary.totalCount}개</h2>
          <p>
            주의가 필요한 기기 {summary.deviceSummary.warningCount}개 · UWB 위치 안내 가능{' '}
            {summary.deviceSummary.uwbSupportedCount}개
          </p>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={onOpenDevices}>
          기기 확인
        </button>
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

function DevicesTab({ devices, maxDeviceCount, onAddMockDevice, uwb }) {
  const canAddDevice = devices.length < maxDeviceCount

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

      <section className="content-card device-register-card">
        <div>
          <p className="card-label">기기 등록</p>
          <h2>등록된 기기 {devices.length}/{maxDeviceCount}개</h2>
          <p>시연용 mock 기기를 최대 {maxDeviceCount}개까지 추가할 수 있습니다.</p>
        </div>
        <button
          className="secondary-button compact-button"
          type="button"
          disabled={!canAddDevice}
          onClick={onAddMockDevice}
        >
          Mock 기기 추가
        </button>
        {!canAddDevice ? (
          <p className="limit-message" role="status">
            최대 10개까지 등록할 수 있습니다.
          </p>
        ) : null}
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
