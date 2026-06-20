import * as actions from './voiceActionExecutor'

export const VOICE_INTENTS = {
  ADD_DEVICE: 'ADD_DEVICE',
  DELETE_DEVICE: 'DELETE_DEVICE',
  UPDATE_DEVICE_SETTING: 'UPDATE_DEVICE_SETTING',
  LIST_DEVICES: 'LIST_DEVICES',
  START_UWB_GUIDE: 'START_UWB_GUIDE',
  STOP_UWB_GUIDE: 'STOP_UWB_GUIDE',
  CONNECT_GUARDIAN: 'CONNECT_GUARDIAN',
  DELETE_GUARDIAN: 'DELETE_GUARDIAN',
  CONNECT_WEARABLE: 'CONNECT_WEARABLE',
  CHECK_WEARABLE_STATUS: 'CHECK_WEARABLE_STATUS',
  READ_ALERTS: 'READ_ALERTS',
  LIST_ALERTS: 'LIST_ALERTS',
  READ_ALERT_DETAIL: 'READ_ALERT_DETAIL',
  CONFIRM_ALERT: 'CONFIRM_ALERT',
  CONFIRM_ALERTS_BY_FILTER: 'CONFIRM_ALERTS_BY_FILTER',
  DELETE_ALERT: 'DELETE_ALERT',
  DELETE_ALERTS_BY_FILTER: 'DELETE_ALERTS_BY_FILTER',
  FILTER_ALERTS: 'FILTER_ALERTS',
  SET_NOTIFICATION_SOUND: 'SET_NOTIFICATION_SOUND',
  SET_VIBRATION_PATTERN: 'SET_VIBRATION_PATTERN',
  SET_LIFE_SIGNAL: 'SET_LIFE_SIGNAL',
  SEND_SOS: 'SEND_SOS',
  CHECK_EVENT_HISTORY: 'CHECK_EVENT_HISTORY',
  REMOTE_CONTROL_DEVICE: 'REMOTE_CONTROL_DEVICE',
  NAVIGATE_SCREEN: 'NAVIGATE_SCREEN',
  HELP: 'HELP',
  CANCEL: 'CANCEL',
  REPEAT: 'REPEAT',
  GO_BACK: 'GO_BACK',
  GO_HOME: 'GO_HOME',
}

export async function handleStructuredVoiceCommand({ currentTask, text, context }) {
  const controlIntent = classifyControlIntent(text)
  if (controlIntent) {
    return handleControlIntent(controlIntent, currentTask)
  }

  if (currentTask) {
    return continueTask(currentTask, text, context)
  }

  const intent = classifyIntent(text)
  if (!intent) {
    return { handled: false }
  }

  return startTask(intent, text, context)
}

function handleControlIntent(intent, currentTask) {
  if (intent === VOICE_INTENTS.CANCEL) {
    return {
      handled: true,
      nextTask: null,
      responseText: currentTask ? '현재 작업을 취소했습니다. 무엇을 도와드릴까요?' : '취소할 작업이 없습니다. 무엇을 도와드릴까요?',
    }
  }

  if (intent === VOICE_INTENTS.REPEAT) {
    return {
      handled: true,
      nextTask: currentTask,
      responseText: currentTask?.lastPrompt || '다시 들려드릴 이전 안내가 없습니다. 무엇을 도와드릴까요?',
    }
  }

  if (intent === VOICE_INTENTS.GO_BACK) {
    const previous = currentTask?.history?.at(-1)
    if (!previous) {
      return { handled: true, nextTask: currentTask || null, responseText: '이전 단계가 없습니다.' }
    }
    return { handled: true, nextTask: previous, responseText: previous.lastPrompt || '이전 단계로 돌아왔습니다.' }
  }

  if (intent === VOICE_INTENTS.GO_HOME) {
    return {
      handled: true,
      nextTask: null,
      action: { type: 'NAVIGATE_SCREEN', screenName: 'home' },
      responseText: '홈으로 이동했습니다. 무엇을 도와드릴까요?',
    }
  }

  return { handled: false }
}

async function startTask(intent, text, context) {
  const task = createTask(intent)
  return continueTask(task, text, context, { firstTurn: true })
}

