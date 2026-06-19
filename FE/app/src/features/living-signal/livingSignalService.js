import { apiRequest } from '../../services/apiClient'
import { cloneLivingSignalState } from './livingSignalUtils'

export async function getLivingSignalState(fallbackState) {
  const response = await apiRequest('/api/living-signals')

  return cloneLivingSignalState({
    threshold: response.threshold,
    workflow: response.workflow || fallbackState.workflow || [],
    detections: [],
    sounds: response.sounds || [],
  })
}

export async function createLivingSignalSound(sound) {
  return apiRequest('/api/living-signals/sounds', {
    method: 'POST',
    body: toSoundPayload(sound),
  })
}

export async function updateLivingSignalSound(soundId, sound) {
  return apiRequest(`/api/living-signals/sounds/${soundId}`, {
    method: 'PUT',
    body: toSoundPayload(sound),
  })
}

export async function deleteLivingSignalSound(soundId) {
  return apiRequest(`/api/living-signals/sounds/${soundId}`, {
    method: 'DELETE',
  })
}

export async function updateLivingSignalThreshold(threshold) {
  return apiRequest('/api/living-signals/threshold', {
    method: 'PUT',
    body: { threshold },
  })
}

export async function createLivingSignalDetectionAlert(payload) {
  return apiRequest('/api/living-signals/detections', {
    method: 'POST',
    body: payload,
  })
}

function toSoundPayload(sound) {
  return {
    registeredSoundName: sound.registeredSoundName,
    soundType: sound.soundType,
    notes: sound.notes || '',
    recordings: (sound.recordings || []).map((recording) => ({
      label: recording.label,
      createdAt: recording.createdAt,
      durationSec: recording.durationSec,
      audioDataUrl: recording.audioDataUrl || '',
      embedding: recording.embedding || [],
    })),
  }
}
