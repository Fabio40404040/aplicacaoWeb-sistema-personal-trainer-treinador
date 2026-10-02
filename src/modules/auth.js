import { clearApiSession, login, syncRemoteData } from './api-client.js'

const SESSION_KEY = 'frs-coach-session-v2'
// Endereço do login do personal. Não aparece em nenhum link do site público;
// para entrar, use o endereço direto (salve nos favoritos): seu-site/#acesso-frs
export const PERSONAL_LOGIN_ROUTE = 'acesso-frs'

function showApp() {
  document.querySelector('[data-public-screen]').hidden = true
  document.querySelector('[data-login-screen]').hidden = true
  document.querySelector('[data-app-shell]').hidden = false
  if (!location.hash || location.hash === `#${PERSONAL_LOGIN_ROUTE}`) location.hash = '#painel'
}

function showLogin() {
  document.querySelector('[data-public-screen]').hidden = true
  document.querySelector('[data-login-screen]').hidden = false
  document.querySelector('[data-app-shell]').hidden = true
  document.title = 'FRS Personal Trainer'
  location.hash = `#${PERSONAL_LOGIN_ROUTE}`
}

function showPublic() {
  document.querySelector('[data-public-screen]').hidden = false
  document.querySelector('[data-login-screen]').hidden = true
  document.querySelector('[data-app-shell]').hidden = true
  document.title = 'FRS Personal Trainer'
}

// App "FRS Painel" (endereço /painel/): é só do personal. O iPhone pode abrir
// o app sem o "#acesso-frs" no endereço — aí, em vez do site público, vai
// direto para o login (ou para o painel, se já estiver logado).
const PUBLIC_ROUTES = ['inicio', 'consultoria', 'planos', 'aluno', 'faq', 'contato', 'login']
function inPainelApp() {
  return location.pathname.startsWith('/painel/')
}

function handleLocation() {
  if (inPainelApp() && (!location.hash || PUBLIC_ROUTES.includes(location.hash.slice(1)))) {
    history.replaceState(null, '', `${location.pathname}#${PERSONAL_LOGIN_ROUTE}`)
  }
  const route = location.hash.slice(1)
  document.querySelectorAll('[data-student-screen]').forEach((screen) => {
    screen.hidden = true
  })
  document.querySelectorAll('[data-personal-screen]').forEach((screen) => {
    screen.hidden = true
  })
  const studentRoute = route.split('?')[0]
  if (
    ['entrar-aluno', 'cadastro-aluno', 'painel-aluno', 'recuperar-senha', 'nova-senha'].includes(
      studentRoute,
    )
  ) {
    document.querySelector('[data-public-screen]').hidden = true
    document.querySelector('[data-login-screen]').hidden = true
    document.querySelector('[data-app-shell]').hidden = true
    document.querySelector(`[data-student-screen="${studentRoute}"]`).hidden = false
    document.title = 'FRS Personal Trainer'
    return
  }
  if (
    ['recuperar-senha-personal', 'nova-senha-personal', 'ativar-personal'].includes(studentRoute)
  ) {
    document.querySelector('[data-public-screen]').hidden = true
    document.querySelector('[data-login-screen]').hidden = true
    document.querySelector('[data-app-shell]').hidden = true
    document.querySelector(`[data-personal-screen="${studentRoute}"]`).hidden = false
    document.title = 'FRS Personal Trainer'
    return
  }
  // O antigo "#login" agora leva ao site (o login do personal mudou de endereço).
  if (
    !route ||
    route === 'login' ||
    ['inicio', 'consultoria', 'planos', 'aluno', 'faq', 'contato'].includes(route)
  ) {
    showPublic()
    return
  }
  if (route === PERSONAL_LOGIN_ROUTE) {
    // Já logado (ex.: abriu o app "FRS Painel"): vai direto para o painel.
    if (localStorage.getItem(SESSION_KEY)) showApp()
    else showLogin()
    return
  }
  if (localStorage.getItem(SESSION_KEY)) showApp()
  else showLogin()
}

// Atalho escondido: 5 toques seguidos no logo "FRS" do site público abrem o
// login do personal (útil no app instalado, que não tem barra de endereço).
function initSecretShortcut() {
  const logo = document.querySelector('.public-brand')
  if (!logo) return
  let taps = 0
  let timer = 0
  logo.addEventListener('click', (event) => {
    taps += 1
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (taps = 0), 2000)
    if (taps >= 5) {
      taps = 0
      event.preventDefault()
      location.hash = `#${PERSONAL_LOGIN_ROUTE}`
    }
  })
}

export function initAuth() {
  initSecretShortcut()
  const form = document.querySelector('[data-login-form]')
  let pendingLogin = null
  const status = form.querySelector('[data-personal-login-status]')
  const button = form.querySelector('[type="submit"]')

  handleLocation()
  window.addEventListener('hashchange', () => {
    if (location.hash !== `#${PERSONAL_LOGIN_ROUTE}` && pendingLogin) {
      pendingLogin.abort()
      pendingLogin = null
      clearApiSession()
      button.disabled = false
      status.textContent = ''
    }
    handleLocation()
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    if (pendingLogin) return
    const controller = new AbortController()
    pendingLogin = controller
    const credentials = Object.fromEntries(new FormData(form))
    button.disabled = true
    status.textContent = 'Verificando seus dados…'
    try {
      await login(credentials, controller.signal)
      await syncRemoteData()
      if (controller.signal.aborted || location.hash !== `#${PERSONAL_LOGIN_ROUTE}`) return
      pendingLogin = null
      localStorage.setItem(SESSION_KEY, 'active')
      status.textContent = ''
      showApp()
    } catch (error) {
      if (controller.signal.aborted) return
      localStorage.removeItem(SESSION_KEY)
      clearApiSession()
      status.textContent = error.message
    } finally {
      if (pendingLogin === controller) pendingLogin = null
      if (!pendingLogin) button.disabled = false
    }
  })

  // Login vencido (a API respondeu 401): volta para a tela de entrada com um
  // aviso, em vez de deixar o painel aberto tentando carregar tudo sem acesso.
  window.addEventListener('frs:session-expired', () => {
    if (!localStorage.getItem(SESSION_KEY)) return
    localStorage.removeItem(SESSION_KEY)
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close())
    showLogin()
    status.textContent = 'Sua sessão expirou. Entre de novo para continuar.'
  })

  document.querySelector('[data-logout]').addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY)
    clearApiSession()
    location.hash = '#inicio'
    showPublic()
  })
}
