const EMBEDDING_BUCKETS = 8
const SIGNAL_FLOOR = 0.08

function createAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext

  if (!AudioContextClass) {
    throw new Error('이 브라우저에서는 오디오 분석을 지원하지 않습니다.')
  }

  return new AudioContextClass()
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

function averageEmbeddings(embeddings) {
  if (!embeddings.length) {
    return []
  }

  const length = embeddings[0].length
  const sums = new Array(length).fill(0)

  embeddings.forEach((embedding) => {
    for (let index = 0; index < length; index += 1) {
      sums[index] += embedding[index] || 0
    }
  })

  return sums.map((value) => value / embeddings.length)
}

function cosineSimilarity(left, right) {
  const size = Math.min(left.length, right.length)
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0

  for (let index = 0; index < size; index += 1) {
    dot += left[index] * right[index]
    leftNorm += left[index] * left[index]
    rightNorm += right[index] * right[index]
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

function buildSoundEmbeddings(sounds) {
  return sounds
    .map((sound) => ({
      soundId: sound.soundId,
      registeredSoundName: sound.registeredSoundName,
      soundType: sound.soundType,
      soundTypeLabel: sound.soundTypeLabel || sound.soundType,
      embedding: averageEmbeddings((sound.recordings || []).map((recording) => recording.embedding || [])),
    }))
    .filter((sound) => sound.embedding.length > 0)
}

export function isMicrophoneSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

export async function createWearableLivingSignalSession({ sounds, threshold, onLevel, onMatch }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const audioContext = createAudioContext()
  const source = audioContext.createMediaStreamSource(stream)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)

  const soundEmbeddings = buildSoundEmbeddings(sounds)
  const frequencyData = new Uint8Array(analyser.frequencyBinCount)
  let lastSoundId = null
  let sameSoundCount = 0
  let lastReportedAt = 0

  const intervalId = window.setInterval(() => {
    analyser.getByteFrequencyData(frequencyData)
    const frame = Array.from(frequencyData)
    const level = calculateSignalLevel(frame)
    onLevel?.(level)

    if (level < SIGNAL_FLOOR) {
      lastSoundId = null
      sameSoundCount = 0
      return
    }

    const liveEmbedding = createEmbedding(frame)
    let bestMatch = null

    soundEmbeddings.forEach((sound) => {
      const similarity = cosineSimilarity(liveEmbedding, sound.embedding)

      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { ...sound, similarity }
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
    if (bestMatch.similarity >= threshold && sameSoundCount >= 2 && now - lastReportedAt > 2500) {
      lastReportedAt = now
      onMatch?.({
        predicted: true,
        soundId: bestMatch.soundId,
        registeredSoundName: bestMatch.registeredSoundName,
        soundType: bestMatch.soundType,
        soundTypeLabel: bestMatch.soundTypeLabel,
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
