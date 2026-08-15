import { useEffect, useMemo, useRef, useState } from 'react'
import { CloudOff, FolderOpen, Settings, ShieldCheck, Waves } from 'lucide-react'
import { AppSidebar } from './components/AppSidebar.jsx'
import { DeviceBar } from './components/DeviceBar.jsx'
import { LibraryView } from './components/LibraryView.jsx'
import { RecordingDetail } from './components/RecordingDetail.jsx'
import { RecordingList } from './components/RecordingList.jsx'
import { SettingsView } from './components/SettingsView.jsx'
import { browserClient } from './direct/d3200BrowserClient.js'
import { createRecordingZip } from './direct/exportBundle.js'
import {
  clearWorkspace, loadWorkspace, persistWorkspace, saveRecordingEntry,
} from './direct/localWorkspace.js'
import { summarizeTranscript, transcribeAudio } from './direct/siliconflow.js'
import { defaultTitle, formatTime, saveBlob, textBlob } from './utils/format.js'

function previewState() {
  const now = 1786786550
  const sizes = [7647000, 2718000, 3930000, 1930000, 5285000]
  return {
    supported: true, connected: true, connecting: false, deviceName: 'soundcore Work', recordStatus: 0,
    device: { battery: 80, charging: false, boxBattery: 100, boxCharging: true, freeMemoryKb: 7.2 * 1024 * 1024, firmwareVersion: '04.92' },
    files: sizes.map((sizeBytes, index) => ({ fileId: now - index * 4680, sizeBytes, estimatedDurationMs: sizeBytes, exported: index === 1 })),
    logs: [], error: null, export: null,
  }
}

