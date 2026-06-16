import { useCallback, useEffect, useRef, useState } from 'react'

const DEVICE_NAME_PREFIX = 'ABLE-ESP'
const PROXIMITY_SERVICE_UUID = '7a8b9c0d-1111-2222-3333-1234567890ab'
const INFO_CHARACTERISTIC_UUID = '7a8b9c0d-1111-2222-3333-1234567890ac'
const LAST_DEVICE_ID_STORAGE_KEY = 'able-band.ble.lastDeviceId'
const LAST_DEVICE_NAME_STORAGE_KEY = 'able-band.ble.lastDeviceName'
const MAX_SAMPLES = 3
const textDecoder = new TextDecoder()

const initialGuideState = {
  status: 'idle',
  targetName: '',
  deviceLabel: DEVICE_NAME_PREFIX,
  distanceM: null,
  distanceText: '--.-',
  helperText: '위치 안내를 시작하면 실시간 거리 표시가 나타납니다.',
  statusLabel: '연결 대기',
  statusTitle: '',
  errorMessage: '',
}

export function useBleProximityGuide() {
  const [guideState, setGuideState] = useState(initialGuideState)
  const deviceRef = useRef(null)
  const characteristicRef = useRef(null)
  const targetNameRef = useRef('')
  const samplesRef = useRef([])
  const previousDistanceRef = useRef(null)

  const resetMeasurements = useCallback(() => {
    samplesRef.current = []
    previousDistanceRef.current = null
  }, [])

  const handleDisconnected = useCallback(() => {
    characteristicRef.current = null
    deviceRef.current = null
    resetMeasurements()

    setGuideState((current) => ({
      ...current,
      status: 'idle',
      distanceM: null,
      distanceText: '--.-',
      helperText: '연결이 종료되었습니다. 위치 안내를 다시 시작해 주세요.',
      statusLabel: '연결 종료',
      statusTitle: '',
      errorMessage: '',
    }))
  }, [resetMeasurements])

  const handlePayloadText = useCallback((text) => {
    try {
      const payload = JSON.parse(text)
      const targetName = targetNameRef.current || '가전'
      const rssi = typeof payload.rssi === 'number' ? payload.rssi : null

      if (rssi == null && typeof payload.distanceM !== 'number') {
        setGuideState((current) => ({
          ...current,
          status: 'active',
          deviceLabel: payload.deviceName || current.deviceLabel,
          helperText: `${targetName} 쪽 신호 연결을 준비하고 있어요.`,
          statusLabel: '측정 준비',
          statusTitle: '',
          errorMessage: '',
        }))
        return
      }

      const rawDistanceM =
        typeof payload.distanceM === 'number'
          ? payload.distanceM
          : estimateDistanceM(rssi, payload.txPowerAt1m ?? -59, 2.2)
      const distanceM = smoothDistance(samplesRef, rawDistanceM)
      const trend = estimateTrend(previousDistanceRef.current, distanceM)
      previousDistanceRef.current = distanceM

      const helperText = buildGuideMessage(distanceM, trend, targetName)
      maybeQueueVoiceGuide(helperText)

      setGuideState((current) => ({
        ...current,
        status: 'active',
        deviceLabel: payload.deviceName || current.deviceLabel,
        distanceM,
        distanceText: distanceM.toFixed(1),
        helperText,
        statusLabel: classifyDistance(distanceM),
        statusTitle: '',
        errorMessage: '',
      }))
    } catch (error) {
      setGuideState((current) => ({
        ...current,
        status: 'error',
        helperText: '거리 정보를 읽지 못했습니다. 다시 시도해 주세요.',
        statusLabel: '오류',
        statusTitle: '안내를 이어가지 못했어요',
        errorMessage: error.message,
      }))
    }
  }, [])

  const handleNotification = useCallback(
    (event) => {
      handlePayloadText(textDecoder.decode(event.target.value.buffer))
    },
    [handlePayloadText],
  )

  const stopGuide = useCallback(async () => {
    if (characteristicRef.current) {
      try {
        characteristicRef.current.removeEventListener('characteristicvaluechanged', handleNotification)
        await characteristicRef.current.stopNotifications()
      } catch {
        // ignore notification cleanup errors
      }
    }

    if (deviceRef.current) {
      cleanupDeviceListeners(deviceRef.current, handleDisconnected)

      try {
        if (deviceRef.current.gatt?.connected) {
          deviceRef.current.gatt.disconnect()
        }
      } catch {
        // ignore disconnect errors
      }
    }

    characteristicRef.current = null
    deviceRef.current = null
    resetMeasurements()

    setGuideState((current) => ({
      ...initialGuideState,
      targetName: current.targetName,
      helperText: current.targetName
        ? `${current.targetName} 위치 안내를 종료했습니다.`
        : initialGuideState.helperText,
    }))
  }, [handleDisconnected, handleNotification, resetMeasurements])

  useEffect(() => {
    return () => {
      stopGuide().catch(() => null)
    }
  }, [stopGuide])

  const startGuide = useCallback(
    async (targetName) => {
      targetNameRef.current = targetName || '가전'
      resetMeasurements()

      if (!navigator.bluetooth) {
        setGuideState({
          ...initialGuideState,
          status: 'error',
          targetName: targetNameRef.current,
          helperText: '이 브라우저에서는 블루투스 연결을 사용할 수 없습니다.',
          statusLabel: '지원 안 됨',
          statusTitle: '블루투스를 사용할 수 없어요',
          errorMessage: 'Web Bluetooth unsupported',
        })
        return
      }

      setGuideState((current) => ({
        ...current,
        status: 'selecting',
        targetName: targetNameRef.current,
        distanceM: null,
        distanceText: '--.-',
        helperText: `${targetNameRef.current} 위치 안내를 준비하고 있어요.`,
        statusLabel: '기기 확인 중',
        statusTitle: 'ESP 기기를 찾는 중이에요',
        errorMessage: '',
      }))

      try {
        const selectedDevice = await resolvePreferredDevice(setGuideState, targetNameRef.current)

        if (!selectedDevice) {
          throw new Error('기기 선택이 취소되었습니다.')
        }

        if (deviceRef.current && deviceRef.current !== selectedDevice) {
          cleanupDeviceListeners(deviceRef.current, handleDisconnected)
        }

        deviceRef.current = selectedDevice
        deviceRef.current.addEventListener('gattserverdisconnected', handleDisconnected)
        rememberDevice(deviceRef.current)

        setGuideState((current) => ({
          ...current,
          status: 'connecting',
          deviceLabel: deviceRef.current.name || DEVICE_NAME_PREFIX,
          helperText: `${targetNameRef.current} 위치를 찾기 위해 ${deviceRef.current.name || DEVICE_NAME_PREFIX}에 연결하는 중이에요.`,
          statusLabel: '연결 중',
          statusTitle: 'ESP 기기에 연결하는 중이에요',
        }))

        const server = await connectGattWithFallback(deviceRef.current)
        const service = await server.getPrimaryService(PROXIMITY_SERVICE_UUID)
        const characteristic = await service.getCharacteristic(INFO_CHARACTERISTIC_UUID)

        characteristicRef.current = characteristic
        characteristic.addEventListener('characteristicvaluechanged', handleNotification)
        await characteristic.startNotifications()

        const initialValue = await characteristic.readValue()
        handlePayloadText(textDecoder.decode(initialValue.buffer))

        setGuideState((current) => ({
          ...current,
          status: 'active',
          targetName: targetNameRef.current,
          deviceLabel: deviceRef.current?.name || DEVICE_NAME_PREFIX,
          helperText:
            current.distanceM == null
              ? `${targetNameRef.current} 방향의 신호를 기다리고 있어요.`
              : current.helperText,
          statusLabel: current.distanceM == null ? '측정 준비' : current.statusLabel,
          statusTitle: '',
          errorMessage: '',
        }))
      } catch (error) {
        await stopGuide()
        setGuideState({
          ...initialGuideState,
          status: 'error',
          targetName: targetNameRef.current,
          helperText:
            error.message === '기기 선택이 취소되었습니다.'
              ? '기기 선택이 취소되었습니다. 다시 눌러서 선택해 주세요.'
              : '블루투스 연결에 실패했습니다. 다시 시도해 주세요.',
          statusLabel: '연결 실패',
          statusTitle: '위치 안내를 시작하지 못했어요',
          errorMessage: error.message,
        })
      }
    },
    [handleDisconnected, handleNotification, handlePayloadText, resetMeasurements, stopGuide],
  )

  return {
    ...guideState,
    isActive: guideState.status === 'active',
    isConnecting: ['selecting', 'connecting'].includes(guideState.status),
    isShowingOverlay: ['selecting', 'connecting'].includes(guideState.status),
    bleDevicePrefix: DEVICE_NAME_PREFIX,
    startGuide,
    stopGuide,
  }
}

