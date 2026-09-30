import { getData, updateData } from './state.js'
import { paintAvatar } from './profile-kit.js'
import { askConfirm, exerciseGroups, formatDate, showToast } from './utils.js'
import {
  deleteMuscleGroup,
  loadExerciseGifFrame,
  persistRecord,
  removeRecord,
  syncRemoteData,
} from './api-client.js'
import { downloadWorkoutPdf } from './workout-pdf.js'
import { legGroupNames } from '../data/library.js'
import {
  applyExerciseGifThumb,
  exerciseGifStatus,
  findVideo,
  openVideoLightbox,
  folderAddButton,
  folderCreateButton,
} from './exercise-gifs.js'

// A pasta "Pernas" é só uma forma de agrupar essas quatro na exibição — o
// exercício continua guardando o(s) grupo(s) reais dele (Glúteos,
// Quadríceps, etc.), nunca a palavra "Pernas".
const legGroups = legGroupNames

// Excluir a pasta inteira. Como agora um exercício pode pertencer a mais de
// um grupo muscular (ex.: afundo no smith = quadríceps e glúteos), excluir
// uma pasta só apaga de verdade o exercício se esse era o único grupo dele —
// se ele também está em outro grupo, apenas tiramos esta pasta da lista dele.
async function removeExerciseFolder(name, exercises, owned) {
  const total = exercises.length
  const ok = await askConfirm({
    eyebrow: 'Biblioteca de exercícios',
    title: `Excluir a pasta ${name}?`,
    message: total
      ? `Os ${total} exercício(s) que estão dentro dela serão excluídos — exceto os que também pertencem a outro grupo, que só saem desta pasta.`
      : 'A pasta será removida da lista de grupos musculares.',
    note: total
      ? 'Exercícios usados em alguma ficha ou treino pronto não são excluídos — eu aviso quais ficaram.'
      : 'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir pasta',
  })
  if (!ok) return
  const groupsToStrip = name === 'Pernas' ? legGroups : [name]
  let apagados = 0
  let mantidos = 0
  const emUso = []
  for (const exercise of exercises) {
    const currentGroups = exerciseGroups(exercise)
    const remaining = currentGroups.filter((groupName) => !groupsToStrip.includes(groupName))
    if (remaining.length) {
      try {
        await persistRecord('exercises', { ...exercise, group: remaining.join(', ') }, exercise.id)
        mantidos += 1
      } catch {
        emUso.push(exercise.name)
      }
      continue
    }
    try {
      await removeRecord('exercises', exercise.id)
      apagados += 1
    } catch {
      emUso.push(exercise.name)
    }
  }
  if (owned && !emUso.length) {
    try {
      await deleteMuscleGroup(owned.id)
    } catch {
      /* a pasta some sozinha quando fica vazia */
    }
  }
  await syncRemoteData()
  const parts = []
  if (apagados) parts.push(`${apagados} excluído(s)`)
  if (mantidos) parts.push(`${mantidos} mantido(s) em outro grupo`)
  if (emUso.length) {
    const lista = emUso.slice(0, 3).join(', ')
    parts.push(`${emUso.length} continuam porque estão em uso: ${lista}${emUso.length > 3 ? '…' : ''}`)
  }
  showToast(parts.length ? `${parts.join('. ')}.` : `Pasta ${name} excluída.`)
}

// Aluno (nome + foto) pelo id ou pelo nome, para mostrar a foto de perfil.
function studentPhoto(id, name) {
  const student = (getData().students || []).find(
    (item) => (id && String(item.id) === String(id)) || item.name === name,
  )
  return { name: name || student?.name, avatar: student?.avatar }
}

function exerciseFolderRemoveButton(name, exercises, owned) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'button button--secondary gif-group-remove'
  button.textContent = 'Excluir pasta'
  button.title = `Excluir a pasta ${name}`
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void removeExerciseFolder(name, exercises, owned)
  })
  return button
}

const cloneTemplate = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true)
const billingCycleLabels = {
  monthly: 'mensal',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  annual: 'anual',
  permanent: 'permanente',
}
const planLabels = {
  ready: 'Treinos Prontos',
  basic: 'Consultoria Básica',
  premium: 'Consultoria Premium',
  athlete: 'Performance Atleta',
}
// Selo colorido com o nome do plano e o período ("Performance Atleta · anual").
function planBadge(student) {
  const code = planLabels[student.planCode] ? student.planCode : 'none'
  const badge = document.createElement('span')
  badge.className = `plan-badge plan-badge--${code}`
  const period =
    student.planCode === 'ready' || student.accessType === 'permanent'
      ? 'permanente'
      : billingCycleLabels[student.billingCycle]
  badge.textContent = code === 'none'
    ? 'Sem plano'
    : [planLabels[code], period].filter(Boolean).join(' · ')
  return badge
}
function accessLabel(student) {
  if (student.accessStatus === 'active' && student.paymentStatus === 'paid')
    return student.accessType === 'permanent' ? 'Permanente' : 'Liberado'
  if (student.accessStatus === 'paused') return 'Pausado'
  if (student.accessStatus === 'cancelled') return 'Cancelado'
  return student.paymentStatus === 'pending' ? 'Pagamento pendente' : 'Aguardando'
}
const numberFrom = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(
    String(value ?? '')
      .replace(',', '.')
      .replace(/[^0-9.-]/gu, ''),
  )
  return Number.isFinite(parsed) ? parsed : null
}
const assessmentDate = (item) => {
  if (!item) return null
  const date = new Date(item.assessedAt || '')
  return Number.isNaN(date.getTime()) ? null : date
}
const shortDate = (date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
const monthLabel = (date) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '')

