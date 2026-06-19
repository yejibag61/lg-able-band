import { useEffect, useMemo, useRef, useState } from 'react'
import { createEnrollmentSession, isMicrophoneSupported } from './livingSignalAudio'
import {
  SOUND_TYPE_OPTIONS,
  buildInitialEditor,
  cloneLivingSignalState,
  createRecordingEntry,
  getSoundTypeLabel,
} from './livingSignalUtils'
import {
  createLivingSignalSound,
  deleteLivingSignalSound,
  getLivingSignalState,
  updateLivingSignalSound,
  updateLivingSignalThreshold,
} from './livingSignalService'

function scrollAppContentToTop() {
  const appContent = document.querySelector('.app-content')
  if (appContent instanceof HTMLElement && typeof appContent.scrollTo === 'function') {
    appContent.scrollTo({ top: 0, left: 0 })
  }

  window.scrollTo({ top: 0, left: 0 })
}

const defaultAudioHandlers = {
  createEnrollmentSession,
  isMicrophoneSupported,
}

const defaultDataHandlers = {
  loadState: getLivingSignalState,
  createSound: createLivingSignalSound,
  updateSound: updateLivingSignalSound,
  deleteSound: deleteLivingSignalSound,
  updateThreshold: updateLivingSignalThreshold,
}

