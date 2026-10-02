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
  badge.className = `student-plan-badge student-plan-badge--${code}`
  const period =
    student.planCode === 'ready' || student.accessType === 'permanent'
      ? 'permanente'
      : billingCycleLabels[student.billingCycle]
  badge.textContent = code === 'none'
    ? 'Sem plano'
    : [planLabels[code], period].filter(Boolean).join(' · ')
  return badge
}
// Situação do acesso: "Liberado" ou "Liberar". O período (mensal, anual,
// permanente…) já aparece no selo do plano embaixo do nome; o motivo de
// ainda não estar liberado fica na dica ao passar o mouse.
function accessLabel(student) {
  return student.accessStatus === 'active'
    ? 'Liberado'
    : 'Liberar'
}
function accessDetail(student) {
  if (student.accessStatus === 'active')
    return student.paymentStatus === 'paid'
      ? 'Acesso liberado'
      : 'Liberado pelo personal (pagamento não confirmado)'
  if (student.accessStatus === 'paused') return 'Acesso pausado'
  if (student.accessStatus === 'cancelled') return 'Acesso cancelado'
  return student.paymentStatus === 'pending' ? 'Pagamento pendente' : 'Aguardando liberação'
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
      // "Ativo" = liberado pelo personal (acesso ativo), igual à coluna de situação.
      (filter === 'all' ||
        (filter === 'Ativo' ? s.accessStatus === 'active' : s.accessStatus !== 'active')),
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
      status.title = accessDetail(student)
      status.classList.add(
        student.accessStatus === 'active'
          ? 'status--active'
          : 'status--paused',
      )
      // Mesmo botão, bem visível, pra qualquer aluno ainda não liberado —
      // não importa se foi cadastrado presencialmente ou se ele mesmo se
      // cadastrou pelo site. Antes só o presencial ganhava um botão grande;
      // o do WebApp ficava só com um "✓" pequeno, fácil de não perceber.
      const needsRelease = student.accessStatus !== 'active'
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
      status.title = accessDetail(s)
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
// Nome sem acento e em minúsculas, para a busca achar "Antonio" em "Antônio".
const normalizeName = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()

// Fichas personalizadas agrupadas por aluno. Escolher um aluno (na lista do
// topo ou tocando no nome dele) mostra só as fichas desse aluno.
// Lista de alunos (select) que acompanha a busca: só aparecem os nomes que
// combinam com o que foi digitado. Mantém a escolha atual quando possível e
// devolve a chave do aluno escolhido ('' = todos).
function fillStudentSelect(select, groups, search) {
  if (!select) return ''
  const current = select.value
  const options = groups
    .filter((group) => !search || normalizeName(group.name).includes(search))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
  select.replaceChildren(
    Object.assign(document.createElement('option'), {
      value: '',
      textContent: options.length ? 'Todos os alunos' : 'Nenhum aluno encontrado',
    }),
    ...options.map((group) =>
      Object.assign(document.createElement('option'), {
        value: group.key,
        textContent: `${group.name} (${(group.all || group.items).length})`,
      }),
    ),
  )
  select.value = options.some((group) => group.key === current) ? current : ''
  return select.value
}

function workoutCard(w) {
  const card = cloneTemplate('workout-card-template')
  card.dataset.id = w.id
  card.querySelector('h2').textContent = w.name
  // O nome do aluno já está no cabeçalho do grupo; e o "Progresso" não era
  // calculado (ficava sempre igual), então os dois saem do card.
  card.querySelector('[data-card="student"]')?.remove()
  card.querySelector('[data-card="goal"]').textContent =
    `${w.goal} · ${w.publishedAt ? 'Publicado' : 'Rascunho'} · ${w.exerciseCount || 0} exercícios`
  card.querySelector('[data-card="duration"]').textContent = w.duration
  card.querySelector('.workout-progress')?.remove()
  card.querySelector('progress')?.remove()
  const pdf = card.querySelector('.button--full')
  pdf.dataset.action = 'pdf'
  pdf.firstChild.textContent = 'Baixar PDF visual '
  return card
}

function renderWorkouts() {
  const workouts = getData().workouts || []
  const grid = document.querySelector('[data-workouts-grid]')
  const searchInput = document.querySelector('[data-workout-search]')
  const studentSelect = document.querySelector('[data-workout-student]')
  const search = normalizeName(searchInput?.value)
  const status = document.querySelector('[data-workout-status]')?.value || 'all'
  const groups = new Map()
  workouts.forEach((w) => {
    const key = w.studentId ? `id:${w.studentId}` : `nome:${w.student}`
    if (!groups.has(key)) groups.set(key, { key, studentId: w.studentId, name: w.student, items: [] })
    groups.get(key).items.push(w)
  })
  const ordered = [...groups.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'pt-BR'),
  )
  const chosenKey = fillStudentSelect(studentSelect, ordered, search)
  const chosen = Boolean(chosenKey)
  const matchesStatus = (w) =>
    status === 'all' || (status === 'published' ? Boolean(w.publishedAt) : !w.publishedAt)
  const visible = ordered
    .filter((group) =>
      chosenKey ? group.key === chosenKey : !search || normalizeName(group.name).includes(search),
    )
    .map((group) => ({ ...group, items: group.items.filter(matchesStatus) }))
    .filter((group) => group.items.length)
  const summary = document.querySelector('[data-workout-summary]')
  if (summary)
    summary.textContent = `${ordered.length} aluno${ordered.length === 1 ? '' : 's'} · ${workouts.length} ficha${workouts.length === 1 ? '' : 's'}`
  const selectStudent = (key) => {
    if (searchInput) searchInput.value = ''
    if (studentSelect) {
      fillStudentSelect(studentSelect, ordered, '')
      studentSelect.value = key
    }
    renderWorkouts()
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const sections = visible.map((group) => {
    const section = document.createElement('section')
    section.className = 'workout-group'
    const head = document.createElement('header')
    head.className = 'workout-group-head'
    const who = document.createElement('button')
    who.type = 'button'
    who.className = 'workout-group-name'
    who.title = chosen ? 'Voltar para todos os alunos' : `Ver só as fichas de ${group.name}`
    const avatar = document.createElement('span')
    avatar.className = 'avatar'
    paintAvatar(avatar, studentPhoto(group.studentId, group.name))
    const text = document.createElement('span')
    const name = document.createElement('strong')
    name.textContent = group.name
    const count = document.createElement('small')
    count.textContent = `${group.items.length} ficha${group.items.length === 1 ? '' : 's'}`
    text.append(name, count)
    who.append(avatar, text)
    who.addEventListener('click', () => selectStudent(chosen ? '' : group.key))
    head.append(who)
    if (chosen) {
      const back = document.createElement('button')
      back.type = 'button'
      back.className = 'link-button'
      back.textContent = '← Todos os alunos'
      back.addEventListener('click', () => selectStudent(''))
      head.append(back)
    }
    const cards = document.createElement('div')
    cards.className = 'cards-grid'
    cards.append(...group.items.map(workoutCard))
    section.append(head, cards)
    return section
  })
  if (!sections.length && workouts.length) {
    const empty = document.createElement('p')
    empty.className = 'assessment-empty'
    empty.textContent = 'Nenhuma ficha encontrada com esses filtros.'
    sections.push(empty)
  }
  grid.replaceChildren(...sections)
  document.querySelector('[data-workouts-empty]').hidden = workouts.length > 0
}
const openExerciseFolders = new Set()

// Equipamento em categorias (o campo é texto livre: "Barra e banco", "Polia alta"…).
const EQUIPMENT_KINDS = [
  ['Smith', /smith/u],
  ['Máquina', /maquina|aparelho|cadeira|mesa|leg ?press|hack|voador|peck|graviton|articulad/u],
  ['Polia / cabo', /polia|cabo|cross|corda/u],
  ['Halteres', /halter/u],
  ['Barra', /barra/u],
  ['Kettlebell', /kettle/u],
  ['Elástico', /elastic|faixa|miniband/u],
  ['Peso corporal', /corporal|solo|livre|colchonete|peso do corpo|sem equip/u],
]
function equipmentKinds(exercise) {
  const text = normalizeName(exercise.equipment)
  const kinds = EQUIPMENT_KINDS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  return kinds.length ? kinds : ['Outros']
}

// Em quantas fichas (de alunos e treinos prontos) cada exercício aparece.
function exerciseUsage() {
  const usage = new Map()
  const add = (id) => usage.set(String(id), (usage.get(String(id)) || 0) + 1)
  const idsOf = (item) => {
    try {
      const ids = JSON.parse(item.exerciseIdsJson || 'null')
      if (Array.isArray(ids)) return ids
    } catch {
      /* segue para as prescrições */
    }
    try {
      return JSON.parse(item.exercisePrescriptionsJson || '[]').map((entry) => entry.exerciseId)
    } catch {
      return []
    }
  }
  ;[...(getData().workouts || []), ...(getData().readyPrograms || [])].forEach((item) =>
    new Set(idsOf(item).map(String)).forEach(add),
  )
  return usage
}

function exerciseMediaState(exercise) {
  const hasGif = exerciseGifStatus(exercise) === 'com GIF'
  const hasVideo = Boolean(exercise.videoId && findVideo(exercise.videoId))
  return { hasGif, hasVideo }
}

// Menu "⋯" de cada exercício: Editar, Duplicar e Excluir.
function exerciseMenu(exercise) {
  const menu = document.createElement('details')
  menu.className = 'row-menu'
  const toggle = document.createElement('summary')
  toggle.textContent = '⋯'
  toggle.title = 'Mais ações'
  toggle.setAttribute('aria-label', `Ações de ${exercise.name}`)
  const list = document.createElement('div')
  list.className = 'row-menu-list'
  ;[
    ['edit', 'Editar'],
    ['duplicate-exercise', 'Duplicar'],
    ['delete-exercise', 'Excluir'],
  ].forEach(([action, label]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = action
    button.textContent = label
    if (action === 'delete-exercise') button.className = 'is-danger'
    list.append(button)
  })
  menu.append(toggle, list)
  return menu
}

function renderExerciseFilters(exercises) {
  // Pílulas dos grupos, a partir das pastas reais (filtro escondido é a fonte).
  const select = document.querySelector('[data-exercise-filter]')
  const pills = document.querySelector('[data-exercise-pills]')
  if (select && pills) {
    const countFor = (value) =>
      value === 'all'
        ? exercises.length
        : exercises.filter((e) => {
            const groups = exerciseGroups(e)
            return (
              groups.includes(value) ||
              (value === 'Pernas' && groups.some((name) => legGroups.includes(name)))
            )
          }).length
    pills.replaceChildren(
      ...[...select.options].map((option) => {
        const pill = document.createElement('button')
        pill.type = 'button'
        pill.className = `group-pill${option.value === select.value ? ' is-active' : ''}`
        pill.dataset.group = option.value
        pill.textContent = option.value === 'all' ? 'Todos' : option.textContent
        const count = document.createElement('small')
        count.textContent = countFor(option.value)
        pill.append(count)
        return pill
      }),
    )
  }
  // Equipamentos que existem de verdade na biblioteca.
  const equipment = document.querySelector('[data-exercise-equipment]')
  if (equipment) {
    const current = equipment.value
    const kinds = [...new Set(exercises.flatMap(equipmentKinds))].sort((a, b) =>
      a === 'Outros' ? 1 : b === 'Outros' ? -1 : a.localeCompare(b, 'pt-BR'),
    )
    equipment.replaceChildren(
      Object.assign(document.createElement('option'), {
        value: 'all',
        textContent: 'Todos os equipamentos',
      }),
      ...kinds.map((kind) => Object.assign(document.createElement('option'), { value: kind, textContent: kind })),
    )
    equipment.value = kinds.includes(current) ? current : 'all'
  }
  // Resumo do que falta completar.
  const summary = document.querySelector('[data-exercise-summary]')
  if (summary) {
    const states = exercises.map(exerciseMediaState)
    const withGif = states.filter((state) => state.hasGif).length
    const withVideo = states.filter((state) => state.hasVideo).length
    summary.textContent = exercises.length
      ? `${exercises.length} exercícios · ${withGif} com GIF · ${withVideo} com vídeo`
      : ''
  }
}

function renderExercises() {
  const all = getData().exercises || []
  renderExerciseFilters(all)
  const query = normalizeName(document.querySelector('[data-table-search="exercises"]').value),
    group = document.querySelector('[data-exercise-filter]').value,
    media = document.querySelector('[data-exercise-media]')?.value || 'all',
    equipmentKind = document.querySelector('[data-exercise-equipment]')?.value || 'all',
    sort = document.querySelector('[data-exercise-sort]')?.value || 'az'
  const usage = exerciseUsage()
  const usedIn = (e) => usage.get(String(e.id)) || 0
  const filtered = all.filter((e) => {
    if (query && !normalizeName(e.name).includes(query)) return false
    const state = exerciseMediaState(e)
    if (media === 'no-gif' && state.hasGif) return false
    if (media === 'no-video' && state.hasVideo) return false
    if (media === 'complete' && !(state.hasGif && state.hasVideo)) return false
    if (equipmentKind !== 'all' && !equipmentKinds(e).includes(equipmentKind)) return false
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
  const filtering = Boolean(query) || group !== 'all' || media !== 'all' || equipmentKind !== 'all'
  // Pastas criadas por você aparecem mesmo sem exercício dentro.
  const custom = getData().customGroups || []
  if (!filtering) custom.forEach((item) => folders.set(item.name, []))
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
  const order = (a, b) =>
    sort === 'used'
      ? usedIn(b) - usedIn(a) || a.name.localeCompare(b.name, 'pt-BR')
      : a.name.localeCompare(b.name, 'pt-BR')
  list.replaceChildren(
    ...[...folders.entries()]
      .sort(([a], [b]) => position(a) - position(b) || a.localeCompare(b, 'pt-BR'))
      .map(([name, exercises]) => {
        const folder = document.createElement('details')
        folder.className = 'exercise-folder'
        folder.dataset.group = name
        folder.open = filtering || openExerciseFolders.has(name)
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
          ...[...exercises].sort(order).map((e) => {
            const item = cloneTemplate('exercise-item-template')
            item.dataset.id = e.id
            item.classList.add('exercise-item--row')
            item.title = 'Clique para editar'
            item.querySelector('h3').textContent = e.name
            const info = item.querySelector('p')
            const { hasGif, hasVideo } = exerciseMediaState(e)
            // Dificuldade com cor.
            const level = e.difficulty || 'Intermediário'
            const difficulty = document.createElement('span')
            difficulty.className = `difficulty-badge difficulty-badge--${normalizeName(level)}`
            difficulty.textContent = level
            // "com GIF" em verde e "sem GIF" em vermelho.
            const badge = document.createElement('span')
            badge.className = `gif-status ${hasGif ? 'gif-status--on' : 'gif-status--off'}`
            badge.textContent = hasGif ? 'com GIF' : 'sem GIF'
            // Mesmo esquema para o vídeo MP4. "com MP4" é clicável e abre o vídeo.
            const video = hasVideo ? findVideo(e.videoId) : null
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
            const parts = [difficulty, badge, videoBadge]
            const uses = usedIn(e)
            if (uses) {
              const used = document.createElement('span')
              used.className = 'exercise-usage'
              used.textContent = `em ${uses} ficha${uses === 1 ? '' : 's'}`
              parts.push(used)
            }
            info.replaceChildren(
              ...(e.equipment ? [document.createTextNode(e.equipment)] : []),
              ...parts,
            )
            // Nas outras pastas em que ele também aparece.
            const others = folderNamesFor(e).filter((other) => other !== name)
            const tag = item.querySelector('.tag')
            tag.textContent = others.length ? `também em ${others.join(', ')}` : ''
            tag.classList.toggle('tag--empty', !others.length)
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
            // O lápis e o × soltos dão lugar ao menu "⋯".
            item.querySelector('[data-action="edit"]')?.remove()
            item.append(exerciseMenu(e))
            return item
          }),
        )
        folder.append(summary, body)
        return folder
      }),
  )
  document.querySelector('[data-exercises-empty]').hidden = filtered.length > 0
}

// Abas da página Biblioteca: Exercícios | GIFs | Vídeos MP4. As bibliotecas
// de GIF e de vídeo são criadas por outros módulos; a aba só esconde/mostra.
let libraryTab = 'exercicios'
function paintLibraryTabs() {
  const page = document.querySelector('[data-route="exercicios"]')
  if (!page) return
  page.dataset.libraryTab = libraryTab
  page.querySelectorAll('[data-library-tab]').forEach((tab) => {
    const active = tab.dataset.libraryTab === libraryTab
    tab.classList.toggle('is-active', active)
    tab.setAttribute('aria-selected', String(active))
  })
  const counts = {
    exercicios: (getData().exercises || []).length,
    gifs: (getData().exerciseGifs || []).length,
    videos: (getData().exerciseVideos || []).length,
  }
  page.querySelectorAll('[data-library-count]').forEach((badge) => {
    badge.textContent = counts[badge.dataset.libraryCount] ?? ''
  })
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
    search: normalizeName(document.querySelector('[data-assessment-search]')?.value),
    status: document.querySelector('[data-assessment-status]')?.value || 'all',
    sort: document.querySelector('[data-assessment-sort]')?.value || 'recent',
  }
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
  // Sugestões da busca: alunos com avaliação, em ordem alfabética.
  const chosenKey = fillStudentSelect(
    document.querySelector('[data-assessment-student]'),
    [...groups.values()],
    filters.search,
  )
  const visible = [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.all.filter(
        (a) =>
          (filters.status === 'all' ||
            (filters.status === 'published' ? Boolean(a.publishedAt) : !a.publishedAt)),
      ),
    }))
    .filter(
      (group) =>
        group.items.length &&
        (chosenKey
          ? group.key === chosenKey
          : !filters.search || normalizeName(group.name).includes(filters.search)),
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
    let available = select.closest('[data-form="workout"]')
      ? students.filter((student) => student.planCode !== 'ready')
      : students
    // Evolução: a busca por nome deixa na lista só quem combina.
    if (select.matches('[data-progress-student]')) {
      const search = normalizeName(document.querySelector('[data-progress-search]')?.value)
      if (search) available = available.filter((s) => normalizeName(s.name).includes(search))
    }
    const selected = select.value
    select.replaceChildren(
      ...available.map((s) => {
        const o = document.createElement('option')
        o.value = s.name
        o.dataset.studentId = s.id
        o.textContent = select.closest('[data-form="workout"]')
          ? `${s.name} — ${s.planCode === 'athlete' ? 'Performance Atleta' : s.planCode === 'premium' ? 'Consultoria Premium' : 'Consultoria Básica'}`
          : s.name
        return o
      }),
    )
    if (available.some((s) => s.name === selected)) select.value = selected
    if (!available.length && select.matches('[data-progress-student]'))
      select.append(
        Object.assign(document.createElement('option'), {
          value: '',
          textContent: 'Nenhum aluno encontrado',
          disabled: true,
          selected: true,
        }),
      )
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
    empty.textContent = 'Use “Novo atendimento” ou deixe seus alunos agendarem pelo app (Agenda → Configurar agenda).'
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
      service.textContent = `${today.length ? '' : `${shortDate(start)} · `}${item.service}${item.modality === 'online' ? ' · 💻 Online' : item.location ? ` · ${item.location}` : ''}`
      details.append(name, service)
      const status = document.createElement('span')
      status.className = `status ${item.status === 'completed' ? 'status--success' : current ? 'status--now' : item.status === 'pending' ? 'status--warning' : ''}`
      status.textContent =
        item.status === 'completed'
          ? 'Concluído'
          : current
            ? 'Agora'
            : item.status === 'pending'
              ? 'Confirmar'
              : 'Confirmado'
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
  paintLibraryTabs()
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
  ;['[data-exercise-media]', '[data-exercise-equipment]', '[data-exercise-sort]'].forEach((selector) =>
    document.querySelector(selector)?.addEventListener('change', renderExercises),
  )
  // Pílulas dos grupos: um clique filtra (e clicar de novo volta para Todos).
  document.querySelector('[data-exercise-pills]')?.addEventListener('click', (event) => {
    const pill = event.target.closest('[data-group]')
    if (!pill) return
    const select = document.querySelector('[data-exercise-filter]')
    select.value = select.value === pill.dataset.group ? 'all' : pill.dataset.group
    renderExercises()
  })
  // Abas da biblioteca.
  document.querySelector('[data-library-tabs]')?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-library-tab]')
    if (!tab) return
    libraryTab = tab.dataset.libraryTab
    paintLibraryTabs()
  })
  // Fecha o menu "⋯" aberto ao clicar fora dele.
  document.addEventListener('click', (event) => {
    document.querySelectorAll('.row-menu[open]').forEach((menu) => {
      if (!menu.contains(event.target)) menu.open = false
    })
  })
  document.querySelector('[data-assessment-search]')?.addEventListener('input', renderAssessments)
  document.querySelector('[data-workout-search]')?.addEventListener('input', renderWorkouts)
  ;['[data-assessment-student]', '[data-assessment-status]', '[data-assessment-sort]'].forEach(
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
    const row = event.target.closest('.exercise-item[data-id]')
    if (!row) return
    const exercise = getData().exercises.find((item) => String(item.id) === row.dataset.id)
    if (!exercise) return
    const menu = row.querySelector('.row-menu')
    const action = event.target.closest('[data-action]')?.dataset.action
    // Clique na linha (fora de botões, do menu e da miniatura) abre a edição.
    const onControl = event.target.closest(
      'button, summary, a, .row-menu, .exercise-glyph--clickable',
    )
    if (action === 'edit' || !onControl) {
      if (menu) menu.open = false
      window.dispatchEvent(new CustomEvent('frs:edit-exercise', { detail: row.dataset.id }))
      return
    }
    if (action === 'duplicate-exercise') {
      if (menu) menu.open = false
      const copy = {
        name: `${exercise.name} (cópia)`,
        group: exercise.group,
        equipment: exercise.equipment || '',
        instructions: exercise.instructions || '',
        difficulty: exercise.difficulty || 'Intermediário',
        mediaType: exercise.mediaType || '',
        mediaUrl: exercise.mediaUrl || '',
        animationClip: exercise.animationClip || '',
        gifId: exercise.gifId || '',
        videoId: exercise.videoId || '',
      }
      try {
        await persistRecord('exercises', copy)
        await syncRemoteData()
        showToast(`“${copy.name}” criado. Edite o nome e o que mudar.`)
      } catch (error) {
        showToast(error.message)
      }
      return
    }
    if (action !== 'delete-exercise') return
    if (menu) menu.open = false
    const remove = event.target.closest('[data-action]')
    // Exercício em uso não pode ser excluído (o servidor recusa): avisa antes.
    const uses = exerciseUsage().get(String(exercise.id)) || 0
    if (uses) {
      showToast(
        `“${exercise.name}” está em ${uses} ficha${uses === 1 ? '' : 's'} de treino. Tire ele de lá antes de excluir.`,
      )
      return
    }
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
  document.querySelector('[data-progress-search]')?.addEventListener('input', () => {
    const select = document.querySelector('[data-progress-student]')
    const before = select.value
    renderStudentOptions()
    if (select.value && select.value !== before) select.dispatchEvent(new Event('change'))
  })
  ;['[data-workout-student]', '[data-workout-status]'].forEach((selector) =>
    document.querySelector(selector)?.addEventListener('change', renderWorkouts),
  )
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
