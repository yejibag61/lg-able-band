import { useEffect, useMemo, useState } from 'react'
import { useBleProximityGuide } from '../features/ble/useBleProximityGuide'
import { createDevice, getDevices, updateDevice } from '../services/deviceService'

function scrollAppContentToTop() {
  const appContent = document.querySelector('.app-content')
  if (appContent instanceof HTMLElement) {
    appContent.scrollTo({ top: 0, left: 0 })
  }

  window.scrollTo({ top: 0, left: 0 })
}

const connectionLabels = {
  CONNECTED: '연결됨',
  WARNING: '주의 필요',
  DISCONNECTED: '연결 필요',
  ERROR: '확인 필요',
}

const deviceCatalog = [
  {
    templateId: 'washer',
    name: '세탁기',
    type: 'WASHER',
    typeLabel: '세탁기',
    room: '세탁실',
    detail: '선택한 가전의 기본 정보를 확인합니다.',
    primarySignal: '세탁 완료 알림',
    locationSupported: true,
    remoteEnabled: true,
    defaultVendorDeviceId: 'thinq-washer-001',
    management: ['세탁 완료 알림', '문 열림/오류 안내', 'UWB 위치 안내'],
  },
  {
    templateId: 'tv',
    name: 'TV',
    type: 'TV',
    typeLabel: 'TV',
    room: '거실',
    detail: '전원 상태와 볼륨, 현재 사용 상태를 앱에서 확인합니다.',
    primarySignal: '전원 상태 안내',
    locationSupported: false,
    remoteEnabled: true,
    defaultVendorDeviceId: 'thinq-tv-001',
    management: ['전원 상태 안내', '볼륨/채널 안내', 'UWB 위치 안내'],
  },
  {
    templateId: 'range',
    name: '안전 전기레인지',
    type: 'RANGE',
    typeLabel: '전기레인지',
    room: '주방',
    detail: '과열 경고와 전원 상태, 조리 완료 신호를 확인할 수 있습니다.',
    primarySignal: '과열 경고',
    locationSupported: false,
    remoteEnabled: false,
    defaultVendorDeviceId: 'thinq-range-001',
    management: ['전원 상태 안내', '조리 완료 알림', 'UWB 위치 안내'],
  },
  {
    templateId: 'door',
    name: '도어센서',
    type: 'DOOR_SENSOR',
    typeLabel: '도어센서',
    room: '현관',
    detail: '문 열림과 장시간 열림 상태를 빠르게 확인할 수 있습니다.',
    primarySignal: '문 열림 알림',
    locationSupported: false,
    remoteEnabled: false,
    defaultVendorDeviceId: 'door-sensor-001',
    management: ['문 열림 알림', '열림 상태 경고', 'UWB 위치 안내'],
  },
  {
    templateId: 'air',
    name: 'LG 공기질 센서',
    type: 'AIR_SENSOR',
    typeLabel: '공기질 센서',
    room: '거실',
    detail: '공기질과 온습도 변화를 생활 신호처럼 확인할 수 있습니다.',
    primarySignal: '공기질 상태 안내',
    locationSupported: true,
    remoteEnabled: false,
    defaultVendorDeviceId: 'thinq-air-001',
    management: ['공기질 상태 안내', '온도/습도 안내', 'UWB 위치 안내'],
  },
  {
    templateId: 'refrigerator',
    name: '냉장고',
    type: 'REFRIGERATOR',
    typeLabel: '냉장고',
    room: '주방',
    detail: '문 열림과 온도 이상, 주요 상태를 한 번에 확인합니다.',
    primarySignal: '문 열림 알림',
    locationSupported: false,
    remoteEnabled: true,
    defaultVendorDeviceId: 'thinq-fridge-001',
    management: ['문 열림 알림', '온도 이상 안내', 'UWB 위치 안내'],
  },
]

