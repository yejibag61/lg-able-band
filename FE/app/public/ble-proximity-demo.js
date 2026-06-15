const elements = {
  connectButton: document.querySelector('#connectButton'),
  disconnectButton: document.querySelector('#disconnectButton'),
  namePrefix: document.querySelector('#namePrefix'),
  txPowerAt1m: document.querySelector('#txPowerAt1m'),
  pathLossExponent: document.querySelector('#pathLossExponent'),
  connectionState: document.querySelector('#connectionState'),
  distanceText: document.querySelector('#distanceText'),
  messageText: document.querySelector('#messageText'),
  deviceNameText: document.querySelector('#deviceNameText'),
  rssiText: document.querySelector('#rssiText'),
  trendText: document.querySelector('#trendText'),
  directionText: document.querySelector('#directionText'),
  supportText: document.querySelector('#supportText'),
  log: document.querySelector('#log'),
}

const state = {
  device: null,
  infoCharacteristic: null,
  samples: [],
  previousDistanceM: null,
  lastSpokenMessage: '',
  lastVibrationAt: 0,
}

const PROXIMITY_SERVICE_UUID = '7a8b9c0d-1111-2222-3333-1234567890ab'
const INFO_CHARACTERISTIC_UUID = '7a8b9c0d-1111-2222-3333-1234567890ac'
const MAX_SAMPLES = 5
const textDecoder = new TextDecoder()

window.addEventListener('error', (event) => {
  const message = event?.error?.message || event.message || '알 수 없는 오류'
  safeAppendLog(`전역 오류: ${message}`)
})

window.addEventListener('unhandledrejection', (event) => {
  const message = event?.reason?.message || String(event.reason || '알 수 없는 거부')
  safeAppendLog(`비동기 오류: ${message}`)
})

validateElements()
init()

function validateElements() {
  const missingIds = Object.entries(elements)
    .filter(([, element]) => !element)
    .map(([key]) => key)

  if (missingIds.length > 0) {
    throw new Error(`BLE 데모 화면 요소를 찾지 못했습니다: ${missingIds.join(', ')}`)
  }
}

async function init() {
  const hasBluetooth = 'bluetooth' in navigator
  const hasSpeech = 'speechSynthesis' in window

  if (!hasBluetooth) {
    setSupportText('이 브라우저는 Web Bluetooth를 지원하지 않습니다. 안드로이드 크롬에서 테스트해 주세요.')
    elements.connectButton.disabled = true
    return
  }

  try {
    const available = await navigator.bluetooth.getAvailability()
    setSupportText(
      available
        ? `Web Bluetooth 사용 가능${hasSpeech ? ' / 음성 안내 가능' : ''} / 블루투스 설정 앱에서 직접 연결하지 마세요.`
        : '블루투스를 사용할 수 없습니다. 휴대폰 블루투스를 켜 주세요.',
    )
    elements.connectButton.disabled = !available
  } catch (error) {
    setSupportText(`지원 상태 확인 중 오류가 발생했습니다: ${error.message}`)
    elements.connectButton.disabled = true
  }

  elements.connectButton.addEventListener('click', handleConnect)
  elements.disconnectButton.addEventListener('click', handleDisconnect)
}

async function handleConnect() {
  try {
    const namePrefix = elements.namePrefix.value.trim() || 'ABLE-ESP32'
    appendLog(`기기 선택창을 엽니다. prefix=${namePrefix}`)

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix }],
      optionalServices: [PROXIMITY_SERVICE_UUID],
    })

    if (state.device && state.device !== device) {
      cleanupDeviceListeners(state.device)
    }

    state.device = device
    state.samples = []
    state.previousDistanceM = null
    state.lastSpokenMessage = ''
    elements.deviceNameText.textContent = device.name || '이름 없음'
    device.addEventListener('gattserverdisconnected', handleDisconnected)

    setConnectionState('연결 중')
    appendLog(`선택된 기기: ${device.name || device.id}`)

    const server = await connectGattWithRetry(device)
    const service = await server.getPrimaryService(PROXIMITY_SERVICE_UUID)
    const characteristic = await service.getCharacteristic(INFO_CHARACTERISTIC_UUID)

    state.infoCharacteristic = characteristic
    characteristic.addEventListener('characteristicvaluechanged', handleNotification)
    await characteristic.startNotifications()

    const initialValue = await characteristic.readValue()
    handlePayloadText(textDecoder.decode(initialValue.buffer), true)

    setConnectionState('연결 완료')
    appendLog('GATT 알림 수신을 시작했습니다.')
    setSupportText('광고 감시 없이 ESP32 notify로 거리 상태를 받는 중입니다.')
    elements.disconnectButton.disabled = false
  } catch (error) {
    await resetConnectionState()
    appendLog(`연결 실패: ${error.message}`)
    setConnectionState('연결 실패')
  }
}

