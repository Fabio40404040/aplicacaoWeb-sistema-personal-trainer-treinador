function loadedAppScript() {
  const script = [...document.scripts].find((item) => /\/assets\/index-[^/]+\.js$/u.test(item.src))
  return script ? new URL(script.src, location.origin).pathname : ''
}

async function reloadWhenAppChanged() {
  if (document.visibilityState === 'hidden' || !navigator.onLine) return
  try {
    const response = await fetch(`/?app-version=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return
    const html = await response.text()
    const match = html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js)["']/u)
    if (!match) return
    const latestScript = new URL(match[1], location.origin).pathname
    if (loadedAppScript() && latestScript !== loadedAppScript()) location.reload()
  } catch {
    // Sem internet, mantém a versão instalada disponível.
  }
}

// Dois apps instaláveis do mesmo site: "FRS Personal" (site/alunos) e
// "FRS Painel" (só do personal, abre direto no login do painel). Nas telas
// do personal o navegador enxerga o manifesto do painel; no resto, o do site.
const PERSONAL_ROUTES = new Set([
  'acesso-frs',
  'painel',
  'alunos',
  'agenda',
  'treinos',
  'exercicios',
  'avaliacoes',
  'checkins',
  'evolucao',
  'recuperar-senha-personal',
  'nova-senha-personal',
  'ativar-personal',
])
function syncManifest() {
  const route = location.hash.slice(1).split('?')[0]
  const personal = PERSONAL_ROUTES.has(route)
  const link = document.querySelector('link[rel="manifest"]')
  const href = personal ? '/painel.webmanifest' : '/app.webmanifest'
  if (link && link.getAttribute('href') !== href) link.setAttribute('href', href)
  const title = document.querySelector('meta[name="apple-mobile-web-app-title"]')
  if (title) title.setAttribute('content', personal ? 'FRS Painel' : 'FRS Personal')
}

export function initPwa() {
  syncManifest()
  window.addEventListener('hashchange', syncManifest)
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return

  const hadController = Boolean(navigator.serviceWorker.controller)
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return
    refreshing = true
    location.reload()
  })

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      })
      await registration.update()
      await reloadWhenAppChanged()
    } catch (error) {
      console.warn('Não foi possível preparar a instalação do aplicativo.', error)
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reloadWhenAppChanged()
  })
  window.addEventListener('pageshow', () => void reloadWhenAppChanged())

  const installButtons = [...document.querySelectorAll('[data-install-app]')]
  const panelButton = document.querySelector('[data-install-panel]')
  const dialog = document.querySelector('[data-install-dialog]')
  const instructions = dialog.querySelector('[data-install-instructions]')
  const dialogTitle = dialog.querySelector('[data-install-title]')
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/u.test(ua) || (/Macintosh/u.test(ua) && navigator.maxTouchPoints > 1)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  let installPrompt

  const explain = (panel) => {
    if (dialogTitle)
      dialogTitle.textContent = panel
        ? 'Instalar o app FRS Painel'
        : 'Adicionar FRS Personal à tela inicial'
    instructions.textContent = isStandalone
      ? 'Você está dentro de um app instalado. Abra este endereço no navegador (Chrome ou Safari) e instale por lá: ' +
        `${location.origin}/#acesso-frs`
      : isIos
        ? 'No Safari, toque em Compartilhar (quadrado com a seta) e escolha “Adicionar à Tela de Início”. Depois toque em Adicionar.'
        : /Android/u.test(ua)
          ? 'No Chrome, toque no menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.'
          : 'No Chrome ou Edge, clique no ícone de instalar na barra de endereço (monitor com seta) ou no menu ⋮ → “Transmitir, salvar e compartilhar” → “Instalar página como app”.'
    dialog.showModal()
  }

  // Botão do app do painel (tela de login do personal): sempre visível.
  panelButton?.addEventListener('click', async () => {
    if (installPrompt && !isStandalone) {
      installPrompt.prompt()
      await installPrompt.userChoice
      installPrompt = null
      return
    }
    explain(true)
  })

  if (isStandalone) {
    dialog.querySelector('[data-close-install]').addEventListener('click', () => dialog.close())
    return
  }

  const showInstall = (visible) => installButtons.forEach((button) => (button.hidden = !visible))
  if (isIos) showInstall(true)

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event
    showInstall(true)
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    showInstall(false)
  })

  const onInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt()
      await installPrompt.userChoice
      installPrompt = null
      showInstall(false)
      return
    }
    explain(false)
  }
  installButtons.forEach((button) => button.addEventListener('click', onInstallClick))
  dialog.querySelector('[data-close-install]').addEventListener('click', () => dialog.close())
}
