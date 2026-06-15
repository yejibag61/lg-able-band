# ESP32 Web Bluetooth Proximity Demo

This folder contains a simple proximity demo for the ESP32 DevKitC V4 and a phone running Chrome.

## What This Demo Does

- exposes the ESP32 as a BLE peripheral
- lets a web page connect to the board with Web Bluetooth
- reads connection RSSI on the ESP32 side
- sends RSSI updates to the browser through GATT notifications
- estimates approximate distance and speaks Korean guidance in the browser

This version does not rely on `watchAdvertisements()`, so it is better suited to phone testing where advertisement watching is often unavailable.

## What This Demo Cannot Do Reliably

- exact meter-level ranging
- true left/right/front/back direction guidance

With one ESP32 board and one phone, this is still only a proximity estimate.

## Files

- `esp32-web-bluetooth.ino`
  - Arduino sketch for the ESP32 board
- `../../FE/app/public/ble-proximity-demo.html`
  - test page to open from Chrome on your phone
- `../../FE/app/public/ble-proximity-demo.js`
  - Web Bluetooth connection, notification handling, distance estimation, speech, and vibration logic

## How It Works

1. The phone opens the demo page and connects to `ABLE-ESP32-TAG`.
2. The ESP32 stores the connected phone address.
3. The ESP32 periodically calls `esp_ble_gap_read_rssi(...)`.
4. The ESP32 sends JSON payloads through a notify characteristic.
5. The web page reads the RSSI, estimates distance, and announces whether the board is getting closer.

Example payload:

```json
{
  "deviceName": "ABLE-ESP32-TAG",
  "mode": "gatt_notify_proximity",
  "connected": true,
  "txPowerAt1m": -59,
  "uptimeSec": 42,
  "rssi": -67,
  "distanceM": 2.31
}
```

## How To Run

1. Flash `esp32-web-bluetooth.ino` to the ESP32.
2. Run the frontend.
3. Open:

```text
http://localhost:5173/ble-proximity-demo.html
```

4. If testing on your phone, use your HTTPS ngrok address:

```text
https://...ngrok-free.dev/ble-proximity-demo.html
```

5. Tap `ESP32 연결 시작`.
6. Choose `ABLE-ESP32-TAG`.
7. Move the phone closer or farther away and watch the message change.

## Important Notes

- Web Bluetooth needs `HTTPS` or `localhost`.
- In practice, this demo is intended for `Chrome on Android`.
- Distance is based on RSSI, so it can fluctuate with walls, hand position, body blocking, and nearby radios.
- Direction is not available with this hardware and browser flow alone.

## Calibration Tips

- default `txPowerAt1m` is `-59`
- place the phone about 1 meter from the ESP32
- if the distance feels too short or too long, adjust `txPowerAt1m`
- if it changes too sharply, raise `path loss exponent` from `2.2` to `2.6` or `3.0`

## Why This Is Better For Your Current Test

Your phone was able to connect to the ESP32, but the browser failed on BLE advertisement watching. This revised version keeps the same UX goal while using a more widely usable GATT-notify flow for the prototype.
