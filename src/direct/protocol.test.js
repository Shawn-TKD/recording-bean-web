import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateRecordingDurationMs, parseBatteryStatus, parseChargingStatus,
  parseDeviceInfo, parseFileList, pauseRecording, startRecording,
} from './protocol.js'

test('recording commands match D3200 audio-control protocol', () => {
  const start = startRecording()
  const pause = pauseRecording()
  assert.deepEqual([...start.slice(5, 10)], [0x18, 0x82, 0x0b, 0x00, 0x01])
  assert.deepEqual([...pause.slice(5, 10)], [0x18, 0x82, 0x0b, 0x00, 0x02])
})

test('duration falls back to encoded size when device end time is stale', () => {
  assert.equal(estimateRecordingDurationMs(1000, 1003, 2400), 3000)
  assert.equal(estimateRecordingDurationMs(1000, 9000, 2400), 2400)
})

test('file list parser reads id, end time and size', () => {
  const payload = new Uint8Array(14)
  const view = new DataView(payload.buffer)
  view.setUint16(0, 1, true)
  view.setUint32(2, 1000, true)
  view.setUint32(6, 1003, true)
  view.setUint32(10, 2400, true)
  assert.deepEqual(parseFileList(payload, true), [{ fileId: 1000, endTime: 1003, sizeBytes: 2400, estimatedDurationMs: 3000 }])
})

test('device info exposes recorder and charging-case battery independently', () => {
  const payload = new Uint8Array(39)
  payload.set([1, 7, 0], 0)
  payload.set(new TextEncoder().encode('04.92'), 3)
  payload.set(new TextEncoder().encode('D3200-TEST-00001'), 8)
  const view = new DataView(payload.buffer)
  view.setUint32(24, 7_654_321, true)
  view.setUint32(28, 7_123_456, true)
  payload[32] = 1
  payload.set(new TextEncoder().encode('01.08'), 33)
  payload[38] = 9

  const info = parseDeviceInfo(payload)
  assert.equal(info.battery, 80)
  assert.equal(info.charging, false)
  assert.equal(info.boxBattery, 100)
  assert.equal(info.boxCharging, true)
})

test('live battery and charging pushes expose both components', () => {
  assert.deepEqual(parseBatteryStatus(new Uint8Array([6, 8])), { battery: 70, boxBattery: 90 })
  assert.deepEqual(parseChargingStatus(new Uint8Array([1, 0])), { charging: true, boxCharging: false })
})