async function resolvePreferredDevice(setGuideState, targetName) {
  const permittedDevices = await getPermittedDevices()
  const rememberedDeviceId = getRememberedDeviceId()

  const rememberedDevice =
    permittedDevices.find((device) => device.id === rememberedDeviceId) || null
  if (rememberedDevice) {
    setGuideState((current) => ({
      ...current,
      deviceLabel: rememberedDevice.name || DEVICE_NAME_PREFIX,
      helperText: `${targetName} 위치 안내를 위해 최근 연결한 기기에 다시 연결하고 있어요.`,
      statusLabel: '최근 기기 확인',
      statusTitle: '최근 연결 기기에 다시 연결하는 중이에요',
    }))
    return rememberedDevice
  }

  if (permittedDevices.length > 0) {
    const recentNamedDevice = sortRememberedDevicesFirst(permittedDevices)[0]
    setGuideState((current) => ({
      ...current,
      deviceLabel: recentNamedDevice.name || DEVICE_NAME_PREFIX,
      helperText: `${targetName} 위치 안내를 위해 이전에 허용한 기기를 확인하고 있어요.`,
      statusLabel: '허용 기기 확인',
      statusTitle: '이전에 허용된 기기에 연결하는 중이에요',
    }))
    return recentNamedDevice
  }

  setGuideState((current) => ({
    ...current,
    helperText: `${targetName} 위치 안내를 위해 기기 선택창이 열립니다. ABLE-ESP를 선택해 주세요.`,
    statusLabel: '기기 선택 필요',
    statusTitle: '기기 선택을 기다리는 중이에요',
  }))

  return navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: DEVICE_NAME_PREFIX }],
    optionalServices: [PROXIMITY_SERVICE_UUID],
  })
}