function confirmStudentDeletion(student) {
  let dialog = document.querySelector('[data-modal="delete-student"]')
  if (!dialog) {
    dialog = document.createElement('dialog')
    dialog.className = 'modal'
    dialog.dataset.modal = 'delete-student'
    dialog.innerHTML = `<form method="dialog"><header><div><span class="eyebrow eyebrow--blue">Confirmar exclusão</span><h2>Excluir aluno?</h2></div><button class="icon-button" type="submit" value="cancel" aria-label="Fechar">×</button></header><div class="modal-body"><p>Você está prestes a excluir <strong data-delete-student-name></strong>.</p><p>Também serão removidos a conta de acesso, fichas de treino, avaliações, check-ins e agendamentos vinculados.</p><p class="password-requirements">Esta ação não pode ser desfeita.</p></div><footer><button class="button button--secondary" type="submit" value="cancel">Cancelar</button><button class="button button--primary" type="submit" value="confirm">Excluir aluno</button></footer></form>`
    document.body.append(dialog)
  }
  dialog.querySelector('[data-delete-student-name]').textContent = student.name
  dialog.returnValue = 'cancel'
  dialog.showModal()
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {
      once: true,
    })
  })
}

function renderStudents() {
  const { students } = getData(),
    query = document
      .querySelector('[data-table-search="students"]')
      .value.trim()
      .toLocaleLowerCase('pt-BR'),
    filter = document.querySelector('[data-student-filter]').value
  const filtered = students.filter(
    (s) =>
      `${s.name} ${s.goal} ${s.email}`.toLocaleLowerCase('pt-BR').includes(query) &&
      (filter === 'all' || s.status === filter),
  )
  const table = document.querySelector('[data-students-table]')
  table.replaceChildren(
    ...filtered.map((student) => {
      const row = cloneTemplate('student-row-template')
      row.dataset.id = student.id
      paintAvatar(row.querySelector('.avatar'), student)
      row.querySelector('.person-cell strong').textContent = student.name
      row.querySelector('.person-cell small').textContent = student.email
      row.querySelector('.person-cell small').after(planBadge(student))
      row.querySelector('[data-cell="goal"]').textContent = student.goal
      row.querySelector('[data-cell="date"]').textContent = formatDate(student.assessmentDate)
      const status = row.querySelector('.status')
      status.textContent = accessLabel(student)
      status.classList.add(
        student.accessStatus === 'active' && student.paymentStatus === 'paid'
          ? 'status--active'
          : 'status--paused',
      )
      // Mesmo botão, bem visível, pra qualquer aluno ainda não liberado —
      // não importa se foi cadastrado presencialmente ou se ele mesmo se
      // cadastrou pelo site. Antes só o presencial ganhava um botão grande;
      // o do WebApp ficava só com um "✓" pequeno, fácil de não perceber.
      const needsRelease =
        student.accessStatus !== 'active' || student.paymentStatus !== 'paid'
      const manage = document.createElement('button')
      manage.className = needsRelease
        ? 'button button--primary student-release-button'
        : 'icon-button'
      manage.type = 'button'
      manage.dataset.action = 'access'
      manage.title = needsRelease
        ? 'Confirmar pagamento e liberar acesso'
        : 'Plano, pagamento e acesso'
      manage.setAttribute(
        'aria-label',
        needsRelease ? `Liberar acesso de ${student.name}` : 'Gerenciar plano e acesso',
      )
      manage.textContent = needsRelease ? 'Liberar acesso' : '✓'
      row.querySelector('.row-actions').prepend(manage)
      return row
    }),
  )
  document.querySelector('[data-students-empty]').hidden = filtered.length > 0
}
function renderRecentStudents() {
  const rows = getData()
    .students.slice(0, 4)
    .map((s) => {
      const row = cloneTemplate('recent-row-template')
      row.dataset.id = s.id
      paintAvatar(row.querySelector('.avatar'), s)
      row.querySelector('.person-cell strong').textContent = s.name
      row.querySelector('.person-cell small').textContent = s.email
      row.querySelector('.person-cell small').after(planBadge(s))
      row.querySelector('[data-cell="goal"]').textContent = s.goal
      row.querySelector('[data-cell="workout"]').textContent = s.workout || 'Aguardando ficha'
      row.querySelector('[data-cell="activity"]').textContent = s.activity || 'Novo cadastro'
      const status = row.querySelector('.status')
      status.textContent = accessLabel(s)
      status.classList.add(s.accessStatus === 'active' ? 'status--active' : 'status--paused')
      const view = row.querySelector('button')
      view.setAttribute('aria-label', `Editar ${s.name}`)
      view.addEventListener('click', () =>
        window.dispatchEvent(new CustomEvent('frs:edit-student', { detail: String(s.id) })),
      )
      return row
    })
  document.querySelector('[data-recent-students]').replaceChildren(...rows)
}
function renderWorkouts() {
  const workouts = getData().workouts
  document.querySelector('[data-workouts-grid]').replaceChildren(
    ...workouts.map((w) => {
      const card = cloneTemplate('workout-card-template')
      card.dataset.id = w.id
      card.querySelector('h2').textContent = w.name
      card.querySelector('[data-card="student"]').textContent = w.student
      card.querySelector('[data-card="goal"]').textContent =
        `${w.goal} · ${w.publishedAt ? 'Publicado' : 'Rascunho'} · ${w.exerciseCount || 0} exercícios`
      card.querySelector('[data-card="duration"]').textContent = w.duration
      card.querySelector('.workout-progress strong').textContent = `${w.progress}%`
      card.querySelector('progress').value = w.progress
      const pdf = card.querySelector('.button--full')
      pdf.dataset.action = 'pdf'
      pdf.firstChild.textContent = 'Baixar PDF visual '
      return card
    }),
  )
  document.querySelector('[data-workouts-empty]').hidden = workouts.length > 0
}
const openExerciseFolders = new Set()
function renderExercises() {
  const query = document
      .querySelector('[data-table-search="exercises"]')
      .value.trim()
      .toLocaleLowerCase('pt-BR'),
    group = document.querySelector('[data-exercise-filter]').value
  const filtered = getData().exercises.filter((e) => {
    if (!e.name.toLocaleLowerCase('pt-BR').includes(query)) return false
    if (group === 'all') return true
    const groups = exerciseGroups(e)
    return (
      groups.includes(group) || (group === 'Pernas' && groups.some((name) => legGroups.includes(name)))
    )
  })
  const list = document.querySelector('[data-exercises-list]')
  list.querySelectorAll('.exercise-folder').forEach((folder) => {
    if (folder.open) openExerciseFolders.add(folder.dataset.group)
    else openExerciseFolders.delete(folder.dataset.group)
  })
  const filterOptions = [...document.querySelector('[data-exercise-filter]').options]
    .map((option) => option.value)
    .filter((value) => value !== 'all')
  // Um exercício pode aparecer em mais de uma pasta quando trabalha mais de
  // um grupo muscular (ex.: afundo no smith = quadríceps e glúteos).
  const folderNamesFor = (exercise) => {
    const groups = exerciseGroups(exercise)
    if (!groups.length) return ['Sem grupo']
    const names = new Set()
    groups.forEach((name) =>
      names.add(legGroups.includes(name) && filterOptions.includes('Pernas') ? 'Pernas' : name),
    )
    return [...names]
  }
  const folders = new Map()
  // Pastas criadas por você aparecem mesmo sem exercício dentro.
  const custom = getData().customGroups || []
  if (!query && group === 'all')
    custom.forEach((item) => folders.set(item.name, []))
  filtered.forEach((exercise) => {
    folderNamesFor(exercise).forEach((name) => {
      if (!folders.has(name)) folders.set(name, [])
      folders.get(name).push(exercise)
    })
  })
  const position = (name) => {
    const index = filterOptions.indexOf(name)
    return index === -1 ? filterOptions.length : index
  }
  const expandAll = Boolean(query) || group !== 'all'
  list.replaceChildren(
    ...[...folders.entries()]
      .sort(([a], [b]) => position(a) - position(b) || a.localeCompare(b, 'pt-BR'))
      .map(([name, exercises]) => {
        const folder = document.createElement('details')
        folder.className = 'exercise-folder'
        folder.dataset.group = name
        folder.open = expandAll || openExerciseFolders.has(name)
        const summary = document.createElement('summary')
        const label = document.createElement('span')
        label.className = 'exercise-folder-name'
        label.textContent = name
        const count = document.createElement('span')
        count.className = 'exercise-folder-count'
        count.textContent = `${exercises.length} ${exercises.length === 1 ? 'exercício' : 'exercícios'}`
        const owned = custom.find((item) => item.name === name)
        summary.append(
          label,
          count,
          folderAddButton(name),
          exerciseFolderRemoveButton(name, exercises, owned),
        )
        const body = document.createElement('div')
        body.className = 'exercise-folder-body'
        body.append(
          ...exercises.map((e) => {
            const item = cloneTemplate('exercise-item-template')
            item.dataset.id = e.id
            item.querySelector('h3').textContent = e.name
            // "com GIF" em verde e "sem GIF" em vermelho, para achar rápido
            // quais exercícios ainda estão faltando GIF.
            const info = item.querySelector('p')
            const gifStatus = exerciseGifStatus(e)
            const badge = document.createElement('span')
            badge.className = `gif-status ${gifStatus === 'com GIF' ? 'gif-status--on' : 'gif-status--off'}`
            badge.textContent = gifStatus
            // Mesmo esquema para o vídeo MP4. "com MP4" é clicável e abre o vídeo.
            const video = e.videoId ? findVideo(e.videoId) : null
            const videoBadge = document.createElement(video ? 'button' : 'span')
            videoBadge.className = `gif-status ${video ? 'gif-status--on gif-status--button' : 'gif-status--off'}`
            videoBadge.textContent = video ? '▶ com MP4' : 'sem MP4'
            if (video) {
              videoBadge.type = 'button'
              videoBadge.title = `Assistir o vídeo de ${e.name}`
              videoBadge.addEventListener('click', (event) => {
                event.preventDefault()
                event.stopPropagation()
                void openVideoLightbox(video.id, e.name)
              })
            }
            info.replaceChildren(
              document.createTextNode(`${e.equipment} · ${e.difficulty || 'Intermediário'} · `),
              badge,
              document.createTextNode(' '),
              videoBadge,
            )
            item.querySelector('.tag').textContent = exerciseGroups(e).join(' · ') || 'Sem grupo'
            applyExerciseGifThumb(item, e)
            // Sem GIF mas com vídeo: o ícone vira um "play" que abre o vídeo.
            if (video && !item.querySelector('.exercise-glyph--gif')) {
              const glyph = item.querySelector('.exercise-glyph')
              if (glyph) {
                glyph.classList.add('exercise-glyph--video', 'exercise-glyph--clickable')
                glyph.textContent = '▶'
                glyph.title = 'Clique para assistir o vídeo'
                glyph.addEventListener('click', (event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void openVideoLightbox(video.id, e.name)
                })
              }
            }
            const remove = document.createElement('button')
            remove.className = 'icon-button exercise-remove'
            remove.type = 'button'
            remove.dataset.action = 'delete-exercise'
            remove.textContent = '×'
            remove.title = `Excluir ${e.name}`
            remove.setAttribute('aria-label', `Excluir ${e.name}`)
            item.append(remove)
            return item
          }),
        )
        folder.append(summary, body)
        return folder
      }),
  )
  document.querySelector('[data-exercises-empty]').hidden = filtered.length > 0
}
// ── Avaliações agrupadas por aluno ──────────────────────────────────────────
// Um card por aluno com a avaliação mais recente, a variação desde a anterior,
// o prazo da reavaliação (90 dias) e o histórico recolhido.
const REASSESS_DAYS = 90
const openAssessmentHistory = new Set()
const DAY_MS = 86_400_000
// Métricas do card. better: 'down' = menor é melhor; null = depende do objetivo.
const assessmentMetrics = [
  { label: 'Peso', unit: 'kg', better: null, value: (a) => numberFrom(a.weightKg ?? a.weight) },
  { label: 'IMC', unit: '', better: null, value: (a) => numberFrom(a.bmi) },
  { label: 'Gordura', unit: '%', better: 'down', value: (a) => numberFrom(a.bodyFatPercent ?? a.fat) },
  { label: 'Cintura', unit: 'cm', better: 'down', value: (a) => numberFrom(a.waistCm ?? a.waist) },
  { label: 'RCQ', unit: '', better: 'down', value: (a) => numberFrom(a.whr) },
  { label: 'FC repouso', unit: 'bpm', better: 'down', value: (a) => numberFrom(a.restingHR) },
]
const decimal = (value, digits = 1) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value)
const assessmentDateText = (a) => {
  const date = assessmentDate(a)
  return date ? new Intl.DateTimeFormat('pt-BR').format(date) : a.date || '—'
}

