import { BatteryMedium, Bluetooth, HardDrive, Link2Off, LoaderCircle, Mic2, Pause, Play, RotateCw } from 'lucide-react'
import { formatBytes } from '../utils/format.js'

export function DeviceBar({ state, busy, supportReason, onConnect, onDisconnect, onStart, onPause }) {
  const { connected, device, recordStatus, deviceName } = state
  const freeBytes = Number.isFinite(device?.freeMemoryKb) ? device.freeMemoryKb * 1024 : null
  const isRecording = recordStatus === 1
  const isPaused = recordStatus === 2

  return (
    <section className="device-bar">
      <div className="device-identity">
        <div className="device-product"><img src="/assets/d3200-product.png" alt="银色飞书录音豆 D3200" /></div>
        <div>
          <h1>录音豆 <span>({deviceName || 'soundcore Work'})</span></h1>
          <p className={connected ? 'connected' : ''}><span className={`status-dot ${connected ? 'online' : ''}`} />{connected ? '已连接，可直接读取设备' : supportReason}</p>
        </div>
      </div>

      <div className="device-metrics" aria-label="设备状态">
        <div><BatteryMedium size={17} /><span>电量</span><strong>{device?.battery != null ? `${device.battery}%` : '—'}</strong></div>
        <div><HardDrive size={17} /><span>可用空间</span><strong>{formatBytes(freeBytes)}</strong></div>
        <div><RotateCw size={17} /><span>固件</span><strong>{device?.firmwareVersion || '—'}</strong></div>
      </div>

      <div className="device-actions">
        {!connected ? (
          <button className="button primary" disabled={!state.supported || busy === 'connect'} onClick={onConnect}>
            {busy === 'connect' ? <LoaderCircle className="spin" size={17} /> : <Bluetooth size={17} />}连接录音豆
          </button>
        ) : (
          <button className="button subtle" onClick={onDisconnect}><Link2Off size={16} />断开连接</button>
        )}
      </div>

      {connected && (
        <div className="record-control-row">
          <button className={`button record ${isRecording ? 'active' : ''}`} disabled={Boolean(busy) || isRecording} onClick={onStart}>
            {isPaused ? <Play size={17} /> : <Mic2 size={17} />}{isPaused ? '继续录音' : isRecording ? '正在录音' : '开始录音'}
          </button>
          <button className="button" disabled={Boolean(busy) || !isRecording} onClick={onPause}><Pause size={17} />暂停</button>
          <span className="experimental-note">录音控制来自已验证的 D3200 协议，首次使用请同时观察设备指示灯。</span>
        </div>
      )}
    </section>
  )
}
