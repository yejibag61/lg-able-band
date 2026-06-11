import { useMemo, useState } from 'react'
import { createDevice } from '../services/deviceService'

const connectionLabels = {
  CONNECTED: '연결됨',
  WARNING: '주의 필요',
  DISCONNECTED: '연결 필요',
  ERROR: '점검 필요',
}

const deviceCatalog = [
  {
    templateId: 'washer',
    name: '세탁기',
    type: 'WASHER',
    typeLabel: '세탁기',
    room: '세탁실',
    detail: '세탁 완료, 문 열림, 오류 알림을 Able Band로 전달합니다.',
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
    detail: '전원 상태, 볼륨, 채널 변경 안내를 확인합니다.',
    primarySignal: '전원/볼륨 상태 안내',
    locationSupported: false,
    remoteEnabled: true,
    defaultVendorDeviceId: 'thinq-tv-001',
    management: ['전원 상태 안내', '볼륨/채널 안내', '리모컨 찾기'],
  },
  {
    templateId: 'range',
    name: '안전 전기레인지',
    type: 'RANGE',
    typeLabel: '전기레인지',
    room: '주방',
    detail: '과열, 조리 완료, 전원 상태를 생활 알림으로 안내합니다.',
    primarySignal: '과열 경고',
    locationSupported: false,
    remoteEnabled: false,
    defaultVendorDeviceId: 'thinq-range-001',
    management: ['전원 상태 안내', '조리 완료 알림', '과열 경고'],
  },
  {
    templateId: 'door',
    name: '도어센서',
    type: 'DOOR_SENSOR',
    typeLabel: '도어센서',
    room: '현관',
    detail: '문 열림과 장시간 개방 상태를 즉시 안내합니다.',
    primarySignal: '문 열림 알림',
    locationSupported: false,
    remoteEnabled: false,
    defaultVendorDeviceId: 'thinq-door-001',
    management: ['문 열림 알림', '장시간 열림 경고', '외출 상태 확인'],
  },
  {
    templateId: 'air',
    name: 'LG 공기질 센서',
    type: 'AIR_SENSOR',
    typeLabel: '공기질 센서',
    room: '거실',
    detail: '공기질, 습도, 미세먼지 상태를 생활 알림으로 전달합니다.',
    primarySignal: '공기질 상태 안내',
    locationSupported: true,
    remoteEnabled: false,
    defaultVendorDeviceId: 'thinq-air-001',
    management: ['대기질 상태 안내', '온도/습도 안내', '미세먼지 안내'],
  },
  {
    templateId: 'refrigerator',
    name: '냉장고',
    type: 'REFRIGERATOR',
    typeLabel: '냉장고',
    room: '주방',
    detail: '문 열림, 온도 이상, 식재료 상태 알림을 관리합니다.',
    primarySignal: '문 열림 알림',
    locationSupported: false,
    remoteEnabled: true,
    defaultVendorDeviceId: 'thinq-fridge-001',
    management: ['문 열림 알림', '온도 이상 안내', '식재료 찾기'],
  },
]