function assessmentFilters() {
  return {
    student: document.querySelector('[data-assessment-student]')?.value || '',
    status: document.querySelector('[data-assessment-status]')?.value || 'all',
    period: document.querySelector('[data-assessment-period]')?.value || 'all',
    sort: document.querySelector('[data-assessment-sort]')?.value || 'recent',
  }
}

function inPeriod(a, period) {
  if (period === 'all') return true
  const date = assessmentDate(a)
  if (!date) return false
  if (period === 'year') return date.getFullYear() === new Date().getFullYear()
  return Date.now() - date.getTime() <= Number(period) * DAY_MS
}

function metricTile(metric, latest, previous) {
  const tile = document.createElement('div')
  const label = document.createElement('span')
  label.textContent = metric.label
  const value = document.createElement('strong')
  const current = metric.value(latest)
  value.textContent =
    current === null
      ? '—'
      : `${decimal(current, 2)}${metric.unit === '%' ? '%' : metric.unit ? ` ${metric.unit}` : ''}`
  tile.append(label, value)
  const before = previous ? metric.value(previous) : null
  if (current !== null && before !== null) {
    const diff = Math.round((current - before) * 100) / 100
    const delta = document.createElement('small')
    delta.className = 'assessment-delta'
    if (diff === 0) {
      delta.textContent = '= igual'
      delta.classList.add('is-neutral')
    } else {
      delta.textContent = `${diff < 0 ? '▼' : '▲'} ${decimal(Math.abs(diff), 2)}`
      delta.classList.add(
        metric.better === null ? 'is-neutral' : (diff < 0) === (metric.better === 'down') ? 'is-good' : 'is-bad',
      )
    }
    delta.title = 'Diferença desde a avaliação anterior'
    tile.append(delta)
  }
  return tile
}

