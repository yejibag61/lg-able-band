import { useEffect, useMemo, useState } from 'react'
import { DevicesTab } from './DevicesTab'
import { HomeTab } from './HomeTab'
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

const MAX_DEVICE_COUNT = 10

export function HomeScreen({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('home')
  const [menuScreen, setMenuScreen] = useState('root')
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

  const currentTitle = useMemo(() => {
    if (activeTab === 'menu' && menuScreen === 'livingSignals') {
      return '생활 신호 설정'
    }
    return tabTitles[activeTab]
  }, [activeTab, menuScreen])

  function handleTabChange(nextTab) {
    setActiveTab(nextTab)
    setEmergencyMessage('')
    if (nextTab !== 'menu') {
      setMenuScreen('root')
    }
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
  const homeUserName = summary.user?.name || session.account.name
  const displayTitle = activeTab === 'home' ? `${homeUserName} 홈` : currentTitle
  const todayMessage = `${homeUserName}님, ${summary.safetyStatus.message}`

  return (
    <main className="phone-screen home-screen app-screen" aria-labelledby="home-title">
      <header className="home-header app-header">
        <div>
          <p className="eyebrow">{activeTab === 'home' ? 'LG Able Band' : 'Able Band'}</p>
          <h1 id="home-title">{displayTitle}</h1>
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
            onEmergencyRequest={() => setEmergencyMessage('보호자에게 긴급 요청을 보냈습니다.')}
            onOpenAlerts={() => handleTabChange('alerts')}
            onOpenDevices={() => handleTabChange('devices')}
          />
        ) : null}
        {activeTab === 'alerts' ? <AlertsTab alerts={preview.alerts} /> : null}
        {activeTab === 'devices' ? (
          <DevicesTab
            devices={preview.devices}
            maxDeviceCount={MAX_DEVICE_COUNT}
            uwb={preview.uwb}
          />
        ) : null}
        {activeTab === 'menu' && menuScreen === 'root' ? (
          <MenuTab
            accessibility={preview.accessibility}
            guardian={preview.guardian}
            livingSignals={preview.livingSignals}
            onOpenLivingSignals={() => setMenuScreen('livingSignals')}
            onLogout={onLogout}
            userName={session.account.name}
          />
        ) : null}
        {activeTab === 'menu' && menuScreen === 'livingSignals' ? (
          <LivingSignalSettingsScreen
            livingSignals={preview.livingSignals}
            onBack={() => setMenuScreen('root')}
          />
        ) : null}
      </div>

      <nav className="bottom-tabs" aria-label="주요 메뉴">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
            type="button"
            key={tab.id}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </main>
  )
}

