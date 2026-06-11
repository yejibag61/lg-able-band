import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LivingSignalSettingsScreen } from './LivingSignalSettingsScreen'
import { livingSignalMock } from './livingSignalMock'

function createFakeAudioHandlers() {
  return {
    isMicrophoneSupported: () => true,
    async createEnrollmentSession() {
      return {
        async stop() {
          return {
            label: 'test-recording',
            durationSec: 2.3,
            audioDataUrl: 'data:audio/webm;base64,test',
            embedding: [0.32, 0.28, 0.41, 0.53, 0.44, 0.29, 0.14, 0.09],
            createdAt: '2026-06-10T16:00:00+09:00',
          }
        },
      }
    },
    async createAmbientDetectionSession({ onLevel, onMatch }) {
      onLevel(0.42)
      onMatch({
        predicted: true,
        registeredSoundName: '우리 아파트 방송음',
        soundType: 'apartment_announcement',
        soundTypeLabel: '아파트 방송',
        similarity: 0.93,
        detectedAt: '2026-06-10T16:01:00+09:00',
      })

      return {
        async stop() {},
      }
    },
  }
}

function createFakeDataHandlers() {
  let state = {
    threshold: livingSignalMock.threshold,
    workflow: livingSignalMock.workflow,
    detections: livingSignalMock.detections,
    sounds: livingSignalMock.sounds.map((sound) => ({
      ...sound,
      recordings: sound.recordings.map((recording) => ({
        ...recording,
        embedding: [...recording.embedding],
      })),
    })),
  }
  let nextSoundId = 100
  let nextRecordingId = 1000

  return {
    async loadState() {
      return structuredClone(state)
    },
    async createSound(sound) {
      const createdSound = {
        soundId: nextSoundId,
        registeredSoundName: sound.registeredSoundName,
        soundType: sound.soundType,
        soundTypeLabel:
          sound.soundType === 'appliance_done' ? '가전 완료음' : sound.soundType,
        notes: sound.notes,
        updatedAt: '2026-06-10T16:00:00+09:00',
        recordings: sound.recordings.map((recording) => ({
          recordingId: nextRecordingId++,
          ...recording,
        })),
      }
      nextSoundId += 1
      state = {
        ...state,
        sounds: [createdSound, ...state.sounds],
      }
      return createdSound
    },
    async updateSound(soundId, sound) {
      const updatedSound = {
        soundId,
        registeredSoundName: sound.registeredSoundName,
        soundType: sound.soundType,
        soundTypeLabel:
          sound.soundType === 'apartment_announcement'
            ? '아파트 방송'
            : sound.soundType === 'doorbell'
              ? '초인종'
              : sound.soundType,
        notes: sound.notes,
        updatedAt: '2026-06-10T16:00:00+09:00',
        recordings: sound.recordings.map((recording) => ({
          recordingId: nextRecordingId++,
          ...recording,
        })),
      }
      state = {
        ...state,
        sounds: state.sounds.map((item) => (item.soundId === soundId ? updatedSound : item)),
      }
      return updatedSound
    },
    async deleteSound(soundId) {
      state = {
        ...state,
        sounds: state.sounds.filter((item) => item.soundId !== soundId),
      }
    },
    async updateThreshold(threshold) {
      state = {
        ...state,
        threshold,
      }
      return { threshold }
    },
  }
}

describe('LivingSignalSettingsScreen', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the add page and creates a new sound after recording', async () => {
    const user = userEvent.setup()

    render(
      <LivingSignalSettingsScreen
        livingSignals={livingSignalMock}
        onBack={() => {}}
        audioHandlers={createFakeAudioHandlers()}
        dataHandlers={createFakeDataHandlers()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '알림음 추가' }))

    expect(screen.getByRole('heading', { name: '알림음 추가' })).toBeTruthy()
    expect(screen.getByLabelText('이 소리가 무엇인가요?')).toBeTruthy()

    await user.type(screen.getByLabelText('이 소리가 무엇인가요?'), '전자레인지 완료음')
    await user.selectOptions(screen.getByLabelText('알림 유형'), 'appliance_done')
    await user.click(screen.getByRole('button', { name: '녹음 시작' }))
    await user.click(screen.getByRole('button', { name: '녹음 완료' }))
    await user.click(screen.getByRole('button', { name: '추가 완료' }))

    expect(screen.getByText('전자레인지 완료음')).toBeTruthy()
    expect(screen.getByText('test-recording')).toBeTruthy()
  })

  it('replaces existing samples on the edit page when replace mode is selected', async () => {
    const user = userEvent.setup()

    render(
      <LivingSignalSettingsScreen
        livingSignals={livingSignalMock}
        onBack={() => {}}
        audioHandlers={createFakeAudioHandlers()}
        dataHandlers={createFakeDataHandlers()}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: '수정' })[0])

    expect(screen.getByRole('heading', { name: '알림음 수정' })).toBeTruthy()

    const nameInput = screen.getByLabelText('이 소리가 무엇인가요?')
    await user.clear(nameInput)
    await user.type(nameInput, '수정된 방송음')
    await user.click(screen.getByRole('button', { name: '기존 샘플 교체' }))
    await user.click(screen.getByRole('button', { name: '녹음 시작' }))
    await user.click(screen.getByRole('button', { name: '녹음 완료' }))
    await user.click(screen.getByRole('button', { name: '수정 완료' }))

    expect(screen.getByText('수정된 방송음')).toBeTruthy()
    expect(screen.getByText('test-recording')).toBeTruthy()
    expect(screen.queryByText('apt-chime-1')).toBeNull()
  })

  it('starts ambient listening and shows detection result', async () => {
    const user = userEvent.setup()

    render(
      <LivingSignalSettingsScreen
        livingSignals={livingSignalMock}
        onBack={() => {}}
        audioHandlers={createFakeAudioHandlers()}
        dataHandlers={createFakeDataHandlers()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '감지 시작' }))

    await waitFor(() => {
      expect(screen.getByText('우리 아파트 방송음 감지')).toBeTruthy()
    })
  })
})
