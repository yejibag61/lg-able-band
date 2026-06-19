const DEFAULT_VOICE_CHATBOT_URL = '/api/ai/voice-chat'
const RETRY_DELAYS_MS = [600, 1200]

export async function requestVoiceChat(payload) {
  const url = soundChatbotUrl()
  const body = JSON.stringify(payload)
  let lastError = null

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body,
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.message || 'Voice chatbot server request failed.')
      }

      return data
    } catch (error) {
      lastError = error
      if (attempt >= RETRY_DELAYS_MS.length) {
        break
      }
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }

  throw lastError || new Error('Voice chatbot server request failed.')
}

export function soundChatbotUrl() {
  return import.meta.env.VITE_SOUND_CHATBOT_URL?.trim() || DEFAULT_VOICE_CHATBOT_URL
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