async function continueTask(task, text, context, options = {}) {
  const normalized = normalize(text)
  const nextTask = pushHistory(task)

  switch (task.currentIntent) {
    case VOICE_INTENTS.ADD_DEVICE:
      return continueAddDevice(nextTask, text, context, options)
    case VOICE_INTENTS.DELETE_DEVICE:
      return continueDeleteDevice(nextTask, text, context)
    case VOICE_INTENTS.UPDATE_DEVICE_SETTING:
      return askOrUnsupported(nextTask, '변경할 가전 설정을 말씀해 주세요. 예를 들면 TV 위치 안내 켜줘처럼 말할 수 있어요.')
    case VOICE_INTENTS.LIST_DEVICES:
      return executeAndReply(null, actions.listDevices(context), formatDeviceListResult)
    case VOICE_INTENTS.START_UWB_GUIDE:
      return continueStartUwbGuide(nextTask, text, context)
    case VOICE_INTENTS.STOP_UWB_GUIDE:
      return executeAndReply(null, actions.stopUwbGuide())
    case VOICE_INTENTS.CONNECT_GUARDIAN:
      return continueConnectGuardian(nextTask, text, context)
    case VOICE_INTENTS.DELETE_GUARDIAN:
      return continueDeleteGuardian(nextTask, text, context)
    case VOICE_INTENTS.CONNECT_WEARABLE:
      return continueConnectWearable(nextTask, text)
    case VOICE_INTENTS.CHECK_WEARABLE_STATUS:
      return executeAndReply(null, actions.checkWearableStatus(context), formatWearableStatusResult)
    case VOICE_INTENTS.READ_ALERTS:
    case VOICE_INTENTS.LIST_ALERTS:
      return executeAndReply(null, actions.getAlerts(extractAlertFilter(text), context), formatAlertsResult)
    case VOICE_INTENTS.FILTER_ALERTS:
      return executeAndReply(null, actions.filterAlerts(extractAlertFilter(text), context), formatAlertFilterResult)
    case VOICE_INTENTS.READ_ALERT_DETAIL:
      return continueReadAlertDetail(nextTask, text, context)
    case VOICE_INTENTS.CONFIRM_ALERT:
    case VOICE_INTENTS.CONFIRM_ALERTS_BY_FILTER:
      return continueAlertMutation(nextTask, text, context, 'confirm')
    case VOICE_INTENTS.DELETE_ALERT:
    case VOICE_INTENTS.DELETE_ALERTS_BY_FILTER:
      return continueAlertMutation(nextTask, text, context, 'delete')
    case VOICE_INTENTS.SET_NOTIFICATION_SOUND:
      return continueSimpleSetting(nextTask, text, 'soundType', '어떤 알림음으로 설정할까요?', () => (
        actions.setNotificationSound(nextTask.slots.alertType || 'ALL', nextTask.slots.soundType)
      ))
    case VOICE_INTENTS.SET_VIBRATION_PATTERN:
      return continueSimpleSetting(nextTask, text, 'patternType', '어떤 진동 패턴으로 설정할까요?', () => (
        actions.setVibrationPattern(nextTask.slots.alertType || 'ALL', nextTask.slots.patternType)
      ))
    case VOICE_INTENTS.SET_LIFE_SIGNAL:
      return continueLifeSignal(nextTask, text)
    case VOICE_INTENTS.SEND_SOS:
      return executeAndReply(null, actions.sendSos())
    case VOICE_INTENTS.CHECK_EVENT_HISTORY:
      return executeAndReply(null, actions.checkEventHistory(extractDateText(text) || '최근', context), formatEventHistoryResult)
    case VOICE_INTENTS.REMOTE_CONTROL_DEVICE:
      return continueRemoteControl(nextTask, text, context)
    case VOICE_INTENTS.NAVIGATE_SCREEN:
      return executeAndReply(null, actions.navigateScreen(extractScreenName(text) || 'home'))
    case VOICE_INTENTS.HELP:
      return { handled: true, nextTask: null, responseText: helpText() }
    default:
      return normalized ? { handled: false } : askOrUnsupported(nextTask, '무엇을 도와드릴까요?')
  }
}

