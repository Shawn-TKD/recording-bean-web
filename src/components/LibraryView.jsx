import { FileText, Search, Sparkles, Tag } from 'lucide-react'
import { formatTime } from '../utils/format.js'

export function LibraryView({ entries, onOpen }) {
  return (
    <section className="page-view">
      <header className="page-heading"><div><h1>本地资料库</h1><p>只保存标题、标签、转录与总结；音频仍留在录音豆或你的下载目录。</p></div><span>{entries.length} 项</span></header>
      {!entries.length ? (
        <div className="page-empty"><Search size={28} /><strong>资料库还是空的</strong><span>连接录音豆后，录音索引会自动保存在这个浏览器。</span></div>
      ) : (
        <div className="library-list">
          {entries.map((entry) => (
            <button key={entry.fileId} onClick={() => onOpen(entry.fileId)}>
              <div><strong>{entry.title}</strong><small>{formatTime(entry.fileId)} · {entry.devicePresent ? '设备中可见' : '仅本地索引'}</small></div>
              <div className="library-tags">{(entry.tags || []).slice(0, 3).map((tag) => <span key={tag}><Tag size={11} />{tag}</span>)}</div>
              <div className="library-state"><span><FileText size={14} />{entry.transcript ? '有转录' : '无转录'}</span><span><Sparkles size={14} />{entry.summary ? '有总结' : '无总结'}</span></div>
              {(entry.summary || entry.transcript) && <p>{String(entry.summary || entry.transcript).slice(0, 110)}{String(entry.summary || entry.transcript).length > 110 ? '…' : ''}</p>}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
