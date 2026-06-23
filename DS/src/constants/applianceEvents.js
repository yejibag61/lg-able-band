export const APPLIANCES = [
  { id: 'washingMachine', label: '세탁기', applianceType: 'WASHING_MACHINE' },
  { id: 'airQualitySensor', label: 'LG 공기질 센서', applianceType: 'AIR_QUALITY_SENSOR' },
  { id: 'tv', label: 'TV', applianceType: 'TV' },
  { id: 'electricRange', label: '전기레인지', applianceType: 'ELECTRIC_RANGE' },
  { id: 'doorSensor', label: '도어 센서', applianceType: 'DOOR_SENSOR' },
  { id: 'refrigerator', label: '냉장고', applianceType: 'REFRIGERATOR' },
]

export const APPLIANCE_EVENT_MAP = {
  washingMachine: {
    START_WASHING: {
      eventType: 'WASHING_COMPLETED',
      title: 'Washing Completed',
      message: 'The washing cycle is complete. Please remove the laundry.',
      toast: '세탁 완료 알림을 전송했어요.',
    },
    CHANGE_MODE: {
      eventType: 'WASHING_MODE_CHANGED',
      title: 'Washing Mode Changed',
      message: 'The washing mode has changed. Please check the current setting.',
      toast: '세탁 모드 변경 알림을 전송했어요.',
    },
    OPEN_DOOR: {
      eventType: 'WASHING_MACHINE_ERROR_OR_DOOR_OPEN',
      title: 'Washing Machine Error or Door Open',
      message: 'The washing machine door is open or an operating error has been detected.',
      toast: '세탁기 문 열림 알림을 전송했어요.',
    },
    TRIGGER_ERROR: {
      eventType: 'WASHING_MACHINE_ERROR_OR_DOOR_OPEN',
      title: 'Washing Machine Error or Door Open',
      message: 'The washing machine door is open or an operating error has been detected.',
      toast: '세탁기 오류 알림을 전송했어요.',
    },
  },
  airQualitySensor: {
    HIGH_CO2: {
      eventType: 'HIGH_CO2',
      title: 'High Carbon Dioxide Level',
      message: 'The carbon dioxide concentration is high. Ventilation is required.',
      toast: '이산화탄소 경고 알림을 전송했어요.',
    },
    TEMP_HUMIDITY_ALERT: {
      eventType: 'TEMPERATURE_HUMIDITY_ALERT',
      title: 'Temperature and Humidity Alert',
      message: 'The indoor temperature or humidity is outside the comfortable range.',
      toast: '온습도 경고 알림을 전송했어요.',
    },
    HIGH_FINE_DUST: {
      eventType: 'HIGH_FINE_DUST',
      title: 'High Fine Dust Level',
      message: 'The indoor fine dust concentration is high.',
      toast: '미세먼지 경고 알림을 전송했어요.',
    },
  },
  tv: {
    TOGGLE_POWER: {
      eventType: 'TV_POWER_STATUS_CHANGED',
      title: 'TV Power Status Changed',
      message: 'The TV power status has changed.',
      toast: 'TV 전원 알림을 전송했어요.',
    },
    CHANGE_MEDIA: {
      eventType: 'TV_VOLUME_OR_CHANNEL_CHANGED',
      title: 'TV Volume or Channel Changed',
      message: 'The TV volume or channel has changed.',
      toast: 'TV 채널/볼륨 알림을 전송했어요.',
    },
    FIND_REMOTE: {
      eventType: 'FIND_TV_REMOTE',
      title: 'Find TV Remote',
      message: 'Remote control location guidance has started.',
      toast: '리모컨 찾기 알림을 전송했어요.',
    },
  },
  electricRange: {
    POWER_ON: {
      eventType: 'ELECTRIC_RANGE_POWER_ON',
      title: 'Electric Range Power On',
      message: 'The electric range is turned on.',
      toast: '전기레인지 전원 알림을 전송했어요.',
    },
    START_COOKING: {
      eventType: 'COOKING_COMPLETED',
      title: 'Cooking Completed',
      message: 'Cooking is complete.',
      toast: '조리 완료 알림을 전송했어요.',
    },
    OVERHEAT: {
      eventType: 'RESIDUAL_HEAT_OR_OVERHEATING_WARNING',
      title: 'Residual Heat or Overheating Warning',
      message: 'Residual heat or an overheating risk has been detected on the electric range.',
      toast: '과열 경고 알림을 전송했어요.',
    },
  },
  doorSensor: {
    OPEN_DOOR: {
      eventType: 'DOOR_OPENED',
      title: 'Door Opened',
      message: 'The door has been opened.',
      toast: '문 열림 알림을 전송했어요.',
    },
    LEFT_OPEN: {
      eventType: 'DOOR_LEFT_OPEN',
      title: 'Door Left Open',
      message: 'The door has been open for a long time.',
      toast: '문 장시간 열림 알림을 전송했어요.',
    },
    CHECK_DOOR: {
      eventType: 'CHECK_DOOR_BEFORE_LEAVING_OR_SLEEPING',
      title: 'Check Door Before Leaving or Sleeping',
      message: 'Please check the door lock status before leaving or going to sleep.',
      toast: '문 상태 확인 알림을 전송했어요.',
    },
  },
  refrigerator: {
    OPEN_DOOR: {
      eventType: 'REFRIGERATOR_DOOR_OPEN',
      title: 'Refrigerator Door Open',
      message: 'The refrigerator door is open.',
      toast: '냉장고 문 열림 알림을 전송했어요.',
    },
    TEMPERATURE_ALERT: {
      eventType: 'REFRIGERATOR_TEMPERATURE_ALERT',
      title: 'Refrigerator Temperature Alert',
      message: 'An abnormal refrigerator temperature has been detected.',
      toast: '냉장고 온도 경고 알림을 전송했어요.',
    },
    FIND_ITEM: {
      eventType: 'FIND_REFRIGERATOR_FOOD_ITEM',
      title: 'Find Refrigerator Food Item',
      message: 'Food location guidance inside the refrigerator has started.',
      toast: '냉장고 음식 찾기 알림을 전송했어요.',
    },
  },
}
