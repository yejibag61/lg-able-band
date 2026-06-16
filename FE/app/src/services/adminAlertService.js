import { apiRequest } from './apiClient'

export async function getAdminAlertTemplates() {
  const response = await apiRequest('/api/admin/alert-templates')
  return response?.items || []
}

export async function broadcastAdminAlert(templateId, audience = 'ALL') {
  return apiRequest('/api/admin/alerts/broadcast', {
    method: 'POST',
    body: {
      templateId,
      audience,
    },
  })
}
