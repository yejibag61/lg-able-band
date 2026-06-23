import { averageEmbeddings, cosineSimilarity, getSoundTypeLabel } from './livingSignalUtils'

const EMBEDDING_BUCKETS = 8
const SIGNAL_FLOOR = 0.08
const LIVE_EMBEDDING_WINDOW = 4
const MIN_MATCH_COUNT = 3
const MIN_MATCH_MARGIN = 0.04

const PREFERRED_AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    sampleRate: { ideal: 44100 },
  },
}

function createAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext

  if (!AudioContextClass) {
    throw new Error('이 브라우저는 Web Audio API를 지원하지 않습니다.')
  }

  return new AudioContextClass()
}

async function openEnrollmentAudioStream() {
  try {
    return await navigator.mediaDevices.getUserMedia(PREFERRED_AUDIO_CONSTRAINTS)
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true })
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('녹음 파일을 읽지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
}

function calculateSignalLevel(frequencyData) {
  const sum = frequencyData.reduce((total, value) => total + value, 0)
  return sum / (frequencyData.length * 255)
}

function createEmbedding(frequencyData) {
  const bucketSize = Math.floor(frequencyData.length / EMBEDDING_BUCKETS)
  const buckets = []

  for (let bucket = 0; bucket < EMBEDDING_BUCKETS; bucket += 1) {
    const start = bucket * bucketSize
    const end = bucket === EMBEDDING_BUCKETS - 1 ? frequencyData.length : start + bucketSize
    let total = 0

    for (let index = start; index < end; index += 1) {
      total += frequencyData[index]
    }

    buckets.push(total / Math.max(1, end - start) / 255)
  }

  const magnitude = Math.sqrt(buckets.reduce((sum, value) => sum + value * value, 0))

  if (magnitude === 0) {
    return buckets
  }

  return buckets.map((value) => value / magnitude)
}

function buildSoundEmbeddings(sounds) {
  return sounds
    .map((sound) => ({
      soundId: sound.soundId,
      registeredSoundName: sound.registeredSoundName,
      soundType: sound.soundType,
      soundTypeLabel: sound.soundTypeLabel || getSoundTypeLabel(sound.soundType),
      embedding: averageEmbeddings(sound.recordings.map((recording) => recording.embedding)),
    }))
    .filter((sound) => sound.embedding.length > 0)
}

export function isMicrophoneSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

export async function createEnrollmentSession({ onLevel }) {
  const stream = await openEnrollmentAudioStream()
  const audioContext = createAudioContext()
  const source = audioContext.createMediaStreamSource(stream)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.72
  source.connect(analyser)

  const recorder = new MediaRecorder(stream)
  const chunks = []
  const frames = []
  const frequencyData = new Uint8Array(analyser.frequencyBinCount)
  const startedAt = Date.now()

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data)
    }
  })

  const intervalId = window.setInterval(() => {
    analyser.getByteFrequencyData(frequencyData)
    onLevel(calculateSignalLevel(Array.from(frequencyData)))
    frames.push(createEmbedding(Array.from(frequencyData)))
  }, 160)

  recorder.start()

  return {
    async stop() {
      const stopped = new Promise((resolve, reject) => {
        recorder.addEventListener('stop', resolve, { once: true })
        recorder.addEventListener('error', () => reject(new Error('녹음이 중단되었습니다.')), {
          once: true,
        })
      })

      recorder.stop()
      await stopped
      window.clearInterval(intervalId)
      source.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      await audioContext.close()

      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      const audioDataUrl = await blobToDataUrl(blob)

      return {
        label: `recording-${new Date().toISOString().slice(11, 19).replaceAll(':', '-')}`,
        createdAt: new Date().toISOString(),
        durationSec: Math.max(0.5, (Date.now() - startedAt) / 1000),
        audioDataUrl,
        embedding: averageEmbeddings(frames),
      }
    },
  }
}

export async function createAmbientDetectionSession({ sounds, threshold, onLevel, onMatch }) {
  const stream = await openEnrollmentAudioStream()
  const audioContext = createAudioContext()
  const source = audioContext.createMediaStreamSource(stream)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.72
  source.connect(analyser)

  const soundEmbeddings = buildSoundEmbeddings(sounds)
  const frequencyData = new Uint8Array(analyser.frequencyBinCount)
  const liveFrames = []
  let lastSoundId = null
  let sameSoundCount = 0
  let lastReportedAt = 0
  let lastBestSimilarity = 0

  const intervalId = window.setInterval(() => {
    analyser.getByteFrequencyData(frequencyData)
    const frame = Array.from(frequencyData)
    const level = calculateSignalLevel(frame)
    onLevel(level)

    if (level < SIGNAL_FLOOR) {
      liveFrames.length = 0
      lastSoundId = null
      sameSoundCount = 0
      return
    }

    liveFrames.push(createEmbedding(frame))
    if (liveFrames.length > LIVE_EMBEDDING_WINDOW) {
      liveFrames.shift()
    }

    const liveEmbedding = averageEmbeddings(liveFrames)
    let bestMatch = null
    let secondBestSimilarity = 0

    soundEmbeddings.forEach((sound) => {
      const similarity = cosineSimilarity(liveEmbedding, sound.embedding)

      if (!bestMatch || similarity > bestMatch.similarity) {
        secondBestSimilarity = bestMatch?.similarity || secondBestSimilarity
        bestMatch = { ...sound, similarity }
        return
      }

      if (similarity > secondBestSimilarity) {
        secondBestSimilarity = similarity
      }
    })

    if (!bestMatch) {
      return
    }

    if (bestMatch.soundId === lastSoundId) {
      sameSoundCount += 1
    } else {
      lastSoundId = bestMatch.soundId
      sameSoundCount = 1
    }

    const now = Date.now()

    const matchMargin = bestMatch.similarity - secondBestSimilarity
    const stableMatch = bestMatch.similarity >= threshold && matchMargin >= MIN_MATCH_MARGIN

    if (stableMatch && sameSoundCount >= MIN_MATCH_COUNT && now - lastReportedAt > 4000) {
      lastReportedAt = now
      lastBestSimilarity = bestMatch.similarity
      onMatch({
        predicted: true,
        registeredSoundName: bestMatch.registeredSoundName,
        soundType: bestMatch.soundType,
        soundTypeLabel: bestMatch.soundTypeLabel,
        similarity: bestMatch.similarity,
        detectedAt: new Date().toISOString(),
      })
      return
    }

    if (
      !stableMatch &&
      now - lastReportedAt > 5000 &&
      Math.abs(bestMatch.similarity - lastBestSimilarity) > 0.03
    ) {
      lastReportedAt = now
      lastBestSimilarity = bestMatch.similarity
      onMatch({
        predicted: false,
        similarity: bestMatch.similarity,
        detectedAt: new Date().toISOString(),
      })
    }
  }, 500)

  return {
    async stop() {
      window.clearInterval(intervalId)
      source.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      await audioContext.close()
    },
  }
}