async function continueAddDevice(task, text, context, options = {}) {
  if (task.step === 'SEARCH') {
    const result = await actions.searchAvailableDevices(context)
    if (!result.success) return resultToReply(null, result)
    const availableDevices = result.data.availableDevices || []
    if (availableDevices.length === 0) {
      return { handled: true, nextTask: null, responseText: '현재 추가 가능한 가전이 없습니다. 모든 지원 가전이 이미 연결되어 있어요.' }
    }
    const selected = findCatalogDevice(text, availableDevices)
    if (selected && !isGenericAddDeviceText(text)) {
      return continueAddDevice({
        ...task,
        step: 'ASK_LOCATION',
        slots: {
          ...task.slots,
          device: selected,
          deviceName: selected.defaultName,
          deviceType: selected.type,
          vendorDeviceId: selected.defaultVendorDeviceId,
        },
      }, text, context)
    }
    const prompt = `추가 가능한 가전을 찾았습니다. 현재 추가 가능한 가전은 ${availableDevices.map((device) => device.typeLabel).join(', ')}입니다. 어떤 가전을 추가할까요?`
    return { handled: true, nextTask: { ...task, step: 'SELECT_DEVICE', slots: { ...task.slots, availableDevices }, lastPrompt: prompt }, responseText: prompt }
  }

  if (task.step === 'SELECT_DEVICE') {
    const selected = findCatalogDevice(text, task.slots.availableDevices || context.deviceCatalog)
    if (!selected) {
      const prompt = '추가할 가전을 찾지 못했습니다. TV, 도어센서, 냉장고처럼 다시 말씀해 주세요.'
      return { handled: true, nextTask: { ...task, lastPrompt: prompt }, responseText: prompt }
    }
    const nextTask = {
      ...task,
      step: 'ASK_NAME',
      slots: {
        ...task.slots,
        device: selected,
        deviceName: selected.defaultName,
        deviceType: selected.type,
        vendorDeviceId: selected.defaultVendorDeviceId,
      },
    }
    const prompt = `${selected.typeLabel}를 추가할게요. 가전 이름은 ${selected.defaultName}로 저장할까요?`
    return { handled: true, nextTask: { ...nextTask, lastPrompt: prompt }, responseText: prompt }
  }

  if (task.step === 'ASK_NAME') {
    const deviceName = isAffirmative(text) ? task.slots.device.defaultName : cleanSpokenName(text) || task.slots.device.defaultName
    const nextTask = {
      ...task,
      step: 'ASK_LOCATION',
      slots: {
        ...task.slots,
        deviceName,
      },
    }
    const prompt = `${deviceName}라는 이름으로 저장할게요. vendorDeviceId는 ${task.slots.vendorDeviceId}로 확인되었습니다. 위치 안내 사용을 켤까요?`
    return { handled: true, nextTask: { ...nextTask, lastPrompt: prompt }, responseText: prompt }
  }

  if (task.step === 'ASK_LOCATION') {
    const nextTask = {
      ...task,
      step: task.slots.device?.type === 'DOOR_SENSOR' ? 'ASK_DOOR_ALERT' : 'ASK_REMOTE',
      slots: {
        ...task.slots,
        locationGuideEnabled: isAffirmative(text),
      },
    }
    const prompt = task.slots.device?.type === 'DOOR_SENSOR' ? '문 열림 알림을 받을까요?' : '원격 제어 사용도 켤까요?'
    return { handled: true, nextTask: { ...nextTask, lastPrompt: prompt }, responseText: prompt }
  }

  if (task.step === 'ASK_DOOR_ALERT' || task.step === 'ASK_REMOTE') {
    const slots = {
      ...task.slots,
      remoteControlEnabled: task.step === 'ASK_REMOTE' ? isAffirmative(text) : false,
      doorAlertEnabled: task.step === 'ASK_DOOR_ALERT' ? isAffirmative(text) : false,
    }
    return executeAndReply(null, actions.addDevice(slots), (result) => {
      if (!result.success) return resultFailureText(result)
      const deviceName = result.data.device?.name || slots.deviceName
      return `${deviceName}를 추가했습니다. 위치 안내를 ${slots.locationGuideEnabled ? '켰고' : '껐고'}, 원격 제어를 ${slots.remoteControlEnabled ? '켰습니다' : '껐습니다'}.`
    })
  }

  return continueAddDevice({ ...task, step: 'SEARCH' }, text, context, options)
}

async function continueStartUwbGuide(task, text, context) {
  if (isStopUwbText(text)) {
    return executeAndReply(null, actions.stopUwbGuide())
  }

  if (task.step === 'GUIDING') {
    const nextIndex = task.slots.modeConfirmed
      ? Math.min((task.slots.progressIndex || 0) + 1, 2)
      : 0
    const nextTask = {
      ...task,
      slots: {
        ...task.slots,
        progressIndex: nextIndex,
        useWearable: task.slots.useWearable || isAffirmative(text),
        modeConfirmed: true,
      },
    }
    return {
      handled: true,
      nextTask,
      responseText: locationGuideMessage(nextTask),
    }
  }

  const device = findDeviceFromText(text, context)
  if (!device) {
    const prompt = '어떤 가전의 위치를 안내할까요? 예를 들면 세탁기 위치 알려줘처럼 말해 주세요.'
    return { handled: true, nextTask: { ...task, step: 'ASK_DEVICE', lastPrompt: prompt }, responseText: prompt }
  }
  const result = await actions.startUwbGuide(device.deviceId || device.id || device.name, context)
  if (!result.success) return resultToReply(null, result)
  return {
    handled: true,
    nextTask: {
      currentIntent: VOICE_INTENTS.START_UWB_GUIDE,
      step: 'GUIDING',
      slots: {
        device,
        progressIndex: 0,
        useWearable: false,
        modeConfirmed: false,
        distanceM: context.preview?.uwb?.distanceM,
        direction: context.preview?.uwb?.direction,
      },
      lastPrompt: `${device.name} 위치 안내를 시작할게요.`,
      history: [],
    },
    responseText: `${device.name} 위치 안내를 시작할게요. 웨어러블 진동과 음성 안내를 함께 사용할까요?`,
  }
}

async function continueDeleteDevice(task, text, context) {
  const device = findDeviceFromText(text, context)
  if (!device) {
    const prompt = '삭제할 가전 이름을 말씀해 주세요.'
    return { handled: true, nextTask: { ...task, lastPrompt: prompt }, responseText: prompt }
  }
  return executeAndReply(null, actions.deleteDevice(device.deviceId || device.id || device.name))
}

async function continueConnectGuardian(task, text) {
  const email = extractEmail(text)
  if (!email) {
    const prompt = '보호자 이메일을 말씀해 주세요.'
    return { handled: true, nextTask: { ...task, lastPrompt: prompt }, responseText: prompt }
  }
  return executeAndReply(null, actions.sendGuardianInvite(email))
}

async function continueDeleteGuardian(task, text) {
  const id = text.match(/\d+/)?.[0]
  if (!id) {
    const prompt = '삭제할 보호자 번호를 말씀해 주세요.'
    return { handled: true, nextTask: { ...task, lastPrompt: prompt }, responseText: prompt }
  }
  return executeAndReply(null, actions.deleteGuardian(id))
}

