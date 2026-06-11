import { useEffect, useMemo, useState } from 'react'
import { getGuardianDashboard } from '../services/guardianDashboardService'

const severityLabels = {
  CRITICAL: '긴급',
  HIGH: '위험',
  MEDIUM: '주의',
  LOW: '생활',
}

const statusLabels = {
  UNREAD: '미확인',
  CONFIRMED: '확인 완료',
  REPLAYED: '다시 들음',
  ESCALATED: '보호자 전달',
  RESOLVED: '해결됨',
  CANCELED: '취소됨',
}

export function GuardianPlaceholder({ account, onLogout }) {
  const [dashboardState, setDashboardState] = useState({
    loading: true,
    error: '',
    data: null,
  })
  const [actionMessage, setActionMessage] = useState('')
  const [activeActionPanel, setActiveActionPanel] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadDashboard() {
      try {
        const data = await getGuardianDashboard()
        if (isMounted) {
          setDashboardState({ loading: false, error: '', data })
        }
      } catch (error) {
        if (isMounted) {
          setDashboardState({
            loading: false,
            error: error.message || '보호자 정보를 불러오지 못했습니다.',
            data: null,
          })
        }
      }
    }

    loadDashboard()

    return () => {
      isMounted = false
    }
  }, [])

  const dashboard = dashboardState.data
  const latestDangerAlert = dashboard?.dangerAlerts?.[0] || null
  const latestEmergency = dashboard?.emergencyRequests?.[0] || null
  const safetyTone = dashboard?.summary?.activeEmergency ? 'danger' : 'safe'
  const contactMessage = useMemo(() => {
    if (!dashboard?.user?.name) {
      return '사용자에게 연락합니다.'
    }
    return `${dashboard.user.name}님에게 연락합니다.`
  }, [dashboard])

  if (dashboardState.loading) {
    return (
      <main className="phone-screen guardian-screen guardian-loading-screen">
        <div className="home-loading-group" role="status">
          <p>보호자 화면을 불러오는 중입니다.</p>
        </div>
      </main>
    )
  }

  if (dashboardState.error) {
    return (
      <main className="phone-screen guardian-screen">
        <p className="form-error" role="alert">
          {dashboardState.error}
        </p>
        <button className="secondary-button full-button" type="button" onClick={onLogout}>
          로그인으로 돌아가기
        </button>
      </main>
    )
  }

  return (
    <main className="phone-screen guardian-screen app-screen" aria-labelledby="guardian-title">
      <header className="home-header app-header">
        <div>
          <p className="eyebrow">Guardian</p>
          <h1 id="guardian-title">보호자 홈</h1>
          <p className="header-summary">{account.name}님, 연결된 사용자의 안전 상태입니다.</p>
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>
          로그아웃
        </button>
      </header>

      <div className="app-content guardian-content">
        <section className={`guardian-status-card status-${safetyTone}`}>
          <p className="card-label">현재 상태</p>
          <h2>{dashboard.summary.safetyMessage}</h2>
          <p>
            {dashboard.user.name} · {dashboard.user.accessibilityType}
          </p>
          <div className="guardian-summary-grid">
            <span>위험 알림 {dashboard.summary.unreadDangerAlertCount}건</span>
            <span>긴급 요청 {dashboard.summary.emergencyRequestCount}건</span>
          </div>
        </section>

        <section className="content-card guardian-emergency-panel" aria-labelledby="guardian-emergency-title">
          <div className="section-title-row">
            <div>
              <p className="card-label">긴급 도움 요청</p>
              <h2 id="guardian-emergency-title">
                {latestEmergency ? latestEmergency.message : '진행 중인 긴급 요청이 없습니다'}
              </h2>
            </div>
          </div>
          <p>
            {latestEmergency
              ? `${formatGuardianTime(latestEmergency.sentAt)} · ${latestEmergency.source}`
              : '사용자가 긴급 요청을 보내면 이 영역에 바로 표시됩니다.'}
          </p>
          <div className="guardian-action-grid single-action">
            <button
              className="primary-button compact-button"
              type="button"
              onClick={() => {
                setActiveActionPanel('contact')
                setActionMessage('')
              }}
            >
              사용자에게 연락
            </button>
          </div>
        </section>

        {activeActionPanel === 'contact' ? (
          <section className="content-card guardian-action-panel" aria-labelledby="guardian-contact-title">
            <div className="section-title-row">
              <div>
                <p className="card-label">사용자 연락</p>
                <h2 id="guardian-contact-title">{contactMessage}</h2>
              </div>
              <button className="text-button" type="button" onClick={() => setActiveActionPanel('')}>
                닫기
              </button>
            </div>
            <p>
              먼저 통화로 상태를 확인하고, 응답이 없으면 문자와 주변 도움 요청을 이어서 진행하세요.
            </p>
            <div className="guardian-contact-grid">
              <button
                className="primary-button compact-button"
                type="button"
                onClick={() => setActionMessage(`${dashboard.user.name}님에게 전화를 겁니다.`)}
              >
                전화 걸기
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={() => setActionMessage('안전 확인 문자를 보냈습니다.')}
              >
                확인 문자 보내기
              </button>
            </div>
            <div className="guardian-script-box">
              <strong>권장 확인 문장</strong>
              <p>“지금 괜찮으세요? 화면의 도움 요청을 보고 연락했어요. 대답이 어려우면 버튼만 눌러주세요.”</p>
            </div>
          </section>
        ) : null}

        <section className="content-card guardian-alert-panel" aria-labelledby="guardian-alert-title">
          <div className="section-title-row">
            <div>
              <p className="card-label">위험 알림</p>
              <h2 id="guardian-alert-title">
                {latestDangerAlert ? latestDangerAlert.title : '최근 위험 알림 없음'}
              </h2>
            </div>
            {latestDangerAlert ? (
              <span>{severityLabels[latestDangerAlert.severity] || latestDangerAlert.severity}</span>
            ) : null}
          </div>
          {latestDangerAlert ? (
            <>
              <p>{latestDangerAlert.message}</p>
              <dl className="guardian-detail-grid">
                <div>
                  <dt>발생 위치</dt>
                  <dd>{latestDangerAlert.locationName || '집 안'}</dd>
                </div>
                <div>
                  <dt>발생 기기</dt>
                  <dd>{latestDangerAlert.deviceName || '연동 기기'}</dd>
                </div>
                <div>
                  <dt>발생 시각</dt>
                  <dd>{formatGuardianTime(latestDangerAlert.occurredAt)}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{statusLabels[latestDangerAlert.status] || latestDangerAlert.status}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p>위험 알림이 들어오면 보호자에게 우선 표시됩니다.</p>
          )}
        </section>

        <section className="content-card guardian-list-panel" aria-labelledby="guardian-list-title">
          <div className="section-title-row">
            <h2 id="guardian-list-title">최근 전달 내역</h2>
            <span>{dashboard.dangerAlerts.length}건</span>
          </div>
          <div className="guardian-event-list">
            {dashboard.dangerAlerts.map((alert) => (
              <article className="guardian-event-item" key={alert.alertId}>
                <strong>{alert.title}</strong>
                <span>
                  {severityLabels[alert.severity] || alert.severity} · {formatGuardianTime(alert.occurredAt)}
                </span>
              </article>
            ))}
          </div>
        </section>

        {actionMessage ? (
          <p className="guardian-action-message" role="status">
            {actionMessage}
          </p>
        ) : null}
      </div>
    </main>
  )
}

function formatGuardianTime(value) {
  if (!value) {
    return '방금 전'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '시간 확인 필요'
  }

  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
