import { Fragment, useEffect, useMemo, useState } from 'react'
import { confirmAlert, deleteAlert, replayAlert } from '../services/alertService'
import { getWarningRecommendation } from '../services/warningService'
import { isEmergencyRequestAlert } from '../utils/homeSummaryUtils'

function scrollAppContentToTop() {
  const appContent = document.querySelector('.app-content')
  if (appContent instanceof HTMLElement) {
    appContent.scrollTo({ top: 0, left: 0 })
  }

  window.scrollTo({ top: 0, left: 0 })
}

const typeLabels = {
  LIFE: '생활',
  DANGER: '위험',
  EMERGENCY: '긴급',
  LOCATION: '위치',
}

const severityLabels = {
  LOW: '생활',
  MEDIUM: '주의',
  HIGH: '위험',
  CRITICAL: '긴급',
}

const filters = [
  { id: 'ALL', label: '전체' },
  { id: 'UNREAD', label: '미확인' },
  { id: 'DANGER', label: '위험' },
  { id: 'EMERGENCY', label: '긴급' },
  { id: 'LIFE', label: '생활' },
]

const channelLabels = {
  BAND_VIBRATION: '밴드 진동',
  BAND_SCREEN: '밴드 화면',
  APP_SCREEN: '앱 화면',
  APP_VOICE: '음성 안내',
  TV_POPUP: 'TV 팝업',
  THINQ_LIGHT: 'ThinQ 조명',
  THINQ_ON_LIGHT: 'ThinQ 조명',
  GUARDIAN_PUSH: '보호자 알림',
  GUARDIAN_CALL: '보호자 통화',
}

const vibrationLabels = {
  BASIC_SHORT: '짧은 진동',
  BASIC_REPEAT: '반복 진동',
  STRONG_REPEAT: '강한 반복 진동',
  SOS_REPEAT: '긴급 반복 진동',
}

const screenModeLabels = {
  SIMPLE_TEXT: '간단 안내 화면',
  LARGE_TEXT: '큰 글씨 화면',
  HIGH_CONTRAST: '고대비 화면',
  HIGH_CONTRAST_LARGE_TEXT: '고대비 큰 글씨 화면',
  EMERGENCY_FULL_SCREEN: '긴급 전체 화면',
}

const notificationStatsMock = {
  periods: [
    { id: '7d', label: '최근 7일' },
    { id: '30d', label: '최근 30일' },
    { id: 'month', label: '이번 달' },
  ],
  summary: [
    { id: 'total', label: '총 알림', value: '126', icon: 'bell' },
    { id: 'danger', label: '위험 알림', value: '18', icon: 'shield', accent: true },
    { id: 'topDevice', label: '가장 자주 사용한 가전', value: '세탁기', icon: 'washer' },
    { id: 'peakTime', label: '알림 피크 시간', value: '19:00-21:00', icon: 'clock' },
  ],
  timeAlerts: [
    { label: '오전 6시', value: 8 },
    { label: '오전 9시', value: 13 },
    { label: '오후 12시', value: 16 },
    { label: '오후 3시', value: 20 },
    { label: '오후 6시', value: 25 },
    { label: '오후 9시', value: 44 },
  ],
  deviceUsage: [
    { device: '세탁기', value: 48, icon: 'washer' },
    { device: '냉장고', value: 32, icon: 'fridge' },
    { device: 'TV', value: 20, icon: 'tv' },
    { device: '공기질 센서', value: 14, icon: 'air' },
    { device: '도어센서', value: 12, icon: 'door' },
  ],
  ratios: [
    { label: '위험', value: 18, color: '#e11d48' },
    { label: '주의', value: 32, color: '#f59e0b' },
    { label: '일반', value: 50, color: '#cbd5e1' },
  ],
  deviceAlerts: [
    { device: '세탁기', total: 48, danger: 6, caution: 14, normal: 28, icon: 'washer' },
    { device: '냉장고', total: 32, danger: 3, caution: 9, normal: 20, icon: 'fridge' },
    { device: '도어센서', total: 12, danger: 5, caution: 4, normal: 3, icon: 'door' },
    { device: '공기질 센서', total: 14, danger: 4, caution: 5, normal: 5, icon: 'air' },
  ],
  insight:
    '최근 7일 동안 저녁 시간대(19:00-21:00)에 알림이 가장 많이 발생했습니다. 세탁기와 도어센서 관련 알림 비중이 높아 생활 패턴이 저녁 시간에 집중되는 것으로 보입니다. 위험 알림은 공기질 센서와 도어센서에서 주로 발생했습니다.',
}

