export function initials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function formatDate(value) {
  if (!value) return 'A definir'
  const normalized = value.includes('T') ? value : `${value}T12:00:00Z`
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(normalized))
    .replace('.', '')
}

export function showToast(message) {
  const toast = document.querySelector('[data-toast]')
  toast.querySelector('span').textContent = message
  toast.classList.add('is-visible')
  window.clearTimeout(showToast.timer)
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600)
}
