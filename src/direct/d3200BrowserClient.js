import { DeviceCrypto } from './crypto.js'
import { muxOggOpus, oggToWav } from './oggOpus.js'
import {
  NOTIFY_UUID,
  PacketBuffer,
  SERVICE_UUID,
  WRITE_UUID,
  deleteFile,
  encryptHandshake,
  getDeviceInfo,
  listFilesWithEnd,
  parseDeviceInfo,
  parseFileList,
  pauseRecording,
  startRecording,
  startFileExport,
} from './protocol.js'

const initialState = {
  supported: typeof navigator !== 'undefined' && Boolean(navigator.bluetooth) && window.isSecureContext,
  connected: false,
  connecting: false,
  device: null,
  deviceName: null,
  files: [],
  logs: [],
  error: null,
  export: null,
  recordStatus: 0,
}

function friendlyBluetoothError(error) {
  if (error?.name === 'NotFoundError' || /cancel/i.test(error?.message || '')) return '已取消设备选择；再次连接时请选择 soundcore Work'
  if (error?.name === 'SecurityError') return '浏览器拒绝蓝牙权限，请确认页面使用 HTTPS 并允许蓝牙访问'
  if (error?.name === 'NetworkError') return '无法建立蓝牙连接；请关闭飞书 App 或其他正在连接录音豆的程序后重试'
  return error?.message || '蓝牙连接失败'
}

export class D3200BrowserClient {
  #state = structuredClone(initialState)
  #listeners = new Set()
  #device = null
  #server = null
  #writeCharacteristic = null
  #notifyCharacteristic = null
  #packets = new PacketBuffer()
  #crypto = new DeviceCrypto()
  #waiters = new Set()
  #notificationQueue = Promise.resolve()
  #exportContext = null
  #cache = new Map()

