import { QrCodeImage } from './QrCodeImage'

export function PairingQrScreen({
  pairing,
  onPairComplete,
  onResetPairing,
  status = 'waiting',
}) {
  if (!pairing) {
    return <p className="screen-message">연동 QR을 준비하는 중입니다.</p>
  }

  if (status === 'success') {
    return (
      <section className="pairing-state-screen" aria-labelledby="pairing-success-title">
        <p className="pairing-state-icon" aria-hidden="true">
          OK
        </p>
        <p className="eyebrow">연동 상태</p>
        <h1 id="pairing-success-title">연동 완료</h1>
        <p>휴대폰과 연결되었습니다. 곧 알림 화면으로 전환됩니다.</p>
      </section>
    )
  }

  if (status === 'expired') {
    return (
      <section className="pairing-state-screen" aria-labelledby="pairing-expired-title">
        <p className="pairing-state-icon warning" aria-hidden="true">
          !
        </p>
        <p className="eyebrow">연동 상태</p>
        <h1 id="pairing-expired-title">QR 다시 발급 필요</h1>
        <p>유효 시간이 지나 휴대폰에서 이 QR을 사용할 수 없습니다.</p>
        <button className="primary-action" type="button" onClick={onResetPairing}>
          새 QR 발급
        </button>
      </section>
    )
  }

  if (status === 'invalid') {
    return (
      <section className="pairing-state-screen" aria-labelledby="pairing-invalid-title">
        <p className="pairing-state-icon warning" aria-hidden="true">
          !
        </p>
        <p className="eyebrow">연동 상태</p>
        <h1 id="pairing-invalid-title">연동 정보 오류</h1>
        <p>휴대폰 앱에서 인식한 연동 정보가 올바르지 않습니다.</p>
        <button className="secondary-action" type="button" onClick={onResetPairing}>
          QR 다시 보기
        </button>
      </section>
    )
  }

  return (
    <section className="pairing-screen" aria-labelledby="pairing-title">
      <div className="pairing-copy">
        <p className="eyebrow">LG Able Band</p>
        <h1 id="pairing-title">휴대폰으로 연동</h1>
        <p>앱에서 QR을 스캔하면 바로 밴드가 연결됩니다.</p>
        <span className="pairing-status" role="status">
          스캔 대기 중
        </span>
      </div>

      <div className="qr-panel">
        <QrCodeImage payload={pairing.pairingPayload} />
        <div className="pairing-meta">
          <strong>{pairing.pairingCode}</strong>
          <span>{pairing.deviceId}</span>
          <span>{pairing.expiresInMinutes}분 동안 유효</span>
        </div>
      </div>

      <button className="primary-action" type="button" onClick={onPairComplete}>
        휴대폰 연동 완료
      </button>
    </section>
  )
}
