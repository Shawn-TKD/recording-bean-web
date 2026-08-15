const MAGIC = new TextEncoder().encode('soundcored3200')

function equalBytes(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index]
  return diff === 0
}

async function aesCtr(data, keyBytes, counter) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-CTR', false, ['decrypt'])
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CTR', counter, length: 128 }, key, data))
}

export class DeviceCrypto {
  #keyPair = null
  #sessionKey = null
  #files = new Map()

  get hasSession() {
    return this.#sessionKey != null
  }

  async publicKey() {
    if (!this.#keyPair) {
      this.#keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    }
    return new Uint8Array(await crypto.subtle.exportKey('raw', this.#keyPair.publicKey))
  }

  async completeHandshake(payload) {
    if (payload.length < 97) return false
    await this.publicKey()
    const peer = await crypto.subtle.importKey('raw', payload.slice(0, 65), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, this.#keyPair.privateKey, 256))
    if (!equalBytes(shared, payload.slice(65, 97))) return false
    const hkdfKey = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits'])
    this.#sessionKey = new Uint8Array(await crypto.subtle.deriveBits({
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array([1, 2, 3]),
      info: new Uint8Array([1, 2, 3]),
    }, hkdfKey, 256))
    return true
  }

  async prepareFile(payload) {
    if (!this.#sessionKey || payload.length < 87) return null
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
    const secret = {
      fileId: view.getUint32(0, true),
      fileSize: view.getUint32(4, true),
      nonce: payload.slice(8, 24),
      encryptedKey: payload.slice(24, 70),
      sessionNonce: payload.slice(70, 86),
      errorCode: payload[86],
    }
    if (secret.errorCode !== 0) throw new Error(`设备拒绝导出（错误码 ${secret.errorCode}）`)
    const plain = await aesCtr(secret.encryptedKey, this.#sessionKey, secret.sessionNonce)
    if (plain.length < 46 || !equalBytes(plain.slice(0, 14), MAGIC)) throw new Error('录音文件密钥校验失败')
    this.#files.set(secret.fileId, { key: plain.slice(14, 46), nonce: secret.nonce.slice(0, 12) })
    return secret
  }

  async decryptChunk(fileId, sequence, data) {
    const file = this.#files.get(fileId)
    if (!file) throw new Error('尚未取得录音文件密钥')
    const counter = new Uint8Array(16)
    counter.set(file.nonce, 0)
    new DataView(counter.buffer).setUint32(12, sequence * 10, false)
    return aesCtr(data, file.key, counter)
  }

  clearFile(fileId) {
    this.#files.delete(fileId)
  }

  reset() {
    this.#sessionKey = null
    this.#files.clear()
  }
}