  snapshot() {
    return structuredClone(this.#state)
  }

  subscribe(listener) {
    this.#listeners.add(listener)
    listener(this.snapshot())
    return () => this.#listeners.delete(listener)
  }

  #update(changes) {
    Object.assign(this.#state, changes)
    for (const listener of this.#listeners) listener(this.snapshot())
  }

  #log(message, level = 'info') {
    this.#state.logs.push({ time: new Date().toISOString(), message, level })
    this.#state.logs = this.#state.logs.slice(-100)
    this.#update({ logs: this.#state.logs })
  }

  async connect() {
    if (!window.isSecureContext) throw new Error('浏览器直连需要 HTTPS；localhost 调试除外')
    if (!navigator.bluetooth) throw new Error('当前浏览器不支持 Web Bluetooth，请使用电脑 Chrome/Edge 或 Android Chrome')
    if (this.#server?.connected) return this.refresh()
    this.#update({ connecting: true, error: null })
    try {
      this.#device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID],
      })
      try { localStorage.setItem('recording-bean:last-device-id', this.#device.id) } catch {}
      this.#device.addEventListener('gattserverdisconnected', this.#onDisconnected)
      this.#server = await this.#device.gatt.connect()
      const service = await this.#server.getPrimaryService(SERVICE_UUID)
      this.#writeCharacteristic = await service.getCharacteristic(WRITE_UUID)
      this.#notifyCharacteristic = await service.getCharacteristic(NOTIFY_UUID)
      await this.#notifyCharacteristic.startNotifications()
      this.#notifyCharacteristic.addEventListener('characteristicvaluechanged', this.#onNotification)
      this.#update({ connected: true, connecting: false, deviceName: this.#device.name || 'soundcore Work', error: null })
      this.#log(`已由浏览器直接连接 ${this.#device.name || 'soundcore Work'}`)
      await this.refresh()
      return this.snapshot()
    } catch (error) {
      const message = friendlyBluetoothError(error)
      this.#update({ connected: false, connecting: false, error: message })
      this.#log(`连接失败：${message}`, 'error')
      throw new Error(message)
    }
  }

  disconnect() {
    if (this.#device) this.#device.removeEventListener('gattserverdisconnected', this.#onDisconnected)
    if (this.#server?.connected) this.#server.disconnect()
    this.#clearConnection()
  }

  #onDisconnected = () => {
    this.#clearConnection()
    this.#log('录音豆连接已断开', 'error')
  }

  #clearConnection() {
    this.#server = null
    this.#writeCharacteristic = null
    this.#notifyCharacteristic = null
    this.#crypto.reset()
    this.#update({ connected: false, connecting: false, recordStatus: 0 })
  }

  #onNotification = (event) => {
    const value = event.target.value
    const fragment = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    for (const packet of this.#packets.feed(fragment)) {
      this.#notificationQueue = this.#notificationQueue
        .then(() => this.#handlePacket(packet))
        .catch((error) => {
          this.#update({ error: error.message })
          this.#log(error.message, 'error')
        })
    }
  }

  async #handlePacket(packet) {
    if (packet.cmdType === 0x01 && packet.cmdId === 0x01) {
      const device = parseDeviceInfo(packet.payload)
      this.#update({ device, recordStatus: device.recordStatus ?? this.#state.recordStatus, error: null })
    } else if (packet.cmdType === 0x18 && packet.cmdId === 0x82 && packet.payload.length) {
      const recordStatus = packet.payload[0]
      if (recordStatus >= 0 && recordStatus <= 2) {
        this.#update({ recordStatus })
        this.#log(recordStatus === 1 ? '录音豆正在录音' : recordStatus === 2 ? '录音已暂停' : '录音已停止')
        if (recordStatus === 0) setTimeout(() => this.listFiles({ silent: true }).catch(() => {}), 700)
      }
    } else if (packet.cmdType === 0x1a || packet.cmdType === 0x1b) {
      if (packet.cmdId === 0x07 && this.#exportContext) {
        const secret = await this.#crypto.prepareFile(packet.payload)
        if (secret?.fileId === this.#exportContext.fileId) {
          this.#exportContext.expected = secret.fileSize || this.#exportContext.expected
          this.#exportContext.hasHead = true
        }
      } else if ((packet.cmdId === 0x08 || packet.cmdId === 0x12) && this.#exportContext) {
        await this.#consumeSlices(packet.raw)
      }
    } else if (packet.cmdType === 0x2e && packet.cmdId === 0x01) {
      const ok = await this.#crypto.completeHandshake(packet.payload)
      if (!ok) throw new Error('ECDH 握手校验失败')
      this.#log('浏览器已建立本地解密会话')
    }

    for (const waiter of [...this.#waiters]) {
      if (!waiter.predicate(packet)) continue
      clearTimeout(waiter.timer)
      this.#waiters.delete(waiter)
      waiter.resolve(packet)
    }
  }

  async #consumeSlices(raw) {
    const context = this.#exportContext
    let offset = 9
    while (raw.length - offset >= 165) {
      const view = new DataView(raw.buffer, raw.byteOffset + offset, 4)
      const sequence = view.getUint32(0, true)
      offset += 5
      const encrypted = raw.slice(offset, offset + 160)
      offset += 160
      context.parts.push(await this.#crypto.decryptChunk(context.fileId, sequence, encrypted))
      context.received += encrypted.length
      if (offset < raw.length) offset += 1
    }
    const progress = context.expected ? Math.min(100, Math.round(context.received * 100 / context.expected)) : 0
    this.#update({ export: { fileId: context.fileId, status: 'downloading', progress, receivedBytes: context.received, expectedBytes: context.expected } })
  }

  #waitFor(predicate, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null }
      waiter.timer = setTimeout(() => {
        this.#waiters.delete(waiter)
        reject(new Error(`${label}超时，请唤醒录音豆后重试`))
      }, timeoutMs)
      this.#waiters.add(waiter)
    })
  }

  async #write(bytes) {
    if (!this.#writeCharacteristic || !this.#server?.connected) throw new Error('浏览器尚未连接录音豆')
    if (this.#writeCharacteristic.writeValueWithoutResponse) {
      await this.#writeCharacteristic.writeValueWithoutResponse(bytes)
    } else {
      await this.#writeCharacteristic.writeValue(bytes)
    }
  }

  async refresh({ silent = false } = {}) {
    const info = this.#waitFor((packet) => packet.cmdType === 0x01 && packet.cmdId === 0x01, 8000, '读取设备信息')
    await this.#write(getDeviceInfo())
    await info
    await this.listFiles({ silent })
    return this.snapshot()
  }

  async listFiles({ silent = false } = {}) {
    const collected = new Map()
    for (let page = 0; page < 50; page += 1) {
      const response = this.#waitFor((packet) => packet.cmdType === 0x1b && packet.cmdId === 0x0e, 8000, `读取录音列表第 ${page + 1} 页`)
      await this.#write(listFilesWithEnd(page))
      const packet = await response
      const files = parseFileList(packet.payload, true)
      for (const file of files) collected.set(file.fileId, { ...file, exported: this.#cache.has(file.fileId) })
      this.#update({ files: [...collected.values()].sort((a, b) => b.fileId - a.fileId) })
      if (files.length < 10) break
    }
    if (!silent) this.#log(`已读取 ${collected.size} 条录音`)
    return this.snapshot().files
  }

  async startRecording() {
    const wasPaused = this.#state.recordStatus === 2
    await this.#write(startRecording())
    this.#update({ recordStatus: 1 })
    this.#log(wasPaused ? '已继续录音' : '已发送开始录音指令')
    return this.snapshot()
  }

  async pauseRecording() {
    await this.#write(pauseRecording())
    this.#update({ recordStatus: 2 })
    this.#log('已发送暂停录音指令')
    return this.snapshot()
  }

  async #ensureCrypto() {
    if (this.#crypto.hasSession) return
    const response = this.#waitFor((packet) => packet.cmdType === 0x2e && packet.cmdId === 0x01, 12000, '建立本地解密会话')
    await this.#write(encryptHandshake(await this.#crypto.publicKey()))
    await response
    if (!this.#crypto.hasSession) throw new Error('无法建立录音解密会话')
  }

  async exportRecording(fileId) {
    if (this.#cache.has(fileId)) return this.#cache.get(fileId)
    const file = this.#state.files.find((item) => item.fileId === fileId)
    if (!file) throw new Error('当前录音列表里没有这个文件，请先刷新')
    await this.#ensureCrypto()
    this.#exportContext = { fileId, expected: file.sizeBytes, received: 0, parts: [], hasHead: false }
    this.#update({ export: { fileId, status: 'downloading', progress: 0, receivedBytes: 0, expectedBytes: file.sizeBytes } })
    try {
      const done = this.#waitFor((packet) => (packet.cmdType === 0x1a || packet.cmdType === 0x1b) && packet.cmdId === 0x0a, 120000, '导出录音')
      await this.#write(startFileExport(fileId))
      await done
      const context = this.#exportContext
      if (!context.hasHead || !context.parts.length) throw new Error('设备没有返回完整的可解密录音')
      const size = context.parts.reduce((total, part) => total + part.length, 0)
      const raw = new Uint8Array(size)
      let offset = 0
      for (const part of context.parts) {
        raw.set(part, offset)
        offset += part.length
      }
      const durationMs = Math.ceil(raw.length / 160) * 20
      const ogg = muxOggOpus(raw)
      let wav = null
      try {
        wav = await oggToWav(ogg)
      } catch (error) {
        this.#log(`当前浏览器未能转换 WAV，将使用 OGG：${error.message}`, 'error')
      }
      const result = { fileId, durationMs, ogg, wav, audio: wav || ogg, fileName: `${fileId}.${wav ? 'wav' : 'ogg'}` }
      this.#cache.set(fileId, result)
      this.#update({
        export: { fileId, status: 'complete', progress: 100, receivedBytes: context.received, expectedBytes: context.expected },
        files: this.#state.files.map((item) => item.fileId === fileId ? { ...item, exported: true, estimatedDurationMs: durationMs } : item),
      })
      this.#log(`录音 ${fileId} 已在浏览器内解密`)
      return result
    } finally {
      this.#crypto.clearFile(fileId)
      this.#exportContext = null
    }
  }

  async deleteRecording(fileId) {
    const file = this.#state.files.find((item) => item.fileId === fileId)
    if (!file) throw new Error('当前录音列表里没有这个文件，请先刷新')

    const response = this.#waitFor(
      (packet) => packet.cmdType === 0x1a && packet.cmdId === 0x10,
      10000,
      '删除录音',
    )
    await this.#write(deleteFile(fileId))
    const packet = await response
    if (packet.status !== 0) throw new Error(`录音豆拒绝删除（状态码 ${packet.status}）`)

    this.#cache.delete(fileId)
    this.#update({
      files: this.#state.files.filter((item) => item.fileId !== fileId),
      export: this.#state.export?.fileId === fileId ? null : this.#state.export,
    })
    this.#log(`录音 ${fileId} 已从录音豆永久删除`)

    await new Promise((resolve) => setTimeout(resolve, 350))
    await this.listFiles()
    return this.snapshot()
  }
}

export const browserClient = new D3200BrowserClient()
