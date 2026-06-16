import { useEffect, useMemo, useState } from 'react'
import { broadcastAdminAlert, getAdminAlertTemplates } from '../services/adminAlertService'

const audienceOptions = [
  { id: 'ALL', label: '전체 사용자' },
  { id: 'VISUAL', label: '시각장애 사용자' },
  { id: 'HEARING', label: '청각장애 사용자' },
]

export function AdminAlertBroadcastTab({ onBroadcastComplete }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sendingTemplateId, setSendingTemplateId] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [selectedAudience, setSelectedAudience] = useState('ALL')

  useEffect(() => {
    let isMounted = true

    async function loadTemplates() {
      setLoading(true)
      setError('')

      try {
        const items = await getAdminAlertTemplates()
        if (isMounted) {
          setTemplates(items)
        }
      } catch (nextError) {
        if (isMounted) {
          setError(nextError.message || '알림 발송 템플릿을 불러오지 못했습니다.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadTemplates()

    return () => {
      isMounted = false
    }
  }, [])

  const groupedTemplates = useMemo(() => {
    return templates.reduce((groups, template) => {
      const currentGroup = groups[template.categoryName] || []
      return {
        ...groups,
        [template.categoryName]: [...currentGroup, template],
      }
    }, {})
  }, [templates])

  const selectedAudienceLabel =
    audienceOptions.find((option) => option.id === selectedAudience)?.label || '전체 사용자'

  async function handleBroadcast(template) {
    if (sendingTemplateId) {
      return
    }

    setSendingTemplateId(template.templateId)
    setFeedbackMessage('')

    try {
      const result = await broadcastAdminAlert(template.templateId, selectedAudience)
      setFeedbackMessage(
        `${selectedAudienceLabel} ${result.dispatchedUserCount}명에게 ${template.title} 알림을 전송했습니다.`,
      )
      await onBroadcastComplete?.()
    } catch (nextError) {
      setFeedbackMessage(nextError.message || '알림 발송에 실패했습니다.')
    } finally {
      setSendingTemplateId('')
    }
  }

  return (
    <section className="tab-stack admin-alert-tab" aria-labelledby="admin-alert-title">
      <section className="content-card admin-alert-hero-card">
        <p className="card-label">관리자 전용</p>
        <strong className="card-title" id="admin-alert-title">알림 발송</strong>
        <p>시연할 때 필요한 알림을 버튼 한 번으로 원하는 사용자 그룹에게 보낼 수 있습니다.</p>
        <div className="admin-alert-audience-row" aria-label="발송 대상 선택">
          {audienceOptions.map((option) => (
            <button
              key={option.id}
              className={selectedAudience === option.id ? 'filter-chip active' : 'filter-chip'}
              type="button"
              aria-pressed={selectedAudience === option.id}
              onClick={() => setSelectedAudience(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <p className="empty-state" role="status">
          알림 발송 항목을 불러오는 중입니다.
        </p>
      ) : null}

      {error ? (
        <p className="member-status-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading
        ? Object.entries(groupedTemplates).map(([categoryName, items]) => (
            <section className="content-card admin-alert-group-card" key={categoryName}>
              <div className="section-title-row">
                <strong className="card-title">{categoryName}</strong>
                <span>{items.length}개</span>
              </div>
              <div className="admin-alert-button-list">
                {items.map((template) => (
                  <button
                    className="admin-alert-button"
                    type="button"
                    key={template.templateId}
                    onClick={() => handleBroadcast(template)}
                    disabled={sendingTemplateId === template.templateId}
                  >
                    <div className="admin-alert-button-copy">
                      <strong>{template.featureName}</strong>
                      <p>{template.title}</p>
                      <small>{template.message}</small>
                    </div>
                    <span className="admin-alert-button-action">
                      {sendingTemplateId === template.templateId ? '전송 중...' : '보내기'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))
        : null}

      {feedbackMessage ? (
        <p className="status-message" role="status">
          {feedbackMessage}
        </p>
      ) : null}
    </section>
  )
}
