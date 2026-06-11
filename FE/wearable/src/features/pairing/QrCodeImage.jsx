const QR_MODULE_COUNT = 61
const QR_QUIET_ZONE = 4
const QR_MODULE_HEX = [
  'fe1e2322ddb49bfc13ad82b94abed06ebc7cbbd06b4ebb7522d122d22555dba811d2f98b9f2ec177220c7f627107faaaaaaaaaaaafe010b10514',
  '358000be160bcffe75dbe06b5c099cef829abb9eb197d6c7ef02c00d1964405e8d3a7223e409c719f3a2fe2b984a7089594970b22dc81de034b5',
  '1a9876dcad7bf76d26401d74c833e6daafdee16c992394aeb68ed1fd16b08a468c9152c72b6483f185b40da7c0eb9ec56832c322694b7dfcb88b',
  'f9bb12b168c835a2886a90dbdc3830fb3f2bc245848162b15d9a416bdab6e4669885b58fcb3ac718ffdb74f9c61afde474b05c4630e441aaeefa',
  'abfb5eeb691fad5b14f783195fefe04fba129fbccc89bf2aefc8922fd9d5f5f8a7ccb31b665b222eb032bf7f4be175a66bcbe65e2bf68a78cb8b',
  '4eb5c5f3cc5facdaa62416ea37a089eefae0f2c962dfed4caf086ec90480b8a114067fd57cda9ab15eac0b1a138f3448b461a74dfaca36075622',
  '1e4d21183261eed86baa7f062b962035c8835688d3575f119e5ca2439d4ee384b90fd8e5c4ed82fea7d12fd1c24bb080af2e832df9820bfb0049',
  'c8f468342443f98715aaae10ebf0537e7b1cdd6919bac7dc1f9f26aff5d46abfb8a304ad6eb377847a81f983042075b5057b241feebfd836d218',
  '4780',
].join('')

const QR_IMAGE_SRC = createQrImageSrc()

export function QrCodeImage({ payload }) {
  return (
    <img
      className="qr-code"
      src={QR_IMAGE_SRC}
      alt="Able Band 연동 QR 코드"
      data-pairing-payload={payload}
    />
  )
}

function createQrImageSrc() {
  const size = QR_MODULE_COUNT + QR_QUIET_ZONE * 2
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `<path fill="#fff" d="M0 0h${size}v${size}H0z"/>`,
    `<path fill="#111" d="${createDarkModulePath()}"/>`,
    '</svg>',
  ].join('')

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function createDarkModulePath() {
  const parts = []

  for (let row = 0; row < QR_MODULE_COUNT; row += 1) {
    let column = 0
    while (column < QR_MODULE_COUNT) {
      while (column < QR_MODULE_COUNT && !isDarkModule(row, column)) {
        column += 1
      }

      const start = column
      while (column < QR_MODULE_COUNT && isDarkModule(row, column)) {
        column += 1
      }

      const length = column - start
      if (length > 0) {
        const x = start + QR_QUIET_ZONE
        const y = row + QR_QUIET_ZONE
        parts.push(`M${x} ${y}h${length}v1H${x}z`)
      }
    }
  }

  return parts.join('')
}

function isDarkModule(row, column) {
  const bitIndex = row * QR_MODULE_COUNT + column
  const byteIndex = Math.floor(bitIndex / 8) * 2
  const byte = Number.parseInt(QR_MODULE_HEX.slice(byteIndex, byteIndex + 2), 16)
  const bitMask = 2 ** (7 - (bitIndex % 8))

  return (byte & bitMask) !== 0
}