export function DevicesTab({ devices = [], uwb }) {
  const catalogByType = useMemo(
    () => Object.fromEntries(deviceCatalog.map((item) => [item.type, item])),
    [],
  )
  const initialDevices = useMemo(
    () => devices.map((device) => enrichDevice(device, catalogByType)),
    [catalogByType, devices],
  )

  const [connectedDevices, setConnectedDevices] = useState(initialDevices)
  const [selectedDeviceId, setSelectedDeviceId] = useState(initialDevices[0]?.deviceId ?? null)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [isDevicePickerOpen, setIsDevicePickerOpen] = useState(false)
  const [screenMode, setScreenMode] = useState('list')
  const [draft, setDraft] = useState(createEmptyDraft())
  const [submitState, setSubmitState] = useState({
    saving: false,
    error: '',
  })
  const [locationDraftByDeviceId, setLocationDraftByDeviceId] = useState({})
  const [locationSaveState, setLocationSaveState] = useState({
    saving: false,
    error: '',
  })

  const bleGuide = useBleProximityGuide()

  const selectedDevice =
    connectedDevices.find((device) => device.deviceId === selectedDeviceId) || null
  const locationDraft = selectedDevice
    ? locationDraftByDeviceId[selectedDevice.deviceId] ?? selectedDevice.room ?? ''
    : ''

  const uwbTarget = getGuideTarget(connectedDevices, selectedDevice, uwb)
  const isGuidingCurrentTarget = Boolean(
    uwbTarget && bleGuide.isActive && bleGuide.targetName === uwbTarget.name,
  )

  useEffect(() => {
    if (!connectionMessage) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setConnectionMessage('')
    }, 2200)

    return () => window.clearTimeout(timeoutId)
  }, [connectionMessage])

  useEffect(() => {
    if (screenMode === 'list') {
      return
    }

    scrollAppContentToTop()
  }, [screenMode])

  function handleToggleDevicePicker() {
    setIsDevicePickerOpen((current) => !current)
    setConnectionMessage('')
  }

  function handleSelectConnectedDevice(deviceId) {
    setSelectedDeviceId(deviceId)
    setConnectionMessage('')
    setLocationSaveState({ saving: false, error: '' })
  }

  function handleRefreshSelectedDevice() {
    if (!selectedDevice) {
      return
    }

    setConnectionMessage(`${selectedDevice.name} 상태를 방금 새로고침했습니다.`)
  }

  function handleToggleLocationGuide(targetDevice = uwbTarget || selectedDevice) {
    if (!targetDevice) {
      return
    }

    if (bleGuide.isActive && bleGuide.targetName === targetDevice.name) {
      bleGuide.stopGuide()
      return
    }

    bleGuide.startGuide(targetDevice.name)
  }

  function openCreatePage(template) {
    if (isDeviceConnected(connectedDevices, template)) {
      setConnectionMessage(`${template.name}는 이미 연결된 가전입니다.`)
      setIsDevicePickerOpen(false)
      return
    }

    setDraft({
      vendor: 'LG_THINQ',
      vendorDeviceId: template.defaultVendorDeviceId,
      name: template.name,
      type: template.type,
      room: '',
      locationSupported: template.locationSupported,
      remoteEnabled: template.remoteEnabled,
    })
    setSubmitState({ saving: false, error: '' })
    setScreenMode('create')
  }

  function closeCreatePage() {
    setScreenMode('list')
    setSubmitState({ saving: false, error: '' })
  }

  function updateDraft(field, value) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }))
    setSubmitState((current) => ({ ...current, error: '' }))
  }

  async function handleCreateDevice() {
    if (!draft.name.trim()) {
      setSubmitState({
        saving: false,
        error: '가전 이름을 입력해 주세요.',
      })
      return
    }

    if (!draft.vendorDeviceId.trim()) {
      setSubmitState({
        saving: false,
        error: 'vendorDeviceId를 입력해 주세요.',
      })
      return
    }

    const normalizedDraft = {
      ...draft,
      name: draft.name.trim(),
      vendorDeviceId: draft.vendorDeviceId.trim(),
      room: draft.room.trim(),
    }
    if (isDeviceConnected(connectedDevices, normalizedDraft)) {
      setSubmitState({
        saving: false,
        error: '이미 연결된 기기입니다.',
      })
      return
    }

    setSubmitState({ saving: true, error: '' })

    try {
      const devicePayload = {
        vendor: draft.vendor,
        vendorDeviceId: normalizedDraft.vendorDeviceId,
        name: normalizedDraft.name,
        type: draft.type,
        locationSupported: draft.locationSupported,
        remoteEnabled: draft.remoteEnabled,
      }

      if (normalizedDraft.room) {
        devicePayload.room = normalizedDraft.room
      }

      const savedDevice = await createDevice(devicePayload)

      const nextDevice = enrichDevice(
        {
          ...savedDevice,
          room: savedDevice.room || savedDevice.locationName || normalizedDraft.room,
        },
        catalogByType,
      )
      setConnectedDevices((current) => [
        nextDevice,
        ...current.filter((item) => item.deviceId !== nextDevice.deviceId),
      ])
      setSelectedDeviceId(nextDevice.deviceId)
      setIsDevicePickerOpen(false)
      setScreenMode('list')
      setConnectionMessage(`${nextDevice.name}를 연결했습니다.`)
      setSubmitState({ saving: false, error: '' })
    } catch (error) {
      if (error.code === 'DUPLICATED_DEVICE') {
        await syncConnectedDevices()
      }

      setSubmitState({
        saving: false,
        error: error.message || '가전 연결에 실패했습니다.',
      })
    }
  }

  async function handleSaveLocation() {
    if (!selectedDevice) {
      return
    }

    const nextRoom = locationDraft.trim()
    if (!nextRoom) {
      setLocationSaveState({
        saving: false,
        error: '가전 위치를 입력해 주세요.',
      })
      return
    }

    setLocationSaveState({ saving: true, error: '' })

    try {
      const savedDevice = await updateDevice(selectedDevice.deviceId, { room: nextRoom })
      const nextDevice = enrichDevice(
        {
          ...selectedDevice,
          ...savedDevice,
          room: savedDevice.room || savedDevice.locationName || nextRoom,
        },
        catalogByType,
      )

      setConnectedDevices((currentDevices) =>
        currentDevices.map((device) =>
          device.deviceId === selectedDevice.deviceId ? nextDevice : device,
        ),
      )
      setLocationDraftByDeviceId((currentDrafts) => ({
        ...currentDrafts,
        [nextDevice.deviceId]: nextDevice.room,
      }))
      setLocationSaveState({ saving: false, error: '' })
      setConnectionMessage(`${nextDevice.name} 위치를 ${nextDevice.room}으로 저장했습니다.`)
    } catch (error) {
      setLocationSaveState({
        saving: false,
        error: error.message || '가전 위치 저장에 실패했습니다.',
      })
    }
  }

  async function syncConnectedDevices() {
    try {
      const latestDevices = await getDevices()
      const nextDevices = latestDevices.map((device) => enrichDevice(device, catalogByType))
      setConnectedDevices(nextDevices)
      setSelectedDeviceId((currentDeviceId) => {
        if (nextDevices.some((device) => device.deviceId === currentDeviceId)) {
          return currentDeviceId
        }

        const connectedDraft = nextDevices.find((device) => isSameVendorDevice(device, draft))
        return connectedDraft?.deviceId ?? nextDevices[0]?.deviceId ?? null
      })
    } catch {
      // Keep the current screen state; the visible error already explains the failed action.
    }
  }

  if (screenMode === 'create') {
    const template = catalogByType[draft.type]
    const isAlreadyConnected = isDeviceConnected(connectedDevices, draft)

    return (
      <section className="tab-stack device-tab" aria-labelledby="device-add-title">
        <section className="content-card device-add-editor">
          <div className="device-add-hero">
            <button
              className="text-button back-button alert-detail-back"
              type="button"
              aria-label="목록으로 돌아가기"
              onClick={closeCreatePage}
            >
              <span aria-hidden="true">←</span>
            </button>
            <strong className="card-title" id="device-add-title">가전 추가</strong>
          </div>

          <div className="device-add-preview-card">
            <DeviceIcon type={draft.type} />
            <div>
              <strong>{template?.name || draft.name}</strong>
              <p>{template?.detail || '선택한 가전의 기본 정보를 확인합니다.'}</p>
            </div>
          </div>

          <label className="field">
            <span>가전 이름</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => updateDraft('name', event.target.value)}
              placeholder="예: 우리 집 세탁기"
            />
          </label>

          <label className="field">
            <span>vendorDeviceId</span>
            <input
              type="text"
              value={draft.vendorDeviceId}
              onChange={(event) => updateDraft('vendorDeviceId', event.target.value)}
              placeholder="예: thinq-washer-001"
            />
          </label>

          <label className="field">
            <span>가전 위치</span>
            <input
              type="text"
              value={draft.room}
              onChange={(event) => updateDraft('room', event.target.value)}
              placeholder={`예: ${template?.room || '거실'}`}
            />
          </label>

          <div className="device-add-static-grid">
            <div>
              <span>연동사</span>
              <strong>{draft.vendor}</strong>
            </div>
            <div>
              <span>기기 유형</span>
              <strong>{template?.typeLabel || draft.type}</strong>
            </div>
          </div>

          <label className="device-toggle">
            <input
              type="checkbox"
              checked={draft.locationSupported}
              onChange={(event) => updateDraft('locationSupported', event.target.checked)}
            />
            <div>
              <strong>위치 안내 사용</strong>
              <p>이 가전을 위치 안내 대상으로 함께 관리합니다.</p>
            </div>
          </label>

          <label className="device-toggle">
            <input
              type="checkbox"
              checked={draft.remoteEnabled}
              onChange={(event) => updateDraft('remoteEnabled', event.target.checked)}
            />
            <div>
              <strong>원격 제어 사용</strong>
              <p>원격 상태 조회와 제어 기능을 사용할 수 있게 등록합니다.</p>
            </div>
          </label>

          {submitState.error ? (
            <p className="form-error" role="alert">
              {submitState.error}
            </p>
          ) : null}

          {isAlreadyConnected ? (
            <p className="form-error" role="alert">
              이미 연결된 기기입니다.
            </p>
          ) : null}

          <button
            className="primary-button full-button"
            type="button"
            disabled={submitState.saving || isAlreadyConnected}
            onClick={handleCreateDevice}
          >
            {submitState.saving ? '가전 연결 중...' : '가전 연결 완료'}
          </button>
        </section>
      </section>
    )
  }

  return (
    <section className="tab-stack device-tab" aria-labelledby="connected-devices-title">

      {uwbTarget ? (
        <section className="content-card uwb-card">
          <div className="uwb-card-header">
            <div>
              <p className="card-label">UWB 위치 안내</p>
              <strong className="card-title">{bleGuide.targetName || uwbTarget.name} 찾기</strong>
            </div>
          </div>

          <div className="uwb-distance-panel" aria-live="polite">
            <strong className="uwb-distance-value">{bleGuide.distanceText}m</strong>
            <p className="uwb-distance-caption">{bleGuide.helperText}</p>
          </div>

          <div className="uwb-meta-row">
            <span>{bleGuide.statusLabel}</span>
            <span>{bleGuide.deviceLabel}</span>
          </div>

          {bleGuide.errorMessage ? (
            <p className="limit-message" role="alert">
              {bleGuide.errorMessage}
            </p>
          ) : null}

          <button
            className="primary-button full-button"
            type="button"
            disabled={bleGuide.isConnecting}
            onClick={() => handleToggleLocationGuide(uwbTarget)}
          >
            {bleGuide.isConnecting
              ? '위치 안내 연결 중...'
              : isGuidingCurrentTarget
                ? '위치 안내 종료'
                : '위치 안내 시작'}
          </button>
        </section>
      ) : (
        <section className="content-card uwb-card">
          <div className="section-title-row">
            <div>
              <p className="card-label">UWB 위치 안내</p>
              <strong className="card-title">연결된 가전이 없습니다</strong>
            </div>
          </div>
          <p>가전을 먼저 연결하면 이 화면에서 위치 안내를 바로 시작할 수 있습니다.</p>
        </section>
      )}

      <section className="content-card device-connected-card" aria-labelledby="connected-devices-title">
        <div className="section-title-row">
          <div>
            <p className="card-label">연결된 가전</p>
            <strong className="card-title" id="connected-devices-title">내 가전 목록</strong>
          </div>
          <button
            className={isDevicePickerOpen ? 'device-inline-add-button active' : 'device-inline-add-button'}
            type="button"
            aria-expanded={isDevicePickerOpen}
            aria-controls="device-catalog-grid"
            onClick={handleToggleDevicePicker}
          >
            추가
          </button>
        </div>

        {isDevicePickerOpen ? (
          <section
            id="device-catalog-grid"
            className="device-product-grid device-catalog-grid"
            aria-label="추가 가능한 가전 목록"
          >
            {deviceCatalog.map((device) => {
              const isRegistered = isDeviceConnected(connectedDevices, device)

              return (
                <button
                  className={
                    isRegistered ? 'device-product-card already-connected' : 'device-product-card'
                  }
                  key={device.templateId}
                  type="button"
                  aria-label={isRegistered ? `${device.name} 이미 연결됨` : `${device.name} 추가하기`}
                  disabled={isRegistered}
                  onClick={() => openCreatePage(device)}
                >
                  <DeviceIcon type={device.type} />
                  <span className="device-catalog-chip">
                    {isRegistered ? '이미 연결됨' : '추가 가능'}
                  </span>
                  <strong>{device.name}</strong>
                  <small>{device.typeLabel}</small>
                </button>
              )
            })}
          </section>
        ) : null}

        {!isDevicePickerOpen ? (
          connectedDevices.length > 0 ? (
            <div className="device-product-grid">
              {connectedDevices.map((device) => (
                <button
                  className={
                    selectedDevice?.deviceId === device.deviceId
                      ? 'device-product-card selected'
                      : 'device-product-card'
                  }
                  key={device.deviceId}
                  type="button"
                  aria-label={`${device.name} 관리 열기`}
                  aria-pressed={selectedDevice?.deviceId === device.deviceId}
                  onClick={() => handleSelectConnectedDevice(device.deviceId)}
                >
                  <DeviceIcon type={device.type} />
                  <span
                    className={`connection-dot connection-${device.connectionStatus.toLowerCase()}`}
                  />
                  <strong>{device.name}</strong>
                  <small>{connectionLabels[device.connectionStatus] || device.connectionStatus}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              아직 연결된 가전이 없습니다. 아래의 가전 추가하기로 먼저 연결해 주세요.
            </p>
          )
        ) : null}
      </section>

      {selectedDevice ? (
        <section
          className="content-card device-manager-card"
          aria-label={`${selectedDevice.name} 관리`}
        >
          <div className="device-manager-header">
            <div>
              <div className="device-manager-topline">
                <p className="card-label">{selectedDevice.room}</p>
              </div>
              <div className="device-manager-title-row">
                <strong className="card-title">{selectedDevice.name} 관리</strong>
              </div>
            </div>
            <button
              className="device-manager-refresh-button"
              type="button"
              aria-label={`${selectedDevice.name} 상태 새로고침`}
              onClick={handleRefreshSelectedDevice}
            >
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path d="M6.5 7.5A7 7 0 0 1 18 9" />
                <path d="M17.5 5.5V9h-3.5" />
                <path d="M17.5 16.5A7 7 0 0 1 6 15" />
                <path d="M6.5 18.5V15H10" />
              </svg>
            </button>
          </div>
          <dl className="device-detail-grid">
            <div>
              <dt>기기 유형</dt>
              <dd>{selectedDevice.typeLabel}</dd>
            </div>
            <div>
              <dt>최근 이벤트</dt>
              <dd>{selectedDevice.lastEventLabel}</dd>
            </div>
            <div>
              <dt>위치 안내</dt>
              <dd>임시 BLE 테스트 가능</dd>
            </div>
            <div>
              <dt>주요 알림</dt>
              <dd>{selectedDevice.primarySignal}</dd>
            </div>
          </dl>
          <label className="field">
            <span>가전 위치 수정</span>
            <input
              type="text"
              value={locationDraft}
              onChange={(event) => {
                setLocationDraftByDeviceId((currentDrafts) => ({
                  ...currentDrafts,
                  [selectedDevice.deviceId]: event.target.value,
                }))
                setLocationSaveState((current) => ({ ...current, error: '' }))
              }}
              placeholder="예: 거실"
            />
          </label>
          {locationSaveState.error ? (
            <p className="form-error" role="alert">
              {locationSaveState.error}
            </p>
          ) : null}
          <button
            className="primary-button full-button"
            type="button"
            disabled={locationSaveState.saving}
            onClick={handleSaveLocation}
          >
            {locationSaveState.saving ? '위치 저장 중...' : '위치 저장'}
          </button>
          <div className="device-feature-list" aria-label={`${selectedDevice.name} 관리 기능`}>
            {selectedDevice.management.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
        </section>
      ) : null}

      {connectionMessage ? (
        <div className="device-toast" role="status" aria-live="polite">
          <p className="device-toast-message">{connectionMessage}</p>
        </div>
      ) : null}

      {bleGuide.isShowingOverlay ? (
        <div className="device-guide-overlay" role="status" aria-live="polite">
          <div className="device-guide-overlay-card">
            <div className="device-guide-spinner" aria-hidden="true" />
            <strong>{bleGuide.statusTitle || '기기를 연결하는 중이에요'}</strong>
            <p>{bleGuide.helperText}</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function createEmptyDraft() {
  return {
    vendor: 'LG_THINQ',
    vendorDeviceId: '',
    name: '',
    type: 'WASHER',
    room: '',
    locationSupported: false,
    remoteEnabled: false,
  }
}

function getDeviceVendorId(device) {
  const vendorDeviceId = (device?.vendorDeviceId || '').trim()

  if (vendorDeviceId.startsWith('admin-demo-')) {
    return (device?.defaultVendorDeviceId || vendorDeviceId).trim()
  }

  return (vendorDeviceId || device?.defaultVendorDeviceId || '').trim()
}

function isSameVendorDevice(device, selectedDevice) {
  const deviceVendorDeviceId = getDeviceVendorId(device)
  const selectedVendorDeviceId = getDeviceVendorId(selectedDevice)

  return Boolean(
    deviceVendorDeviceId &&
      selectedVendorDeviceId &&
      deviceVendorDeviceId === selectedVendorDeviceId,
  )
}

function isDeviceConnected(connectedDevices, selectedDevice) {
  return connectedDevices.some((device) => isSameVendorDevice(device, selectedDevice))
}

function enrichDevice(device, catalogByType) {
  const template = catalogByType[device.type] || createFallbackTemplate(device)

  return {
    ...template,
    ...device,
    vendorDeviceId: getDeviceVendorId({ ...template, ...device }),
    room: device.room || device.locationName || template.room,
    typeLabel: device.typeLabel || template.typeLabel,
    detail: device.detail || template.detail,
    primarySignal: device.primarySignal || template.primarySignal,
    management: device.management || template.management,
    lastEventLabel: device.lastEventLabel || formatLastEvent(device.lastEventAt),
  }
}

function createFallbackTemplate(device) {
  return {
    name: device.name,
    type: device.type,
    typeLabel: device.type,
    room: '기기 위치',
    detail: '연결된 가전의 상태를 확인할 수 있습니다.',
    primarySignal: '기기 상태 안내',
    management: ['상태 확인', '위치 안내 시작'],
  }
}

function getGuideTarget(devices, selectedDevice, uwb) {
  if (selectedDevice) {
    return selectedDevice
  }

  const previewTarget = devices.find((device) => device.name === uwb?.targetName)
  if (previewTarget) {
    return previewTarget
  }

  return devices[0] || null
}


function formatLastEvent(value) {
  if (!value) {
    return '방금 연결됨'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '최근 이벤트 확인'
  }

  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function DeviceIcon({ type }) {
  return (
    <span
      className={`appliance-icon appliance-${type.toLowerCase().replace('_', '-')}`}
      aria-hidden="true"
    >
      {renderDeviceIcon(type)}
    </span>
  )
}

function renderDeviceIcon(type) {
  if (type === 'WASHER') {
    return (
      <svg viewBox="0 0 48 48" focusable="false">
        <rect x="10" y="7" width="28" height="34" rx="5" />
        <circle cx="24" cy="27" r="9" />
        <path d="M16 14h7M30 14h2" />
      </svg>
    )
  }

  if (type === 'TV') {
    return (
      <svg viewBox="0 0 48 48" focusable="false">
        <rect x="7" y="11" width="34" height="22" rx="4" />
        <path d="M20 37h8M24 33v4" />
      </svg>
    )
  }

  if (type === 'RANGE') {
    return (
      <svg viewBox="0 0 48 48" focusable="false">
        <rect x="9" y="10" width="30" height="28" rx="5" />
        <circle cx="18" cy="20" r="4" />
        <circle cx="30" cy="20" r="4" />
        <path d="M18 31h12M24 28v6" />
      </svg>
    )
  }

  if (type === 'DOOR_SENSOR') {
    return (
      <svg viewBox="0 0 48 48" focusable="false">
        <path d="M14 8h19v32H14z" />
        <path d="M33 15h5v18h-5M28 24h1" />
      </svg>
    )
  }

  if (type === 'AIR_SENSOR') {
    return (
      <svg viewBox="0 0 48 48" focusable="false">
        <rect x="16" y="7" width="16" height="34" rx="8" />
        <path d="M12 18c-4 3-4 8 0 11M36 18c4 3 4 8 0 11M20 18h8M20 25h8M21 32h6" />
      </svg>
    )
  }

  if (type === 'REFRIGERATOR') {
    return (
      <svg viewBox="0 0 48 48" focusable="false">
        <rect x="14" y="6" width="20" height="36" rx="4" />
        <path d="M14 22h20M29 14h1M29 30h1" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" focusable="false">
      <rect x="10" y="10" width="28" height="28" rx="6" />
      <path d="M16 24h16" />
    </svg>
  )
}

