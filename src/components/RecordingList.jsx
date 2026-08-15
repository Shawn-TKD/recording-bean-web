import { Check, Download, LoaderCircle, RefreshCw, Search, Trash2 } from 'lucide-react'
import { formatBytes, formatDuration, formatTime } from '../utils/format.js'

export function RecordingList({
  files, selectedId, checkedIds, search, autoRefresh, busy, exportState,
  onSelect, onToggle, onToggleAll, onSearch, onAutoRefresh, onRefresh, onBatchExport, onBatchDelete,
}) {
  const allChecked = files.length > 0 && files.every((file) => checkedIds.has(file.fileId))
  const selectionCount = checkedIds.size

  return (
    <section className="recording-list-panel">
      <header className="list-toolbar">
        <label className="check-label">
          <input type="checkbox" checked={allChecked} onChange={(event) => onToggleAll(event.target.checked)} />
          <span>{selectionCount ? `已选择 ${selectionCount} 项` : `${files.length} 条录音`}</span>
        </label>
        <div className="batch-buttons">
          <button className="button compact" disabled={!selectionCount || Boolean(busy)} onClick={onBatchExport}>
            {busy === 'batch-export' ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}导出所选
          </button>
          <button className="button compact danger" disabled={!selectionCount || Boolean(busy)} onClick={onBatchDelete}><Trash2 size={15} />删除所选</button>
        </div>
      </header>

      <div className="list-filter-row">
        <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索标题、日期或标签" /></label>
        <label className="switch-label"><span>自动刷新</span><input type="checkbox" checked={autoRefresh} onChange={(event) => onAutoRefresh(event.target.checked)} /><i /></label>
        <button className="icon-button" disabled={Boolean(busy)} onClick={onRefresh} title="立即刷新"><RefreshCw className={busy === 'refresh' ? 'spin' : ''} size={16} /></button>
      </div>

      <div className="recording-table-head" aria-hidden="true"><span>名称 / 日期</span><span>时长</span><span>大小</span><span>状态</span></div>
      <div className="recording-rows">
        {!files.length ? (
          <div className="list-empty"><Search size={24} /><strong>没有找到录音</strong><span>连接设备或清除搜索条件后再试。</span></div>
        ) : files.map((file) => (
          <div key={file.fileId} className={`recording-row ${selectedId === file.fileId ? 'selected' : ''}`}>
            <label className="row-check" aria-label={`选择 ${file.title}`}>
              <input type="checkbox" checked={checkedIds.has(file.fileId)} onChange={() => onToggle(file.fileId)} />
              <span>{checkedIds.has(file.fileId) && <Check size={12} />}</span>
            </label>
            <button className="row-main" onClick={() => onSelect(file.fileId)}>
              <span className="row-title"><strong>{file.title}</strong><small>{formatTime(file.fileId)}</small></span>
              <span>{formatDuration(file.estimatedDurationMs)}</span>
              <span>{formatBytes(file.sizeBytes)}</span>
              <span className="ready-state"><i />{file.exported ? '已缓存' : '可导出'}</span>
            </button>
          </div>
        ))}
      </div>
      <footer className="list-footer">
        <span>共 {files.length} 条录音</span>
        {exportState?.status === 'downloading' && <span>正在读取 {exportState.progress}%</span>}
      </footer>
    </section>
  )
}

