import {
  Download, Edit3, Eye, EyeOff, FileArchive, FileText, KeyRound, LoaderCircle,
  Play, Save, Sparkles, Tag, Trash2,
} from 'lucide-react'
import { formatBytes, formatDuration, formatTime } from '../utils/format.js'

export function RecordingDetail({
  file, entry, devicePresent, player, busy, apiKey, showKey, activeTab, template, customPrompt,
  onTitleChange, onTagsChange, onPlay, onDownload, onDelete, onApiKeyChange, onToggleKey,
  onTabChange, onTranscriptChange, onSummaryChange, onTemplateChange, onCustomPromptChange,
  onTranscribe, onSummarize, onExportBundle, onDownloadText,
}) {
  if (!file) {
    return <section className="recording-detail-panel empty-detail"><FileText size={32} /><strong>选择一条录音</strong><span>播放、命名、转录和总结会集中显示在这里。</span></section>
  }

  const transcript = entry?.transcript || ''
  const summary = entry?.summary || ''
  const isTranscribing = busy === `transcribe-${file.fileId}`
  const isSummarizing = busy === `summarize-${file.fileId}`

  return (
    <section className="recording-detail-panel">
      <header className="detail-heading">
        <div className="title-editor">
          <Edit3 size={17} />
          <input value={entry?.title || ''} onChange={(event) => onTitleChange(event.target.value)} aria-label="录音标题" />
          <div className="recording-meta"><span>{formatTime(file.fileId, true)}</span><span>{formatDuration(file.estimatedDurationMs)}</span><span>{formatBytes(file.sizeBytes)}</span></div>
        </div>
        <div className="detail-actions">
          <button className="button compact" disabled={Boolean(busy) || !devicePresent} onClick={onDownload}><Download size={15} />下载音频</button>
          <button className="button compact danger" disabled={Boolean(busy) || !devicePresent} onClick={onDelete}><Trash2 size={15} />删除录音</button>
        </div>
      </header>

      <div className="player-area">
        {player?.fileId === file.fileId ? <audio controls autoPlay src={player.url} /> : (
          <button className="play-placeholder" disabled={Boolean(busy) || !devicePresent} onClick={onPlay}>
            {busy === `play-${file.fileId}` ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}{devicePresent ? '读取并播放录音' : '连接录音豆后可播放'}
          </button>
        )}
      </div>

      <label className="tag-editor"><Tag size={16} /><input value={(entry?.tags || []).join('，')} onChange={(event) => onTagsChange(event.target.value)} placeholder="添加标签，用逗号分隔" /></label>

      <div className="ai-key-row">
        <KeyRound size={16} />
        <input type={showKey ? 'text' : 'password'} value={apiKey} autoComplete="off" onChange={(event) => onApiKeyChange(event.target.value)} placeholder="填写 SiliconFlow API Key（仅当前页面内存）" />
        <button onClick={onToggleKey} aria-label={showKey ? '隐藏密钥' : '显示密钥'}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>

      <div className="editor-shell">
        <div className="editor-tabs" role="tablist">
          <button role="tab" aria-selected={activeTab === 'transcript'} className={activeTab === 'transcript' ? 'active' : ''} onClick={() => onTabChange('transcript')}>转录</button>
          <button role="tab" aria-selected={activeTab === 'summary'} className={activeTab === 'summary' ? 'active' : ''} onClick={() => onTabChange('summary')}>总结</button>
        </div>

        {activeTab === 'transcript' ? (
          <div className="editor-pane">
            <div className="editor-toolbar">
              <div><strong>可编辑转录</strong><span>{transcript.length} 字 · 自动保存在此浏览器</span></div>
              <div>
                <button className="button compact" disabled={!transcript} onClick={() => onDownloadText('transcript')}><Download size={14} />TXT</button>
                <button className="button compact primary" disabled={!devicePresent || !apiKey.trim() || Boolean(busy)} onClick={onTranscribe}>
                  {isTranscribing ? <LoaderCircle className="spin" size={15} /> : <FileText size={15} />}{isTranscribing ? '正在转录' : transcript ? '重新转录' : '开始转录'}
                </button>
              </div>
            </div>
            <textarea value={transcript} onChange={(event) => onTranscriptChange(event.target.value)} placeholder="生成转录后会显示在这里；你也可以直接粘贴或编辑文字。" />
          </div>
        ) : (
          <div className="editor-pane">
            <div className="summary-controls">
              <label>总结模板
                <select value={template} onChange={(event) => onTemplateChange(event.target.value)}>
                  <option value="meeting">会议纪要</option>
                  <option value="memo">闪念笔记</option>
                  <option value="interview">访谈整理</option>
                  <option value="custom">自定义要求</option>
                </select>
              </label>
              {template === 'custom' && <label className="custom-prompt">自定义要求<input value={customPrompt} onChange={(event) => onCustomPromptChange(event.target.value)} placeholder="例如：整理为标题、三条洞察和下一步行动" /></label>}
              <button className="button primary" disabled={!transcript || !apiKey.trim() || Boolean(busy) || (template === 'custom' && !customPrompt.trim())} onClick={onSummarize}>
                {isSummarizing ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{isSummarizing ? '正在总结' : summary ? '重新总结' : '生成总结'}
              </button>
              <button className="button compact" disabled={!summary} onClick={() => onDownloadText('summary')}><Download size={14} />Markdown</button>
            </div>
            <textarea value={summary} onChange={(event) => onSummaryChange(event.target.value)} placeholder="选择模板并生成总结；结果可以继续手工修改。" />
          </div>
        )}

        <footer className="editor-footer">
          <span><Save size={14} />标题、标签和文字保存在当前浏览器；音频不自动留存。</span>
          <button className="button bundle" disabled={Boolean(busy) || !devicePresent} onClick={onExportBundle}><FileArchive size={16} />导出资料包</button>
        </footer>
      </div>
    </section>
  )
}
