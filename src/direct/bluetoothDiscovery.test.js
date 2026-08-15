import assert from 'node:assert/strict'
import test from 'node:test'
import { SERVICE_UUID } from './protocol.js'
import { DISCOVERY_MODE, createBluetoothRequestOptions } from './bluetoothDiscovery.js'

test('precise discovery filters by the D3200 service without relying on its name', () => {
  assert.deepEqual(createBluetoothRequestOptions(), {
    filters: [{ services: [SERVICE_UUID] }],
  })
})

test('all-device discovery remains available as a compatibility fallback', () => {
  assert.deepEqual(createBluetoothRequestOptions(DISCOVERY_MODE.all), {
    acceptAllDevices: true,
    optionalServices: [SERVICE_UUID],
  })
})