function AlertsTab({ alerts }) {
  return (
    <section className="tab-stack" aria-labelledby="alerts-title">
      <div className="content-card hero-card">
        <p className="card-label">실시간 알림</p>
        <h2 id="alerts-title">지금 확인해야 할 알림을 모았어요.</h2>
        <p>위험도와 위치, 발생 시간을 보고 바로 확인하거나 다시 들을 수 있어요.</p>
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

function MenuTab({
  accessibility,
  guardian,
  livingSignals,
  onOpenLivingSignals,
  onLogout,
  userName,
}) {
  return (
    <section className="tab-stack" aria-labelledby="menu-title">
      <div className="content-card hero-card">
        <p className="card-label">빠른 설정</p>
        <h2 id="menu-title">자주 바꾸는 설정만 모았어요.</h2>
        <p>{userName}님의 접근성, 보호자, 생활 신호 기능을 확인합니다.</p>
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

      <button className="soft-card settings-link-card" type="button" onClick={onOpenLivingSignals}>
        <p className="card-label">생활 신호 설정</p>
        <h2>등록된 생활 알림음을 관리해요.</h2>
        <p>
          현재 {livingSignals.summary.registeredSoundCount}개 신호, 샘플 {livingSignals.summary.enrolledClipCount}개가
          등록되어 있어요.
        </p>
      </button>

      <button className="secondary-button full-button" type="button" onClick={onLogout}>
        로그인으로 돌아가기
      </button>
    </section>
  )
}

function LivingSignalSettingsScreen({ livingSignals, onBack }) {
  const { summary, sounds, evaluation, workflow } = livingSignals

  return (
    <section className="tab-stack" aria-labelledby="living-signals-title">
      <button className="text-button back-button" type="button" onClick={onBack}>
        ← 메뉴로 돌아가기
      </button>

      <div className="content-card hero-card">
        <p className="card-label">생활 신호 설정</p>
        <h2 id="living-signals-title">사용자 맞춤 생활 알림음을 관리해요.</h2>
        <p>등록한 소리를 다시 들었을 때 같은 생활 신호로 인식하도록 제품 화면 안에 연결한 상태입니다.</p>
      </div>

      <section className="signal-stat-grid" aria-label="생활 신호 요약">
        <article className="mini-card">
          <p className="card-label">등록 신호</p>
          <strong>{summary.registeredSoundCount}</strong>
          <span>사용자별 대표 생활 신호</span>
        </article>
        <article className="mini-card">
          <p className="card-label">등록 샘플</p>
          <strong>{summary.enrolledClipCount}</strong>
          <span>녹음 파일 기준</span>
        </article>
        <article className="mini-card">
          <p className="card-label">기준값</p>
          <strong>{summary.threshold.toFixed(2)}</strong>
          <span>유사도 threshold</span>
        </article>
        <article className="mini-card">
          <p className="card-label">최근 정확도</p>
          <strong>{Math.round(summary.accuracy * 100)}%</strong>
          <span>{summary.lastEvaluatedAt.slice(11, 16)} 평가 기준</span>
        </article>
      </section>

      <section className="content-card">
        <div className="section-title-row">
          <h2>등록된 생활 신호</h2>
          <span>{summary.matchingMethod}</span>
        </div>
        <div className="signal-list">
          {sounds.map((sound) => (
            <article className="soft-card signal-item" key={sound.soundId}>
              <div className="signal-item-head">
                <div>
                  <p className="card-label">{sound.soundTypeLabel}</p>
                  <h3>{sound.registeredSoundName}</h3>
                </div>
                <strong>{Math.round(sound.averageSimilarity * 100)}%</strong>
              </div>
              <p>{sound.notes}</p>
              <div className="settings-grid signal-metadata">
                <span>유형 {sound.soundType}</span>
                <span>샘플 {sound.clipCount}개</span>
              </div>
              <div className="sample-chip-row" aria-label="등록된 샘플">
                {sound.sampleNames.map((sampleName) => (
                  <span className="sample-chip" key={sampleName}>
                    {sampleName}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="section-title-row">
          <h2>현재 연결된 모델 기준</h2>
          <span>제품 반영 완료</span>
        </div>
        <div className="signal-detail-grid">
          <span>모델 {summary.modelName}</span>
          <span>정밀도 {Math.round(summary.precisionMacro * 100)}%</span>
          <span>재현율 {Math.round(summary.recallMacro * 100)}%</span>
          <span>F1 {Math.round(summary.f1Macro * 100)}%</span>
        </div>
      </section>

      <section className="content-card">
        <div className="section-title-row">
          <h2>최근 평가 결과</h2>
          <span>
            {evaluation.correctQueries}/{evaluation.totalQueries} 성공
          </span>
        </div>
        <p>
          자기 자신을 제외한 등록음 비교 기준으로 정확도 {Math.round(summary.accuracy * 100)}%를 기록했습니다.
        </p>
        <div className="signal-detail-grid">
          <span>최고 유사도 {evaluation.bestSimilarityMin.toFixed(4)}</span>
          <span>최고 유사도 {evaluation.bestSimilarityMax.toFixed(4)}</span>
          <span>리포트 {evaluation.reportFile}</span>
        </div>
      </section>

      <section className="content-card">
        <div className="section-title-row">
          <h2>동작 방식</h2>
          <span>현재 제품 흐름</span>
        </div>
        <ul className="signal-flow-list">
          {workflow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </section>
    </section>
  )
}
