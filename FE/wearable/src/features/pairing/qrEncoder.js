const QUIET_ZONE = 4
const ECC_LEVEL_LOW = 1
const FORMAT_MASK = 0x5412
const FORMAT_GENERATOR = 0x537
const VERSION_GENERATOR = 0x1f25

const QR_VERSIONS = [
  {
    version: 4,
    alignment: [6, 26],
    eccPerBlock: 20,
    groups: [{ count: 1, dataCodewords: 80 }],
  },
  {
    version: 8,
    alignment: [6, 24, 42],
    eccPerBlock: 24,
    groups: [{ count: 2, dataCodewords: 97 }],
  },
  {
    version: 12,
    alignment: [6, 32, 58],
    eccPerBlock: 24,
    groups: [
      { count: 2, dataCodewords: 92 },
      { count: 2, dataCodewords: 93 },
    ],
  },
  {
    version: 15,
    alignment: [6, 26, 48, 70],
    eccPerBlock: 22,
    groups: [
      { count: 5, dataCodewords: 87 },
      { count: 1, dataCodewords: 88 },
    ],
  },
]

const GF_EXP = createGaloisExponentTable()
const GF_LOG = createGaloisLogTable(GF_EXP)

export function createQrImageSrc(payload) {
  const bytes = [...new TextEncoder().encode(payload)]
  const qrVersion = selectQrVersion(bytes.length)
  const codewords = createCodewords(bytes, qrVersion)
  const matrix = createBestMatrix(codewords, qrVersion)
  const svg = createSvg(matrix)

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function selectQrVersion(byteLength) {
  const version = QR_VERSIONS.find((candidate) => {
    const lengthBits = getByteCountBits(candidate.version)
    const requiredBits = 4 + lengthBits + byteLength * 8
    const requiredCodewords = Math.ceil((requiredBits + 4) / 8)
    return candidate.dataCodewords >= requiredCodewords
  })

  if (!version) {
    throw new Error('Pairing payload is too large for the wearable QR code.')
  }

  return version
}

function createCodewords(bytes, qrVersion) {
  const data = createDataCodewords(bytes, qrVersion)
  const blocks = splitBlocks(data, qrVersion)
  const eccBlocks = blocks.map((block) =>
    createErrorCorrectionCodewords(block, qrVersion.eccPerBlock),
  )

  return interleaveBlocks(blocks, eccBlocks)
}

function createDataCodewords(bytes, qrVersion) {
  const dataCodewordCount = qrVersion.dataCodewords
  const bits = []
  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, getByteCountBits(qrVersion.version))
  bytes.forEach((byte) => appendBits(bits, byte, 8))

  const capacityBits = dataCodewordCount * 8
  const terminatorLength = Math.min(4, capacityBits - bits.length)
  appendBits(bits, 0, terminatorLength)

  while (bits.length % 8 !== 0) {
    bits.push(0)
  }

  const codewords = []
  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(bitsToByte(bits.slice(index, index + 8)))
  }

  const pads = [0xec, 0x11]
  while (codewords.length < dataCodewordCount) {
    codewords.push(pads[codewords.length % 2])
  }

  return codewords
}

function getByteCountBits(version) {
  return version <= 9 ? 8 : 16
}

function appendBits(bits, value, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1)
  }
}

function bitsToByte(bits) {
  return bits.reduce((byte, bit) => (byte << 1) | bit, 0)
}

function splitBlocks(data, qrVersion) {
  const blocks = []
  let offset = 0

  qrVersion.groups.forEach((group) => {
    for (let index = 0; index < group.count; index += 1) {
      blocks.push(data.slice(offset, offset + group.dataCodewords))
      offset += group.dataCodewords
    }
  })

  return blocks
}

