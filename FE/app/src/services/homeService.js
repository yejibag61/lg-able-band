import { mockHomeSummary } from '../mocks/homeMock'
import { mockAppPreview } from '../mocks/appPreviewMock'

export async function getHomeSummary() {
  return structuredClone(mockHomeSummary)
}

export async function getAppPreview() {
  return structuredClone(mockAppPreview)
}
