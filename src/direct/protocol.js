export const SERVICE_UUID = '020cf5da-0000-1000-8000-00805f9b34fb'
export const WRITE_UUID = '00007777-0000-1000-8000-00805f9b34fb'
export const NOTIFY_UUID = '00008888-0000-1000-8000-00805f9b34fb'

export function encodeCommand(cmdType, cmdId, payload = new Uint8Array()) {
  const bytes = new Uint8Array(10 + payload.length)
  bytes.set([0x08, 0xee, 0x00, 0x00, 0x00, cmdType & 0xff, cmdId & 0xff])
  bytes[7] = bytes.length & 0xff
  bytes[8] = (bytes.length >>> 8) & 0xff
  bytes.set(payload, 9)
  bytes[bytes.length - 1] = checksum(bytes.subarray(0, bytes.length - 1))
  return bytes
}

export function u16le(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff])
}

export function u32le(value) {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, Number(value), true)
  return bytes
}

export function checksum(bytes) {
  let value = 0
  for (const byte of bytes) value = (value + byte) & 0xff
  return value
}

export function listFilesWithEnd(page = 0) {
  return encodeCommand(0x1b, 0x0e, u16le(page))
}

export function getDeviceInfo() {
  return encodeCommand(0x01, 0x01)
}

export function startRecording() {
  return encodeCommand(0x18, 0x82, new Uint8Array([0x01]))
}

export function pauseRecording() {
  return encodeCommand(0x18, 0x82, new Uint8Array([0x02]))
}

export function encryptHandshake(publicKey) {
  return encodeCommand(0x2e, 0x01, publicKey)
}

export function startFileExport(fileId, alreadyTransferred = 0) {
  const payload = new Uint8Array(9)
  payload.set(u32le(alreadyTransferred), 0)
  payload.set(u32le(fileId), 4)
  return encodeCommand(0x1a, 0x07, payload)
}

export function deleteFile(fileId) {
  return encodeCommand(0x1a, 0x10, u32le(fileId))
}

export class PacketBuffer {
  #buffer = new Uint8Array()

  feed(fragment) {
    const incoming = fragment instanceof Uint8Array ? fragment : new Uint8Array(fragment)
    const joined = new Uint8Array(this.#buffer.length + incoming.length)
    joined.set(this.#buffer)
    joined.set(incoming, this.#buffer.length)
    this.#buffer = joined
    const packets = []

    while (this.#buffer.length >= 10) {
      const start = findHeader(this.#buffer)
      if (start < 0) {
        this.#buffer = new Uint8Array()
        break
      }
      if (start > 0) this.#buffer = this.#buffer.slice(start)
      if (this.#buffer.length < 10) break
      const total = this.#buffer[7] | (this.#buffer[8] << 8)
      if (total < 10) {
        this.#buffer = this.#buffer.slice(1)
        continue
      }
      if (this.#buffer.length < total) break
      const raw = this.#buffer.slice(0, total)
      this.#buffer = this.#buffer.slice(total)
      if (checksum(raw.subarray(0, raw.length - 1)) !== raw[raw.length - 1]) continue
      packets.push({
        raw,
        status: raw[4],
        cmdType: raw[5],
        cmdId: raw[6],
        payload: raw.slice(9, -1),
      })
    }
    return packets
  }
}

function findHeader(bytes) {
  for (let index = 0; index <= bytes.length - 4; index += 1) {
    if (bytes[index] === 0x09 && bytes[index + 1] === 0xff && bytes[index + 2] === 0x00 && bytes[index + 3] === 0x00) return index
  }
  return -1
}

function readAscii(bytes) {
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end >= 0 ? bytes.slice(0, end) : bytes).trim()
}

function batteryPercent(raw) {
  if (raw == null) return null
  const value = raw & 0x7f
  return value <= 9 ? (value + 1) * 10 : Math.min(value, 100)
}

export function parseBatteryStatus(payload) {
  const result = {}
  if (payload.length > 0) result.battery = batteryPercent(payload[0])
  if (payload.length > 1) result.boxBattery = batteryPercent(payload[1])
  return result
}

export function parseChargingStatus(payload) {
  const result = {}
  if (payload.length > 0) result.charging = payload[0] === 1
  if (payload.length > 1) result.boxCharging = payload[1] === 1
  return result
}

export function parseDeviceInfo(payload) {
  const result = {}
  if (payload.length < 3) return result
  result.connectStatus = payload[0]
  result.battery = batteryPercent(payload[1])
  result.charging = payload[2] === 1
  let offset = 3
  if (payload.length >= offset + 5) {
    result.firmwareVersion = readAscii(payload.slice(offset, offset + 5))
    offset += 5
  }
  if (payload.length >= offset + 16) {
    result.serialNumber = readAscii(payload.slice(offset, offset + 16)).toLowerCase()
    offset += 16
  }
  if (payload.length >= offset + 8) {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
    result.totalMemoryKb = view.getUint32(offset, true)
    result.freeMemoryKb = view.getUint32(offset + 4, true)
    offset += 8
  }
  if (payload.length > offset) result.boxCharging = payload[offset++] === 1
  if (payload.length >= offset + 5) {
    result.boxFirmware = readAscii(payload.slice(offset, offset + 5))
    offset += 5
  }
  if (payload.length > offset) result.boxBattery = batteryPercent(payload[offset++])
  if (payload.length >= offset + 6) {
    result.boxMac = [...payload.slice(offset, offset + 6)].map((value) => value.toString(16).padStart(2, '0')).join(':')
    offset += 6
  }
  if (payload.length >= offset + 6) {
    offset += 5 // device color, auto-off switch/index, mic light, case light
    result.recording = payload[offset] === 1
    result.recordStatus = result.recording ? 1 : 0
  }
  return result
}

export function estimateRecordingDurationMs(fileId, endTime, sizeBytes) {
  // D3200's file-list size closely tracks encoded audio milliseconds. The
  // optional endTime is normally useful, but can occasionally contain a stale
  // value (observed as hours for a seconds-long recording).
  const sizeEstimate = sizeBytes > 0 ? Number(sizeBytes) : null
  if (endTime != null && endTime >= fileId) {
    const clockEstimate = (endTime - fileId) * 1000
    if (sizeEstimate == null) return clockEstimate
    const ratio = clockEstimate / sizeEstimate
    if (ratio >= 0.5 && ratio <= 2) return clockEstimate
  }
  return sizeEstimate
}

export function parseFileList(payload, withEndTime = true) {
  if (payload.length < 2) return []
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const count = view.getUint16(0, true)
  const files = []
  let offset = 2
  const entrySize = withEndTime ? 12 : 8
  for (let index = 0; index < count && offset + entrySize <= payload.length; index += 1) {
    const fileId = view.getUint32(offset, true)
    offset += 4
    const endTime = withEndTime ? view.getUint32(offset, true) : null
    if (withEndTime) offset += 4
    const sizeBytes = view.getUint32(offset, true)
    offset += 4
    if (!sizeBytes) continue
    files.push({
      fileId,
      endTime,
      sizeBytes,
      estimatedDurationMs: estimateRecordingDurationMs(fileId, endTime, sizeBytes),
    })
  }
  return files
}
