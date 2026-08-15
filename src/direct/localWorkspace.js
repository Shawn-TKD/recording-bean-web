const STORAGE_KEY = 'recording-bean:workspace:v1'

function readWorkspace() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function writeWorkspace(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function loadWorkspace() {
  return readWorkspace()
}

export function persistWorkspace(workspace) {
  if (!writeWorkspace(workspace)) throw new Error('浏览器本地空间不足，无法保存文字内容')
}

export function saveRecordingEntry(fileId, patch) {
  const workspace = readWorkspace()
  const key = String(fileId)
  workspace[key] = {
    ...(workspace[key] || {}),
    ...patch,
    fileId: Number(fileId),
    updatedAt: Date.now(),
  }
  if (!writeWorkspace(workspace)) throw new Error('浏览器本地空间不足，无法保存文字内容')
  return workspace[key]
}

export function removeRecordingEntry(fileId) {
  const workspace = readWorkspace()
  delete workspace[String(fileId)]
  writeWorkspace(workspace)
}

export function clearWorkspace() {
  localStorage.removeItem(STORAGE_KEY)
}
