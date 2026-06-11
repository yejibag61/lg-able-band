import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createAmbientDetectionSession,
  createEnrollmentSession,
  isMicrophoneSupported,
} from './livingSignalAudio'
import {
  SOUND_TYPE_OPTIONS,
  buildInitialEditor,
  cloneLivingSignalState,
  countTotalRecordings,
  createDetectionEvent,
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
import './livingSignal.css'

const defaultAudioHandlers = {
  createAmbientDetectionSession,
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

function formatPercent(value) {
  return `${Math.round(value * 100)}%`
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
  const [sounds, setSounds] = useState(initialState.sounds)
  const [threshold, setThreshold] = useState(initialState.threshold)
  const [detections, setDetections] = useState(initialState.detections)
  const [editor, setEditor] = useState(buildInitialEditor())
  const [screenMode, setScreenMode] = useState('list')
  const [recordingState, setRecordingState] = useState({
    status: 'idle',
    error: '',
    level: 0,
    sample: null,
  })
  const [sampleSaveMode, setSampleSaveMode] = useState('append')
  const [listenerState, setListenerState] = useState({
    isListening: false,
    error: '',
    level: 0,
    lastMatch: null,
    info: '감지를 시작하면 휴대폰 마이크로 주변 소리를 듣고 등록된 알림음과 비교합니다.',
  })
  const [syncError, setSyncError] = useState('')

  const enrollmentSessionRef = useRef(null)
  const ambientSessionRef = useRef(null)
  const isHydratingRef = useRef(true)
  const thresholdReadyRef = useRef(false)
  const totalRecordings = useMemo(() => countTotalRecordings(sounds), [sounds])

  useEffect(() => {
    let isMounted = true

    async function loadState() {
      try {
        const remoteState = await dataHandlers.loadState(initialState)

        if (!isMounted) {
          return
        }

        isHydratingRef.current = true
        setSounds(remoteState.sounds)
        setThreshold(remoteState.threshold)
        setDetections(remoteState.detections || [])
        setSyncError('')
      } catch (error) {
        if (!isMounted) {
          return
        }

        setSyncError(error.message || '생활 신호 설정을 불러오지 못했습니다.')
      } finally {
        if (isMounted) {
          isHydratingRef.current = false
          thresholdReadyRef.current = true
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
        setSyncError(error.message || '감지 기준 저장에 실패했습니다.')
      }
    }, 300)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [dataHandlers, threshold])

  useEffect(() => {
    return () => {
      stopEnrollmentSession({ discard: true })
      stopAmbientListening()
    }
  }, [])

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

  async function startAmbientListening() {
    if (!audioHandlers.isMicrophoneSupported()) {
      setListenerState((current) => ({
        ...current,
        error: '이 브라우저에서는 주변 소리 감지를 사용할 수 없습니다.',
      }))
      return
    }

    if (sounds.length === 0) {
      setListenerState((current) => ({
        ...current,
        error: '먼저 알림음을 하나 이상 등록해주세요.',
      }))
      return
    }

    try {
      const session = await audioHandlers.createAmbientDetectionSession({
        sounds,
        threshold,
        onLevel: (nextLevel) => {
          setListenerState((current) => ({
            ...current,
            level: nextLevel,
          }))
        },
        onMatch: (match) => {
          setListenerState((current) => ({
            ...current,
            lastMatch: match,
            error: '',
            info: match.predicted
              ? `${match.registeredSoundName} 감지`
              : '등록되지 않은 소리로 판단했습니다.',
          }))

          setDetections((current) => [createDetectionEvent(match), ...current].slice(0, 8))
        },
      })

      ambientSessionRef.current = session
      setListenerState((current) => ({
        ...current,
        isListening: true,
        error: '',
        info: '주변 소리를 듣는 중입니다. 등록된 알림음과 유사도를 비교합니다.',
      }))
    } catch (error) {
      setListenerState((current) => ({
        ...current,
        isListening: false,
        error: error.message || '감지를 시작하지 못했습니다.',
      }))
    }
  }

  async function stopAmbientListening() {
    const session = ambientSessionRef.current

    if (!session) {
      return
    }

    ambientSessionRef.current = null
    await session.stop()

    setListenerState((current) => ({
      ...current,
      isListening: false,
      level: 0,
      info: '주변 소리 감지를 중지했습니다.',
    }))
  }

  async function saveSound() {
    const trimmedName = editor.name.trim()
    const trimmedNotes = editor.notes.trim()

    if (!trimmedName) {
      setEditor((current) => ({
        ...current,
        error: '이 소리가 무엇인지 이름을 적어주세요.',
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
        const createdSound = await dataHandlers.createSound(payload)
        setSounds((current) => [normalizeSound(createdSound), ...current])
      } else {
        const updatedSound = await dataHandlers.updateSound(editor.soundId, payload)
        setSounds((current) =>
          current.map((sound) => (sound.soundId === editor.soundId ? normalizeSound(updatedSound) : sound)),
        )
      }

      setSyncError('')
    } catch (error) {
      setEditor((current) => ({
        ...current,
        error: error.message || '생활 신호 저장에 실패했습니다.',
      }))
      return
    }

    if (listenerState.isListening) {
      stopAmbientListening()
    }

    closeEditorPage()
  }

  async function deleteSound(soundId) {
    const target = sounds.find((sound) => sound.soundId === soundId)

    if (!target) {
      return
    }

    if (!window.confirm(`"${target.registeredSoundName}" 알림음을 삭제할까요?`)) {
      return
    }

    try {
      await dataHandlers.deleteSound(soundId)
      setSounds((current) => current.filter((sound) => sound.soundId !== soundId))
      setSyncError('')
    } catch (error) {
      setSyncError(error.message || '생활 신호 삭제에 실패했습니다.')
      return
    }

    if (listenerState.isListening) {
      stopAmbientListening()
    }
  }

  if (screenMode === 'create' || screenMode === 'edit') {
    return (
      <section className="living-signal-screen" aria-labelledby="living-signal-editor-title">
        <div className="living-signal-top-row">
          <button className="living-signal-back" type="button" onClick={closeEditorPage}>
            목록으로 돌아가기
          </button>
          <span className="living-signal-page-badge">
            {screenMode === 'create' ? '추가 페이지' : '수정 페이지'}
          </span>
        </div>

        <header className="living-signal-header">
          <h2 id="living-signal-editor-title">
            {screenMode === 'create' ? '알림음 추가' : '알림음 수정'}
          </h2>
          <p>
            마이크로 소리를 먼저 듣고, 사용자가 이 소리가 무엇인지 이름과 유형을 직접
            적어 등록하는 화면입니다.
          </p>
        </header>

        <label className="living-signal-field">
          <span>이 소리가 무엇인가요?</span>
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
            placeholder="언제 들리는 소리인지 간단히 적어두세요."
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
              ? '지금 들리는 소리를 녹음하고 있습니다.'
              : recordingState.sample
                ? '녹음이 준비되었습니다. 이름과 유형을 확인한 뒤 저장하세요.'
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
    )
  }

  return (
    <section className="living-signal-screen" aria-labelledby="living-signal-title">
      <div className="living-signal-top-row">
        {showBackButton ? (
          <button className="living-signal-back" type="button" onClick={onBack}>
            메뉴로 돌아가기
          </button>
        ) : <span />}
        <button className="living-signal-add-link" type="button" onClick={openCreatePage}>
          알림음 추가
        </button>
      </div>

      <header className="living-signal-header">
        <h2 id="living-signal-title">생활 신호 설정</h2>
        <p>등록된 알림음을 관리하고, 일상생활에서 다시 들렸을 때 감지하도록 설정합니다.</p>
      </header>

      <section className="living-signal-list-section" aria-labelledby="living-signal-list-title">
        <div className="living-signal-section-row">
          <h3 id="living-signal-list-title">등록된 알림음</h3>
          <span>
            {sounds.length}개 · 샘플 {totalRecordings}개
          </span>
        </div>

        {sounds.length === 0 ? (
          <p className="living-signal-empty">아직 등록된 알림음이 없습니다. 먼저 하나 추가해주세요.</p>
        ) : (
          <div className="living-signal-list">
            {sounds.map((sound) => (
              <article className="living-signal-item" key={sound.soundId}>
                <div className="living-signal-item-main">
                  <div>
                    <p className="living-signal-type">{sound.soundTypeLabel}</p>
                    <h4>{sound.registeredSoundName}</h4>
                    {sound.notes ? <p className="living-signal-note">{sound.notes}</p> : null}
                    <p className="living-signal-meta">
                      유형 {sound.soundType} · 샘플 {sound.recordings.length}개 · 수정{' '}
                      {formatTime(sound.updatedAt)}
                    </p>
                  </div>
                  <div className="living-signal-item-actions">
                    <button type="button" onClick={() => openEditPage(sound)}>
                      수정
                    </button>
                    <button type="button" className="danger" onClick={() => deleteSound(sound.soundId)}>
                      삭제
                    </button>
                  </div>
                </div>

                <div className="living-signal-recordings">
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
          <h3 id="living-signal-detect-title">주변 소리 감지</h3>
          <button
            className={listenerState.isListening ? 'living-signal-stop' : 'living-signal-start'}
            type="button"
            onClick={listenerState.isListening ? stopAmbientListening : startAmbientListening}
          >
            {listenerState.isListening ? '감지 중지' : '감지 시작'}
          </button>
        </div>

        <label className="living-signal-threshold">
          <span>감지 기준 {threshold.toFixed(2)}</span>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.01"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
        </label>

        <div className="living-signal-level-bar">
          <div
            className="living-signal-level-fill"
            style={{ width: `${Math.round(listenerState.level * 100)}%` }}
          />
        </div>

        <p className="living-signal-info">{listenerState.info}</p>
        {listenerState.error ? <p className="living-signal-warning">{listenerState.error}</p> : null}
        {syncError ? <p className="living-signal-warning">{syncError}</p> : null}

        {listenerState.lastMatch?.predicted ? (
          <p className="living-signal-result">{listenerState.lastMatch.registeredSoundName} 감지</p>
        ) : null}
      </section>

      {detections.length > 0 ? (
        <section className="living-signal-history" aria-labelledby="living-signal-history-title">
          <div className="living-signal-section-row">
            <h3 id="living-signal-history-title">최근 감지 기록</h3>
            <span>{detections.length}건</span>
          </div>
          <div className="living-signal-detection-list">
            {detections.map((item) => (
              <div className="living-signal-detection-item" key={item.eventId}>
                <strong>{item.predicted ? item.registeredSoundName : 'unknown'}</strong>
                <span>
                  {item.predicted ? formatPercent(item.similarity) : 'threshold 미만'} ·{' '}
                  {formatTime(item.detectedAt)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}