function interleaveBlocks(dataBlocks, eccBlocks) {
  const result = []
  const maxDataLength = Math.max(...dataBlocks.map((block) => block.length))

  for (let index = 0; index < maxDataLength; index += 1) {
    dataBlocks.forEach((block) => {
      if (index < block.length) {
        result.push(block[index])
      }
    })
  }

  for (let index = 0; index < eccBlocks[0].length; index += 1) {
    eccBlocks.forEach((block) => {
      result.push(block[index])
    })
  }

  return result
}

function createBestMatrix(codewords, qrVersion) {
  let bestMatrix = null
  let bestPenalty = Number.POSITIVE_INFINITY

  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = createMatrix(codewords, qrVersion, mask)
    const penalty = calculatePenalty(matrix)

    if (penalty < bestPenalty) {
      bestMatrix = matrix
      bestPenalty = penalty
    }
  }

  return bestMatrix
}

function createMatrix(codewords, qrVersion, mask) {
  const size = qrVersion.version * 4 + 17
  const modules = Array.from({ length: size }, () => Array(size).fill(false))
  const reserved = Array.from({ length: size }, () => Array(size).fill(false))

  const setFunction = (row, column, dark) => {
    if (row < 0 || column < 0 || row >= size || column >= size) {
      return
    }

    modules[row][column] = dark
    reserved[row][column] = true
  }

  drawFunctionPatterns({ modules, qrVersion, reserved, setFunction, size })
  drawCodewords({ codewords, mask, modules, reserved, size })
  drawFormatBits({ mask, setFunction, size })
  drawVersionBits({ qrVersion, setFunction, size })

  return modules
}

function drawFunctionPatterns({ qrVersion, reserved, setFunction, size }) {
  drawFinderPattern(3, 3, setFunction)
  drawFinderPattern(size - 4, 3, setFunction)
  drawFinderPattern(3, size - 4, setFunction)

  for (let index = 0; index < size; index += 1) {
    if (index !== 6) {
      const dark = index % 2 === 0
      if (!reserved[6][index]) {
        setFunction(6, index, dark)
      }

      if (!reserved[index][6]) {
        setFunction(index, 6, dark)
      }
    }
  }

  qrVersion.alignment.forEach((row) => {
    qrVersion.alignment.forEach((column) => {
      const overlapsFinder =
        (row <= 8 && column <= 8) ||
        (row <= 8 && column >= size - 9) ||
        (row >= size - 9 && column <= 8)

      if (!overlapsFinder) {
        drawAlignmentPattern(row, column, setFunction)
      }
    })
  })

  reserveFormatAreas(setFunction, size)
  if (qrVersion.version >= 7) {
    reserveVersionAreas(setFunction, size)
  }

  setFunction(size - 8, 8, true)
}

function drawFinderPattern(centerRow, centerColumn, setFunction) {
  for (let rowOffset = -4; rowOffset <= 4; rowOffset += 1) {
    for (let columnOffset = -4; columnOffset <= 4; columnOffset += 1) {
      const row = centerRow + rowOffset
      const column = centerColumn + columnOffset
      const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset))

      setFunction(row, column, distance !== 2 && distance !== 4)
    }
  }
}

function drawAlignmentPattern(centerRow, centerColumn, setFunction) {
  for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
    for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
      const distance = Math.max(Math.abs(rowOffset), Math.abs(columnOffset))
      setFunction(centerRow + rowOffset, centerColumn + columnOffset, distance !== 1)
    }
  }
}

function reserveFormatAreas(setFunction, size) {
  for (let index = 0; index <= 8; index += 1) {
    if (index !== 6) {
      setFunction(8, index, false)
      setFunction(index, 8, false)
    }
  }

  for (let index = 0; index < 8; index += 1) {
    setFunction(size - 1 - index, 8, false)
    setFunction(8, size - 1 - index, false)
  }
}

function reserveVersionAreas(setFunction, size) {
  for (let row = 0; row < 6; row += 1) {
    for (let column = size - 11; column <= size - 9; column += 1) {
      setFunction(row, column, false)
      setFunction(column, row, false)
    }
  }
}

