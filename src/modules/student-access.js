const TOKEN_KEY = 'frs-student-token'
const API_URL = import.meta.env.VITE_API_URL || ''

async function studentRequest(path, data) {
  const token = sessionStorage.getItem(TOKEN_KEY)
  const response = await fetch(`${API_URL}/api/student/${path}`, {
    method: data ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  }).catch(() => {
    throw new Error('Não foi possível conectar ao serviço de contas. Tente novamente mais tarde.')
  })
  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('O serviço de contas está indisponível. Tente novamente mais tarde.')
  }
  if (!response.ok) throw new Error(result?.error || 'Não foi possível acessar sua conta.')
  return result
}

export function initStudentAccess() {
  let generation = 0
  async function loadPanel() {
    const current = ++generation
    if (location.hash !== '#painel-aluno') return
    const status = document.querySelector('[data-student-panel-status]')
    document.querySelector('[data-student-name]').textContent = 'Área do Aluno'
    status.textContent = 'Carregando sua conta…'
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      location.hash = '#entrar-aluno'
      return
    }
    try {
      const user = await studentRequest('me')
      if (current !== generation) return
      document.querySelector('[data-student-name]').textContent = `Olá, ${user.name}`
      status.textContent = 'Conta criada. Seu acompanhamento ainda não foi liberado pelo treinador.'
    } catch (error) {
      if (current !== generation) return
      status.textContent = error.message
    }
  }
  document.querySelectorAll('[data-student-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      if (!form.reportValidity()) return
      const status = form.querySelector('[role="status"]')
      const button = form.querySelector('[type="submit"]')
      const defaultButtonLabel = button.textContent.trim()
      const restoreSubmitButton = () => {
        if (!button.dataset.resetUrl) return
        delete button.dataset.resetUrl
        button.type = 'submit'
        button.textContent = defaultButtonLabel
        button.onclick = null
        status.textContent = ''
      }
      form.addEventListener('input', restoreSubmitButton, { once: true })
      button.disabled = true
      status.textContent = 'Aguarde…'
      try {
        const data = Object.fromEntries(new FormData(form))
        const action = form.dataset.studentForm
        if (action === 'reset')
          data.token = new URLSearchParams(location.hash.split('?')[1] || '').get('token')
        const result = await studentRequest(`auth/${action}`, data)
        if (['forgot', 'reset'].includes(action)) {
          form.reset()
          status.replaceChildren(document.createTextNode(result.message))
          if (action === 'forgot' && result.resetUrl) {
            button.dataset.resetUrl = result.resetUrl
            button.type = 'button'
            button.textContent = 'Abrir link de recuperação'
            button.onclick = () => location.assign(button.dataset.resetUrl)
          }
          if (action === 'reset') {
            sessionStorage.removeItem(TOKEN_KEY)
            history.replaceState(null, '', '#nova-senha')
          }
          return
        }
        if (!result?.token) throw new Error('O servidor não retornou uma sessão válida.')
        sessionStorage.setItem(TOKEN_KEY, result.token)
        form.reset()
        status.textContent = ''
        location.hash = '#painel-aluno'
      } catch (error) {
        status.textContent = error.message
      } finally {
        button.disabled = false
      }
    })
  })
  document.querySelector('[data-student-logout]').addEventListener('click', () => {
    generation++
    sessionStorage.removeItem(TOKEN_KEY)
    document.querySelector('[data-student-name]').textContent = 'Área do Aluno'
    location.hash = '#entrar-aluno'
  })
  window.addEventListener('hashchange', loadPanel)
  loadPanel()
}
