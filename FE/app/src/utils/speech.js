export function isTextToSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

export function speakText(text, options = {}) {
  const trimmedText = text.trim()

  if (!trimmedText) {
    return { ok: false, message: '읽어줄 문장을 먼저 입력해주세요.' }
  }

  if (!isTextToSpeechSupported()) {
    return { ok: false, message: '현재 브라우저에서는 음성 출력을 지원하지 않습니다.' }
  }

  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(trimmedText)
  utterance.lang = options.lang || 'ko-KR'
  utterance.volume = options.volume ?? 1
  utterance.rate = options.rate ?? 1.04
  utterance.pitch = options.pitch ?? 1
  utterance.voice = options.voice ?? findKoreanVoice()

  if (typeof options.onEnd === 'function') {
    utterance.onend = options.onEnd
  }

  if (typeof options.onError === 'function') {
    utterance.onerror = options.onError
  }

  window.speechSynthesis.speak(utterance)
  return { ok: true, message: '' }
}

export function findKoreanVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || []
  return (
    voices.find((voice) => voice.lang?.toLowerCase() === 'ko-kr') ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith('ko')) ||
    null
  )
}

export function stopSpeaking() {
  if (isTextToSpeechSupported()) {
    window.speechSynthesis.cancel()
  }
}
