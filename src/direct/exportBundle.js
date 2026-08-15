function safeName(value, fallback) {
  const cleaned = String(value || '').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, ' ')
  return (cleaned || fallback).slice(0, 80)
}

function textFile(value) {
  return new TextEncoder().encode(String(value || ''))
}

export async function createRecordingZip(entries, onProgress = () => {}) {
  const { zip, strToU8 } = await import('fflate')
  const files = {}

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    const folder = safeName(entry.title, `recording-${entry.file.fileId}`)
    const audio = new Uint8Array(await entry.asset.audio.arrayBuffer())
    const extension = entry.asset.fileName.split('.').pop() || 'ogg'
    files[`${folder}/audio.${extension}`] = [audio, { level: 0 }]
    files[`${folder}/metadata.json`] = strToU8(JSON.stringify({
      fileId: entry.file.fileId,
      recordedAt: new Date(entry.file.fileId * 1000).toISOString(),
      durationMs: entry.asset.durationMs || entry.file.estimatedDurationMs,
      sizeBytes: entry.file.sizeBytes,
      title: entry.title,
      tags: entry.tags,
      audioFormat: extension,
    }, null, 2))
    if (entry.transcript) files[`${folder}/transcript.txt`] = textFile(entry.transcript)
    if (entry.summary) files[`${folder}/summary.md`] = textFile(`# ${entry.title}\n\n${entry.summary}\n`)
    onProgress(index + 1, entries.length)
  }

  return new Promise((resolve, reject) => {
    zip(files, { level: 1 }, (error, data) => {
      if (error) reject(error)
      else resolve(new Blob([data], { type: 'application/zip' }))
    })
  })
}

