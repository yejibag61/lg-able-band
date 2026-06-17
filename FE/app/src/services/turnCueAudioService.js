let audioContext = null
let dingAudioElement = null
let greetingAudioElement = null
let dingAudioBuffer = null
let dingAudioBufferPromise = null
let greetingAudioBuffer = null
let greetingAudioBufferPromise = null
let activeAudioSources = new Set()

const DING_DURATION_SECONDS = 0.82
const DING_FREQUENCY_HZ = 1046.5
const TURN_CUE_AUDIO_SRC = '/turn-cue-ding.wav'
const GREETING_AUDIO_SRC = '/chatbot-greeting.wav'

async function getAudioContext() {
  if (typeof window === 'undefined') {
    return null
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) {
    return null
  }

  try {
    audioContext = audioContext || new AudioContext()
    if (audioContext.state === 'suspended') {
      await audioContext.resume?.()
    }

    if (audioContext.state === 'running') return audioContext

    return null
  } catch {
    return null
  }
}

export async function unlockTurnCueAudio() {
  const context = await getAudioContext()
  const audioElement = getDingAudioElement()
  const greetingAudioElement = getGreetingAudioElement()

  try {
    if (context) {
      const now = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(440, now)
      gain.gain.setValueAtTime(0.0001, now)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.04)
    }

    if (context) {
      loadDingAudioBuffer(context)
      loadGreetingAudioBuffer(context)
    }

    audioElement?.load?.()
    greetingAudioElement?.load?.()

    return Boolean(context || audioElement || greetingAudioElement)
  } catch {
    return Boolean(context)
  }
}

export async function playGreetingAudio() {
  const context = await getAudioContext()
  const buffer = context ? await loadGreetingAudioBuffer(context) : null
  if (context && buffer) {
    await playDecodedBufferAndWait(context, buffer, 1)
    return true
  }

  return playGreetingAudioElement()
}

export async function playTurnCueTone(kind) {
  if (kind === 'user') {
    const context = await getAudioContext()
    const buffer = context ? await loadDingAudioBuffer(context) : null
    if (context && buffer) {
      await playDecodedDingBuffer(context, buffer, 1)
      navigator.vibrate?.(80)
      return true
    }

    const playedAudioElement = await playDingAudioElement()
    if (playedAudioElement) {
      navigator.vibrate?.(80)
      return true
    }
  }

  const context = await getAudioContext()
  if (!context) {
    return false
  }

  try {
    const now = context.currentTime
    const isUserTurn = kind === 'user'
    const duration = isUserTurn ? DING_DURATION_SECONDS : 0.12
    const tones = isUserTurn
      ? [
          { frequency: DING_FREQUENCY_HZ, start: 0, duration: 0.72, volume: 0.9 },
          { frequency: DING_FREQUENCY_HZ * 1.5, start: 0.015, duration: 0.18, volume: 0.22 },
        ]
      : [{ frequency: 520, start: 0, duration: 0.1, volume: 0.1 }]

    tones.forEach((tone) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const toneStart = now + tone.start
      const toneEnd = toneStart + tone.duration

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, toneStart)
      gain.gain.setValueAtTime(0.0001, toneStart)
      gain.gain.exponentialRampToValueAtTime(tone.volume, toneStart + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd)
      oscillator.connect(gain)
      gain.connect(context.destination)
      trackAudioSource(oscillator)
      oscillator.start(toneStart)
      oscillator.stop(toneEnd + 0.02)
    })

    return new Promise((resolve) => {
      window.setTimeout(() => resolve(true), duration * 1000 + 40)
    })
  } catch {
    return false
  }
}

export function stopTurnCueAudio() {
  activeAudioSources.forEach((source) => {
    try {
      source.stop?.(0)
    } catch {
      // Source may have already ended.
    }
  })
  activeAudioSources.clear()

  ;[dingAudioElement, greetingAudioElement].forEach((audioElement) => {
    if (!audioElement) return

    try {
      audioElement.pause()
      audioElement.currentTime = 0
    } catch {
      // Some mobile browsers throw while swapping audio sessions.
    }
  })
}

async function loadDingAudioBuffer(context) {
  if (dingAudioBuffer) {
    return dingAudioBuffer
  }

  if (!dingAudioBufferPromise) {
    dingAudioBufferPromise = fetch(TURN_CUE_AUDIO_SRC)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load turn cue audio')
        }
        return response.arrayBuffer()
      })
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
      .then((buffer) => {
        dingAudioBuffer = buffer
        return buffer
      })
      .catch(() => {
        dingAudioBufferPromise = null
        return null
      })
  }

  return dingAudioBufferPromise
}

function playDecodedDingBuffer(context, buffer, volume) {
  return playDecodedBufferAndWait(context, buffer, volume)
}

function playDecodedBuffer(context, buffer, volume) {
  const source = context.createBufferSource()
  const gain = context.createGain()
  const now = context.currentTime

  source.buffer = buffer
  gain.gain.setValueAtTime(Math.max(0.0001, volume), now)
  source.connect(gain)
  gain.connect(context.destination)
  trackAudioSource(source)
  source.start(now)
  return source
}

function playDecodedBufferAndWait(context, buffer, volume) {
  const source = playDecodedBuffer(context, buffer, volume)

  return new Promise((resolve) => {
    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      resolve(true)
    }

    source.onended = () => {
      activeAudioSources.delete(source)
      finish()
    }
    window.setTimeout(finish, buffer.duration * 1000 + 180)
  })
}

function trackAudioSource(source) {
  activeAudioSources.add(source)
  const previousOnEnded = source.onended
  source.onended = (event) => {
    activeAudioSources.delete(source)
    previousOnEnded?.(event)
  }
}

async function loadGreetingAudioBuffer(context) {
  if (greetingAudioBuffer) {
    return greetingAudioBuffer
  }

  if (!greetingAudioBufferPromise) {
    greetingAudioBufferPromise = fetch(GREETING_AUDIO_SRC)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load greeting audio')
        }
        return response.arrayBuffer()
      })
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer.slice(0)))
      .then((buffer) => {
        greetingAudioBuffer = buffer
        return buffer
      })
      .catch(() => {
        greetingAudioBufferPromise = null
        return null
      })
  }

  return greetingAudioBufferPromise
}

async function playDingAudioElement() {
  const audioElement = getDingAudioElement()
  if (!audioElement) {
    return false
  }

  try {
    audioElement.pause()
    audioElement.currentTime = 0
    audioElement.volume = 1
    await audioElement.play()
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(true), DING_DURATION_SECONDS * 1000 + 80)
    })
  } catch {
    return false
  }
}

async function playGreetingAudioElement() {
  const audioElement = getGreetingAudioElement()
  if (!audioElement) {
    return false
  }

  try {
    audioElement.pause()
    audioElement.currentTime = 0
    audioElement.volume = 1
    await audioElement.play()
    return new Promise((resolve) => {
      const finish = () => resolve(true)
      audioElement.onended = finish
      window.setTimeout(finish, 2500)
    })
  } catch {
    return false
  }
}

function getDingAudioElement() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null
  }

  if (!dingAudioElement) {
    dingAudioElement = new Audio(TURN_CUE_AUDIO_SRC)
    dingAudioElement.preload = 'auto'
    dingAudioElement.playsInline = true
  }

  return dingAudioElement
}

function getGreetingAudioElement() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null
  }

  if (!greetingAudioElement) {
    greetingAudioElement = new Audio(GREETING_AUDIO_SRC)
    greetingAudioElement.preload = 'auto'
    greetingAudioElement.playsInline = true
  }

  return greetingAudioElement
}