function drawCodewords({ codewords, mask, modules, reserved, size }) {
  let bitIndex = 0
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1
    }

    for (let vertical = 0; vertical < size; vertical += 1) {
      const row = upward ? size - 1 - vertical : vertical
      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const column = right - columnOffset

        if (reserved[row][column]) {
          continue
        }

        const codeword = codewords[Math.floor(bitIndex / 8)] || 0
        const bit = ((codeword >>> (7 - (bitIndex % 8))) & 1) === 1
        modules[row][column] = bit !== maskBit(mask, row, column)
        bitIndex += 1
      }
    }

    upward = !upward
  }
}

function drawFormatBits({ mask, setFunction, size }) {
  const bits = getFormatBits(mask)

  for (let index = 0; index <= 5; index += 1) {
    setFunction(index, 8, getBit(bits, index))
  }

  setFunction(7, 8, getBit(bits, 6))
  setFunction(8, 8, getBit(bits, 7))
  setFunction(8, 7, getBit(bits, 8))

  for (let index = 9; index < 15; index += 1) {
    setFunction(8, 14 - index, getBit(bits, index))
  }

  for (let index = 0; index < 8; index += 1) {
    setFunction(8, size - 1 - index, getBit(bits, index))
  }

  for (let index = 8; index < 15; index += 1) {
    setFunction(size - 15 + index, 8, getBit(bits, index))
  }

  setFunction(size - 8, 8, true)
}

function drawVersionBits({ qrVersion, setFunction, size }) {
  if (qrVersion.version < 7) {
    return
  }

  const bits = getVersionBits(qrVersion.version)
  for (let index = 0; index < 18; index += 1) {
    const row = Math.floor(index / 3)
    const column = size - 11 + (index % 3)
    const bit = getBit(bits, index)
    setFunction(row, column, bit)
    setFunction(column, row, bit)
  }
}

function getFormatBits(mask) {
  const data = (ECC_LEVEL_LOW << 3) | mask
  let remainder = data

  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * FORMAT_GENERATOR)
  }

  return ((data << 10) | remainder) ^ FORMAT_MASK
}

function getVersionBits(version) {
  let remainder = version

  for (let index = 0; index < 12; index += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 11) & 1) * VERSION_GENERATOR)
  }

  return (version << 12) | remainder
}

function maskBit(mask, row, column) {
  switch (mask) {
    case 0:
      return (row + column) % 2 === 0
    case 1:
      return row % 2 === 0
    case 2:
      return column % 3 === 0
    case 3:
      return (row + column) % 3 === 0
    case 4:
      return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0
    case 5:
      return ((row * column) % 2) + ((row * column) % 3) === 0
    case 6:
      return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0
    case 7:
      return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0
    default:
      return false
  }
}

function calculatePenalty(matrix) {
  return (
    calculateRunPenalty(matrix) +
    calculateBlockPenalty(matrix) +
    calculatePatternPenalty(matrix) +
    calculateBalancePenalty(matrix)
  )
}

function calculateRunPenalty(matrix) {
  let penalty = 0
  const rows = matrix
  const columns = matrix[0].map((_, column) => matrix.map((row) => row[column]))

  ;[...rows, ...columns].forEach((line) => {
    let runColor = line[0]
    let runLength = 1

    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === runColor) {
        runLength += 1
      } else {
        if (runLength >= 5) {
          penalty += runLength - 2
        }

        runColor = line[index]
        runLength = 1
      }
    }

    if (runLength >= 5) {
      penalty += runLength - 2
    }
  })

  return penalty
}

function calculateBlockPenalty(matrix) {
  let penalty = 0

  for (let row = 0; row < matrix.length - 1; row += 1) {
    for (let column = 0; column < matrix.length - 1; column += 1) {
      const color = matrix[row][column]
      if (
        matrix[row][column + 1] === color &&
        matrix[row + 1][column] === color &&
        matrix[row + 1][column + 1] === color
      ) {
        penalty += 3
      }
    }
  }

  return penalty
}

