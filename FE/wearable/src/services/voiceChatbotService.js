const DEFAULT_SOUND_CHATBOT_URL = 'http://127.0.0.1:8002/api/ai/voice-chat'
const PROXIED_SOUND_CHATBOT_URL = '/api/ai/voice-chat'

export async function requestVoiceChat(payload) {
  const response = await fetch(soundChatbotUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.message || '음성 챗봇 서버 요청에 실패했습니다.')
  }

  return data
}

export function soundChatbotUrl() {
  const configuredUrl = import.meta.env.VITE_SOUND_CHATBOT_URL?.trim()
  if (configuredUrl) {
    return configuredUrl
  }
  return import.meta.env.MODE === 'test' ? DEFAULT_SOUND_CHATBOT_URL : PROXIED_SOUND_CHATBOT_URL
}
