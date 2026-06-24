import { useEffect, useMemo, useState } from 'react'
import { broadcastAdminAlert, getAdminAlertTemplates } from '../services/adminAlertService'

export function AdminAlertBroadcastTab({ onBroadcastComplete }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sendingTemplateId, setSendingTemplateId] = useState('')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [targetUserEmail, setTargetUserEmail] = useState('')

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

  async function handleBroadcast(template) {
    const normalizedEmail = targetUserEmail.trim().toLowerCase()
    if (sendingTemplateId) {
      return
    }
    if (!normalizedEmail) {
      setFeedbackMessage('알림을 받을 사용자 이메일을 입력해주세요.')
      return
    }

    setSendingTemplateId(template.templateId)
    setFeedbackMessage('')

    try {
      await broadcastAdminAlert(template.templateId, normalizedEmail)
      setFeedbackMessage(`${normalizedEmail} 사용자에게 ${template.title} 알림을 전송했습니다.`)
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
        <p>알림을 받을 사용자 이메일을 입력한 뒤 원하는 알림을 선택하세요.</p>
        <label className="admin-alert-email-field">
          <span>사용자 이메일</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="user@example.com"
            value={targetUserEmail}
            onChange={(event) => {
              setTargetUserEmail(event.target.value)
              setFeedbackMessage('')
            }}
          />
        </label>
      </section>

      {loading ? <p className="empty-state" role="status">알림 발송 목록을 불러오는 중입니다.</p> : null}
      {error ? <p className="member-status-message error" role="alert">{error}</p> : null}

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
                    disabled={Boolean(sendingTemplateId)}
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

      {feedbackMessage ? <p className="status-message" role="status">{feedbackMessage}</p> : null}
    </section>
  )
}
