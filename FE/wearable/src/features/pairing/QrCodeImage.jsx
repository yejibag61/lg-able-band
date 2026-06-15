import { createQrImageSrc } from './qrEncoder'

export function QrCodeImage({ payload }) {
  return (
    <img
      className="qr-code"
      src={createQrImageSrc(payload || '')}
      alt="Able Band 연동 QR 코드"
      data-pairing-payload={payload}
    />
  )
}
