const API_URL = import.meta.env.VITE_API_URL || ''

async function personalRequest(action, data) {
  const response = await fetch(`${API_URL}/api/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {
    throw new Error('Não foi possível conectar ao serviço de contas. Tente novamente mais tarde.')
  })
  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('O serviço de contas está indisponível. Tente novamente mais tarde.')
  }
  if (!response.ok) throw new Error(result?.error || 'Não foi possível concluir a solicitação.')
  return result
}

export function initPersonalAccess() {
  document.querySelectorAll('[data-personal-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      if (!form.reportValidity()) return
      const status = form.querySelector('[role="status"]')
      const button = form.querySelector('[type="submit"]')
      const action = form.dataset.personalForm
      const data = Object.fromEntries(new FormData(form))
      if (action === 'reset')
        data.token = new URLSearchParams(location.hash.split('?')[1] || '').get('token')
      button.disabled = true
      status.textContent = 'Aguarde…'
      try {
        const result = await personalRequest(action, data)
        form.reset()
        status.replaceChildren(document.createTextNode(result.message))
        if (action === 'forgot' && result.resetUrl) {
          const resetLink = document.createElement('a')
          resetLink.href = result.resetUrl
          resetLink.className = 'button button--primary button--full'
          resetLink.textContent = 'Abrir link de recuperação'
          status.append(document.createElement('br'), resetLink)
        }
        if (action === 'reset') history.replaceState(null, '', '#nova-senha-personal')
      } catch (error) {
        status.textContent = error.message
      } finally {
        button.disabled = false
      }
    })
  })
}
