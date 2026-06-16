import { wearableApiRequest } from './wearableApiClient'

export async function getWearableLivingSignalState() {
  const response = await wearableApiRequest('/api/living-signals')

  return {
    threshold: response?.threshold ?? 0.8,
    sounds: response?.sounds || [],
    workflow: response?.workflow || [],
  }
}

export async function createLivingSignalDetectionAlert(payload) {
  return wearableApiRequest('/api/living-signals/detections', {
    method: 'POST',
    body: payload,
  })
}