function reassessBadge(latest) {
  const badge = document.createElement('span')
  badge.className = 'assessment-due'
  const date = assessmentDate(latest)
  if (!date) {
    badge.textContent = 'Sem data'
    return badge
  }
  const days = Math.ceil((date.getTime() + REASSESS_DAYS * DAY_MS - Date.now()) / DAY_MS)
  if (days < 0) {
    badge.textContent = `Reavaliação atrasada ${-days} dia${days === -1 ? '' : 's'}`
    badge.classList.add('is-late')
  } else if (days === 0) {
    badge.textContent = 'Reavaliar hoje'
    badge.classList.add('is-late')
  } else {
    badge.textContent = `Reavaliar em ${days} dia${days === 1 ? '' : 's'}`
    if (days <= 14) badge.classList.add('is-soon')
  }
  return badge
}

function openReassessment(name) {
  const trigger = document.querySelector('[data-route="avaliacoes"] [data-open-modal="assessment"]')
  if (!trigger) return
  trigger.click()
  queueMicrotask(() => {
    const select = document.querySelector('[data-form="assessment"] [name="student"]')
    if (select && [...select.options].some((option) => option.value === name)) select.value = name
  })
}

function assessmentGroupCard(group) {
  const [latest, previous] = group.items
  const card = document.createElement('article')
  card.className = 'assessment-card assessment-group panel'

  const header = document.createElement('header')
  const person = document.createElement('div')
  person.className = 'person-cell'
  const avatar = document.createElement('span')
  avatar.className = 'avatar'
  paintAvatar(avatar, studentPhoto(group.studentId, group.name))
  const who = document.createElement('div')
  const title = document.createElement('h2')
  title.textContent = group.name
  const sub = document.createElement('p')
  sub.textContent = `${group.all.length} avaliaç${group.all.length === 1 ? 'ão' : 'ões'} · última em ${assessmentDateText(latest)}`
  who.append(title, sub)
  person.append(avatar, who)
  const status = document.createElement('span')
  status.className = `status ${latest.publishedAt ? 'status--success' : 'status--paused'}`
  status.textContent = latest.publishedAt ? 'Publicada' : 'Rascunho'
  header.append(person, status)

  const values = document.createElement('div')
  values.className = 'assessment-values'
  values.append(...assessmentMetrics.map((metric) => metricTile(metric, latest, previous)))

  const footer = document.createElement('footer')
  const protocol = document.createElement('strong')
  protocol.textContent = latest.protocol || 'Avaliação física'
  const again = document.createElement('button')
  again.type = 'button'
  again.className = 'link-button assessment-again'
  again.textContent = '+ Reavaliar'
  again.addEventListener('click', () => openReassessment(group.name))
  footer.append(reassessBadge(latest), protocol, again)

  card.append(header, values, footer)

  if (group.all.length > 1) {
    const history = document.createElement('details')
    history.className = 'assessment-history'
    history.open = openAssessmentHistory.has(group.key)
    history.addEventListener('toggle', () => {
      if (history.open) openAssessmentHistory.add(group.key)
      else openAssessmentHistory.delete(group.key)
    })
    const summary = document.createElement('summary')
    summary.textContent = `Ver histórico (${group.all.length})`
    const list = document.createElement('ol')
    group.all.forEach((a) => {
      const row = document.createElement('li')
      const date = document.createElement('strong')
      date.textContent = assessmentDateText(a)
      const info = document.createElement('span')
      const weight = numberFrom(a.weightKg ?? a.weight)
      const fat = numberFrom(a.bodyFatPercent ?? a.fat)
      info.textContent = [
        a.protocol || 'Avaliação física',
        weight !== null ? `${decimal(weight, 2)} kg` : null,
        fat !== null ? `${decimal(fat, 2)}% gordura` : null,
      ]
        .filter(Boolean)
        .join(' · ')
      const state = document.createElement('small')
      state.className = a.publishedAt ? 'is-published' : 'is-draft'
      state.textContent = a.publishedAt ? 'Publicada' : 'Rascunho'
      row.append(date, info, state)
      list.append(row)
    })
    history.append(summary, list)
    card.append(history)
  }
  return card
}

