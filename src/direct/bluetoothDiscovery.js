import { SERVICE_UUID } from './protocol.js'

export const DISCOVERY_MODE = Object.freeze({
  precise: 'precise',
  all: 'all',
})

export function createBluetoothRequestOptions(mode = DISCOVERY_MODE.precise) {
  if (mode === DISCOVERY_MODE.all) {
    return {
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID],
    }
  }

  return {
    filters: [{ services: [SERVICE_UUID] }],
  }
}
