import { getData, replaceData } from './state.js'

const API_URL = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'frs-coach-api-token'

async function request(path, options = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY)
  const controller = new AbortController()
  const cancelRequest = () => controller.abort()
  const timeoutId = setTimeout(cancelRequest, 12000)
  if (options.signal?.aborted) cancelRequest()
  else options.signal?.addEventListener('abort', cancelRequest, { once: true })
  let response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Não foi possível conectar ao serviço de contas. Tente novamente mais tarde.')
  } finally {
    clearTimeout(timeoutId)
    options.signal?.removeEventListener('abort', cancelRequest)
  }
  if (response.status === 204) return null
  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('O serviço de contas está indisponível. Tente novamente mais tarde.')
  }
  if (!response.ok) throw new Error(result?.error || 'Não foi possível concluir a solicitação.')
  return result
}

export async function login(credentials, signal) {
  const result = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
    signal,
  })
  if (signal?.aborted) throw new Error('Entrada cancelada.')
  if (!result?.token) throw new Error('O servidor não retornou uma sessão válida.')
  sessionStorage.setItem(TOKEN_KEY, result.token)
  return result
}
export function clearApiSession() {
  sessionStorage.removeItem(TOKEN_KEY)
}
export function persistRecord(collection, record, editingId = null) {
  return request(`/${collection}${editingId ? `/${editingId}` : ''}`, {
    method: editingId ? 'PUT' : 'POST',
    body: JSON.stringify(record),
  })
}
export function removeRecord(collection, id) {
  return request(`/${collection}/${id}`, { method: 'DELETE' })
}
export function updateStudentAccess(id, data) {
  return request(`/students/${id}/access`, { method: 'PUT', body: JSON.stringify(data) })
}
export async function syncRemoteData() {
  if (!sessionStorage.getItem(TOKEN_KEY)) return
  try {
    const remote = await request('/dashboard')
    replaceData({ ...getData(), ...remote })
  } catch {
    // Mantém o último estado disponível quando a API estiver temporariamente indisponível.
  }
}
export function initRemoteSync() {
  window.addEventListener('frs:remote-refresh', syncRemoteData)
  return syncRemoteData()
}
