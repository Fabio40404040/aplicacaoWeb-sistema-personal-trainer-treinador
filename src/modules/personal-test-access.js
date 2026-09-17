const ENABLE_PERSONAL_PASSWORD_RECOVERY = false // Troque para true para reativar o link.

const TEST_CREDENTIALS = {
  email: 'fabiogisel7@gmail.com',
  password: '@Fagisel7123',
}

export function initPersonalTestAccess() {
  const form = document.querySelector('[data-login-form]')
  if (!form) return

  const recoveryLink = form.querySelector('a[href="#recuperar-senha-personal"]')
  if (recoveryLink) recoveryLink.hidden = !ENABLE_PERSONAL_PASSWORD_RECOVERY

  const passwordField = form.querySelector('input[name="password"]')?.closest('.field')
  if (!passwordField || form.querySelector('[data-personal-test-credentials]')) return

  const credentials = document.createElement('aside')
  credentials.className = 'personal-test-credentials'
  credentials.dataset.personalTestCredentials = ''
  credentials.setAttribute('aria-label', 'Dados para testar o painel do personal')

  const title = document.createElement('strong')
  title.textContent = 'Dados para testar o painel'
  const email = document.createElement('span')
  email.textContent = `E-mail: ${TEST_CREDENTIALS.email}`
  const password = document.createElement('span')
  password.textContent = `Senha: ${TEST_CREDENTIALS.password}`

  credentials.append(title, email, password)
  passwordField.after(credentials)
}