function calculatePatternPenalty(matrix) {
  let penalty = 0
  const rows = matrix
  const columns = matrix[0].map((_, column) => matrix.map((row) => row[column]))

  ;[...rows, ...columns].forEach((line) => {
    for (let index = 0; index <= line.length - 11; index += 1) {
      const slice = line.slice(index, index + 11).map((bit) => (bit ? 1 : 0)).join('')
      if (slice === '10111010000' || slice === '00001011101') {
        penalty += 40
      }
    }
  })

  return penalty
}

function calculateBalancePenalty(matrix) {
  const darkModules = matrix.flat().filter(Boolean).length
  const totalModules = matrix.length * matrix.length
  const darkPercent = (darkModules * 100) / totalModules
  const previousMultipleOfFive = Math.floor(darkPercent / 5) * 5
  const nextMultipleOfFive = previousMultipleOfFive + 5

  return (
    Math.min(
      Math.abs(previousMultipleOfFive - 50),
      Math.abs(nextMultipleOfFive - 50),
    ) / 5
  ) * 10
}

function createErrorCorrectionCodewords(data, degree) {
  const divisor = createReedSolomonDivisor(degree)
  const result = Array(degree).fill(0)

  data.forEach((byte) => {
    const factor = byte ^ result.shift()
    result.push(0)

    divisor.forEach((coefficient, index) => {
      result[index] ^= multiplyGalois(coefficient, factor)
    })
  })

  return result
}

function createReedSolomonDivisor(degree) {
  const result = Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1

  for (let index = 0; index < degree; index += 1) {
    for (let item = 0; item < degree; item += 1) {
      result[item] = multiplyGalois(result[item], root)
      if (item + 1 < degree) {
        result[item] ^= result[item + 1]
      }
    }

    root = multiplyGalois(root, 0x02)
  }

  return result
}

function multiplyGalois(left, right) {
  if (left === 0 || right === 0) {
    return 0
  }

  return GF_EXP[GF_LOG[left] + GF_LOG[right]]
}

function createGaloisExponentTable() {
  const table = Array(512).fill(0)
  let value = 1

  for (let index = 0; index < 255; index += 1) {
    table[index] = value
    value <<= 1
    if (value & 0x100) {
      value ^= 0x11d
    }
  }

  for (let index = 255; index < table.length; index += 1) {
    table[index] = table[index - 255]
  }

  return table
}

function createGaloisLogTable(exponentTable) {
  const table = Array(256).fill(0)
  for (let index = 0; index < 255; index += 1) {
    table[exponentTable[index]] = index
  }

  return table
}

function createSvg(matrix) {
  const moduleCount = matrix.length
  const size = moduleCount + QUIET_ZONE * 2
  const darkPath = createDarkModulePath(matrix)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `<path fill="#fff" d="M0 0h${size}v${size}H0z"/>`,
    darkPath ? `<path fill="#111" d="${darkPath}"/>` : '',
    '</svg>',
  ].join('')
}

function createDarkModulePath(matrix) {
  const parts = []

  matrix.forEach((row, rowIndex) => {
    let column = 0
    while (column < row.length) {
      while (column < row.length && !row[column]) {
        column += 1
      }

      const start = column
      while (column < row.length && row[column]) {
        column += 1
      }

      const length = column - start
      if (length > 0) {
        const x = start + QUIET_ZONE
        const y = rowIndex + QUIET_ZONE
        parts.push(`M${x} ${y}h${length}v1H${x}z`)
      }
    }
  })

  return parts.join('')
}

function getBit(value, index) {
  return ((value >>> index) & 1) === 1
}

QR_VERSIONS.forEach((version) => {
  version.dataCodewords = version.groups.reduce(
    (total, group) => total + group.count * group.dataCodewords,
    0,
  )
})