function renderAssessments() {
  const grid = document.querySelector('[data-assessments-grid]')
  if (!grid) return
  const filters = assessmentFilters()
  const all = [...(getData().assessments || [])].sort(
    (a, b) => (assessmentDate(b)?.getTime() || 0) - (assessmentDate(a)?.getTime() || 0),
  )
  // Agrupa todas as avaliações por aluno (id; nome como reserva).
  const groups = new Map()
  all.forEach((a) => {
    const key = a.studentId ? `id:${a.studentId}` : `nome:${a.student}`
    if (!groups.has(key))
      groups.set(key, { key, studentId: a.studentId, name: a.student, all: [], items: [] })
    groups.get(key).all.push(a)
  })
  // Lista de alunos com avaliação (mantém a escolha atual).
  const studentSelect = document.querySelector('[data-assessment-student]')
  if (studentSelect) {
    const options = [...groups.values()].sort((a, b) =>
      String(a.name).localeCompare(String(b.name), 'pt-BR'),
    )
    studentSelect.replaceChildren(
      Object.assign(document.createElement('option'), { value: '', textContent: 'Todos os alunos' }),
      ...options.map((group) =>
        Object.assign(document.createElement('option'), {
          value: group.key,
          textContent: `${group.name} (${group.all.length})`,
        }),
      ),
    )
    studentSelect.value = groups.has(filters.student) ? filters.student : ''
    filters.student = studentSelect.value
  }
  const visible = [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.all.filter(
        (a) =>
          inPeriod(a, filters.period) &&
          (filters.status === 'all' ||
            (filters.status === 'published' ? Boolean(a.publishedAt) : !a.publishedAt)),
      ),
    }))
    .filter(
      (group) =>
        group.items.length && (!filters.student || group.key === filters.student),
    )
    .map((group) => {
      // "Anterior" é sempre a avaliação imediatamente antes da mostrada.
      const index = group.all.indexOf(group.items[0])
      return { ...group, items: [group.items[0], group.all[index + 1]].filter(Boolean) }
    })
  const time = (group) => assessmentDate(group.items[0])?.getTime() || 0
  visible.sort((a, b) =>
    filters.sort === 'name'
      ? String(a.name).localeCompare(String(b.name), 'pt-BR')
      : filters.sort === 'due'
        ? time(a) - time(b)
        : time(b) - time(a),
  )
  const summary = document.querySelector('[data-assessment-summary]')
  if (summary)
    summary.textContent = `${visible.length} aluno${visible.length === 1 ? '' : 's'} · ${all.length} avaliaç${all.length === 1 ? 'ão' : 'ões'}`
  if (!visible.length) {
    const empty = document.createElement('p')
    empty.className = 'assessment-empty'
    empty.textContent = all.length
      ? 'Nenhuma avaliação encontrada com esses filtros.'
      : 'Nenhuma avaliação registrada ainda. Clique em "Nova avaliação" para começar.'
    grid.replaceChildren(empty)
    return
  }
  grid.replaceChildren(...visible.map(assessmentGroupCard))
}
function renderStudentOptions() {
  const students = getData().students
  document.querySelectorAll('[data-student-options],[data-progress-student]').forEach((select) => {
    const available = select.closest('[data-form="workout"]')
      ? students.filter((student) => student.planCode !== 'ready')
      : students
    const selected = select.value
    select.replaceChildren(
      ...available.map((s) => {
        const o = document.createElement('option')
        o.value = s.name
        o.textContent = select.closest('[data-form="workout"]')
          ? `${s.name} — ${s.planCode === 'athlete' ? 'Performance Atleta' : s.planCode === 'premium' ? 'Consultoria Premium' : 'Consultoria Básica'}`
          : s.name
        return o
      }),
    )
    if (available.some((s) => s.name === selected)) select.value = selected
  })
}
function renderExerciseOptions() {
  const select = document.querySelector('[name="exerciseIds"]')
  if (!select) return
  const selected = new Set([...select.selectedOptions].map((o) => o.value))
  select.replaceChildren(
    ...getData().exercises.map((e) => {
      const o = document.createElement('option')
      o.value = e.id
      o.textContent = `${e.name} — ${e.group}`
      o.selected = selected.has(e.id)
      return o
    }),
  )
}
function renderStats() {
  const d = getData()
  const active = d.students.filter((s) =>
    s.accessStatus ? s.accessStatus === 'active' : s.status === 'Ativo',
  )
  const publishedWorkouts = d.workouts.filter((workout) => workout.publishedAt)
  const recentLimit = Date.now() - 90 * 86_400_000
  const assessedRecently = new Set(
    d.assessments
      .filter((item) => (assessmentDate(item)?.getTime() || 0) >= recentLimit)
      .map((item) => item.studentId || item.student),
  )
  const pendingAssessments = active.filter(
    (student) => !assessedRecently.has(student.id) && !assessedRecently.has(student.name),
  ).length
  const fatChanges = active
    .map((student) => {
      const entries = d.assessments
        .filter((item) => item.studentId === student.id || item.student === student.name)
        .sort((a, b) => (assessmentDate(a)?.getTime() || 0) - (assessmentDate(b)?.getTime() || 0))
      if (entries.length < 2) return null
      const first = numberFrom(entries[0].bodyFatPercent ?? entries[0].fat)
      const last = numberFrom(entries.at(-1).bodyFatPercent ?? entries.at(-1).fat)
      return first === null || last === null ? null : first - last
    })
    .filter((value) => value !== null)
  const averageEvolution = fatChanges.length
    ? fatChanges.reduce((total, value) => total + value, 0) / fatChanges.length
    : null
  document.querySelector('[data-stat-students]').textContent = active.length
  document.querySelector('[data-stat-students-detail]').textContent =
    `${d.students.length} cadastro${d.students.length === 1 ? '' : 's'} no total`
  document.querySelector('[data-stat-workouts]').textContent = publishedWorkouts.length
  document.querySelector('[data-stat-workouts-detail]').textContent =
    `${d.workouts.length} ficha${d.workouts.length === 1 ? '' : 's'} cadastrada${d.workouts.length === 1 ? '' : 's'}`
  document.querySelector('[data-stat-assessments]').textContent = pendingAssessments
  document.querySelector('[data-stat-assessments-detail]').textContent = pendingAssessments
    ? 'Sem avaliação nos últimos 90 dias'
    : 'Avaliações em dia'
  document.querySelector('[data-stat-evolution]').textContent =
    averageEvolution === null
      ? '—'
      : `${averageEvolution >= 0 ? '+' : '−'}${Math.abs(averageEvolution).toFixed(1)} pts`
  document.querySelector('[data-stat-evolution-detail]').textContent =
    averageEvolution === null ? 'Aguardando reavaliações' : 'Melhora média na gordura corporal'
  document.querySelector('[data-student-count]').textContent = d.students.length
}

