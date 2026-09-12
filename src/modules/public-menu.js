function closeMenu(menu, toggle) {
  menu.hidden = true
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-label', 'Abrir menu')
}

export function initPublicMenu() {
  const menu = document.querySelector('[data-public-menu]')
  const toggle = document.querySelector('[data-public-menu-toggle]')
  const wrapper = toggle.closest('.public-menu-wrap')
  const desktop = window.matchMedia('(min-width: 821px)')

  toggle.addEventListener('click', () => {
    const willOpen = menu.hidden
    menu.hidden = !willOpen
    toggle.setAttribute('aria-expanded', String(willOpen))
    toggle.setAttribute('aria-label', willOpen ? 'Fechar menu' : 'Abrir menu')
  })

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu(menu, toggle)
  })

  document.addEventListener('click', (event) => {
    if (!menu.hidden && !wrapper.contains(event.target)) closeMenu(menu, toggle)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menu.hidden) {
      closeMenu(menu, toggle)
      toggle.focus()
    }
  })

  desktop.addEventListener('change', (event) => {
    if (event.matches) closeMenu(menu, toggle)
  })
}