async function continueConnectWearable(task, text) {
  const code = extractPairingCode(text)
  if (!code) {
    const prompt = '웨어러블 QR 코드를 인식 중입니다. 아직 QR 코드가 인식되지 않았습니다. 코드로 연결하려면 연결 코드를 말씀해 주세요.'
    return { handled: true, nextTask: { ...task, lastPrompt: prompt }, responseText: prompt }
  }
  return executeAndReply(null, actions.connectWearableByCode(code))
}

async function continueReadAlertDetail(task, text, context) {
  if (task.step === 'FOLLOWUP' && task.slots.lastAlert) {
    const value = normalize(text)
    if (value.includes('삭제') || value.includes('지워')) {
      return promptAlertMutation({
        ...task,
        currentIntent: VOICE_INTENTS.DELETE_ALERT,
        slots: { alert: task.slots.lastAlert },
      }, 'delete')
    }
    if (value.includes('확인') || value.includes('읽음')) {
      return promptAlertMutation({
        ...task,
        currentIntent: VOICE_INTENTS.CONFIRM_ALERT,
        slots: { alert: task.slots.lastAlert },
      }, 'confirm')
    }
    const prompt = '이 알림을 확인 완료 처리하거나 삭제할 수 있습니다. 어떻게 할까요?'
    return { handled: true, nextTask: { ...task, lastPrompt: prompt }, responseText: prompt }
  }

  if (task.step === 'SELECT_ALERT') {
    const selected = selectNumberedAlert(text, task.slots.matches)
    if (!selected) {
      return { handled: true, nextTask: task, responseText: '몇 번째 알림인지 말해 주세요. 첫 번째, 두 번째처럼 말하면 됩니다.' }
    }
    return alertDetailReply(selected)
  }

  const alerts = await loadVoiceAlerts(context)
  const matches = findAlertsFromText(text, alerts)
  if (matches.length === 0) {
    return { handled: true, nextTask: null, responseText: '상세 내용을 알려드릴 알림을 찾지 못했습니다. 최근 알림 알려줘처럼 먼저 조회해 주세요.' }
  }
  if (matches.length > 1) {
    const prompt = `${matches[0].title} 알림이 ${matches.length}건 있습니다. ${matches.slice(0, 2).map((alert, index) => `${index + 1}번째는 ${formatAlertTimeText(alert.occurredAt)} 알림입니다`).join(', ')}. 어떤 알림을 자세히 볼까요?`
    return { handled: true, nextTask: { ...task, step: 'SELECT_ALERT', slots: { matches }, lastPrompt: prompt }, responseText: prompt }
  }
  return alertDetailReply(matches[0])
}

async function continueAlertMutation(task, text, context, actionType) {
  if (task.step === 'CONFIRM_ACTION') {
    if (!isAffirmative(text)) {
      const label = task.slots.filter ? `${alertFilterLabel(task.slots.filter)} 알림` : `${task.slots.alert?.title || '알림'}`
      return { handled: true, nextTask: null, responseText: `${label} ${actionType === 'delete' ? '삭제' : '확인 완료 처리'}를 취소했습니다.` }
    }

    const result = task.slots.alert
      ? actionType === 'delete'
        ? await actions.deleteAlert(task.slots.alert.alertId, context)
        : await actions.confirmAlert(task.slots.alert.alertId)
      : actionType === 'delete'
        ? await actions.deleteAlertsByFilter(task.slots.filter, context)
        : await actions.confirmAlertsByFilter(task.slots.filter, context)
    if (!result.success) return resultToReply(null, result)
    const refreshed = await actions.refreshAlerts()
    return {
      handled: true,
      nextTask: null,
      result,
      responseText: `${result.message} ${remainingAlertsText(refreshed.data?.alerts || [])}`,
    }
  }

  if (task.step === 'SELECT_ALERT') {
    const selected = selectNumberedAlert(text, task.slots.matches)
    if (!selected) {
      return { handled: true, nextTask: task, responseText: '몇 번째 알림인지 말해 주세요. 첫 번째, 두 번째처럼 말씀하시면 됩니다.' }
    }
    return promptAlertMutation({ ...task, slots: { alert: selected } }, actionType)
  }

  const filter = extractAlertFilter(text)
  const isFilterAction = task.currentIntent === VOICE_INTENTS.CONFIRM_ALERTS_BY_FILTER || task.currentIntent === VOICE_INTENTS.DELETE_ALERTS_BY_FILTER || isGenericAlertFilterText(text)
  if (isFilterAction) {
    const result = await actions.getAlerts(filter, context)
    const alerts = (result.data?.alerts || []).filter((alert) => actionType === 'delete' || alert.status !== 'CONFIRMED')
    if (alerts.length === 0) {
      return {
        handled: true,
        nextTask: null,
        responseText: actionType === 'delete'
          ? `삭제할 ${alertFilterLabel(filter)} 알림이 없습니다.`
          : `확인 완료 처리할 ${alertFilterLabel(filter)} 알림이 없습니다.`,
      }
    }
    return promptAlertMutation({ ...task, slots: { filter, count: alerts.length } }, actionType)
  }

  const alerts = await loadVoiceAlerts(context)
  const matches = findAlertsFromText(text, alerts)
  if (matches.length === 0) {
    return { handled: true, nextTask: null, responseText: `${actionType === 'delete' ? '삭제할' : '확인 완료 처리할'} 알림을 찾지 못했습니다.` }
  }
  if (matches.length > 1) {
    const prompt = `${matches[0].title} 알림이 ${matches.length}건 있습니다. ${matches.slice(0, 2).map((alert, index) => `${index + 1}번째는 ${formatAlertTimeText(alert.occurredAt)} 알림입니다`).join(', ')}. 어떤 알림을 처리할까요?`
    return { handled: true, nextTask: { ...task, step: 'SELECT_ALERT', slots: { matches }, lastPrompt: prompt }, responseText: prompt }
  }
  return promptAlertMutation({ ...task, slots: { alert: matches[0] } }, actionType)
}