async function getPermittedDevices() {
  if (typeof navigator.bluetooth.getDevices !== 'function') {
    return []
  }

  const devices = await navigator.bluetooth.getDevices()
  return devices.filter((device) => (device.name || '').startsWith(DEVICE_NAME_PREFIX))
}

function sortRememberedDevicesFirst(devices) {
  const rememberedName = getRememberedDeviceName()

  return [...devices].sort((left, right) => {
    const leftScore = left.name === rememberedName ? 0 : 1
    const rightScore = right.name === rememberedName ? 0 : 1
    return leftScore - rightScore
  })
}

async function connectGattWithFallback(primaryDevice) {
  try {
    return await connectGattWithRetry(primaryDevice)
  } catch (firstError) {
    const fallbackDevice = await findFallbackDevice(primaryDevice)
    if (!fallbackDevice) {
      throw firstError
    }

    rememberDevice(fallbackDevice)
    return connectGattWithRetry(fallbackDevice)
  }
}

async function findFallbackDevice(primaryDevice) {
  const devices = await getPermittedDevices()
  return devices.find((device) => device.id !== primaryDevice.id) || null
}

function rememberDevice(device) {
  try {
    if (device?.id) {
      window.localStorage.setItem(LAST_DEVICE_ID_STORAGE_KEY, device.id)
    }

    if (device?.name) {
      window.localStorage.setItem(LAST_DEVICE_NAME_STORAGE_KEY, device.name)
    }
  } catch {
    // ignore storage errors
  }
}

function getRememberedDeviceId() {
  try {
    return window.localStorage.getItem(LAST_DEVICE_ID_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function getRememberedDeviceName() {
  try {
    return window.localStorage.getItem(LAST_DEVICE_NAME_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function cleanupDeviceListeners(device, handleDisconnected) {
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
        device.gatt.disconnect()
        await delay(400)
      }

      return await device.gatt.connect()
    } catch (error) {
      lastError = error

      try {
        if (device.gatt?.connected) {
          device.gatt.disconnect()
        }
      } catch {
        // ignore cleanup errors
      }

      if (attempt < maxAttempts) {
        await delay(800)
      }
    }
  }

  throw lastError ?? new Error('connection attempt failed')
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function estimateDistanceM(rssi, txPowerAt1m, pathLossExponent) {
  if (typeof rssi !== 'number') {
    return Infinity
  }

  return Math.pow(10, (txPowerAt1m - rssi) / (10 * pathLossExponent))
}

function smoothDistance(samplesRef, nextDistanceM) {
  samplesRef.current.push(nextDistanceM)
  if (samplesRef.current.length > MAX_SAMPLES) {
    samplesRef.current.shift()
  }

  const totalWeight = samplesRef.current.reduce((sum, _value, index) => sum + index + 1, 0)
  const weightedTotal = samplesRef.current.reduce(
    (sum, value, index) => sum + value * (index + 1),
    0,
  )

  return weightedTotal / totalWeight
}

function estimateTrend(previousDistanceM, currentDistanceM) {
  if (previousDistanceM == null) {
    return 'steady'
  }

  const delta = currentDistanceM - previousDistanceM

  if (delta <= -0.2) {
    return 'approaching'
  }

  if (delta >= 0.2) {
    return 'moving_away'
  }

  return 'steady'
}

function classifyDistance(distanceM) {
  if (distanceM <= 1.0) {
    return '바로 근처'
  }

  if (distanceM <= 3.0) {
    return '가까운 거리'
  }

  if (distanceM <= 6.0) {
    return '중간 거리'
  }

  return '먼 거리'
}

function buildGuideMessage(distanceM, trend, targetName) {
  const rounded = distanceM.toFixed(1)

  if (distanceM <= 1.0) {
    return `${targetName} 쪽 신호가 바로 근처에 있어요. 약 ${rounded}미터예요.`
  }

  if (trend === 'approaching') {
    return `${targetName} 쪽으로 가까워지고 있어요. 약 ${rounded}미터예요.`
  }

  if (trend === 'moving_away') {
    return `${targetName} 쪽 신호가 멀어지고 있어요. 약 ${rounded}미터예요.`
  }

  return `${targetName}까지 약 ${rounded}미터예요.`
}

function maybeQueueVoiceGuide(message) {
  void message
  // const utterance = new SpeechSynthesisUtterance(message)
  // utterance.lang = 'ko-KR'
  // window.speechSynthesis.cancel()
  // window.speechSynthesis.speak(utterance)
}
