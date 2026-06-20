import { apiRequest } from './apiClient'
import {
  getAlertDetail as getAlertDetailApi,
  getAlerts as getAlertsApi,
  confirmAlert as confirmAlertApi,
  deleteAlert as deleteAlertApi,
} from './alertService'
import { createDevice, getDevices } from './deviceService'
import { createEmergencyRequest } from './emergencyService'
import { deleteGuardian as deleteGuardianApi, linkGuardianByEmail } from './guardianService'
import { completeWearablePairing } from './wearablePairingService'

function ok(message, data = {}) {
  return { success: true, message, data }
}

function actionOk(message, { affectedCount = 0, data = {} } = {}) {
  return { success: true, message, affectedCount, data }
}

function fail(message, reason = '', nextActions = ['다시 시도', '취소']) {
  return { success: false, message, reason, nextActions }
}

export async function searchAvailableDevices(context = {}) {
  try {
    const connectedDevices = await listDevicesRaw(context)
    const connectedTypes = new Set(connectedDevices.map((device) => device.type))
    const availableDevices = context.deviceCatalog.filter((device) => !connectedTypes.has(device.type))
    return ok('추가 가능한 가전 검색이 완료되었습니다.', {
      availableDevices,
      connectedDevices,
    })
  } catch (error) {
    return fail('기기를 찾지 못했습니다.', error.message)
  }
}

export async function addDevice(deviceInfo) {
  try {
    const device = await createDevice({
      vendor: 'LG_THINQ',
      vendorDeviceId: deviceInfo.vendorDeviceId,
      name: deviceInfo.deviceName,
      type: deviceInfo.deviceType,
      locationSupported: Boolean(deviceInfo.locationGuideEnabled),
      remoteEnabled: Boolean(deviceInfo.remoteControlEnabled),
    })
    return ok(`${device?.name || deviceInfo.deviceName} 저장이 완료되었습니다.`, { device })
  } catch (error) {
    return fail('저장에 실패했습니다.', error.message)
  }
}

export async function deleteDevice(deviceId) {
  try {
    await apiRequest(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
    return ok('가전 삭제가 완료되었습니다.', { deviceId })
  } catch (error) {
    return fail('가전 삭제에 실패했습니다.', error.message)
  }
}

export async function updateDeviceSetting(deviceId, setting) {
  try {
    const device = await apiRequest(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      body: setting,
    })
    return ok('가전 설정 저장이 완료되었습니다.', { device })
  } catch (error) {
    return fail('저장에 실패했습니다.', error.message)
  }
}

export async function listDevices(context = {}) {
  try {
    const devices = await listDevicesRaw(context)
    return ok('연결된 가전 목록 확인이 완료되었습니다.', { devices })
  } catch (error) {
    return fail('연결된 가전 목록 확인에 실패했습니다.', error.message)
  }
}

export async function startUwbGuide(deviceId, context = {}) {
  const devices = await listDevicesRaw(context)
  const device = devices.find((item) => String(item.deviceId || item.id || item.name) === String(deviceId))
  if (!device) {
    return fail('기기를 찾지 못했습니다.', '위치 안내를 시작할 가전이 없습니다.')
  }
  return ok('위치 안내를 시작했습니다.', {
    device,
    uwb: context.preview?.uwb || null,
  })
}

export async function stopUwbGuide() {
  return ok('위치 안내를 종료했습니다.')
}

export async function createGuardianInviteCode() {
  try {
    const invite = await apiRequest('/api/guardians/invite-code', { method: 'POST' })
    return ok('보호자 초대 코드가 생성되었습니다.', { invite })
  } catch (error) {
    return fail('보호자 초대 코드 생성에 실패했습니다.', error.message)
  }
}

export async function sendGuardianInvite(contact) {
  try {
    const guardian = await linkGuardianByEmail({
      email: contact,
      isPrimary: false,
      notifyOnDanger: true,
    })
    return ok('보호자 연결이 완료되었습니다.', { guardian })
  } catch (error) {
    return fail('연결에 실패했습니다.', error.message)
  }
}

export async function deleteGuardian(guardianId) {
  try {
    await deleteGuardianApi(guardianId)
    return ok('보호자 삭제가 완료되었습니다.', { guardianId })
  } catch (error) {
    return fail('보호자 삭제에 실패했습니다.', error.message)
  }
}

export async function connectWearableByQr(pairing = null) {
  if (!pairing) {
    return fail('QR 코드 인식에 실패했습니다.', '아직 QR 코드가 인식되지 않았습니다.', ['QR 다시 스캔', '코드로 연결', '취소'])
  }
  try {
    const result = await completeWearablePairing(pairing)
    return ok('연결이 완료되었습니다.', result)
  } catch (error) {
    return fail('QR 코드 인식에 실패했습니다.', error.message, ['다시 시도', '취소'])
  }
}

