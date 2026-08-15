const FRAME_SIZE = 160
const SAMPLES_PER_FRAME = 960
const SAMPLE_RATE = 48000

function concat(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function crc32Ogg(bytes) {
  let crc = 0
  for (const byte of bytes) {
    crc ^= byte << 24
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x80000000 ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0
    }
  }
  return crc >>> 0
}

function page(packets, serial, sequence, granule, flags = 0) {
  const segments = []
  const bodyParts = []
  for (const packet of packets) {
    bodyParts.push(packet)
    let remaining = packet.length
    while (remaining >= 255) {
      segments.push(255)
      remaining -= 255
    }
    segments.push(remaining)
  }
  const header = new Uint8Array(27 + segments.length)
  header.set(new TextEncoder().encode('OggS'), 0)
  header[4] = 0
  header[5] = flags
  const view = new DataView(header.buffer)
  view.setBigUint64(6, BigInt(granule), true)
  view.setUint32(14, serial, true)
  view.setUint32(18, sequence, true)
  header[26] = segments.length
  header.set(segments, 27)
  const output = concat([header, ...bodyParts])
  new DataView(output.buffer).setUint32(22, crc32Ogg(output), true)
  return output
}

export function muxOggOpus(raw) {
  if (!raw.length) throw new Error('录音数据为空')
  const frames = []
  for (let offset = 0; offset < raw.length; offset += FRAME_SIZE) {
    let frame = raw.slice(offset, offset + FRAME_SIZE)
    let end = frame.length
    while (end > 0 && frame[end - 1] === 0) end -= 1
    frame = end ? frame.slice(0, end) : new Uint8Array([0])
    frames.push(frame)
  }

  const head = new Uint8Array(19)
  head.set(new TextEncoder().encode('OpusHead'), 0)
  head.set([1, 1], 8)
  const headView = new DataView(head.buffer)
  headView.setUint16(10, 3840, true)
  headView.setUint32(12, SAMPLE_RATE, true)
  headView.setInt16(16, 0, true)
  head[18] = 0

  const vendor = new TextEncoder().encode('D3200 Browser')
  const tags = new Uint8Array(16 + vendor.length)
  tags.set(new TextEncoder().encode('OpusTags'), 0)
  const tagsView = new DataView(tags.buffer)
  tagsView.setUint32(8, vendor.length, true)
  tags.set(vendor, 12)
  tagsView.setUint32(12 + vendor.length, 0, true)

  const serial = 0x41524b52
  const pages = [page([head], serial, 0, 0, 0x02), page([tags], serial, 1, 0)]
  let granule = 0
  let sequence = 2
  for (let start = 0; start < frames.length; start += 50) {
    const batch = frames.slice(start, start + 50)
    granule += batch.length * SAMPLES_PER_FRAME
    pages.push(page(batch, serial, sequence++, granule, start + 50 >= frames.length ? 0x04 : 0))
  }
  return new Blob(pages, { type: 'audio/ogg; codecs=opus' })
}

export async function oggToWav(oggBlob) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) throw new Error('当前浏览器不能将 Opus 转成 WAV')
  const context = new AudioContextClass()
  try {
    const audio = await context.decodeAudioData(await oggBlob.arrayBuffer())
    const channels = audio.numberOfChannels
    const frames = audio.length
    const bytes = new ArrayBuffer(44 + frames * channels * 2)
    const view = new DataView(bytes)
    const write = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
    write(0, 'RIFF')
    view.setUint32(4, 36 + frames * channels * 2, true)
    write(8, 'WAVE')
    write(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, channels, true)
    view.setUint32(24, audio.sampleRate, true)
    view.setUint32(28, audio.sampleRate * channels * 2, true)
    view.setUint16(32, channels * 2, true)
    view.setUint16(34, 16, true)
    write(36, 'data')
    view.setUint32(40, frames * channels * 2, true)
    let offset = 44
    const data = Array.from({ length: channels }, (_, channel) => audio.getChannelData(channel))
    for (let frame = 0; frame < frames; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, data[channel][frame]))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += 2
      }
    }
    return new Blob([bytes], { type: 'audio/wav' })
  } finally {
    await context.close()
  }
}
