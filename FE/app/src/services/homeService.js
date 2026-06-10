import { mockHomeSummary } from '../mocks/homeMock'

export async function getHomeSummary() {
  return structuredClone(mockHomeSummary)
}