function formatTime(dateTime) {
  return new Date(dateTime).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSeconds(value) {
  return `${value.toFixed(1)}초`
}

function createInitialState(livingSignals) {
  return cloneLivingSignalState(livingSignals)
}

export function LivingSignalSettingsScreen({
  livingSignals,
  onBack,
  showBackButton = true,
  audioHandlers = defaultAudioHandlers,
  dataHandlers = defaultDataHandlers,
}) {
  const initialState = useMemo(() => createInitialState(livingSignals), [livingSignals])
  const [sounds, setSounds] = useState([])
  const [threshold, setThreshold] = useState(initialState.threshold)
  const [editor, setEditor] = useState(buildInitialEditor())
  const [screenMode, setScreenMode] = useState('list')
  const [recordingState, setRecordingState] = useState({
    status: 'idle',
    error: '',
    level: 0,
    sample: null,
  })
  const [sampleSaveMode, setSampleSaveMode] = useState('append')
  const [syncError, setSyncError] = useState('')
  const [isStateReady, setIsStateReady] = useState(false)

  const enrollmentSessionRef = useRef(null)
  const isHydratingRef = useRef(true)
  const thresholdReadyRef = useRef(false)

  useEffect(() => {
    let isMounted = true

    async function loadState() {
      try {
        await hydrateFromRemoteState({ isMounted })
      } catch (error) {
        if (!isMounted) {
          return
        }

        setSyncError(error.message || '생활 신호 설정을 불러오지 못했습니다.')
        setSounds([])
        setThreshold(initialState.threshold)
      } finally {
        if (isMounted) {
          isHydratingRef.current = false
          thresholdReadyRef.current = true
          setIsStateReady(true)
        }
      }
    }

    loadState()

    return () => {
      isMounted = false
    }
  }, [dataHandlers, initialState])

  useEffect(() => {
    if (isHydratingRef.current || !thresholdReadyRef.current) {
      return undefined
    }

    const timerId = window.setTimeout(async () => {
      try {
        await dataHandlers.updateThreshold(threshold)
        setSyncError('')
      } catch (error) {
        setSyncError(error.message || '감지 기준값 저장에 실패했습니다.')
      }
    }, 300)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [dataHandlers, threshold])

  useEffect(() => {
    return () => {
      stopEnrollmentSession({ discard: true })
    }
  }, [])

  useEffect(() => {
    scrollAppContentToTop()
  }, [screenMode])

  function resetRecordingState() {
    setRecordingState({
      status: 'idle',
      error: '',
      level: 0,
      sample: null,
    })
  }

  function openCreatePage() {
    setEditor({
      isOpen: true,
      mode: 'create',
      soundId: null,
      name: '',
      soundType: SOUND_TYPE_OPTIONS[0].value,
      notes: '',
      error: '',
    })
    resetRecordingState()
    setSampleSaveMode('append')
    setScreenMode('create')
  }

  function openEditPage(sound) {
    setEditor({
      isOpen: true,
      mode: 'edit',
      soundId: sound.soundId,
      name: sound.registeredSoundName,
      soundType: sound.soundType,
      notes: sound.notes,
      error: '',
    })
    resetRecordingState()
    setSampleSaveMode('append')
    setScreenMode('edit')
  }

  function closeEditorPage() {
    stopEnrollmentSession({ discard: true })
    setEditor(buildInitialEditor())
    resetRecordingState()
    setSampleSaveMode('append')
    setScreenMode('list')
  }

  function updateEditorField(field, value) {
    setEditor((current) => ({
      ...current,
      [field]: value,
      error: '',
    }))
  }

  function normalizeSound(sound) {
    return {
      ...sound,
      soundTypeLabel: sound.soundTypeLabel || getSoundTypeLabel(sound.soundType),
      recordings: (sound.recordings || []).map((recording) => ({
        ...recording,
        embedding: [...(recording.embedding || [])],
      })),
    }
  }

  async function hydrateFromRemoteState({ isMounted = true } = {}) {
    const remoteState = await dataHandlers.loadState(initialState)

    if (!isMounted) {
      return remoteState
    }

    isHydratingRef.current = true
    setSounds(remoteState.sounds)
    setThreshold(remoteState.threshold)
    setSyncError('')
    return remoteState
  }

  async function startEnrollmentRecording() {
    if (!audioHandlers.isMicrophoneSupported()) {
      setRecordingState((current) => ({
        ...current,
        error: '이 브라우저에서는 마이크 녹음을 사용할 수 없습니다.',
      }))
      return
    }

    try {
      resetRecordingState()
      setRecordingState((current) => ({
        ...current,
        status: 'recording',
      }))

      const session = await audioHandlers.createEnrollmentSession({
        onLevel: (nextLevel) => {
          setRecordingState((current) => ({
            ...current,
            level: nextLevel,
          }))
        },
      })

      enrollmentSessionRef.current = session
    } catch (error) {
      setRecordingState({
        status: 'idle',
        error: error.message || '마이크 녹음을 시작하지 못했습니다.',
        level: 0,
        sample: null,
      })
    }
  }

  async function stopEnrollmentSession({ discard = false } = {}) {
    const session = enrollmentSessionRef.current

    if (!session) {
      return
    }

    enrollmentSessionRef.current = null

    try {
      const sample = await session.stop()

      if (discard) {
        resetRecordingState()
        return
      }

      setRecordingState({
        status: 'ready',
        error: '',
        level: 0,
        sample,
      })
    } catch (error) {
      setRecordingState({
        status: 'idle',
        error: error.message || '녹음 저장에 실패했습니다.',
        level: 0,
        sample: null,
      })
    }
  }

  async function saveSound() {
    const trimmedName = editor.name.trim()
    const trimmedNotes = editor.notes.trim()

    if (!trimmedName) {
      setEditor((current) => ({
        ...current,
        error: '소리 이름을 입력해 주세요.',
      }))
      return
    }

    if (editor.mode === 'create' && !recordingState.sample) {
      setEditor((current) => ({
        ...current,
        error: '추가하려면 먼저 마이크로 소리를 녹음해야 합니다.',
      }))
      return
    }

    const nextRecordings =
      editor.mode === 'create'
        ? [createRecordingEntry(recordingState.sample)]
        : (() => {
            const currentSound = sounds.find((sound) => sound.soundId === editor.soundId)
            if (!recordingState.sample) {
              return currentSound?.recordings || []
            }

            return sampleSaveMode === 'replace'
              ? [createRecordingEntry(recordingState.sample)]
              : [...(currentSound?.recordings || []), createRecordingEntry(recordingState.sample)]
          })()

    const payload = {
      registeredSoundName: trimmedName,
      soundType: editor.soundType,
      notes: trimmedNotes,
      recordings: nextRecordings,
    }

    try {
      if (editor.mode === 'create') {
        await dataHandlers.createSound(payload)
      } else {
        await dataHandlers.updateSound(editor.soundId, payload)
      }

      await hydrateFromRemoteState()
      setSyncError('')
      closeEditorPage()
    } catch (error) {
      setEditor((current) => ({
        ...current,
        error: error.message || '생활 신호 저장에 실패했습니다.',
      }))
    }
  }

  async function handleDeleteSound(soundId) {
    const target = sounds.find((sound) => sound.soundId === soundId)

    if (!target) {
      return
    }

    if (!window.confirm(`"${target.registeredSoundName}" 알림음을 삭제할까요?`)) {
      return
    }

    try {
      await dataHandlers.deleteSound(soundId)
      await hydrateFromRemoteState()
      setSyncError('')
    } catch (error) {
      setSyncError(error.message || '생활 신호 삭제에 실패했습니다.')
    }
  }

  if (screenMode === 'create' || screenMode === 'edit') {
    return (
      <section className="living-signal-screen" aria-labelledby="living-signal-editor-title">
        <section className="content-card living-signal-editor-panel">
        <div className="living-signal-panel-hero device-add-hero">
          <button
            className="text-button back-button alert-detail-back"
            type="button"
            aria-label="목록으로 돌아가기"
            onClick={closeEditorPage}
          >
            <span aria-hidden="true">←</span>
          </button>
          <strong className="card-title" id="living-signal-editor-title">
            {screenMode === 'create' ? '알림음 추가' : '알림음 수정'}
          </strong>
        </div>

        <label className="living-signal-field">
          <span>어떤 소리인가요?</span>
          <input
            type="text"
            value={editor.name}
            onChange={(event) => updateEditorField('name', event.target.value)}
            placeholder="예: 우리 아파트 방송음"
          />
        </label>

        <label className="living-signal-field">
          <span>알림 유형</span>
          <select
            value={editor.soundType}
            onChange={(event) => updateEditorField('soundType', event.target.value)}
          >
            {SOUND_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="living-signal-field">
          <span>설명</span>
          <textarea
            rows="3"
            value={editor.notes}
            onChange={(event) => updateEditorField('notes', event.target.value)}
            placeholder="나중에 구분하기 쉬운 메모를 적어 주세요."
          />
        </label>

        <section className="living-signal-mic-section" aria-labelledby="living-signal-mic-title">
          <div className="living-signal-section-row">
            <h3 id="living-signal-mic-title">마이크로 소리 듣기</h3>
            <span>{recordingState.status === 'recording' ? '녹음 중' : '대기 중'}</span>
          </div>

          {screenMode === 'edit' ? (
            <div className="living-signal-sample-mode">
              <span>새 녹음을 어떻게 저장할까요?</span>
              <div className="living-signal-sample-mode-buttons">
                <button
                  className={sampleSaveMode === 'append' ? 'active' : undefined}
                  type="button"
                  onClick={() => setSampleSaveMode('append')}
                >
                  샘플 추가
                </button>
                <button
                  className={sampleSaveMode === 'replace' ? 'active' : undefined}
                  type="button"
                  onClick={() => setSampleSaveMode('replace')}
                >
                  기존 샘플 교체
                </button>
              </div>
            </div>
          ) : null}

          <p className="living-signal-info">
            {recordingState.status === 'recording'
              ? '지금 들리는 알림음을 녹음하고 있습니다.'
              : recordingState.sample
                ? '녹음이 준비되었습니다. 이름과 유형을 확인한 뒤 저장해 주세요.'
                : '버튼을 눌러 실제 알림음을 들려주세요.'}
          </p>

          <div className="living-signal-level-bar">
            <div
              className="living-signal-level-fill"
              style={{ width: `${Math.round(recordingState.level * 100)}%` }}
            />
          </div>

          {recordingState.status === 'recording' ? (
            <div className="living-signal-recording-indicator" aria-live="polite">
              <span className="living-signal-recording-dot" />
              <span>녹음 중</span>
              <span className="living-signal-recording-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          ) : null}

          <div className="living-signal-record-buttons">
            {recordingState.status !== 'recording' ? (
              <button type="button" onClick={startEnrollmentRecording}>
                녹음 시작
              </button>
            ) : (
              <button type="button" className="danger" onClick={() => stopEnrollmentSession()}>
                녹음 완료
              </button>
            )}
            {recordingState.sample ? (
              <button type="button" onClick={resetRecordingState}>
                다시 녹음
              </button>
            ) : null}
          </div>

          {recordingState.sample ? (
            <div className="living-signal-sample-preview">
              <span>
                {recordingState.sample.label} · {formatSeconds(recordingState.sample.durationSec)}
              </span>
              <audio controls src={recordingState.sample.audioDataUrl} />
            </div>
          ) : null}

          {recordingState.error ? <p className="living-signal-warning">{recordingState.error}</p> : null}
        </section>

        {editor.error ? <p className="living-signal-warning">{editor.error}</p> : null}
        {syncError ? <p className="living-signal-warning">{syncError}</p> : null}

        <button className="living-signal-save" type="button" onClick={saveSound}>
          {screenMode === 'create' ? '추가 완료' : '수정 완료'}
        </button>
        </section>
      </section>
    )
  }

  if (!isStateReady) {
    return (
      <section className="living-signal-screen" aria-labelledby="living-signal-list-title">
        <section className="living-signal-list-section" aria-labelledby="living-signal-list-title">
          <div className="living-signal-section-row">
            <div className="device-add-hero">
              {showBackButton ? (
                <button
                  className="text-button back-button alert-detail-back"
                  type="button"
                  aria-label="목록으로 돌아가기"
                  onClick={onBack}
                >
                  <span aria-hidden="true">←</span>
                </button>
              ) : null}
              <strong className="card-title" id="living-signal-list-title">등록된 알림음</strong>
            </div>
          </div>
          <p className="living-signal-empty" role="status">등록된 알림음을 불러오는 중입니다.</p>
        </section>
      </section>
    )
  }

  return (
    <section className="living-signal-screen" aria-labelledby="living-signal-list-title">
      <section className="living-signal-list-section" aria-labelledby="living-signal-list-title">
        <div className="living-signal-section-row">
          <div className="device-add-hero">
            {showBackButton ? (
              <button
                className="text-button back-button alert-detail-back"
                type="button"
                aria-label="목록으로 돌아가기"
                onClick={onBack}
              >
                <span aria-hidden="true">←</span>
              </button>
            ) : null}
            <strong className="card-title" id="living-signal-list-title">등록된 알림음</strong>
          </div>
          <button className="device-inline-add-button living-signal-inline-add" type="button" onClick={openCreatePage}>
            알림음 추가
          </button>
        </div>

        {sounds.length === 0 ? (
          <p className="living-signal-empty">아직 등록된 알림음이 없습니다. 먼저 하나 추가해 주세요.</p>
        ) : (
          <div className="living-signal-list">
            {sounds.map((sound) => (
              <article className="living-signal-item" key={sound.soundId}>
                <div className="living-signal-item-header">
                  <div className="living-signal-item-copy">
                    <p className="living-signal-type">{sound.soundTypeLabel}</p>
                    <h4>{sound.registeredSoundName}</h4>
                    {sound.notes ? <p className="living-signal-note">{sound.notes}</p> : null}
                    <p className="living-signal-meta">
                      유형 {sound.soundType} · 샘플 {sound.recordings.length}개 · 수정 {formatTime(sound.updatedAt)}
                    </p>
                  </div>
                  <div className="living-signal-item-actions">
                    <button type="button" onClick={() => openEditPage(sound)}>
                      수정
                    </button>
                    <button type="button" className="danger" onClick={() => handleDeleteSound(sound.soundId)}>
                      삭제
                    </button>
                  </div>
                </div>

                <div className="living-signal-recordings">
                  <span className="living-signal-recordings-label">등록 샘플</span>
                  {sound.recordings.map((recording) => (
                    <div className="living-signal-recording-row" key={recording.recordingId}>
                      <div>
                        <strong>{recording.label}</strong>
                        <p>
                          {formatTime(recording.createdAt)} · {formatSeconds(recording.durationSec)}
                        </p>
                      </div>
                      {recording.audioDataUrl ? (
                        <audio controls src={recording.audioDataUrl} />
                      ) : (
                        <span className="living-signal-muted">오디오 미리듣기 없음</span>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="living-signal-detect-section" aria-labelledby="living-signal-detect-title">
        <div className="living-signal-section-row">
          <h3 id="living-signal-detect-title">상시 감지</h3>
          <span>앱·웨어러블</span>
        </div>

        <label className="living-signal-threshold">
          <span>감지 기준값 {threshold.toFixed(2)}</span>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.01"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
        </label>

        <p className="living-signal-info">
          앱이 켜져 있으면 등록한 생활 알림음을 계속 감지합니다. 챗봇 사용 중이거나 직접 녹음하는 동안에는 잠시 멈춥니다.
        </p>
        {syncError ? <p className="living-signal-warning">{syncError}</p> : null}
      </section>
    </section>
  )
}
