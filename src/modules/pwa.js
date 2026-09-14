export function initPwa() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Não foi possível preparar a instalação do aplicativo.', error)
    })
  })

  const installButton = document.querySelector('[data-install-app]')
  const dialog = document.querySelector('[data-install-dialog]')
  const instructions = dialog.querySelector('[data-install-instructions]')
  const isIos = /iPad|iPhone|iPod/u.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  if (isStandalone) return

  let installPrompt
  if (isIos) installButton.hidden = false

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event
    installButton.hidden = false
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    installButton.hidden = true
  })

  installButton.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt()
      await installPrompt.userChoice
      installPrompt = null
      installButton.hidden = true
      return
    }
    instructions.textContent = isIos
      ? 'No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Depois toque em Adicionar.'
      : 'Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.'
    dialog.showModal()
  })
  dialog.querySelector('[data-close-install]').addEventListener('click', () => dialog.close())
}