function promptAlertMutation(task, actionType) {
  const isDelete = actionType === 'delete'
  const targetText = task.slots.alert
    ? `${task.slots.alert.title} 알림`
    : `${alertFilterLabel(task.slots.filter)} 알림 ${task.slots.count}건`
  const prompt = isDelete
    ? `${targetText}을 삭제할까요? 삭제하면 되돌릴 수 없습니다.`
    : `${targetText}을 확인 완료 처리할까요?`
  return {
    handled: true,
    nextTask: { ...task, step: 'CONFIRM_ACTION', lastPrompt: prompt },
    responseText: prompt,
  }
}

function alertDetailReply(alert) {
  const responseText = `${alert.title} 알림입니다. ${alert.message || '상세 내용이 없습니다.'} ${alert.deviceName ? `${alert.deviceName}에서 발생했고, ` : ''}위치는 ${alert.locationName || '위치 정보 없음'}입니다. 발생 시간은 ${formatAlertTimeText(alert.occurredAt)}입니다. 이 알림을 확인 완료 처리하거나 삭제할 수 있습니다. 어떻게 할까요?`
  return { handled: true, nextTask: { currentIntent: VOICE_INTENTS.READ_ALERT_DETAIL, step: 'FOLLOWUP', slots: { lastAlert: alert }, history: [], lastPrompt: responseText }, responseText }
}

async function continueSimpleSetting(task, text, slotName, prompt, execute) {
  if (!task.slots[slotName]) {
    const value = cleanSettingValue(text)
    if (!value || isGenericSettingText(text)) {
      return { handled: true, nextTask: { ...task, lastPrompt: prompt }, responseText: prompt }
    }
    const nextTask = { ...task, slots: { ...task.slots, [slotName]: value } }
    return executeAndReply(null, execute(nextTask))
  }
  return executeAndReply(null, execute(task))
}

async function continueLifeSignal(task, text) {
  const setting = { enabled: !normalize(text).includes('꺼'), rawText: text }
  return executeAndReply(null, actions.setLifeSignal(setting))
}

async function continueRemoteControl(task, text, context) {
  const device = findDeviceFromText(text, context)
  const action = extractRemoteAction(text)
  if (!device) {
    const prompt = '원격 제어할 가전 이름을 말씀해 주세요.'
    return { handled: true, nextTask: { ...task, lastPrompt: prompt }, responseText: prompt }
  }
  if (!action) {
    const prompt = `${device.name}에서 어떤 동작을 실행할까요? 켜기, 끄기처럼 말해 주세요.`
    return { handled: true, nextTask: { ...task, slots: { ...task.slots, device }, lastPrompt: prompt }, responseText: prompt }
  }
  return executeAndReply(null, actions.remoteControlDevice(device.deviceId || device.id || device.name, action, context))
}

function createTask(intent) {
  return {
    currentIntent: intent,
    step: intent === VOICE_INTENTS.ADD_DEVICE ? 'SEARCH' : 'START',
    slots: {},
    history: [],
    lastPrompt: '',
  }
}

function pushHistory(task) {
  return {
    ...task,
    history: [...(task.history || []), { ...task, history: [] }].slice(-5),
  }
}

async function executeAndReply(nextTask, resultPromise, formatter = resultDefaultText) {
  const result = await resultPromise
  return resultToReply(nextTask, result, formatter)
}

function resultToReply(nextTask, result, formatter = resultDefaultText) {
  return {
    handled: true,
    nextTask,
    responseText: formatter(result),
    result,
  }
}

function resultDefaultText(result) {
  if (result.success) return result.message
  return resultFailureText(result)
}

function resultFailureText(result) {
  const retry = result.nextActions?.length ? ` ${result.nextActions.join(', ')} 중에서 말씀해 주세요.` : ''
  return `${result.message}${result.reason ? ` ${result.reason}` : ''}${retry}`
}

function formatDeviceListResult(result) {
  if (!result.success) return resultFailureText(result)
  const devices = result.data.devices || []
  if (devices.length === 0) return '연결된 가전이 없습니다.'
  return `연결된 가전은 ${devices.map((device) => device.name || device.typeLabel || device.type).join(', ')}입니다.`
}