function handleNotification(event) {
  const value = event.target.value
  handlePayloadText(textDecoder.decode(value.buffer), false)
}

function handlePayloadText(text, isInitialRead) {
  try {
    const payload = JSON.parse(text)
    updateFromPayload(payload, isInitialRead)
  } catch (error) {
    appendLog(`JSON 파싱 실패: ${error.message}`)
  }
}

function updateFromPayload(payload, isInitialRead) {
  const rssi = typeof payload.rssi === 'number' ? payload.rssi : null
  const txPowerAt1m = parseNumber(elements.txPowerAt1m.value, payload.txPowerAt1m ?? -59)
  const pathLossExponent = parseNumber(elements.pathLossExponent.value, 2.2)
  const smoothedDistanceM =
    typeof payload.distanceM === 'number'
      ? smoothDistance(payload.distanceM)
      : smoothDistance(estimateDistanceM(rssi, txPowerAt1m, pathLossExponent))

  elements.deviceNameText.textContent = payload.deviceName || state.device?.name || '-'
  elements.directionText.textContent = '미지원'

  if (rssi == null) {
    elements.rssiText.textContent = '-'
    elements.distanceText.textContent = '-- m'
    elements.trendText.textContent = '대기 중'
    elements.messageText.textContent = '휴대폰과 ESP32가 연결되면 측정이 시작됩니다.'
    setConnectionState(payload.connected ? '측정 준비' : '연결 대기')

    if (isInitialRead) {
      appendLog('초기 상태를 읽었습니다. 아직 RSSI 측정값은 없습니다.')
    }
    return
  }

  const trend = estimateTrend(state.previousDistanceM, smoothedDistanceM)
  const message = buildGuidanceMessage(smoothedDistanceM, trend)

  state.previousDistanceM = smoothedDistanceM

  elements.rssiText.textContent = `${rssi} dBm`
  elements.distanceText.textContent = `${smoothedDistanceM.toFixed(1)} m`
  elements.trendText.textContent = trend.label
  elements.messageText.textContent = message
  setConnectionState(classifyDistance(smoothedDistanceM).label)

  appendLog(
    `${isInitialRead ? '초기 읽기' : '알림 수신'}: RSSI=${rssi} dBm / distance=${smoothedDistanceM.toFixed(2)}m / trend=${trend.code}`,
  )
  maybeSpeak(message)
  maybeVibrate(smoothedDistanceM)
}

async function handleDisconnect() {
  await resetConnectionState()
  elements.disconnectButton.disabled = true
  setConnectionState('대기 중')
  elements.messageText.textContent = '연결을 다시 시작하면 가까워지는 상태를 보여줍니다.'
  elements.distanceText.textContent = '-- m'
  elements.rssiText.textContent = '-'
  elements.trendText.textContent = '-'
  appendLog('연결을 해제했습니다.')
}

async function resetConnectionState() {
  if (state.infoCharacteristic) {
    try {
      state.infoCharacteristic.removeEventListener('characteristicvaluechanged', handleNotification)
      await state.infoCharacteristic.stopNotifications()
    } catch (error) {
      appendLog(`알림 중지 생략: ${error.message}`)
    }
  }

  if (state.device?.gatt?.connected) {
    state.device.gatt.disconnect()
  }

  cleanupDeviceListeners(state.device)
  state.device = null
  state.infoCharacteristic = null
  state.samples = []
  state.previousDistanceM = null
  state.lastSpokenMessage = ''
}

function handleDisconnected() {
  appendLog('기기 연결이 종료되었습니다.')
  state.infoCharacteristic = null
  elements.disconnectButton.disabled = true
  setConnectionState('연결 종료')
}