export function AlertsTab({
  accessibility = {},
  accessibilityType,
  alerts,
  alertView = 'list',
  onAlertDelete = () => {},
  onAlertRestore = () => {},
  onAlertStatusChange = () => {},
}) {
  const [alertItems, setAlertItems] = useState(() => alerts.filter((alert) => alert.status !== 'CONFIRMED'))
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [selectedAlertId, setSelectedAlertId] = useState(null)
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [inlineFeedback, setInlineFeedback] = useState(null)
  const [warningRecommendation, setWarningRecommendation] = useState(null)
  const visibleAlertItems = useMemo(
    () => alertItems.filter((alert) => !isEmergencyRequestAlert(alert)),
    [alertItems],
  )

  const selectedAlert =
    selectedAlertId === null
      ? null
      : visibleAlertItems.find((alert) => alert.alertId === selectedAlertId) || visibleAlertItems[0]

  const filteredAlerts = useMemo(
    () => visibleAlertItems.filter((alert) => filterAlert(alert, activeFilter)),
    [activeFilter, visibleAlertItems],
  )

  useEffect(() => {
    const nextAlerts = alerts.filter((alert) => alert.status !== 'CONFIRMED')
    setAlertItems(nextAlerts)
    setSelectedAlertId((current) =>
      current !== null && !nextAlerts.some((alert) => alert.alertId === current) ? null : current,
    )
  }, [alerts])

  useEffect(() => {
    if (selectedAlertId === null && alertView !== 'stats') {
      return
    }

    scrollAppContentToTop()
  }, [alertView, selectedAlertId])

  useEffect(() => {
    function handleAlertsUpdated(event) {
      if (Array.isArray(event.detail?.alerts)) {
        setAlertItems(event.detail.alerts)
        setSelectedAlertId(null)
        setFeedbackMessage('')
        setInlineFeedback(null)
      }
    }

    function handleAlertFilter(event) {
      const nextFilter = event.detail?.filter
      if (filters.some((filter) => filter.id === nextFilter)) {
        setActiveFilter(nextFilter)
        setSelectedAlertId(null)
        setFeedbackMessage('')
        setInlineFeedback(null)
      }
    }

    window.addEventListener('lg-able-band:alerts-updated', handleAlertsUpdated)
    window.addEventListener('lg-able-band:alerts-filter', handleAlertFilter)

    return () => {
      window.removeEventListener('lg-able-band:alerts-updated', handleAlertsUpdated)
      window.removeEventListener('lg-able-band:alerts-filter', handleAlertFilter)
    }
  }, [])

  async function handleSelectAlert(alertId) {
    setSelectedAlertId(alertId)
    setFeedbackMessage('')
    setInlineFeedback(null)
    setWarningRecommendation(null)

    const alert = visibleAlertItems.find((item) => item.alertId === alertId)
    if (!alert) {
      return
    }

    if (shouldShowDeliveryRecommendation(alert)) {
      setWarningRecommendation(await getWarningRecommendation(alert, accessibilityType))
    }
  }

  async function handleConfirmAlert(alertId) {
    const confirmedIndex = alertItems.findIndex((alert) => alert.alertId === alertId)
    const confirmedAlert = alertItems[confirmedIndex]

    if (!confirmedAlert) {
      return
    }

    setInlineFeedback(null)
    setAlertItems((currentAlerts) => currentAlerts.filter((alert) => alert.alertId !== alertId))
    if (selectedAlertId === alertId) {
      setSelectedAlertId(null)
    }
    setFeedbackMessage('')

    try {
      await confirmAlert(alertId)
      onAlertStatusChange(alertId, 'CONFIRMED')
      setFeedbackMessage('알림을 확인 완료로 처리했습니다.')
    } catch (error) {
      setAlertItems((currentAlerts) => {
        if (currentAlerts.some((alert) => alert.alertId === alertId)) {
          return currentAlerts
        }

        const nextAlerts = [...currentAlerts]
        nextAlerts.splice(Math.max(confirmedIndex, 0), 0, confirmedAlert)
        return nextAlerts
      })
      setFeedbackMessage(error.message || '알림 확인 처리에 실패했습니다.')
    }
  }

  async function handleReplayAlert(alert) {
    setInlineFeedback(null)
    if (accessibility.voiceGuide === false) {
      setFeedbackMessage('음성 안내가 꺼져 있어 알림 안내를 재생하지 않았습니다.')
      return
    }

    const guide = createAlertGuide(alert)
    const speechStarted = speakAlert(guide)

    setFeedbackMessage(
      speechStarted
        ? '알림 안내를 다시 들려드리고 있습니다.'
        : '이 브라우저에서는 음성 안내를 사용할 수 없습니다.',
    )

    try {
      await replayAlert(alert.alertId)
      setAlertItems((currentAlerts) =>
        currentAlerts.map((item) =>
          item.alertId === alert.alertId
            ? {
                ...item,
                status: 'REPLAYED',
              }
            : item,
        ),
      )
      onAlertStatusChange(alert.alertId, 'REPLAYED')
    } catch (error) {
      if (!speechStarted) {
        setFeedbackMessage(error.message || '알림 다시 듣기에 실패했습니다.')
      }
    }
  }

  async function handleDeleteAlert(alertId) {
    const deletedIndex = filteredAlerts.findIndex((alert) => alert.alertId === alertId)
    const originalIndex = alertItems.findIndex((alert) => alert.alertId === alertId)
    const deletedAlert = alertItems[originalIndex]
    const nextVisibleAlertId = filteredAlerts[deletedIndex + 1]?.alertId ?? null

    if (!deletedAlert) {
      return
    }

    setInlineFeedback(null)
    setAlertItems((currentAlerts) => currentAlerts.filter((alert) => alert.alertId !== alertId))
    onAlertDelete(alertId)
    if (selectedAlertId === alertId) {
      setSelectedAlertId(null)
    }
    setFeedbackMessage('')
    setInlineFeedback({
      appendToEnd: nextVisibleAlertId === null,
      insertBeforeAlertId: nextVisibleAlertId,
      message: '알림을 삭제하는 중입니다.',
    })

    try {
      await deleteAlert(alertId)
      setInlineFeedback({
        appendToEnd: nextVisibleAlertId === null,
        insertBeforeAlertId: nextVisibleAlertId,
        message: '알림을 목록에서 삭제했습니다.',
      })
    } catch (error) {
      setAlertItems((currentAlerts) => {
        if (currentAlerts.some((alert) => alert.alertId === alertId)) {
          return currentAlerts
        }

        const nextAlerts = [...currentAlerts]
        nextAlerts.splice(Math.max(originalIndex, 0), 0, deletedAlert)
        return nextAlerts
      })
      onAlertRestore(deletedAlert)
      setInlineFeedback(null)
      setFeedbackMessage(error.message || '알림 삭제에 실패했습니다.')
    }
  }

  if (alertView === 'stats' && !selectedAlert) {
    return <NotificationStatsPage stats={notificationStatsMock} />
  }

  return (
    <section
      className="tab-stack alert-tab"
      aria-label={selectedAlert ? undefined : '실시간 알림 목록'}
      aria-labelledby={selectedAlert ? 'alert-detail-title' : undefined}
    >
      {selectedAlert ? (
        <AlertDetail
          alert={selectedAlert}
          feedbackMessage={feedbackMessage}
          warningRecommendation={warningRecommendation}
          onBack={() => {
            setSelectedAlertId(null)
            setFeedbackMessage('')
          }}
          onConfirm={() => handleConfirmAlert(selectedAlert.alertId)}
          onReplay={() => handleReplayAlert(selectedAlert)}
        />
      ) : (
        <>
          <div className="alert-filter-row" aria-label="알림 필터">
            {filters.map((filter) => (
              <button
                className={activeFilter === filter.id ? 'filter-chip active' : 'filter-chip'}
                type="button"
                key={filter.id}
                aria-pressed={activeFilter === filter.id}
                onClick={() => {
                  setActiveFilter(filter.id)
                  setFeedbackMessage('')
                  setInlineFeedback(null)
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="alert-list" aria-label="알림 목록">
            {filteredAlerts.length > 0 ? (
              <>
              {filteredAlerts.map((alert) => (
                <Fragment key={alert.alertId}>
                {inlineFeedback?.insertBeforeAlertId === alert.alertId ? (
                  <InlineAlertFeedback message={inlineFeedback.message} />
                ) : null}
                <article
                  className={[
                    'content-card alert-card',
                    isUrgentAlert(alert) ? 'urgent' : '',
                    alert.status === 'UNREAD' ? 'unread' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="alert-card-main no-icon">
                    <div className="alert-card-copy">
                      <div className="alert-card-topline">
                        <span className={`severity severity-${alert.severity.toLowerCase()}`}>
                          {severityLabels[alert.severity] || alert.severity}
                        </span>
                        <button
                          className="device-inline-add-button alert-delete-button"
                          type="button"
                          aria-label={`${alert.title} 삭제`}
                          onClick={() => handleDeleteAlert(alert.alertId)}
                        >
                          삭제
                        </button>
                      </div>
                      <h3>{alert.title}</h3>
                      <p className="alert-card-message">{alert.message}</p>
                      <small className="alert-meta-line">
                        {alert.deviceName} · {alert.locationName} · {formatAlertTime(alert.occurredAt)}
                      </small>
                    </div>
                  </div>
                  <div
                    className={
                      alert.status === 'CONFIRMED'
                        ? 'alert-card-actions single-action'
                        : 'alert-card-actions'
                    }
                  >
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      aria-label={`${alert.title} 상세 보기`}
                      onClick={() => handleSelectAlert(alert.alertId)}
                    >
                      상세 보기
                    </button>
                    {alert.status !== 'CONFIRMED' ? (
                      <button
                        className="primary-button compact-button"
                        type="button"
                        aria-label={`${alert.title} 확인 완료`}
                        onClick={() => handleConfirmAlert(alert.alertId)}
                      >
                        확인 완료
                      </button>
                    ) : null}
                  </div>
                </article>
                </Fragment>
              ))}
              {inlineFeedback?.appendToEnd ? (
                <InlineAlertFeedback message={inlineFeedback.message} />
              ) : null}
              </>
            ) : inlineFeedback ? (
              <InlineAlertFeedback message={inlineFeedback.message} />
            ) : (
              <p className="empty-state">조건에 맞는 알림이 없습니다.</p>
            )}
          </div>

          {feedbackMessage ? (
            <p className="status-message" role="status">
              {feedbackMessage}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

function InlineAlertFeedback({ message }) {
  return (
    <p className="status-message alert-inline-status" role="status">
      {message}
    </p>
  )
}

function NotificationStatsPage({ stats }) {
  const [activePeriod, setActivePeriod] = useState('7d')

  return (
    <section className="tab-stack alert-tab notification-stats-page" aria-label="알림 통계 리포트">
      <PeriodFilter periods={stats.periods} activePeriod={activePeriod} onChange={setActivePeriod} />

      <section className="notification-summary-grid" aria-label="알림 통계 요약">
        {stats.summary.map((item) => (
          <StatsSummaryCard item={item} key={item.id} />
        ))}
      </section>

      <TimeAlertChart data={stats.timeAlerts} />
      <DeviceUsageRanking data={stats.deviceUsage} />
      <AlertRatioChart data={stats.ratios} />
      <DeviceAlertTable data={stats.deviceAlerts} />
      <AiInsightCard insight={stats.insight} />
    </section>
  )
}

function PeriodFilter({ periods, activePeriod, onChange }) {
  return (
    <div className="notification-period-filter" aria-label="통계 기간 선택">
      {periods.map((period) => (
        <button
          className={activePeriod === period.id ? 'notification-period-button active' : 'notification-period-button'}
          type="button"
          key={period.id}
          aria-pressed={activePeriod === period.id}
          onClick={() => onChange(period.id)}
        >
          {period.label}
        </button>
      ))}
    </div>
  )
}

function StatsSummaryCard({ item }) {
  const numericValue = Number(item.value)
  const shouldCountUp = Number.isFinite(numericValue)

  return (
    <article className={item.accent ? 'stats-summary-card accent' : 'stats-summary-card'}>
      <span className="stats-summary-icon" aria-hidden="true">
        <StatsIcon name={item.icon} />
      </span>
      <div>
        <p>{item.label}</p>
        <strong>{shouldCountUp ? <CountUpNumber value={numericValue} /> : item.value}</strong>
      </div>
    </article>
  )
}

function CountUpNumber({ value }) {
  const [displayValue, setDisplayValue] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? value
      : 0,
  )

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return undefined
    }

    let animationFrame = 0
    const duration = 650
    const startTime = window.performance.now()

    function updateFrame(now) {
      const progress = Math.min((now - startTime) / duration, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      setDisplayValue(Math.round(value * easedProgress))

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(updateFrame)
      }
    }

    animationFrame = window.requestAnimationFrame(updateFrame)

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [value])

  return displayValue
}

function TimeAlertChart({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value))

  return (
    <StatsSection title="시간대별 알림 발생 수">
      <div className="time-alert-chart" aria-label="시간대별 알림 막대 차트">
        {data.map((item) => (
          <div className="time-alert-bar-item" key={item.label}>
            <span className="time-alert-value">{item.value}</span>
            <span
              className="time-alert-bar"
              style={{ height: Math.max((item.value / maxValue) * 100, 14) + '%' }}
              aria-label={item.label + ' ' + item.value + '건'}
            />
            <span className="time-alert-label">{item.label}</span>
          </div>
        ))}
      </div>
    </StatsSection>
  )
}

function DeviceUsageRanking({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value))

  return (
    <StatsSection title="자주 사용하는 가전">
      <div className="device-usage-list">
        {data.map((item) => (
          <div className="device-usage-row" key={item.device}>
            <span className="device-usage-icon" aria-hidden="true">
              <StatsIcon name={item.icon} />
            </span>
            <span className="device-usage-name">{item.device}</span>
            <span className="device-usage-track" aria-hidden="true">
              <span style={{ width: (item.value / maxValue) * 100 + '%' }} />
            </span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </StatsSection>
  )
}

function AlertRatioChart({ data }) {
  const ratioSegments = data.reduce((segments, item) => {
    const offset = segments.reduce((sum, segment) => sum + segment.value, 0)
    return [...segments, { ...item, offset }]
  }, [])

  return (
    <StatsSection title="위험/주의 알림 비율">
      <div className="alert-ratio-layout">
        <div className="alert-ratio-donut" aria-label="위험 18%, 주의 32%, 일반 50%" role="img">
          <svg viewBox="0 0 120 120" focusable="false">
            <circle className="alert-ratio-donut-track" cx="60" cy="60" r="46" />
            {ratioSegments.map((item) => (
              <circle
                className="alert-ratio-donut-segment"
                cx="60"
                cy="60"
                r="46"
                key={item.label}
                pathLength="100"
                stroke={item.color}
                strokeDasharray={item.value + ' ' + (100 - item.value)}
                strokeDashoffset={-item.offset}
              />
            ))}
          </svg>
          <span>126</span>
        </div>
        <div className="alert-ratio-list">
          {data.map((item) => (
            <div className="alert-ratio-item" key={item.label}>
              <span style={{ backgroundColor: item.color }} aria-hidden="true" />
              <p>{item.label}</p>
              <strong>{item.value}%</strong>
            </div>
          ))}
        </div>
      </div>
    </StatsSection>
  )
}

function DeviceAlertTable({ data }) {
  return (
    <StatsSection title="가전별 알림 통계">
      <div className="device-alert-table" role="table" aria-label="가전별 알림 통계 표">
        <div className="device-alert-row header" role="row">
          <span role="columnheader">가전</span>
          <span role="columnheader">총</span>
          <span role="columnheader">위험</span>
          <span role="columnheader">주의</span>
          <span role="columnheader">일반</span>
        </div>
        {data.map((item) => (
          <div className="device-alert-row" role="row" key={item.device}>
            <span className="device-alert-name" role="cell">
              <span aria-hidden="true">
                <StatsIcon name={item.icon} />
              </span>
              {item.device}
            </span>
            <strong role="cell">{item.total}</strong>
            <strong className="danger" role="cell">
              {item.danger}
            </strong>
            <strong className="caution" role="cell">
              {item.caution}
            </strong>
            <span role="cell">{item.normal}</span>
          </div>
        ))}
      </div>
    </StatsSection>
  )
}

function AiInsightCard({ insight }) {
  return (
    <section className="ai-insight-card" aria-labelledby="ai-insight-title">
      <span className="ai-insight-icon" aria-hidden="true">
        <StatsIcon name="spark" />
      </span>
      <div>
        <div className="ai-insight-heading">
          <strong id="ai-insight-title">AI 인사이트</strong>
          <span>분석 기반 제안</span>
        </div>
        <p>{insight}</p>
      </div>
    </section>
  )
}

function StatsSection({ title, children }) {
  const titleId = 'stats-' + title.replaceAll(' ', '-')

  return (
    <section className="stats-report-card" aria-labelledby={titleId}>
      <div className="stats-report-header">
        <h2 id={titleId}>{title}</h2>
        <span aria-hidden="true">i</span>
      </div>
      {children}
    </section>
  )
}

function StatsIcon({ name }) {
  const icons = {
    air: (
      <>
        <circle cx="7" cy="7" r="1.2" />
        <circle cx="14" cy="5" r="1.2" />
        <circle cx="17" cy="12" r="1.2" />
        <circle cx="9" cy="15" r="1.2" />
        <circle cx="15" cy="18" r="1.2" />
      </>
    ),
    bars: (
      <>
        <path d="M5 19V10" />
        <path d="M12 19V5" />
        <path d="M19 19v-7" />
      </>
    ),
    bell: (
      <>
        <path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7v5l4 3" />
      </>
    ),
    door: (
      <>
        <path d="M7 4h10v16H7z" />
        <path d="M14 12h1" />
      </>
    ),
    fridge: (
      <>
        <path d="M7 3h10v18H7z" />
        <path d="M7 10h10" />
        <path d="M10 6v2" />
        <path d="M10 13v3" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </>
    ),
    spark: (
      <>
        <path d="M12 3c1 4 3 6 7 7-4 1-6 3-7 7-1-4-3-6-7-7 4-1 6-3 7-7z" />
        <path d="M5 15c.5 2 1.5 3 3.5 3.5" />
        <path d="M18 4c.4 1.8 1.4 2.8 3 3.2" />
      </>
    ),
    tv: (
      <>
        <path d="M5 7h14v9H5z" />
        <path d="M9 20h6" />
        <path d="M12 16v4" />
      </>
    ),
    washer: (
      <>
        <path d="M6 4h12v16H6z" />
        <path d="M6 8h12" />
        <circle cx="12" cy="14" r="4" />
        <path d="M9 6h.01" />
        <path d="M12 6h.01" />
      </>
    ),
  }

  return (
    <svg viewBox="0 0 24 24" focusable="false">
      {icons[name] || icons.bars}
    </svg>
  )
}

function AlertDetail({ alert, feedbackMessage, onBack, onConfirm, onReplay, warningRecommendation }) {
  const guide = createAlertGuide(alert)

  return (
    <section className="content-card alert-detail-panel" aria-labelledby="alert-detail-title">
      <div className="alert-detail-hero device-add-hero">
        <button
          className="text-button back-button alert-detail-back"
          type="button"
          aria-label="목록으로 돌아가기"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
        <strong className="card-title">알림 상세</strong>
      </div>

      <div className="alert-detail-heading">
        <div>
          <span className={`severity severity-${alert.severity.toLowerCase()}`}>
            {severityLabels[alert.severity] || alert.severity}
          </span>
          <strong className="card-title" id="alert-detail-title">
            {alert.title}
          </strong>
        </div>
      </div>

      <p className="alert-detail-summary">{alert.message}</p>

      <div className="alert-guide-box" aria-label="알림 안내">
        <p>{guide}</p>
      </div>

      <dl className="alert-detail-grid">
        <div>
          <dt>알림 유형</dt>
          <dd>{typeLabels[alert.type] || alert.type}</dd>
        </div>
        <div>
          <dt>발생 위치</dt>
          <dd>{alert.locationName}</dd>
        </div>
        <div>
          <dt>발생 기기</dt>
          <dd>{alert.device?.name || alert.deviceName}</dd>
        </div>
        <div>
          <dt>발생 시간</dt>
          <dd>{formatAlertTime(alert.occurredAt)}</dd>
        </div>
      </dl>

      {alert.recommendedAction ? (
        <div className="alert-followup-box">
          <p className="card-label">추천 행동</p>
          <p>{alert.recommendedAction}</p>
        </div>
      ) : null}

      {warningRecommendation ? <WarningRecommendationCard recommendation={warningRecommendation} /> : null}

      <div className={alert.status === 'CONFIRMED' ? 'action-row single-action' : 'action-row'}>
        <button className="secondary-button compact-button" type="button" onClick={onReplay}>
          다시 듣기
        </button>
        {alert.status !== 'CONFIRMED' ? (
          <button className="primary-button compact-button" type="button" onClick={onConfirm}>
            확인 완료
          </button>
        ) : null}
      </div>

      {feedbackMessage ? (
        <p className="status-message" role="status">
          {feedbackMessage}
        </p>
      ) : null}
    </section>
  )
}

function WarningRecommendationCard({ recommendation }) {
  const channelNames = recommendation.recommendedChannels.map(
    (channel) => channelLabels[channel] || channel,
  )
  const deliverySummary = channelNames.join(' · ')
  const guidanceSummary = [
    vibrationLabels[recommendation.vibrationPattern] || recommendation.vibrationPattern,
    screenModeLabels[recommendation.screenMode] || recommendation.screenMode,
    recommendation.voiceEnabled ? '음성 안내 사용' : '음성 안내 없음',
  ].join(' · ')

  return (
    <section className="warning-recommendation-card" aria-label="전달 방식">
      <div className="warning-recommendation-header">
        <div>
          <p className="card-label">전달 방식</p>
          <strong className="card-title">이 알림은 이렇게 전달돼요.</strong>
        </div>
      </div>

      <dl className="warning-summary-grid">
        <div>
          <dt>전달 수단</dt>
          <dd>{deliverySummary}</dd>
        </div>
        <div>
          <dt>보조 안내</dt>
          <dd>{guidanceSummary}</dd>
        </div>
      </dl>
    </section>
  )
}

function filterAlert(alert, activeFilter) {
  if (activeFilter === 'UNREAD') {
    return alert.status === 'UNREAD'
  }

  if (activeFilter === 'DANGER') {
    return isUrgentAlert(alert)
  }

  if (activeFilter === 'EMERGENCY') {
    return alert.type === 'EMERGENCY' || alert.severity === 'CRITICAL'
  }

  if (activeFilter === 'LIFE') {
    return alert.type === 'LIFE'
  }

  return true
}

function isUrgentAlert(alert) {
  return (
    alert.type === 'DANGER' ||
    alert.type === 'EMERGENCY' ||
    alert.severity === 'HIGH' ||
    alert.severity === 'CRITICAL'
  )
}

function shouldShowDeliveryRecommendation(alert) {
  return isUrgentAlert(alert)
}

function formatAlertTime(isoString) {
  const date = new Date(isoString)

  if (Number.isNaN(date.getTime())) {
    return isoString
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function createAlertGuide(alert) {
  return [alert.voiceGuide || alert.message, alert.recommendedAction]
    .filter(Boolean)
    .filter((message, index, messages) => messages.indexOf(message) === index)
    .join(' ')
}

function speakAlert(text) {
  if (
    typeof window === 'undefined' ||
    !window.speechSynthesis ||
    typeof window.SpeechSynthesisUtterance !== 'function'
  ) {
    return false
  }

  const synthesis = window.speechSynthesis
  const utterance = new window.SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.volume = 1
  utterance.rate = 1.04
  utterance.pitch = 1

  const voices = synthesis.getVoices()
  const koreanVoice = voices.find((voice) => voice.lang?.toLowerCase() === 'ko-kr') ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith('ko'))
  if (koreanVoice) {
    utterance.voice = koreanVoice
  }

  synthesis.cancel()
  synthesis.resume()
  synthesis.speak(utterance)
  return true
}