function formatAlertsResult(result) {
  if (!result.success) return resultFailureText(result)
  const alerts = result.data.alerts || []
  const filter = result.data.filter || 'ALL'
  const label = alertFilterLabel(filter)
  if (alerts.length === 0) return `${label} 알림은 없습니다.`
  return `${label} 알림은 ${alerts.length}건입니다. ${alerts.slice(0, 3).map((alert, index) => `${index + 1}번째, ${alert.title || '알림'}. ${alert.message || ''}`).join(' ')} 상세 내용을 들으시겠어요?`
}

function formatWearableStatusResult(result) {
  if (!result.success) return resultFailureText(result)
  const wearable = result.data.wearable
  return `${wearable.name || '웨어러블'} 상태 확인이 완료되었습니다. 현재 ${wearable.connectionStatus || wearable.status || '연결됨'} 상태입니다.`
}

function formatEventHistoryResult(result) {
  if (!result.success) return resultFailureText(result)
  const events = result.data.events || []
  if (events.length === 0) return '확인된 이벤트 이력이 없습니다.'
  return `이벤트 이력이 ${events.length}건 있습니다. ${events.slice(0, 3).map((event) => event.title || event.message).filter(Boolean).join(' ')}`
}

function locationGuideMessage(task) {
  const device = task.slots.device || { name: '가전' }
  const index = task.slots.progressIndex || 0
  const distanceText = formatGuideDistance(task.slots.distanceM) || '약 2.4미터'
  const directionText = task.slots.direction || '앞쪽'
  if (index === 0) {
    return `웨어러블 진동과 음성 안내를 함께 사용할게요. ${device.name}까지의 거리를 확인하고 있습니다. 현재 ${distanceText} ${directionText}에 있습니다. 천천히 앞으로 이동해주세요.`
  }
  if (index === 1) {
    return `${device.name}와 가까워지고 있습니다. 현재 약 1미터입니다. 오른쪽으로 조금 이동해주세요.`
  }
  return `${device.name}가 매우 가깝습니다. 약 40센티미터 앞에 있습니다. 손을 뻗기 전에 주변을 확인해주세요.`
}

function formatGuideDistance(distanceM) {
  const distance = Number(distanceM)
  if (!Number.isFinite(distance)) return ''
  if (distance < 1) return `약 ${Math.round(distance * 100)}센티미터`
  return Number.isInteger(distance) ? `약 ${distance}미터` : `약 ${distance.toFixed(1)}미터`
}

async function loadVoiceAlerts(context = {}) {
  const result = await actions.getAlerts('ALL', context)
  if (!result.success) return []
  return result.data?.alerts || []
}

function extractAlertFilter(text) {
  const value = normalize(text)
  if (value.includes('미확인') || value.includes('안읽') || value.includes('안읽은') || value.includes('읽지않은')) return 'UNREAD'
  if (value.includes('긴급도움') || value.includes('긴급')) return 'EMERGENCY'
  if (value.includes('위험한') || value.includes('위험')) return 'DANGER'
  if (value.includes('생활') || value.includes('세탁')) return 'LIFE'
  if (value.includes('전체') || value.includes('모든')) return 'ALL'
  return 'ALL'
}

function alertFilterLabel(filter = 'ALL') {
  return {
    ALL: '전체',
    UNREAD: '미확인',
    DANGER: '위험',
    EMERGENCY: '긴급',
    LIFE: '생활',
  }[filter] || '전체'
}

function isGenericAlertFilterText(text) {
  const value = normalize(text)
  if (value.includes('세탁완료') || value.includes('긴급도움요청')) return false
  return [
    '전체알림',
    '모든알림',
    '미확인알림',
    '안읽은알림',
    '위험알림',
    '위험한알림',
    '긴급알림',
    '생활알림',
    '세탁알림',
  ].some((keyword) => value.includes(keyword))
}

function findAlertsFromText(text, alerts = []) {
  const value = normalize(text)
  const query = cleanAlertQuery(text)
  const candidates = alerts.filter(Boolean)
  const exactMatches = candidates.filter((alert) => {
    const title = normalize(alert.title)
    return title && (value.includes(title) || query.includes(title))
  })
  if (exactMatches.length > 0) return sortAlertsByTime(exactMatches)

  const looseMatches = candidates.filter((alert) => {
    const searchable = [
      alert.title,
      alert.message,
      alert.category,
      alert.deviceName,
      alert.type,
    ].map(normalize).filter(Boolean).join(' ')
    return query && searchable.includes(query)
  })
  if (looseMatches.length > 0) return sortAlertsByTime(looseMatches)

  if (value.includes('세탁완료')) {
    return sortAlertsByTime(candidates.filter((alert) => normalize(alert.title).includes('세탁완료')))
  }
  if (value.includes('긴급도움요청')) {
    return sortAlertsByTime(candidates.filter((alert) => normalize(alert.title).includes('긴급도움요청')))
  }
  return []
}

function cleanAlertQuery(text) {
  return normalize(text)
    .replace(/알림/g, '')
    .replace(/상세/g, '')
    .replace(/보기/g, '')
    .replace(/자세히/g, '')
    .replace(/알려줘/g, '')
    .replace(/읽어줘/g, '')
    .replace(/삭제/g, '')
    .replace(/지워/g, '')
    .replace(/확인완료/g, '')
    .replace(/확인/g, '')
    .replace(/처리/g, '')
    .replace(/해줘/g, '')
}