function renderDashboardMeta() {
  const now = new Date()
  document.querySelector('[data-dashboard-date]').textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(now)
  const hour = now.getHours()
  document.querySelector('[data-dashboard-greeting]').textContent =
    `${hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}, ${
      String(getData().profile?.name || 'Fabio').trim().split(/\s+/u)[0]
    }.`
}

function chartPath(points) {
  if (!points.length) return ''
  return points
    .map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
}

function renderDashboardChart() {
  const metric = document.querySelector('[data-dashboard-chart-metric]').value
  const groups = new Map()
  getData().assessments.forEach((item) => {
    const date = assessmentDate(item)
    const value = numberFrom(
      metric === 'fat' ? (item.bodyFatPercent ?? item.fat) : (item.weightKg ?? item.weight),
    )
    if (!date || value === null) return
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const group = groups.get(key) || { date, values: [] }
    group.values.push(value)
    groups.set(key, group)
  })
  const series = [...groups.values()]
    .sort((a, b) => a.date - b.date)
    .slice(-6)
    .map((group) => ({
      date: group.date,
      value: group.values.reduce((total, value) => total + value, 0) / group.values.length,
    }))
  const months = document.querySelector('[data-dashboard-chart-months]')
  months.replaceChildren(...series.map((item) => elementSpan(monthLabel(item.date))))
  const line = document.querySelector('[data-dashboard-chart-line]')
  const area = document.querySelector('[data-dashboard-chart-area]')
  if (series.length < 2) {
    line.setAttribute('d', '')
    area.setAttribute('d', '')
    document.querySelector('[data-dashboard-chart-subtitle]').textContent =
      'Cadastre ao menos duas avaliações em meses diferentes'
    return
  }
  const values = series.map((item) => item.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = series.map((item, index) => [
    (index / (series.length - 1)) * 700,
    210 - ((item.value - min) / range) * 170,
  ])
  const path = chartPath(points)
  line.setAttribute('d', path)
  area.setAttribute('d', `${path} L700 240 L0 240Z`)
  document.querySelector('[data-dashboard-chart-subtitle]').textContent =
    `${metric === 'fat' ? 'Gordura corporal' : 'Peso'} médio · ${series.length} meses com registros`
}

function elementSpan(text) {
  const span = document.createElement('span')
  span.textContent = text
  return span
}

function sameLocalDay(date, reference) {
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  )
}