export async function connectWearableByCode(code) {
  try {
    const result = await apiRequest('/api/wearable/pairing-codes/complete', {
      method: 'POST',
      body: { pairingCode: code },
    })
    return ok('연결이 완료되었습니다.', result)
  } catch (error) {
    return fail('연결에 실패했습니다.', error.message)
  }
}

export async function checkWearableStatus(context = {}) {
  const devices = await listDevicesRaw(context)
  const wearable = devices.find((device) => /wearable|band|able/i.test(`${device.type} ${device.name}`))
  if (!wearable) {
    return fail('웨어러블 상태 확인에 실패했습니다.', '연결된 웨어러블을 찾지 못했습니다.', ['웨어러블 연결', '취소'])
  }
  return ok('웨어러블 상태 확인이 완료되었습니다.', { wearable })
}

export async function readAlerts(context = {}) {
  const localAlerts = [
    ...(context.summary?.recentAlerts || []),
    ...(context.summary?.unreadAlerts || []),
    ...(context.preview?.alerts || []),
  ].filter(Boolean)

  if (localAlerts.length > 0) {
    return ok('알림 확인이 완료되었습니다.', { alerts: localAlerts })
  }

  try {
    const alerts = await getAlertsApi({ limit: 20 })
    return ok('알림 확인이 완료되었습니다.', { alerts })
  } catch (error) {
    return fail('알림 확인에 실패했습니다.', error.message)
  }
}

export async function confirmAlert(alertId) {
  try {
    const alert = await confirmAlertApi(alertId)
    return ok('알림 확인 처리가 완료되었습니다.', { alert })
  } catch (error) {
    return fail('알림 확인 처리에 실패했습니다.', error.message)
  }
}

export async function getAlerts(filter = 'ALL', context = {}) {
  try {
    const alerts = await listAlertsByFilter(filter, context)
    return actionOk(`${filterLabel(filter)} 알림 ${alerts.length}건을 조회했습니다.`, {
      affectedCount: alerts.length,
      data: { alerts, filter },
    })
  } catch (error) {
    return fail('알림 조회에 실패했습니다.', error.message, ['다시 조회', '취소'])
  }
}

export async function getAlertDetail(alertId, context = {}) {
  try {
    const alert = await loadAlertDetail(alertId, context)
    return actionOk(`${alert.title || '알림'} 상세 정보를 조회했습니다.`, {
      affectedCount: alert ? 1 : 0,
      data: { alert },
    })
  } catch (error) {
    return fail('알림 상세 조회에 실패했습니다.', error.message, ['다시 조회', '취소'])
  }
}

export async function confirmAlertsByFilter(filter = 'ALL', context = {}) {
  try {
    const alerts = await listAlertsByFilter(filter, context)
    const targets = alerts.filter((alert) => alert.status !== 'CONFIRMED')
    if (targets.length === 0) {
      return fail('알림 확인 완료 처리에 실패했습니다.', `확인 완료 처리할 ${filterLabel(filter)} 알림이 없습니다.`, ['다시 조회', '취소'])
    }

    const updatedAlerts = []
    for (const alert of targets) {
      updatedAlerts.push(await confirmAlertApi(alert.alertId))
    }
    await refreshAlerts()
    return actionOk(`${filterLabel(filter)} 알림 ${targets.length}건이 확인 완료 처리되었습니다.`, {
      affectedCount: targets.length,
      data: { alerts: updatedAlerts, filter },
    })
  } catch (error) {
    return fail('알림 확인 완료 처리에 실패했습니다.', error.message, ['다시 조회', '취소'])
  }
}

export async function deleteAlert(alertId, context = {}) {
  try {
    const alert = await loadAlertDetail(alertId, context)
    await deleteAlertApi(alertId)
    await refreshAlerts()
    return actionOk(`${alert?.title || '알림'}이 삭제되었습니다.`, {
      affectedCount: 1,
      data: { alertId, alert },
    })
  } catch (error) {
    return fail('알림 삭제에 실패했습니다.', error.message, ['다시 조회', '취소'])
  }
}

export async function deleteAlertsByFilter(filter = 'ALL', context = {}) {
  try {
    const alerts = await listAlertsByFilter(filter, context)
    if (alerts.length === 0) {
      return fail('알림 삭제에 실패했습니다.', `삭제할 ${filterLabel(filter)} 알림이 없습니다.`, ['다시 조회', '취소'])
    }

    for (const alert of alerts) {
      await deleteAlertApi(alert.alertId)
    }
    await refreshAlerts()
    return actionOk(`${filterLabel(filter)} 알림 ${alerts.length}건이 삭제되었습니다.`, {
      affectedCount: alerts.length,
      data: { alerts, filter },
    })
  } catch (error) {
    return fail('알림 삭제에 실패했습니다.', error.message, ['다시 조회', '취소'])
  }
}

export async function refreshAlerts() {
  try {
    const alerts = await getAlertsApi({ limit: 50 })
    dispatchAlertEvent('lg-able-band:alerts-updated', { alerts })
    return actionOk('알림 목록을 새로고침했습니다.', {
      affectedCount: alerts.length,
      data: { alerts },
    })
  } catch (error) {
    return fail('알림 새로고침에 실패했습니다.', error.message, ['다시 조회', '취소'])
  }
}

