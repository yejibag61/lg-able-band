#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <esp_gap_ble_api.h>

namespace {
constexpr char DEVICE_NAME[] = "ABLE-ESP32-TAG";
constexpr char SERVICE_UUID[] = "7a8b9c0d-1111-2222-3333-1234567890ab";
constexpr char INFO_CHARACTERISTIC_UUID[] = "7a8b9c0d-1111-2222-3333-1234567890ac";
constexpr int STATUS_LED_PIN = 2;
constexpr int TX_POWER_AT_1M = -59;
constexpr unsigned long RSSI_READ_INTERVAL_MS = 320;
constexpr unsigned long NOTIFY_INTERVAL_MS = 600;
}  // namespace

BLECharacteristic* infoCharacteristic = nullptr;
BLEServer* bleServer = nullptr;
bool isClientConnected = false;
bool hasPeerAddress = false;
esp_bd_addr_t connectedPeerAddress = {0};
int latestRssi = 0;
bool hasRssiSample = false;
unsigned long lastRssiReadAt = 0;
unsigned long lastNotifyAt = 0;
unsigned long lastLedToggleAt = 0;
uint32_t bootSeconds = 0;

float estimateDistanceM(int rssi, int txPowerAt1m) {
  constexpr float pathLossExponent = 2.2f;
  return powf(10.0f, (static_cast<float>(txPowerAt1m) - static_cast<float>(rssi)) / (10.0f * pathLossExponent));
}

String buildInfoPayload() {
  String payload = "{";
  payload += "\"deviceName\":\"";
  payload += DEVICE_NAME;
  payload += "\",";
  payload += "\"mode\":\"gatt_notify_proximity\",";
  payload += "\"connected\":";
  payload += isClientConnected ? "true" : "false";
  payload += ",";
  payload += "\"txPowerAt1m\":";
  payload += TX_POWER_AT_1M;
  payload += ",";
  payload += "\"uptimeSec\":";
  payload += bootSeconds;
  payload += ",";
  payload += "\"rssi\":";

  if (hasRssiSample) {
    payload += latestRssi;
  } else {
    payload += "null";
  }

  payload += ",";
  payload += "\"distanceM\":";

  if (hasRssiSample) {
    payload += String(estimateDistanceM(latestRssi, TX_POWER_AT_1M), 2);
  } else {
    payload += "null";
  }

  payload += "}";
  return payload;
}

void notifyCurrentState() {
  if (infoCharacteristic == nullptr || !isClientConnected) {
    return;
  }

  String payload = buildInfoPayload();
  infoCharacteristic->setValue(payload.c_str());
  infoCharacteristic->notify();
  Serial.println(payload);
}

class ProximityServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server, esp_ble_gatts_cb_param_t* param) override {
    isClientConnected = true;
    hasPeerAddress = true;
    hasRssiSample = false;
    memcpy(connectedPeerAddress, param->connect.remote_bda, sizeof(esp_bd_addr_t));
    Serial.printf("Client connected: %02x:%02x:%02x:%02x:%02x:%02x\n",
                  connectedPeerAddress[0],
                  connectedPeerAddress[1],
                  connectedPeerAddress[2],
                  connectedPeerAddress[3],
                  connectedPeerAddress[4],
                  connectedPeerAddress[5]);
    notifyCurrentState();
  }

  void onDisconnect(BLEServer* server, esp_ble_gatts_cb_param_t* param) override {
    isClientConnected = false;
    hasPeerAddress = false;
    hasRssiSample = false;
    latestRssi = 0;
    server->startAdvertising();
    Serial.println("Client disconnected. Advertising restarted.");
  }
};

void customGapHandler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t* param) {
  if (event != ESP_GAP_BLE_READ_RSSI_COMPLETE_EVT) {
    return;
  }

  if (param->read_rssi_cmpl.status != ESP_BT_STATUS_SUCCESS) {
    Serial.printf("RSSI read failed. status=%d\n", param->read_rssi_cmpl.status);
    return;
  }

  latestRssi = param->read_rssi_cmpl.rssi;
  hasRssiSample = true;
  lastNotifyAt = millis();
  notifyCurrentState();
}

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, HIGH);

  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setPower(ESP_PWR_LVL_P9);
  BLEDevice::setCustomGapHandler(customGapHandler);

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ProximityServerCallbacks());

  BLEService* service = bleServer->createService(SERVICE_UUID);
  infoCharacteristic = service->createCharacteristic(
    INFO_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  infoCharacteristic->addDescriptor(new BLE2902());

  String initialPayload = buildInfoPayload();
  infoCharacteristic->setValue(initialPayload.c_str());
  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(false);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  advertising->start();

  Serial.println("ABLE ESP32 GATT proximity demo started.");
  Serial.print("Service UUID: ");
  Serial.println(SERVICE_UUID);
  Serial.print("Characteristic UUID: ");
  Serial.println(INFO_CHARACTERISTIC_UUID);
}

void loop() {
  const unsigned long now = millis();
  bootSeconds = now / 1000;

  if (isClientConnected && hasPeerAddress && now - lastRssiReadAt >= RSSI_READ_INTERVAL_MS) {
    lastRssiReadAt = now;
    esp_err_t result = esp_ble_gap_read_rssi(connectedPeerAddress);
    if (result != ESP_OK) {
      Serial.printf("esp_ble_gap_read_rssi failed: %d\n", result);
    }
  }

  if (isClientConnected && now - lastNotifyAt >= NOTIFY_INTERVAL_MS) {
    lastNotifyAt = now;
    notifyCurrentState();
  }

  if (now - lastLedToggleAt >= 500) {
    lastLedToggleAt = now;
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
  }

  delay(20);
}