function sortAlertsByTime(alerts = []) {
  return [...alerts].sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0))
}

function selectNumberedAlert(text, matches = []) {
  const value = normalize(text)
  const number = Number(value.match(/\d+/)?.[0])
  if (number >= 1 && number <= matches.length) return matches[number - 1]
  if (value.includes('첫') || value.includes('첫번째') || value.includes('첫째')) return matches[0]
  if (value.includes('두') || value.includes('두번째') || value.includes('둘째')) return matches[1]
  if (value.includes('세') || value.includes('세번째') || value.includes('셋째')) return matches[2]
  return null
}

function formatAlertTimeText(value) {
  if (!value) return '시간 정보 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '시간 정보 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function remainingAlertsText(alerts = []) {
  if (alerts.length === 0) return '현재 남은 알림은 없습니다.'
  const counts = alerts.reduce((acc, alert) => {
    const key = alert.type === 'EMERGENCY' ? '긴급' : alert.type === 'DANGER' ? '위험' : alert.type === 'LIFE' ? '생활' : '기타'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const summary = Object.entries(counts).map(([label, count]) => `${label} 알림 ${count}건`).join(', ')
  return `현재 남은 알림은 ${summary}입니다.`
}

function formatAlertFilterResult(result) {
  if (!result.success) return resultFailureText(result)
  const filter = result.data?.filter || 'ALL'
  const count = result.affectedCount ?? result.data?.alerts?.length ?? 0
  return `${alertFilterLabel(filter)} 알림 화면으로 변경했습니다. ${alertFilterLabel(filter)} 알림은 ${count}건입니다.`
}

function askOrUnsupported(task, responseText) {
  return { handled: true, nextTask: { ...task, lastPrompt: responseText }, responseText }
}

function classifyControlIntent(text) {
  const value = normalize(text)
  if (['취소', '그만', '중지', '안할래'].some((word) => value.includes(word))) return VOICE_INTENTS.CANCEL
  if (['다시말', '다시들', '반복'].some((word) => value.includes(word))) return VOICE_INTENTS.REPEAT
  if (['이전', '뒤로'].some((word) => value.includes(word))) return VOICE_INTENTS.GO_BACK
  if (['처음으로', '홈으로', '홈화면'].some((word) => value.includes(word))) return VOICE_INTENTS.GO_HOME
  return null
}

function classifyAlertIntent(text) {
  const value = normalize(text)
  const mentionsAlert = value.includes('알림') || value.includes('긴급도움요청') || value.includes('세탁완료')
  if (!mentionsAlert) return null

  if (value.includes('삭제') || value.includes('지워')) {
    return isGenericAlertFilterText(text) ? VOICE_INTENTS.DELETE_ALERTS_BY_FILTER : VOICE_INTENTS.DELETE_ALERT
  }

  if (value.includes('확인완료') || value.includes('읽음') || (value.includes('확인') && value.includes('처리'))) {
    return isGenericAlertFilterText(text) ? VOICE_INTENTS.CONFIRM_ALERTS_BY_FILTER : VOICE_INTENTS.CONFIRM_ALERT
  }

  if (value.includes('상세') || value.includes('자세히')) return VOICE_INTENTS.READ_ALERT_DETAIL

  if (value.includes('보여줘') || value.includes('보여') || value.includes('필터') || value.includes('화면')) {
    return VOICE_INTENTS.FILTER_ALERTS
  }

  if (value.includes('읽') || value.includes('알려') || value.includes('조회') || value.includes('최근')) {
    return VOICE_INTENTS.LIST_ALERTS
  }

  return VOICE_INTENTS.LIST_ALERTS
}

function classifyIntent(text) {
  const value = normalize(text)
  if (value.includes('도움') || value.includes('뭐할수')) return VOICE_INTENTS.HELP
  const alertIntent = classifyAlertIntent(text)
  if (alertIntent) return alertIntent
  if (value.includes('긴급') || value.includes('sos') || value.includes('도움요청')) return VOICE_INTENTS.SEND_SOS
  if (value.includes('알림') && (value.includes('읽') || value.includes('확인') || value.includes('알려'))) return value.includes('처리') ? VOICE_INTENTS.CONFIRM_ALERT : VOICE_INTENTS.READ_ALERTS
  if (value.includes('가전') && (value.includes('목록') || value.includes('뭐') || value.includes('연결된'))) return VOICE_INTENTS.LIST_DEVICES
  if ((value.includes('추가') || value.includes('등록') || value.includes('연결')) && (value.includes('가전') || findCatalogDevice(text))) return VOICE_INTENTS.ADD_DEVICE
  if ((value.includes('삭제') || value.includes('지워')) && (value.includes('가전') || findCatalogDevice(text))) return VOICE_INTENTS.DELETE_DEVICE
  if ((value.includes('위치') || value.includes('어디')) && !value.includes('멈') && !value.includes('종료')) return VOICE_INTENTS.START_UWB_GUIDE
  if (value.includes('위치안내') && (value.includes('멈') || value.includes('종료') || value.includes('그만'))) return VOICE_INTENTS.STOP_UWB_GUIDE
  if (value.includes('보호자') && (value.includes('삭제') || value.includes('지워'))) return VOICE_INTENTS.DELETE_GUARDIAN
  if (value.includes('보호자')) return VOICE_INTENTS.CONNECT_GUARDIAN
  if (value.includes('웨어러블') || value.includes('밴드')) return value.includes('상태') ? VOICE_INTENTS.CHECK_WEARABLE_STATUS : VOICE_INTENTS.CONNECT_WEARABLE
  if (value.includes('알림음')) return VOICE_INTENTS.SET_NOTIFICATION_SOUND
  if (value.includes('진동')) return VOICE_INTENTS.SET_VIBRATION_PATTERN
  if (value.includes('생활신호')) return VOICE_INTENTS.SET_LIFE_SIGNAL
  if (value.includes('이력') || value.includes('기록')) return VOICE_INTENTS.CHECK_EVENT_HISTORY
  if ((value.includes('켜') || value.includes('꺼')) && findCatalogDevice(text)) return VOICE_INTENTS.REMOTE_CONTROL_DEVICE
  if (value.includes('화면') || value.includes('이동')) return VOICE_INTENTS.NAVIGATE_SCREEN
  return null
}

function helpText() {
  return [
    '음성으로 할 수 있는 기능은 다음과 같습니다.',
    '가전 추가, 삭제, 설정 변경, 연결된 가전 목록 확인, UWB 위치 안내 시작과 종료, 보호자 연결과 삭제, 웨어러블 연결과 상태 확인, 알림 읽기와 확인 처리, 알림음 설정, 진동 패턴 설정, 생활 신호 설정, 긴급 요청 전송, 이벤트 이력 확인, 가전 원격 제어, 화면 이동을 할 수 있어요.',
  ].join(' ')
}

function findCatalogDevice(text, catalog = []) {
  const value = normalize(text)
  return catalog.find((device) => (
    [device.defaultName, device.typeLabel, ...(device.aliases || [])]
      .filter(Boolean)
      .some((alias) => value.includes(normalize(alias)))
  )) || null
}

function findDeviceFromText(text, context = {}) {
  const value = normalize(text)
  const devices = context.preview?.devices || []
  const exact = devices.find((device) => value.includes(normalize(device.name || device.typeLabel || device.type)))
  if (exact) return exact
  const catalogDevice = findCatalogDevice(text, context.deviceCatalog || [])
  if (!catalogDevice) return null
  return devices.find((device) => device.type === catalogDevice.type) || {
    name: catalogDevice.defaultName,
    type: catalogDevice.type,
    deviceId: catalogDevice.defaultName,
    remoteEnabled: catalogDevice.remoteEnabled,
  }
}

function isGenericAddDeviceText(text) {
  const value = normalize(text)
  return value.includes('가전추가') || value === '추가해줘' || value === '등록해줘'
}

function isGenericSettingText(text) {
  const value = normalize(text)
  return value.includes('설정') && value.length < 8
}

function isAffirmative(text) {
  const value = normalize(text)
  if (['아니', '안돼', '싫어', '끄'].some((word) => value.includes(word))) return false
  return ['응', '네', '예', '좋아', '맞아', '켜', '사용', '해줘'].some((word) => value.includes(word))
}

function extractEmail(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/골뱅이|앳|엣/g, '@')
    .replace(/닷|점/g, '.')
    .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
}

function extractPairingCode(text) {
  return String(text || '').match(/[A-Z0-9]{4,}(?:-[A-Z0-9]{2,})*/i)?.[0] || ''
}

function extractRemoteAction(text) {
  const value = normalize(text)
  if (value.includes('켜')) return 'TURN_ON'
  if (value.includes('꺼') || value.includes('끄')) return 'TURN_OFF'
  if (value.includes('시작')) return 'START'
  if (value.includes('정지') || value.includes('멈')) return 'STOP'
  return ''
}

function extractScreenName(text) {
  const value = normalize(text)
  if (value.includes('알림')) return 'alerts'
  if (value.includes('가전')) return 'devices'
  if (value.includes('보호자')) return 'guardian'
  if (value.includes('웨어러블')) return 'wearable'
  if (value.includes('홈')) return 'home'
  return ''
}

function isStopUwbText(text) {
  const value = normalize(text)
  return value.includes('위치안내') && ['멈', '중지', '종료', '그만', '꺼'].some((word) => value.includes(word))
}

function extractDateText(text) {
  const value = normalize(text)
  if (value.includes('오늘')) return '오늘'
  if (value.includes('어제')) return '어제'
  if (value.includes('최근')) return '최근'
  return ''
}

function cleanSettingValue(text) {
  return String(text || '').replace(/(으로|로)?\s*(설정|해줘|바꿔줘|저장)/g, '').trim()
}

function cleanSpokenName(text) {
  return String(text || '')
    .replace(/(으로|로)?\s*(해줘|해주세요|저장해줘|저장|할게|해|응|네|예)/g, '')
    .replace(/[.?!]/g, '')
    .trim()
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^0-9a-z가-힣@.]/g, '')
}
