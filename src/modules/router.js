const routes = new Set(['painel', 'alunos', 'treinos', 'exercicios', 'avaliacoes', 'evolucao'])

function closeMenu() {
  const sidebar = document.querySelector('[data-sidebar]')
  const toggle = document.querySelector('[data-menu-toggle]')
  sidebar.classList.remove('is-open')
  toggle.setAttribute('aria-expanded', 'false')
}

function renderRoute() {
  const requested = location.hash.slice(1)
  if (!routes.has(requested)) return
  const route = routes.has(requested) ? requested : 'painel'
  document
    .querySelectorAll('[data-route]')
    .forEach((page) => page.classList.toggle('is-active', page.dataset.route === route))
  document.querySelectorAll('[data-route-link]').forEach((link) => {
    const active = link.dataset.routeLink === route
    link.classList.toggle('is-active', active)
    if (active) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  document.title = 'FRS Personal Trainer'
  window.scrollTo({ top: 0, behavior: 'smooth' })
  closeMenu()
}

export function initNavigation() {
  window.addEventListener('hashchange', renderRoute)
  document.querySelector('[data-menu-toggle]').addEventListener('click', (event) => {
    const sidebar = document.querySelector('[data-sidebar]')
    const willOpen = !sidebar.classList.contains('is-open')
    sidebar.classList.toggle('is-open', willOpen)
    event.currentTarget.setAttribute('aria-expanded', String(willOpen))
  })
  document.querySelector('[data-sidebar-backdrop]').addEventListener('click', closeMenu)
  renderRoute()
}