function DirectApp() {
  const previewParams = new URLSearchParams(window.location.search)
  const isPreview = import.meta.env.DEV && previewParams.has('preview')
  const previewDisconnected = isPreview && previewParams.get('state') === 'disconnected'
  const [deviceState, setDeviceState] = useState(() => {
    if (!isPreview) return browserClient.snapshot()
    if (!previewDisconnected) return previewState()
    return { ...previewState(), connected: false, device: null, files: [] }
  })
  const [workspace, setWorkspace] = useState(loadWorkspace)
  const [activeView, setActiveView] = useState('device')
  const [selectedId, setSelectedId] = useState(null)
  const [checkedIds, setCheckedIds] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [activeTab, setActiveTab] = useState('transcript')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [assets, setAssets] = useState({})
  const [player, setPlayer] = useState(null)
  const busyRef = useRef('')
  const knownIdsRef = useRef(null)

  useEffect(() => isPreview ? undefined : browserClient.subscribe(setDeviceState), [isPreview])
  useEffect(() => { busyRef.current = busy }, [busy])
  useEffect(() => () => { if (player?.url) URL.revokeObjectURL(player.url) }, [player])

  const supportReason = useMemo(() => {
    if (!window.isSecureContext) return '需要 HTTPS 才能连接蓝牙'
    if (!navigator.bluetooth) return '请使用电脑 Chrome / Edge 或 Android Chrome'
    return '等待连接'
  }, [])

  useEffect(() => {
    if (!deviceState.files.length) return
    setWorkspace((current) => {
      let changed = false
      const next = { ...current }
      for (const file of deviceState.files) {
        const key = String(file.fileId)
        const previous = next[key] || {}
        const updated = {
          ...previous,
          fileId: file.fileId,
          title: previous.title || defaultTitle(file.fileId),
          tags: previous.tags || [],
          sizeBytes: file.sizeBytes,
          estimatedDurationMs: file.estimatedDurationMs,
          recordedAt: file.fileId,
          updatedAt: previous.updatedAt || Date.now(),
        }
        if (JSON.stringify(previous) !== JSON.stringify(updated)) {
          next[key] = updated
          changed = true
        }
      }
      if (!changed) return current
      try { persistWorkspace(next) } catch (error) { setNotice(error.message) }
      return next
    })
  }, [deviceState.files])

  useEffect(() => {
    if (!deviceState.connected) {
      knownIdsRef.current = null
      return
    }
    const ids = new Set(deviceState.files.map((file) => file.fileId))
    if (knownIdsRef.current) {
      const added = [...ids].filter((id) => !knownIdsRef.current.has(id))
      if (added.length) {
        setNotice(`发现 ${added.length} 条新录音，已自动加入列表。`)
        setSelectedId(added[0])
      }
    }
    knownIdsRef.current = ids
  }, [deviceState.connected, deviceState.files])

  useEffect(() => {
    if (isPreview || !deviceState.connected || !autoRefresh) return undefined
    const timer = window.setInterval(() => {
      if (busyRef.current) return
      browserClient.refresh({ silent: true }).catch((error) => setNotice(error.message))
    }, 12000)
    return () => window.clearInterval(timer)
  }, [deviceState.connected, autoRefresh, isPreview])

  useEffect(() => {
    if (selectedId == null && deviceState.files[0]) setSelectedId(deviceState.files[0].fileId)
  }, [deviceState.files, selectedId])

  const files = useMemo(() => deviceState.files.map((file) => ({
    ...file,
    title: workspace[String(file.fileId)]?.title || defaultTitle(file.fileId),
    tags: workspace[String(file.fileId)]?.tags || [],
  })), [deviceState.files, workspace])

  const visibleFiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return files
    return files.filter((file) => [file.title, formatTime(file.fileId), ...(file.tags || [])].join(' ').toLowerCase().includes(query))
  }, [files, search])

  const deviceFile = files.find((file) => file.fileId === selectedId) || null
  const storedEntry = selectedId != null ? workspace[String(selectedId)] : null
  const selectedFile = deviceFile || (storedEntry ? {
    fileId: storedEntry.fileId,
    sizeBytes: storedEntry.sizeBytes,
    estimatedDurationMs: storedEntry.estimatedDurationMs,
  } : null)
  const selectedEntry = selectedFile ? {
    title: defaultTitle(selectedFile.fileId), tags: [], transcript: '', summary: '',
    summaryTemplate: 'meeting', customPrompt: '', ...workspace[String(selectedFile.fileId)],
  } : null

  const libraryEntries = useMemo(() => {
    const deviceIds = new Set(files.map((file) => file.fileId))
    return Object.values(workspace)
      .map((entry) => ({ ...entry, devicePresent: deviceIds.has(entry.fileId) }))
      .sort((a, b) => b.fileId - a.fileId)
  }, [workspace, files])

  async function run(label, action) {
    setBusy(label)
    setNotice('')
    try {
      return await action()
    } catch (error) {
      setNotice(error.message || String(error))
      return null
    } finally {
      setBusy('')
    }
  }

  function updateEntry(fileId, patch) {
    try {
      const saved = saveRecordingEntry(fileId, patch)
      setWorkspace((current) => ({ ...current, [String(fileId)]: saved }))
    } catch (error) {
      setNotice(error.message)
    }
  }

  async function connect(discoveryMode = 'precise') {
    if (isPreview) {
      setNotice(discoveryMode === 'precise'
        ? '预览：将按 D3200 服务 UUID 精确搜索，不依赖设备名称。'
        : '预览：将显示附近全部蓝牙设备，Mac 上录音豆可能显示为未知设备。')
      return
    }
    await run(`connect-${discoveryMode}`, async () => {
      await browserClient.connect({ discoveryMode })
      const first = browserClient.snapshot().files[0]
      if (first) setSelectedId(first.fileId)
    })
  }

  async function getAsset(file) {
    if (assets[file.fileId]) return assets[file.fileId]
    const asset = await browserClient.exportRecording(file.fileId)
    setAssets((current) => ({ ...current, [file.fileId]: asset }))
    return asset
  }

  async function play(file) {
    await run(`play-${file.fileId}`, async () => {
      const asset = await getAsset(file)
      if (player?.url) URL.revokeObjectURL(player.url)
      setPlayer({ fileId: file.fileId, url: URL.createObjectURL(asset.audio) })
    })
  }

  async function downloadAudio(file) {
    await run(`download-${file.fileId}`, async () => {
      const asset = await getAsset(file)
      saveBlob(asset.audio, `${selectedEntry.title}.${asset.fileName.split('.').pop()}`)
    })
  }

  async function deleteAudio(file) {
    if (!window.confirm(`确定从录音豆永久删除“${selectedEntry.title}”吗？此操作无法恢复。`)) return
    await run(`delete-${file.fileId}`, async () => {
      await browserClient.deleteRecording(file.fileId)
      if (player?.fileId === file.fileId) {
        URL.revokeObjectURL(player.url)
        setPlayer(null)
      }
      setAssets((current) => {
        const next = { ...current }
        delete next[file.fileId]
        return next
      })
      const remaining = browserClient.snapshot().files
      setSelectedId(remaining[0]?.fileId ?? file.fileId)
      setNotice('录音已从设备删除；已有标题、转录和总结仍保留在本地资料库。')
    })
  }

  async function batchDelete() {
    const targets = files.filter((file) => checkedIds.has(file.fileId))
    if (!targets.length || !window.confirm(`确定从录音豆永久删除所选 ${targets.length} 条录音吗？此操作无法恢复。`)) return
    await run('batch-delete', async () => {
      for (let index = 0; index < targets.length; index += 1) {
        setNotice(`正在删除 ${index + 1}/${targets.length}…`)
        await browserClient.deleteRecording(targets[index].fileId)
      }
      setCheckedIds(new Set())
      setSelectedId(browserClient.snapshot().files[0]?.fileId ?? null)
      setNotice(`已从设备删除 ${targets.length} 条录音，本地文字资料仍保留。`)
    })
  }

  async function makeBundle(targets, label) {
    await run(label, async () => {
      const entries = []
      for (let index = 0; index < targets.length; index += 1) {
        const file = targets[index]
        setNotice(`正在读取音频 ${index + 1}/${targets.length}…`)
        const asset = await getAsset(file)
        const entry = workspace[String(file.fileId)] || {}
        entries.push({ file, asset, title: entry.title || defaultTitle(file.fileId), tags: entry.tags || [], transcript: entry.transcript, summary: entry.summary })
      }
      setNotice('正在生成资料包…')
      const zip = await createRecordingZip(entries)
      saveBlob(zip, targets.length === 1 ? `${entries[0].title}-资料包.zip` : `录音豆资料包-${Date.now()}.zip`)
      setNotice(`资料包已生成，包含 ${targets.length} 条录音及已有文字内容。`)
    })
  }

  async function transcribe(file) {
    await run(`transcribe-${file.fileId}`, async () => {
      const asset = await getAsset(file)
      const transcript = await transcribeAudio({ apiKey, blob: asset.audio, fileName: asset.fileName })
      updateEntry(file.fileId, { transcript, summary: '' })
      setActiveTab('transcript')
      setNotice('转录已生成并保存在当前浏览器。')
    })
  }

  async function summarize(file) {
    await run(`summarize-${file.fileId}`, async () => {
      const summary = await summarizeTranscript({
        apiKey,
        transcript: selectedEntry.transcript,
        template: selectedEntry.summaryTemplate || 'meeting',
        customPrompt: selectedEntry.customPrompt || '',
      })
      updateEntry(file.fileId, { summary })
      setActiveTab('summary')
      setNotice('总结已生成并保存在当前浏览器。')
    })
  }

  function downloadText(kind) {
    if (!selectedFile) return
    const title = selectedEntry.title || defaultTitle(selectedFile.fileId)
    if (kind === 'transcript' && selectedEntry.transcript) saveBlob(textBlob(selectedEntry.transcript), `${title}-转录.txt`)
    if (kind === 'summary' && selectedEntry.summary) saveBlob(textBlob(`# ${title}\n\n${selectedEntry.summary}\n`, 'text/markdown'), `${title}-总结.md`)
  }

  function toggleChecked(fileId) {
    setCheckedIds((current) => {
      const next = new Set(current)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  function openLibraryEntry(fileId) {
    if (!files.some((file) => file.fileId === fileId)) {
      setNotice('这条录音当前不在设备列表中；文字内容仍保存在下方本地资料卡中。')
      return
    }
    setSelectedId(fileId)
    setActiveView('device')
  }

  function clearLocalLibrary() {
    if (!window.confirm('确定清空此浏览器里的标题、标签、转录和总结吗？录音豆文件不会被删除。')) return
    clearWorkspace()
    setWorkspace({})
    setNotice('本地资料已清空。')
  }

  return (
    <div className="workspace-app">
      <AppSidebar activeView={activeView} onViewChange={setActiveView} connected={deviceState.connected} deviceName={deviceState.deviceName} />
      <main className="workspace-content">
        <header className="topbar"><div className="mobile-brand"><span><Waves size={18} /></span>录音豆</div><div><ShieldCheck size={15} />无需账号 · 数据留在本机</div></header>
        {notice && <div className="app-notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}

        {activeView === 'device' && (
          <>
            <DeviceBar
              state={deviceState} busy={busy} supportReason={supportReason}
              onConnect={connect} onDisconnect={() => browserClient.disconnect()}
              onStart={() => run('record-start', () => browserClient.startRecording())}
              onPause={() => run('record-pause', () => browserClient.pauseRecording())}
            />
            {deviceState.connected ? (
              <div className="primary-workspace">
                <RecordingList
                  files={visibleFiles} selectedId={selectedId} checkedIds={checkedIds} search={search}
                  autoRefresh={autoRefresh} busy={busy} exportState={deviceState.export}
                  onSelect={setSelectedId} onToggle={toggleChecked}
                  onToggleAll={(checked) => setCheckedIds(checked ? new Set(visibleFiles.map((file) => file.fileId)) : new Set())}
                  onSearch={setSearch} onAutoRefresh={setAutoRefresh}
                  onRefresh={() => run('refresh', () => browserClient.refresh())}
                  onBatchExport={() => makeBundle(files.filter((file) => checkedIds.has(file.fileId)), 'batch-export')}
                  onBatchDelete={batchDelete}
                />
                <RecordingDetail
                  file={selectedFile} entry={selectedEntry} devicePresent={Boolean(deviceFile)} player={player} busy={busy}
                  apiKey={apiKey} showKey={showKey} activeTab={activeTab}
                  template={selectedEntry?.summaryTemplate || 'meeting'} customPrompt={selectedEntry?.customPrompt || ''}
                  onTitleChange={(title) => updateEntry(selectedFile.fileId, { title })}
                  onTagsChange={(value) => updateEntry(selectedFile.fileId, { tags: value.split(/[,，]/).map((item) => item.trim()).filter(Boolean).slice(0, 12) })}
                  onPlay={() => play(selectedFile)} onDownload={() => downloadAudio(selectedFile)} onDelete={() => deleteAudio(selectedFile)}
                  onApiKeyChange={setApiKey} onToggleKey={() => setShowKey((value) => !value)} onTabChange={setActiveTab}
                  onTranscriptChange={(transcript) => updateEntry(selectedFile.fileId, { transcript })}
                  onSummaryChange={(summary) => updateEntry(selectedFile.fileId, { summary })}
                  onTemplateChange={(summaryTemplate) => updateEntry(selectedFile.fileId, { summaryTemplate })}
                  onCustomPromptChange={(customPrompt) => updateEntry(selectedFile.fileId, { customPrompt })}
                  onTranscribe={() => transcribe(selectedFile)} onSummarize={() => summarize(selectedFile)}
                  onExportBundle={() => makeBundle([selectedFile], `bundle-${selectedFile.fileId}`)} onDownloadText={downloadText}
                />
              </div>
            ) : (
              <section className="connect-empty">
                <CloudOff size={30} />
                <h2>先连接你的录音豆</h2>
                <p>推荐按 D3200 服务精确搜索，不依赖设备名称。浏览器会直接读取设备，音频不会经过本站服务器。</p>
                <div className="connect-actions">
                  <button className="button primary" disabled={!deviceState.supported || Boolean(busy)} onClick={() => connect('precise')}>
                    {busy === 'connect-precise' ? '正在搜索…' : '精确搜索录音豆'}
                  </button>
                  <button className="button subtle" disabled={!deviceState.supported || Boolean(busy)} onClick={() => connect('all')}>
                    {busy === 'connect-all' ? '正在打开…' : '显示全部设备'}
                  </button>
                </div>
                <small>Mac 上录音豆可能显示为“未知或不支持的设备”；精确搜索仍能通过服务 UUID 找到它。</small>
              </section>
            )}
          </>
        )}

        {activeView === 'library' && <LibraryView entries={libraryEntries} onOpen={openLibraryEntry} />}
        {activeView === 'settings' && <SettingsView apiKey={apiKey} showKey={showKey} autoRefresh={autoRefresh} onApiKeyChange={setApiKey} onToggleKey={() => setShowKey((value) => !value)} onAutoRefresh={setAutoRefresh} onClearLibrary={clearLocalLibrary} />}

        <footer className="app-footer">兼容 Windows / macOS Chrome、Edge 与 Android Chrome · iPhone / iPad 浏览器暂不支持 Web Bluetooth</footer>
      </main>

      <nav className="mobile-navigation" aria-label="手机导航">
        <button className={activeView === 'device' ? 'active' : ''} onClick={() => setActiveView('device')}><Waves size={18} /><span>录音</span></button>
        <button className={activeView === 'library' ? 'active' : ''} onClick={() => setActiveView('library')}><FolderOpen size={18} /><span>资料库</span></button>
        <button className={activeView === 'settings' ? 'active' : ''} onClick={() => setActiveView('settings')}><Settings size={18} /><span>设置</span></button>
      </nav>
    </div>
  )
}

export default DirectApp
