import { useState } from 'react'

const connectionLabels = {
  CONNECTED: '연결됨',
  WARNING: '주의 필요',
  DISCONNECTED: '연결 필요',
}

export function DevicesTab({ devices, maxDeviceCount, uwb }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices[0]?.deviceId ?? null)
  const [connectionMessage, setConnectionMessage] = useState('')
  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId) || devices[0]
  const connectedCount = devices.filter((device) => device.connectionStatus === 'CONNECTED').length
  const warningCount = devices.filter((device) => device.connectionStatus === 'WARNING').length
  const locationSupportedCount = devices.filter((device) => device.locationSupported).length

  function handleFindNearbyDevices() {
    setConnectionMessage('연결 가능한 MVP 가전 6종을 확인했습니다.')
  }

  function handleRefreshSelectedDevice() {
    setConnectionMessage(`${selectedDevice.name} 상태를 방금 갱신했습니다.`)
  }

  return (
    <section className="tab-stack device-tab" aria-labelledby="devices-title">
      <div className="content-card device-hero-card">
        <div>
          <p className="card-label">LG ThinQ 연결</p>
          <h2 id="devices-title">우리집 MVP 가전을 연결해요.</h2>
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
            {devices.length}/{maxDeviceCount}
          </strong>
          등록 슬롯
        </span>
      </div>

      <section className="content-card uwb-card">
        <div className="section-title-row">
          <div>
            <p className="card-label">UWB 위치 안내</p>
            <h2>{uwb.targetName} 찾기</h2>
          </div>
          <span>{uwb.distanceM}m</span>
        </div>
        <p>
          {uwb.vibrationPattern} · {uwb.voiceGuide}
        </p>
        <button className="primary-button full-button" type="button">
          위치 안내 시작
        </button>
      </section>

      <section className="device-product-grid" aria-label="MVP 연동 가전 목록">
        {devices.map((device) => (
          <button
            className={
              selectedDevice.deviceId === device.deviceId
                ? 'device-product-card selected'
                : 'device-product-card'
            }
            key={device.deviceId}
            type="button"
            aria-label={`${device.name} 관리 열기`}
            aria-pressed={selectedDevice.deviceId === device.deviceId}
            onClick={() => {
              setSelectedDeviceId(device.deviceId)
              setConnectionMessage('')
            }}
          >
            <DeviceIcon type={device.type} />
            <span className={`connection-dot connection-${device.connectionStatus.toLowerCase()}`} />
            <strong>{device.name}</strong>
            <small>{connectionLabels[device.connectionStatus] || device.connectionStatus}</small>
          </button>
        ))}
      </section>

      {selectedDevice ? (
        <section className="content-card device-manager-card" aria-label={`${selectedDevice.name} 관리`}>
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
            <button className="secondary-button compact-button" type="button" onClick={handleRefreshSelectedDevice}>
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
    </section>
  )
}

function DeviceIcon({ type }) {
  return (
    <span className={`appliance-icon appliance-${type.toLowerCase().replace('_', '-')}`} aria-hidden="true">
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