export function DevicesTab({ devices = [], maxDeviceCount, uwb }) {
  const catalogByType = useMemo(
    () => Object.fromEntries(deviceCatalog.map((item) => [item.type, item])),
    [],
  )
  const initialDevices = useMemo(
    () => devices.map((device) => enrichDevice(device, catalogByType)),
    [catalogByType, devices],
  )

  const [connectedDevices, setConnectedDevices] = useState(initialDevices)
  const [selectedDeviceId, setSelectedDeviceId] = useState(
    initialDevices[0]?.deviceId ?? null,
  )
  const [connectionMessage, setConnectionMessage] = useState('')
  const [isDevicePickerOpen, setIsDevicePickerOpen] = useState(false)
  const [screenMode, setScreenMode] = useState('list')
  const [draft, setDraft] = useState(createEmptyDraft())
  const [submitState, setSubmitState] = useState({
    saving: false,
    error: '',
  })

  const selectedDevice =
    connectedDevices.find((device) => device.deviceId === selectedDeviceId) || null

  const connectedCount = connectedDevices.filter(
    (device) => device.connectionStatus === 'CONNECTED',
  ).length
  const warningCount = connectedDevices.filter(
    (device) => device.connectionStatus === 'WARNING' || device.connectionStatus === 'ERROR',
  ).length
  const locationSupportedCount = connectedDevices.filter(
    (device) => device.locationSupported,
  ).length

  const registeredDeviceTypes = useMemo(
    () => new Set(connectedDevices.map((device) => device.type)),
    [connectedDevices],
  )
  const availableDeviceCount = deviceCatalog.filter(
    (device) => !registeredDeviceTypes.has(device.type),
  ).length
  const uwbTarget = getUwbTarget(connectedDevices, selectedDevice, uwb)
  const uwbGuide = uwbTarget ? createUwbGuide(uwbTarget, uwb) : null

  function handleFindNearbyDevices() {
    if (availableDeviceCount === 0) {
      setConnectionMessage('모든 가전이 이미 연결되어 있습니다.')
      return
    }

    setConnectionMessage(`연결 가능한 가전 ${availableDeviceCount}종을 확인했습니다.`)
  }

  function handleToggleDevicePicker() {
    setIsDevicePickerOpen((current) => !current)
    setConnectionMessage('')
  }

  function handleSelectConnectedDevice(deviceId) {
    setSelectedDeviceId(deviceId)
    setConnectionMessage('')
  }

  function handleRefreshSelectedDevice() {
    if (!selectedDevice) {
      return
    }

    setConnectionMessage(`${selectedDevice.name} 상태를 방금 새로고침했습니다.`)
  }

  function openCreatePage(template) {
    if (registeredDeviceTypes.has(template.type)) {
      setConnectionMessage(`${template.name}은 이미 연결된 가전입니다.`)
      setIsDevicePickerOpen(false)
      return
    }

    setDraft({
      vendor: 'LG_THINQ',
      vendorDeviceId: template.defaultVendorDeviceId,
      name: template.name,
      type: template.type,
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
        error: '가전 이름을 입력해주세요.',
      })
      return
    }

    if (!draft.vendorDeviceId.trim()) {
      setSubmitState({
        saving: false,
        error: 'vendorDeviceId를 입력해주세요.',
      })
      return
    }

    setSubmitState({ saving: true, error: '' })

    try {
      const savedDevice = await createDevice({
        vendor: draft.vendor,
        vendorDeviceId: draft.vendorDeviceId.trim(),
        name: draft.name.trim(),
        type: draft.type,
        locationSupported: draft.locationSupported,
        remoteEnabled: draft.remoteEnabled,
      })

      const nextDevice = enrichDevice(savedDevice, catalogByType)

      setConnectedDevices((current) => [
        nextDevice,
        ...current.filter((item) => item.deviceId !== nextDevice.deviceId),
      ])
      setSelectedDeviceId(nextDevice.deviceId)
      setIsDevicePickerOpen(false)
      setScreenMode('list')
      setConnectionMessage(`${nextDevice.name}를 연결했어요.`)
      setSubmitState({ saving: false, error: '' })
    } catch (error) {
      setSubmitState({
        saving: false,
        error: error.message || '가전 연결에 실패했습니다.',
      })
    }
  }

  if (screenMode === 'create') {
    const template = catalogByType[draft.type]

    return (
      <section className="tab-stack device-tab" aria-labelledby="device-add-title">
        <section className="content-card device-add-editor">
          <button className="text-button back-button" type="button" onClick={closeCreatePage}>
            목록으로 돌아가기
          </button>

          <div className="device-add-hero">
            <p className="card-label">가전 추가</p>
            <h2 id="device-add-title">{template?.name || '가전'} 연결</h2>
            <p>선택한 가전을 계정에 연결하고, 이후 알림과 UWB 안내에 사용할 수 있게 저장합니다.</p>
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
              placeholder="예: 세탁기"
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
              <strong>UWB 위치 안내 사용</strong>
              <p>해당 가전을 UWB 찾기 대상으로 함께 저장합니다.</p>
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
              <p>원격 상태 조회와 연동 기능을 함께 저장합니다.</p>
            </div>
          </label>

          {submitState.error ? (
            <p className="form-error" role="alert">
              {submitState.error}
            </p>
          ) : null}

          <button
            className="primary-button full-button"
            type="button"
            disabled={submitState.saving}
            onClick={handleCreateDevice}
          >
            {submitState.saving ? '가전 연결 중...' : '가전 연결 완료'}
          </button>
        </section>
      </section>
    )
  }

  return (
    <section className="tab-stack device-tab" aria-labelledby="devices-title">
      <div className="content-card device-hero-card">
        <div>
          <p className="card-label">LG ThinQ 연결</p>
          <h2 id="devices-title">우리 집 가전을 연결해요.</h2>
          <p>세탁기, TV, 안전 전기레인지, 도어센서, 공기질 센서, 냉장고를 한 화면에서 관리합니다.</p>
        </div>
        <button className="device-find-button" type="button" onClick={handleFindNearbyDevices}>
          주변 제품 찾기
        </button>
      </div>

      <div className="device-overview-grid" aria-label="기기 연결 요약">
        <span>
          <strong>{connectedCount}</strong>
          연결됨
        </span>
        <span>
          <strong>{warningCount}</strong>
          주의
        </span>
        <span>
          <strong>{locationSupportedCount}</strong>
          UWB
        </span>
        <span>
          <strong>
            {connectedDevices.length}/{maxDeviceCount}
          </strong>
          등록 현황
        </span>
      </div>

      {uwbGuide ? (
        <section className="content-card uwb-card">
          <div className="section-title-row">
            <div>
              <p className="card-label">UWB 위치 안내</p>
              <h2>{uwbGuide.targetName} 찾기</h2>
            </div>
            <span>{uwbGuide.distanceM}m</span>
          </div>
          <p>
            {uwbGuide.vibrationPattern} · {uwbGuide.voiceGuide}
          </p>
          <button className="primary-button full-button" type="button">
            위치 안내 시작
          </button>
        </section>
      ) : (
        <section className="content-card uwb-card">
          <div className="section-title-row">
            <div>
              <p className="card-label">UWB 위치 안내</p>
              <h2>연결된 위치 안내 가전이 없습니다</h2>
            </div>
          </div>
          <p>UWB를 지원하는 가전을 연결하면 이곳에서 위치 안내를 시작할 수 있습니다.</p>
        </section>
      )}

      <section className="content-card device-connected-card" aria-labelledby="connected-devices-title">
        <div className="section-title-row">
          <div>
            <p className="card-label">연결된 가전</p>
            <h2 id="connected-devices-title">내 가전 목록</h2>
          </div>
          <span>{connectedDevices.length}개</span>
        </div>

        {connectedDevices.length > 0 ? (
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
            아직 연결된 가전이 없습니다. 위의 `가전 추가하기`로 먼저 연결해주세요.
          </p>
        )}
      </section>

      {selectedDevice ? (
        <section
          className="content-card device-manager-card"
          aria-label={`${selectedDevice.name} 관리`}
        >
          <div className="section-title-row">
            <div>
              <p className="card-label">{selectedDevice.room}</p>
              <h2>{selectedDevice.name} 관리</h2>
            </div>
            <span className={`manager-status status-${selectedDevice.connectionStatus.toLowerCase()}`}>
              {connectionLabels[selectedDevice.connectionStatus] || selectedDevice.connectionStatus}
            </span>
          </div>
          <p>{selectedDevice.detail}</p>
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
              <dt>UWB 안내</dt>
              <dd>{selectedDevice.locationSupported ? '지원' : '미지원'}</dd>
            </div>
            <div>
              <dt>주요 알림</dt>
              <dd>{selectedDevice.primarySignal}</dd>
            </div>
          </dl>
          <div className="device-feature-list" aria-label={`${selectedDevice.name} 관리 기능`}>
            {selectedDevice.management.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
          <div className="device-action-grid">
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={handleRefreshSelectedDevice}
            >
              상태 새로고침
            </button>
            <button className="secondary-button compact-button" type="button">
              알림 설정
            </button>
          </div>
        </section>
      ) : null}

      {connectionMessage ? (
        <p className="limit-message" role="status">
          {connectionMessage}
        </p>
      ) : null}

      <section className="device-register-card" aria-labelledby="device-register-title">
        <div className="section-title-row">
          <div>
            <p className="card-label">연동 가전</p>
            <h2 id="device-register-title">가전 추가</h2>
          </div>
          <span>{availableDeviceCount}종</span>
        </div>
        <button
          className={isDevicePickerOpen ? 'device-add-button active' : 'device-add-button'}
          type="button"
          aria-expanded={isDevicePickerOpen}
          aria-controls="device-catalog-grid"
          onClick={handleToggleDevicePicker}
        >
          {isDevicePickerOpen ? '추가 가능한 가전 닫기' : '가전 추가하기'}
        </button>

        {isDevicePickerOpen ? (
          <section
            id="device-catalog-grid"
            className="device-product-grid device-catalog-grid"
            aria-label="추가 가능한 가전 목록"
          >
            {deviceCatalog.map((device) => {
              const isRegistered = registeredDeviceTypes.has(device.type)

              return (
                <button
                  className={
                    isRegistered ? 'device-product-card already-connected' : 'device-product-card'
                  }
                  key={device.templateId}
                  type="button"
                  aria-label={
                    isRegistered ? `${device.name} 이미 연결됨` : `${device.name} 추가하기`
                  }
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
      </section>
    </section>
  )
}

function createEmptyDraft() {
  return {
    vendor: 'LG_THINQ',
    vendorDeviceId: '',
    name: '',
    type: 'WASHER',
    locationSupported: false,
    remoteEnabled: false,
  }
}

function enrichDevice(device, catalogByType) {
  const template = catalogByType[device.type] || createFallbackTemplate(device)

  return {
    ...template,
    ...device,
    room: device.room || template.room,
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
    management: ['상태 확인'],
  }
}

function getUwbTarget(devices, selectedDevice, uwb) {
  const connectedUwbDevices = devices.filter(
    (device) => device.connectionStatus === 'CONNECTED' && device.locationSupported,
  )

  if (connectedUwbDevices.length === 0) {
    return null
  }

  if (
    selectedDevice?.connectionStatus === 'CONNECTED' &&
    selectedDevice.locationSupported
  ) {
    return selectedDevice
  }

  const previewTarget = connectedUwbDevices.find((device) => device.name === uwb?.targetName)
  return previewTarget || connectedUwbDevices[0]
}

function createUwbGuide(target, uwb) {
  const distanceM = Number.isFinite(uwb?.distanceM) ? uwb.distanceM : 2.4
  const vibrationPattern = uwb?.vibrationPattern || '강한 진동'

  return {
    targetName: target.name,
    distanceM,
    vibrationPattern,
    voiceGuide: `${target.name}까지 약 ${distanceM}미터입니다. 연결된 가전 기준으로 위치를 안내합니다.`,
  }
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

  return (
    <svg viewBox="0 0 48 48" focusable="false">
      <rect x="14" y="6" width="20" height="36" rx="4" />
      <path d="M14 22h20M29 14h1M29 30h1" />
    </svg>
  )
}
