const BASE_URL = 'https://api.siliconflow.cn/v1'

async function readError(response) {
  const data = await response.json().catch(() => ({}))
  return data?.message || data?.error?.message || data?.error || `请求失败（HTTP ${response.status}）`
}

export async function transcribeAudio({ apiKey, blob, fileName, model = 'FunAudioLLM/SenseVoiceSmall' }) {
  if (!apiKey.trim()) throw new Error('请先输入硅基流动 API Key')
  if (blob.size > 50 * 1024 * 1024) throw new Error('音频超过硅基流动 50 MB 上传限制')
  const form = new FormData()
  form.append('model', model)
  form.append('file', blob, fileName)
  const response = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    body: form,
  })
  if (!response.ok) throw new Error(await readError(response))
  const result = await response.json()
  const transcript = String(result.text || '').trim()
  if (!transcript) throw new Error('转录结果为空')
  return transcript
}

export async function summarizeTranscript({ apiKey, transcript, model = 'Qwen/Qwen3-8B', template = 'meeting', customPrompt = '' }) {
  const prompts = {
    meeting: '请生成结构化会议纪要，依次给出：一句话摘要、关键要点、明确结论、待办事项（负责人和截止时间仅在原文明确提及时填写）、待确认问题。不得虚构。',
    memo: '请把口述内容整理成清晰笔记，依次给出：标题、核心想法、展开要点、下一步行动。删除口头语但不得增加原文没有的事实。',
    interview: '请整理访谈内容，依次给出：主题摘要、受访者观点、重要原话、洞察、后续问题。不得虚构。',
  }
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是严谨的中文录音整理助手。只依据转录文本输出。' },
        { role: 'user', content: `${template === 'custom' && customPrompt.trim() ? customPrompt.trim() : (prompts[template] || prompts.meeting)}\n\n转录文本：\n${transcript}` },
      ],
      stream: false,
      temperature: 0.2,
      max_tokens: 2048,
    }),
  })
  if (!response.ok) throw new Error(await readError(response))
  const result = await response.json()
  return String(result.choices?.[0]?.message?.content || '').trim()
}
