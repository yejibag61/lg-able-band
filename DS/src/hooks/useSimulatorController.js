import { useEffect, useMemo, useRef, useState } from 'react'
import { APPLIANCES, APPLIANCE_EVENT_MAP } from '../constants/applianceEvents'
import { sendSimulatorEvent } from '../api/notificationApi'

const initialStates = {
  washingMachine: { power: '꺼짐', status: '대기', mode: '표준', doorOpen: false, running: false, completed: false, error: false, drumRotation: 0 },
  airQualitySensor: { power: '켜짐', status: '정상', mode: '센서 모니터링', co2: 650, temperature: 24, humidity: 45, fineDust: 15 },
  tv: { power: '꺼짐', status: '대기', mode: 'HDMI 1', on: false, volume: 12, channel: 7, remotePulse: false },
  electricRange: { power: '꺼짐', status: '대기', mode: '표준 화력', on: false, overheating: false, residual: false, glowColor: '#5f6570' },
  doorSensor: { power: '켜짐', status: '잠김', mode: '일반', open: false, warning: false, elapsed: 0 },
  refrigerator: { power: '켜짐', status: '정상 냉장', mode: '일반 냉장', doorOpen: false, temperature: 3, temperatureWarning: false, highlightShelf: 0 },
}

export function useSimulatorController(selectedApplianceId, targetUserId) {
  const [stateMap, setStateMap] = useState(initialStates)
  const [latestEvent, setLatestEvent] = useState('')
  const [notificationResult, setNotificationResult] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const timersRef = useRef([])

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
  }, [])

  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current = []
    setBusyAction('')
  }, [selectedApplianceId])

  const currentState = stateMap[selectedApplianceId]
  const applianceMeta = APPLIANCES.find((item) => item.id === selectedApplianceId)

  const statusView = useMemo(() => {
    switch (selectedApplianceId) {
      case 'washingMachine':
        return {
          applianceName: '세탁기',
          powerState: currentState.power,
          operatingState: currentState.status,
          modeLabel: currentState.mode,
          statusLines: ['드럼 회전, 도어 상태, 완료 알림을 시연할 수 있어요.'],
        }
      case 'airQualitySensor':
        return {
          applianceName: 'LG 공기질 센서',
          powerState: currentState.power,
          operatingState: currentState.status,
          modeLabel: `${currentState.co2} ppm`,
          statusLines: [`온도 ${currentState.temperature}°C`, `습도 ${currentState.humidity}%`, `미세먼지 ${currentState.fineDust} μg/m³`],
        }
      case 'tv':
        return {
          applianceName: 'TV',
          powerState: currentState.power,
          operatingState: currentState.status,
          modeLabel: `${currentState.mode}`,
          statusLines: [`채널 ${currentState.channel}`, `볼륨 ${currentState.volume}`],
        }
      case 'electricRange':
        return {
          applianceName: '전기레인지',
          powerState: currentState.power,
          operatingState: currentState.status,
          modeLabel: currentState.mode,
          statusLines: [currentState.residual ? '잔열 상태가 유지되고 있어요.' : '안전한 열 상태를 시연할 수 있어요.'],
        }
      case 'doorSensor':
        return {
          applianceName: '도어 센서',
          powerState: currentState.power,
          operatingState: currentState.status,
          modeLabel: currentState.mode,
          statusLines: [currentState.open ? `열린 시간 ${currentState.elapsed}초` : '문이 닫혀 있어요.'],
        }
      case 'refrigerator':
        return {
          applianceName: '냉장고',
          powerState: currentState.power,
          operatingState: currentState.status,
          modeLabel: `${currentState.temperature}°C`,
          statusLines: ['문 열림, 온도 경고, 음식 찾기 시연이 가능합니다.'],
        }
      default:
        return { applianceName: '', powerState: '', operatingState: '', modeLabel: '', statusLines: [] }
    }
  }, [currentState, selectedApplianceId])

  async function dispatchEvent(actionKey) {
    if (!String(targetUserId || '').trim()) {
      setNotificationResult({ type: 'error', message: '대상 사용자 ID를 먼저 입력해주세요.' })
      return false
    }

    const eventMeta = APPLIANCE_EVENT_MAP[selectedApplianceId]?.[actionKey]
    if (!eventMeta || busyAction) {
      return false
    }

    setBusyAction(actionKey)
    setLatestEvent(`${applianceMeta.label} · ${eventMeta.eventType}`)
    setNotificationResult({ type: 'pending', message: '알림을 전송하는 중입니다...' })

    try {
      await sendSimulatorEvent({
        targetUserId: Number(targetUserId),
        applianceType: applianceMeta.applianceType,
        eventType: eventMeta.eventType,
        title: eventMeta.title,
        message: eventMeta.message,
      })
      setNotificationResult({ type: 'success', message: eventMeta.toast })
      return true
    } catch (error) {
      setNotificationResult({ type: 'error', message: error.message || '알림 전송에 실패했습니다.' })
      return false
    } finally {
      setBusyAction('')
    }
  }

  function updateCurrentState(updater) {
    setStateMap((current) => ({
      ...current,
      [selectedApplianceId]:
        typeof updater === 'function' ? updater(current[selectedApplianceId]) : { ...current[selectedApplianceId], ...updater },
    }))
  }

  function registerTimer(callback, delay) {
    const timer = window.setTimeout(callback, delay)
    timersRef.current.push(timer)
    return timer
  }

  const actions = createApplianceActions({
    applianceId: selectedApplianceId,
    state: currentState,
    updateCurrentState,
    dispatchEvent,
    registerTimer,
  })

  return {
    currentState,
    latestEvent,
    notificationResult,
    busyAction,
    statusView,
    actions,
  }
}

