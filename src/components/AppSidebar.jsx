import { Bluetooth, FolderOpen, Settings, ShieldCheck, Waves } from 'lucide-react'

const navigation = [
  { id: 'device', label: '设备与录音', icon: Bluetooth },
  { id: 'library', label: '本地资料库', icon: FolderOpen },
  { id: 'settings', label: '设置', icon: Settings },
]

export function AppSidebar({ activeView, onViewChange, connected, deviceName }) {
  return (
    <aside className="app-sidebar">
      <div className="app-brand"><span className="brand-symbol"><Waves size={20} /></span><strong>录音豆</strong></div>
      <nav className="app-nav" aria-label="主导航">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeView === id ? 'active' : ''} onClick={() => onViewChange(id)}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-privacy"><ShieldCheck size={16} /><span>无需账号<br />数据留在本机</span></div>
      <div className="sidebar-device-state">
        <span className={`status-dot ${connected ? 'online' : ''}`} />
        <div><strong>{deviceName || 'soundcore Work'}</strong><small>{connected ? '浏览器已连接' : '尚未连接'}</small></div>
      </div>
    </aside>
  )
}