export async function filterAlerts(filter = 'ALL', context = {}) {
  try {
    const alerts = await listAlertsByFilter(filter, context)
    dispatchAlertEvent('lg-able-band:alerts-filter', { filter })
    return actionOk(`${filterLabel(filter)} 알림 화면으로 변경했습니다.`, {
      affectedCount: alerts.length,
      data: { alerts, filter },
    })
  } catch (error) {
    return fail('알림 화면 변경에 실패했습니다.', error.message, ['다시 조회', '취소'])
  }
}

export async function setNotificationSound(alertType, soundType) {
  return saveLocalVoiceSetting('notificationSound', { alertType, soundType }, '알림음 설정 저장이 완료되었습니다.')
}

export async function setVibrationPattern(alertType, patternType) {
  return saveLocalVoiceSetting('vibrationPattern', { alertType, patternType }, '진동 패턴 설정 저장이 완료되었습니다.')
}

export async function setLifeSignal(setting) {
  return saveLocalVoiceSetting('lifeSignal', setting, '생활 신호 설정 저장이 완료되었습니다.')
}

export async function sendSos() {
  try {
    const request = await createEmergencyRequest()
    return ok('긴급 요청 전송이 완료되었습니다.', { request })
  } catch (error) {
    return fail('긴급 요청 전송에 실패했습니다.', error.message)
  }
}

export async function checkEventHistory(date, context = {}) {
  const alerts = context.summary?.recentAlerts || context.preview?.alerts || []
  return ok('이벤트 이력 확인이 완료되었습니다.', {
    date,
    events: alerts,
  })
}

async function listAlertsByFilter(filter = 'ALL', context = {}) {
  if (context.source === 'wearable') {
    return filterAlertList(localAlertList(context), filter)
  }

  try {
    return filterAlertList(await getAlertsApi({ limit: 50 }), filter)
  } catch {
    return filterAlertList(localAlertList(context), filter)
  }
}

async function loadAlertDetail(alertId, context = {}) {
  try {
    return await getAlertDetailApi(alertId)
  } catch {
    const alert = localAlertList(context).find((item) => String(item.alertId) === String(alertId))
    if (!alert) {
      throw new Error('알림을 찾을 수 없습니다.')
    }
    return alert
  }
}

function localAlertList(context = {}) {
  return [
    ...(context.preview?.alerts || []),
    ...(context.summary?.recentAlerts || []),
    ...(context.summary?.unreadAlerts || []),
  ].filter(Boolean).filter((alert, index, alerts) => (
    alerts.findIndex((item) => String(item.alertId) === String(alert.alertId)) === index
  ))
}

function filterAlertList(alerts, filter = 'ALL') {
  if (filter === 'UNREAD') {
    return alerts.filter((alert) => alert.status === 'UNREAD')
  }
  if (filter === 'DANGER') {
    return alerts.filter((alert) => alert.type === 'DANGER' || ['HIGH', 'CRITICAL'].includes(alert.severity))
  }
  if (filter === 'EMERGENCY') {
    return alerts.filter((alert) => alert.type === 'EMERGENCY' || alert.severity === 'CRITICAL')
  }
  if (filter === 'LIFE') {
    return alerts.filter((alert) => alert.type === 'LIFE')
  }
  return alerts
}

function filterLabel(filter = 'ALL') {
  return {
    ALL: '전체',
    UNREAD: '미확인',
    DANGER: '위험',
    EMERGENCY: '긴급',
    LIFE: '생활',
  }[filter] || '전체'
}

function dispatchAlertEvent(type, detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(type, { detail }))
  }
}

export async function remoteControlDevice(deviceId, action, context = {}) {
  const devices = await listDevicesRaw(context)
  const device = devices.find((item) => String(item.deviceId || item.id || item.name) === String(deviceId))
  if (!device) {
    return fail('기기를 찾지 못했습니다.', '원격 제어할 가전을 찾지 못했습니다.')
  }
  if (!device.remoteEnabled) {
    return fail('원격 제어에 실패했습니다.', '이 가전은 원격 제어가 꺼져 있습니다.', ['원격 제어 켜기', '취소'])
  }
  return ok('가전 원격 제어가 완료되었습니다.', { device, action })
}

export async function navigateScreen(screenName) {
  return ok('화면 이동이 완료되었습니다.', { screenName })
}

async function listDevicesRaw(context = {}) {
  try {
    return await getDevices()
  } catch {
    return context.preview?.devices || []
  }
}

function saveLocalVoiceSetting(key, value, message) {
  try {
    const current = JSON.parse(window.localStorage.getItem('lg-able-band.voice-settings') || '{}')
    window.localStorage.setItem('lg-able-band.voice-settings', JSON.stringify({
      ...current,
      [key]: value,
    }))
    return ok(message, { [key]: value })
  } catch (error) {
    return fail('저장에 실패했습니다.', error.message)
  }
}