function cleanupDeviceListeners(device) {
  if (!device) {
    return
  }

  device.removeEventListener('gattserverdisconnected', handleDisconnected)
}

async function connectGattWithRetry(device) {
  const maxAttempts = 3
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (device.gatt?.connected) {
        appendLog('기존 GATT 연결을 정리합니다.')
        device.gatt.disconnect()
        await delay(500)
      }

      appendLog(`GATT 연결 시도 ${attempt}/${maxAttempts}`)
      return await device.gatt.connect()
    } catch (error) {
      lastError = error
      appendLog(`GATT 연결 재시도 예정: ${error.message}`)

      try {
        if (device.gatt?.connected) {
          device.gatt.disconnect()
        }
      } catch {
        // ignore cleanup errors
      }

      if (attempt < maxAttempts) {
        await delay(900)
      }
    }
  }

  throw lastError ?? new Error('connection attempt failed')
}

function estimateDistanceM(rssi, txPowerAt1m, pathLossExponent) {
  if (typeof rssi !== 'number') {
    return Infinity
  }

  return Math.pow(10, (txPowerAt1m - rssi) / (10 * pathLossExponent))
}

function smoothDistance(nextDistanceM) {
  state.samples.push(nextDistanceM)
  if (state.samples.length > MAX_SAMPLES) {
    state.samples.shift()
  }

  const total = state.samples.reduce((sum, value) => sum + value, 0)
  return total / state.samples.length
}

function estimateTrend(previousDistanceM, currentDistanceM) {
  if (previousDistanceM == null) {
    return { code: 'steady', label: '측정 시작' }
  }

  const delta = currentDistanceM - previousDistanceM

  if (delta <= -0.35) {
    return { code: 'approaching', label: '가까워짐' }
  }

  if (delta >= 0.35) {
    return { code: 'moving_away', label: '멀어짐' }
  }

  return { code: 'steady', label: '유지 중' }
}

function classifyDistance(distanceM) {
  if (distanceM <= 1.0) {
    return { code: 'very_near', label: '거의 옆' }
  }

  if (distanceM <= 3.0) {
    return { code: 'near', label: '가까운 거리' }
  }

  if (distanceM <= 6.0) {
    return { code: 'mid', label: '중간 거리' }
  }

  return { code: 'far', label: '먼 거리' }
}

function buildGuidanceMessage(distanceM, trend) {
  const rounded = distanceM.toFixed(1)

  if (distanceM <= 1.0) {
    return `보드가 바로 근처에 있습니다. 약 ${rounded}미터입니다.`
  }

  if (trend.code === 'approaching') {
    return `보드가 가까워지고 있습니다. 약 ${rounded}미터입니다.`
  }

  if (trend.code === 'moving_away') {
    return `보드에서 멀어지고 있습니다. 약 ${rounded}미터입니다.`
  }

  return `보드까지 약 ${rounded}미터입니다.`
}

function maybeSpeak(message) {
  if (!('speechSynthesis' in window)) {
    return
  }

  if (message === state.lastSpokenMessage) {
    return
  }

  state.lastSpokenMessage = message
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(message)
  utterance.lang = 'ko-KR'
  utterance.rate = 1
  window.speechSynthesis.speak(utterance)
}

function maybeVibrate(distanceM) {
  if (!('vibrate' in navigator)) {
    return
  }

  const now = Date.now()
  if (now - state.lastVibrationAt < 1400) {
    return
  }

  state.lastVibrationAt = now

  if (distanceM <= 1.0) {
    navigator.vibrate([220, 120, 220])
    return
  }

  if (distanceM <= 3.0) {
    navigator.vibrate([120, 80, 120])
  }
}

function parseNumber(rawValue, fallback) {
  const value = Number(rawValue)
  return Number.isFinite(value) ? value : fallback
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function setConnectionState(text) {
  if (elements.connectionState) {
    elements.connectionState.textContent = text
  }
}

function setSupportText(text) {
  if (elements.supportText) {
    elements.supportText.textContent = text
  }
}

function appendLog(text) {
  const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false })
  elements.log.textContent = `[${timestamp}] ${text}\n${elements.log.textContent}`.trim()
}

function safeAppendLog(text) {
  if (!elements.log) {
    return
  }

  appendLog(text)
}
