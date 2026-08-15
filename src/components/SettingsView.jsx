import { Bluetooth, Eye, EyeOff, KeyRound, LockKeyhole, RefreshCw, Smartphone } from 'lucide-react'

export function SettingsView({ apiKey, showKey, autoRefresh, onApiKeyChange, onToggleKey, onAutoRefresh, onClearLibrary }) {
  return (
    <section className="page-view settings-view">
      <header className="page-heading"><div><h1>设置</h1><p>所有设置都只作用于当前浏览器。</p></div></header>
      <div className="settings-section">
        <div className="settings-copy"><KeyRound size={19} /><div><strong>SiliconFlow API Key</strong><span>仅保存在页面内存，刷新或关闭页面后消失，不写入本地存储。</span></div></div>
        <div className="settings-key"><input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => onApiKeyChange(event.target.value)} placeholder="sk-..." autoComplete="off" /><button onClick={onToggleKey}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      </div>
      <div className="settings-section setting-line">
        <div className="settings-copy"><RefreshCw size={19} /><div><strong>自动发现新录音</strong><span>连接期间每 12 秒刷新一次设备列表。</span></div></div>
        <label className="switch-label"><input type="checkbox" checked={autoRefresh} onChange={(event) => onAutoRefresh(event.target.checked)} /><i /></label>
      </div>
      <div className="settings-section compatibility">
        <div className="settings-copy"><Bluetooth size={19} /><div><strong>浏览器兼容性</strong><span>Windows / macOS：Chrome 或 Edge；Android：Chrome。iPhone / iPad 浏览器不支持 Web Bluetooth，需要原生 App。</span></div></div>
        <div className="compatibility-icons"><Smartphone size={18} /><span>iOS 暂不支持网页直连</span></div>
      </div>
      <div className="settings-section setting-line danger-zone">
        <div className="settings-copy"><LockKeyhole size={19} /><div><strong>清空本地资料库</strong><span>只删除此浏览器内的标题、标签、转录和总结，不会删除录音豆文件。</span></div></div>
        <button className="button danger" onClick={onClearLibrary}>清空本地资料</button>
      </div>
    </section>
  )
}