function createApplianceActions({ applianceId, state, updateCurrentState, dispatchEvent, registerTimer }) {
  if (applianceId === 'washingMachine') {
    return {
      async startWashing() {
        updateCurrentState((current) => ({ ...current, power: '켜짐', status: '세탁 중', running: true, completed: false, error: false }))
        registerTimer(() => {
          updateCurrentState((current) => ({ ...current, status: '세탁 완료', running: false, completed: true, drumRotation: 0 }))
          void dispatchEvent('START_WASHING')
        }, 5000)
      },
      async changeMode(mode) {
        updateCurrentState((current) => ({ ...current, power: '켜짐', mode, status: '모드 변경됨', error: false }))
        await dispatchEvent('CHANGE_MODE')
      },
      async openDoor() {
        updateCurrentState((current) => ({ ...current, doorOpen: !current.doorOpen, status: '문 열림', running: false }))
        await dispatchEvent('OPEN_DOOR')
      },
      async triggerError() {
        updateCurrentState((current) => ({ ...current, error: true, power: '켜짐', status: '오류 발생', running: false }))
        await dispatchEvent('TRIGGER_ERROR')
      },
    }
  }

  if (applianceId === 'airQualitySensor') {
    return {
      async increaseCo2() {
        updateCurrentState((current) => ({ ...current, co2: 1500, status: '경고', mode: '환기 필요' }))
        await dispatchEvent('HIGH_CO2')
      },
      async updateTemperature(value) {
        updateCurrentState((current) => ({ ...current, temperature: value, status: value >= 31 ? '경고' : '정상' }))
        if (value >= 31 || state.humidity >= 70) {
          await dispatchEvent('TEMP_HUMIDITY_ALERT')
        }
      },
      async updateHumidity(value) {
        updateCurrentState((current) => ({ ...current, humidity: value, status: value >= 70 ? '경고' : '정상' }))
        if (value >= 70 || state.temperature >= 31) {
          await dispatchEvent('TEMP_HUMIDITY_ALERT')
        }
      },
      async increaseFineDust() {
        updateCurrentState((current) => ({ ...current, fineDust: 80, status: '경고', mode: '공기질 악화' }))
        await dispatchEvent('HIGH_FINE_DUST')
      },
    }
  }

  if (applianceId === 'tv') {
    return {
      async togglePower() {
        updateCurrentState((current) => ({ ...current, on: !current.on, power: current.on ? '꺼짐' : '켜짐', status: current.on ? '대기' : '시청 중' }))
        await dispatchEvent('TOGGLE_POWER')
      },
      async changeVolume(delta) {
        updateCurrentState((current) => ({ ...current, on: true, power: '켜짐', status: '볼륨 변경', volume: Math.max(0, Math.min(40, current.volume + delta)) }))
        await dispatchEvent('CHANGE_MEDIA')
      },
      async changeChannel(delta) {
        updateCurrentState((current) => ({ ...current, on: true, power: '켜짐', status: '채널 변경', channel: Math.max(1, current.channel + delta) }))
        await dispatchEvent('CHANGE_MEDIA')
      },
      async findRemote() {
        updateCurrentState((current) => ({ ...current, remotePulse: true, status: '리모컨 위치 안내' }))
        registerTimer(() => updateCurrentState((current) => ({ ...current, remotePulse: false, status: '대기' })), 2200)
        await dispatchEvent('FIND_REMOTE')
      },
    }
  }

  if (applianceId === 'electricRange') {
    return {
      async powerOn() {
        updateCurrentState((current) => ({ ...current, on: true, power: '켜짐', status: '가열 중', glowColor: '#ff5b43', residual: false, overheating: false }))
        await dispatchEvent('POWER_ON')
      },
      async startCooking() {
        updateCurrentState((current) => ({ ...current, on: true, power: '켜짐', status: '조리 중', glowColor: '#ff6546', residual: false }))
        registerTimer(() => {
          updateCurrentState((current) => ({ ...current, status: '조리 완료', on: false, power: '꺼짐', residual: true, glowColor: '#e78d5c' }))
          void dispatchEvent('START_COOKING')
        }, 5000)
      },
      async triggerOverheating() {
        updateCurrentState((current) => ({ ...current, on: true, power: '켜짐', status: '과열 경고', overheating: true, glowColor: '#ff2f2f' }))
        await dispatchEvent('OVERHEAT')
      },
      turnOff() {
        updateCurrentState((current) => ({ ...current, on: false, power: '꺼짐', status: '잔열 주의', residual: true, overheating: false, glowColor: '#e78d5c' }))
      },
    }
  }

  if (applianceId === 'doorSensor') {
    return {
      async openDoor() {
        updateCurrentState((current) => ({ ...current, open: !current.open, status: '문 열림', warning: false, elapsed: 0 }))
        await dispatchEvent('OPEN_DOOR')
        registerTimer(() => {
          updateCurrentState((current) => ({ ...current, warning: true, status: '장시간 열림 경고', elapsed: 5 }))
          void dispatchEvent('LEFT_OPEN')
        }, 5000)
      },
      async awayMode() {
        updateCurrentState((current) => ({ ...current, mode: '외출 모드', warning: current.open, status: current.open ? '문 확인 필요' : '외출 준비 완료' }))
        if (state.open) {
          await dispatchEvent('CHECK_DOOR')
        }
      },
      async sleepMode() {
        updateCurrentState((current) => ({ ...current, mode: '취침 모드', warning: current.open, status: current.open ? '문 확인 필요' : '취침 준비 완료' }))
        if (state.open) {
          await dispatchEvent('CHECK_DOOR')
        }
      },
    }
  }

  return {
    async openDoor() {
      updateCurrentState((current) => ({ ...current, doorOpen: !current.doorOpen, status: '문 열림', highlightShelf: 0 }))
      await dispatchEvent('OPEN_DOOR')
      registerTimer(() => {
        updateCurrentState((current) => ({ ...current, temperature: 9, temperatureWarning: true, status: '온도 경고' }))
        void dispatchEvent('TEMPERATURE_ALERT')
      }, 5000)
    },
    async findItem(item) {
      const shelfMap = { 우유: 0.9, 달걀: 0.2, 물: -0.45, 채소: -1.05 }
      updateCurrentState((current) => ({ ...current, doorOpen: true, highlightShelf: shelfMap[item] || 0.4, status: `${item} 위치 안내` }))
      await dispatchEvent('FIND_ITEM')
    },
  }
}