// Painel: só um resumo do dia. A agenda completa (semana, concluir,
// cancelar…) fica na página "Agenda" do menu.
function renderSchedule() {
  const now = new Date()
  const allUpcoming = (getData().appointments || [])
    .filter((item) => item.status !== 'cancelled' && new Date(item.endsAt) >= now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  const today = (getData().appointments || [])
    .filter((item) => item.status !== 'cancelled' && sameLocalDay(new Date(item.startsAt), now))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  const next = allUpcoming.find((item) => !sameLocalDay(new Date(item.startsAt), now))
  const appointments = today.length ? today.slice(0, 5) : next ? [next] : []
  const list = document.querySelector('[data-schedule-list]')
  document.querySelector('[data-schedule-title]').textContent = 'Agenda de hoje'
  document.querySelector('[data-schedule-summary]').textContent = today.length
    ? `${today.length} atendimento${today.length === 1 ? '' : 's'} hoje`
    : next
      ? 'Hoje está livre · próximo atendimento:'
      : 'Nenhum atendimento programado'
  const fullAgenda = document.createElement('a')
  fullAgenda.className = 'link-button schedule-more'
  fullAgenda.href = '#agenda'
  fullAgenda.textContent = 'Ver agenda completa →'
  if (!appointments.length) {
    const empty = document.createElement('p')
    empty.className = 'schedule-empty'
    empty.textContent = 'Use “Novo atendimento” para organizar sua agenda presencial.'
    list.replaceChildren(empty, fullAgenda)
    return
  }
  list.replaceChildren(
    ...appointments.map((item) => {
      const start = new Date(item.startsAt)
      const end = new Date(item.endsAt)
      const current = now >= start && now <= end && item.status === 'scheduled'
      const row = document.createElement('div')
      row.className = `schedule-item${current ? ' is-current' : ''}`
      row.dataset.id = item.id
      const actions = document.createElement('div')
      actions.className = 'schedule-actions'
      actions.innerHTML = `<button class="icon-button" type="button" data-appointment-action="edit" aria-label="Editar atendimento">✎</button><button class="icon-button icon-button--danger" type="button" data-appointment-action="delete" aria-label="Excluir atendimento">×</button>`
      const time = document.createElement('time')
      time.textContent = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(start)
      const avatar = document.createElement('span')
      avatar.className = 'avatar'
      paintAvatar(avatar, studentPhoto(item.studentId, item.student))
      const details = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = item.student
      const service = document.createElement('small')
      service.textContent = `${today.length ? '' : `${shortDate(start)} · `}${item.service}${item.location ? ` · ${item.location}` : ''}`
      details.append(name, service)
      const status = document.createElement('span')
      status.className = `status ${item.status === 'completed' ? 'status--success' : current ? 'status--now' : ''}`
      status.textContent =
        item.status === 'completed' ? 'Concluído' : current ? 'Agora' : 'Agendado'
      row.append(time, avatar, details, status, actions)
      return row
    }),
    fullAgenda,
  )
}

function setKpi(name, change, details) {
  const card = document.querySelector(`[data-progress-kpi="${name}"]`)
  card.querySelector('strong').textContent = change
  card.querySelector('small').textContent = details
}

function renderProgress() {
  const selected = document.querySelector('[data-progress-student]').value
  const student = getData().students.find((item) => item.name === selected) || getData().students[0]
  if (!student) return
  document.querySelector('[data-progress-name]').textContent = student.name
  document.querySelector('[data-progress-goal]').textContent = student.goal
  paintAvatar(document.querySelector('[data-progress-avatar]'), student)
  const assessments = getData()
    .assessments.filter((item) => item.studentId === student.id || item.student === student.name)
    .sort((a, b) => (assessmentDate(a)?.getTime() || 0) - (assessmentDate(b)?.getTime() || 0))
  const workouts = getData().workouts.filter(
    (item) => item.studentId === student.id || item.student === student.name,
  )
  const averageProgress = workouts.length
    ? workouts.reduce((total, item) => total + Number(item.progress || 0), 0) / workouts.length
    : null
  const start =
    assessmentDate(assessments[0]) || (student.createdAt ? new Date(student.createdAt) : null)
  document.querySelector('[data-progress-start]').textContent = start ? shortDate(start) : '—'
  document.querySelector('[data-progress-frequency]').textContent =
    `${workouts.length} ficha${workouts.length === 1 ? '' : 's'}`
  document.querySelector('[data-progress-adherence]').textContent =
    averageProgress === null ? '—' : `${Math.round(averageProgress)}%`
  const metric = document.querySelector('[data-progress-metric]').value
  const entries = assessments
    .map((item) => ({
      date: assessmentDate(item),
      value: numberFrom(item[metric]),
    }))
    .filter((item) => item.date && item.value !== null)
    .slice(-6)
  const values = entries.map((item) => item.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  document.querySelector('[data-progress-bars]').replaceChildren(
    ...entries.map((item) => {
      const bar = document.createElement('i')
      bar.style.setProperty('--value', `${35 + ((item.value - min) / range) * 55}%`)
      const label = document.createElement('span')
      label.textContent = item.value.toLocaleString('pt-BR', {
        maximumFractionDigits: 1,
      })
      bar.append(label)
      return bar
    }),
  )
  document
    .querySelector('[data-progress-months]')
    .replaceChildren(...entries.map((item) => elementSpan(monthLabel(item.date))))
  const first = assessments[0]
  const last = assessments.at(-1)
  const updateDifference = (name, firstValue, lastValue, unit) => {
    if (firstValue === null || lastValue === null || assessments.length < 2) {
      setKpi(name, '—', 'Aguardando reavaliação')
      return
    }
    const difference = lastValue - firstValue
    setKpi(
      name,
      `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${Math.abs(difference).toFixed(1)}${unit}`,
      `${firstValue.toFixed(1)} → ${lastValue.toFixed(1)}${unit}`,
    )
  }
  updateDifference('weight', numberFrom(first?.weightKg), numberFrom(last?.weightKg), ' kg')
  updateDifference('fat', numberFrom(first?.bodyFatPercent), numberFrom(last?.bodyFatPercent), '%')
  updateDifference('waist', numberFrom(first?.waistCm), numberFrom(last?.waistCm), ' cm')
  setKpi(
    'performance',
    averageProgress === null ? '—' : `${Math.round(averageProgress)}%`,
    averageProgress === null ? 'Aguardando registros' : 'Progresso médio das fichas',
  )
}
export function renderAll() {
  renderStudents()
  renderRecentStudents()
  renderWorkouts()
  renderExercises()
  renderAssessments()
  renderStudentOptions()
  renderExerciseOptions()
  renderStats()
  renderDashboardMeta()
  renderDashboardChart()
  renderSchedule()
  renderProgress()
}
export function initDashboard() {
  renderAll()
  window.addEventListener('frs:data-changed', renderAll)
  document.querySelector('[data-table-search="students"]').addEventListener('input', renderStudents)
  document.querySelector('[data-student-filter]').addEventListener('change', renderStudents)
  document
    .querySelector('[data-table-search="exercises"]')
    .addEventListener('input', renderExercises)
  document.querySelector('[data-exercise-filter]').addEventListener('change', renderExercises)
  ;['[data-assessment-student]', '[data-assessment-status]', '[data-assessment-period]', '[data-assessment-sort]'].forEach(
    (selector) => document.querySelector(selector)?.addEventListener('change', renderAssessments),
  )
  const filterBox = document.querySelector('[data-exercise-filter]')?.parentElement
  if (filterBox && !filterBox.querySelector('.folder-create-button'))
    filterBox.append(folderCreateButton())
  document
    .querySelector('[data-dashboard-chart-metric]')
    .addEventListener('change', renderDashboardChart)
  document.querySelector('[data-progress-metric]').addEventListener('change', renderProgress)
  document.querySelector('[data-students-table]').addEventListener('click', async (event) => {
    const b = event.target.closest('[data-action]')
    if (!b) return
    const id = b.closest('tr').dataset.id
    if (b.dataset.action === 'edit')
      window.dispatchEvent(new CustomEvent('frs:edit-student', { detail: id }))
    if (b.dataset.action === 'access')
      window.dispatchEvent(new CustomEvent('frs:manage-access', { detail: id }))
    if (b.dataset.action === 'delete') {
      const student = getData().students.find((item) => String(item.id) === String(id))
      if (!student || !(await confirmStudentDeletion(student))) return
      b.disabled = true
      try {
        await removeRecord('students', id)
        updateData((d) => {
          d.students = d.students.filter((s) => String(s.id) !== String(id))
        })
        showToast('Aluno e conta de acesso excluídos com sucesso.')
      } catch (error) {
        b.disabled = false
        showToast(error.message)
      }
    }
  })
  document.querySelector('[data-workouts-grid]').addEventListener('click', async (event) => {
    const b = event.target.closest('[data-action]')
    if (!b) return
    const id = b.closest('[data-id]').dataset.id
    if (b.dataset.action === 'edit')
      window.dispatchEvent(new CustomEvent('frs:edit-workout', { detail: id }))
    if (b.dataset.action === 'pdf') {
      const workout = getData().workouts.find((item) => String(item.id) === String(id))
      if (!workout) return
      if (!Array.isArray(workout.exercisePrescriptions))
        try {
          workout.exercisePrescriptions = JSON.parse(workout.exercisePrescriptionsJson || '[]')
        } catch {
          workout.exercisePrescriptions = []
        }
      void downloadWorkoutPdf(
        { ...workout, exercises: workout.exercisePrescriptions },
        workout.student || 'Aluno',
        loadExerciseGifFrame,
      ).catch((error) => showToast(error.message))
    }
    if (
      b.dataset.action === 'delete' &&
      (await askConfirm({
        title: 'Excluir ficha de treino?',
        message: 'A ficha sai do painel e deixa de aparecer para o aluno.',
        note: 'Esta ação não pode ser desfeita.',
      }))
    ) {
      updateData((d) => {
        d.workouts = d.workouts.filter((w) => w.id !== id)
      })
      void removeRecord('workouts', id).catch(() => {})
      showToast('Ficha excluída com sucesso.')
    }
  })
  document.querySelector('[data-exercises-list]').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-action="edit"]')
    if (edit) {
      window.dispatchEvent(
        new CustomEvent('frs:edit-exercise', {
          detail: edit.closest('[data-id]').dataset.id,
        }),
      )
      return
    }
    const remove = event.target.closest('[data-action="delete-exercise"]')
    if (!remove) return
    const row = remove.closest('[data-id]')
    const exercise = getData().exercises.find((item) => item.id === row.dataset.id)
    if (!exercise) return
    const ok = await askConfirm({
      eyebrow: 'Biblioteca de exercícios',
      title: 'Excluir exercício?',
      message: `O exercício “${exercise.name}” será removido da biblioteca.`,
      note: 'Esta ação não pode ser desfeita.',
    })
    if (!ok) return
    remove.disabled = true
    try {
      await removeRecord('exercises', exercise.id)
      await syncRemoteData()
      showToast('Exercício excluído.')
    } catch (error) {
      remove.disabled = false
      showToast(error.message)
    }
  })
  document.querySelector('[data-progress-student]').addEventListener('change', (event) => {
    const s = getData().students.find((i) => i.name === event.target.value)
    if (!s) return
    document.querySelector('[data-progress-name]').textContent = s.name
    document.querySelector('[data-progress-goal]').textContent = s.goal
    paintAvatar(document.querySelector('[data-progress-avatar]'), s)
    renderProgress()
  })
  document.querySelector('[data-schedule-list]').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-appointment-action]')
    if (!button) return
    const id = button.closest('[data-id]').dataset.id
    if (button.dataset.appointmentAction === 'edit')
      window.dispatchEvent(new CustomEvent('frs:edit-appointment', { detail: id }))
    if (
      button.dataset.appointmentAction === 'delete' &&
      (await askConfirm({
        eyebrow: 'Agenda',
        title: 'Excluir atendimento?',
        message: 'O atendimento sai da agenda.',
        note: 'Esta ação não pode ser desfeita.',
      }))
    ) {
      updateData((data) => {
        data.appointments = (data.appointments || []).filter((item) => item.id !== id)
      })
      void removeRecord('appointments', id).catch((error) => showToast(error.message))
      showToast('Atendimento removido da agenda.')
    }
  })
}
