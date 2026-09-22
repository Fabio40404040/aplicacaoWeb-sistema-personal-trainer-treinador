import { getData, updateData } from './state.js'
import { formatDate, initials, showToast } from './utils.js'
import { removeRecord } from './api-client.js'
import { downloadWorkoutPdf } from './workout-pdf.js'

const cloneTemplate = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true)
const billingCycleLabels = {
  monthly: 'mensal',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  annual: 'anual',
  permanent: 'permanente',
}
const planSummary = (student) =>
  `${student.planCode || 'sem plano'} · ${billingCycleLabels[student.billingCycle] || 'período não definido'}`
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
      row.querySelector('.avatar').textContent = initials(student.name)
      row.querySelector('.person-cell strong').textContent = student.name
      row.querySelector('.person-cell small').textContent =
        `${student.email} · ${planSummary(student)}`
      row.querySelector('[data-cell="goal"]').textContent = student.goal
      row.querySelector('[data-cell="date"]').textContent = formatDate(student.assessmentDate)
      const status = row.querySelector('.status')
      status.textContent = accessLabel(student)
      status.classList.add(
        student.accessStatus === 'active' && student.paymentStatus === 'paid'
          ? 'status--active'
          : 'status--paused',
      )
      const isPresentialPending =
        !student.accountId &&
        (student.accessStatus !== 'active' || student.paymentStatus !== 'paid')
      const manage = document.createElement('button')
      manage.className = isPresentialPending
        ? 'button button--primary student-release-button'
        : 'icon-button'
      manage.type = 'button'
      manage.dataset.action = 'access'
      manage.title = isPresentialPending
        ? 'Confirmar pagamento presencial e liberar acesso'
        : 'Plano, pagamento e acesso'
      manage.setAttribute(
        'aria-label',
        isPresentialPending
          ? `Liberar aluno presencial ${student.name}`
          : 'Gerenciar plano e acesso',
      )
      manage.textContent = isPresentialPending ? 'Liberar presencial' : '✓'
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
      row.querySelector('.avatar').textContent = initials(s.name)
      row.querySelector('.person-cell strong').textContent = s.name
      row.querySelector('.person-cell small').textContent = `${s.email} · ${planSummary(s)}`
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
function renderExercises() {
  const legGroups = ['Glúteos', 'Quadríceps', 'Posteriores de coxa', 'Panturrilhas']
  const query = document
      .querySelector('[data-table-search="exercises"]')
      .value.trim()
      .toLocaleLowerCase('pt-BR'),
    group = document.querySelector('[data-exercise-filter]').value
  const filtered = getData().exercises.filter(
    (e) =>
      e.name.toLocaleLowerCase('pt-BR').includes(query) &&
      (group === 'all' || e.group === group || (group === 'Pernas' && legGroups.includes(e.group))),
  )
  document.querySelector('[data-exercises-list]').replaceChildren(
    ...filtered.map((e) => {
      const item = cloneTemplate('exercise-item-template')
      item.dataset.id = e.id
      item.querySelector('h3').textContent = e.name
      item.querySelector('p').textContent =
        `${e.equipment} · ${e.difficulty || 'Intermediário'} · ${e.mediaUrl ? 'mídia cadastrada' : 'sem mídia'}`
      item.querySelector('.tag').textContent = e.group
      return item
    }),
  )
  document.querySelector('[data-exercises-empty]').hidden = filtered.length > 0
}
function renderAssessments() {
  document.querySelector('[data-assessments-grid]').replaceChildren(
    ...getData().assessments.map((a) => {
      const card = cloneTemplate('assessment-card-template')
      card.querySelector('.avatar').textContent = initials(a.student)
      card.querySelector('h2').textContent = a.student
      card.querySelector('.person-cell p').textContent = a.publishedAt
        ? 'Publicada para o aluno'
        : 'Rascunho do personal'
      card.querySelector('[data-value="weight"]').textContent = a.weight
      card.querySelector('[data-value="bmi"]').textContent = a.bmi || '—'
      card.querySelector('[data-value="fat"]').textContent = a.fat
      card.querySelector('[data-value="waist"]').textContent = a.waist
      card.querySelector('[data-value="whr"]').textContent = a.whr || '—'
      card.querySelector('[data-value="restingHR"]').textContent = a.restingHR || '—'
      card.querySelector('[data-value="date"]').textContent = a.date
      card.querySelector('[data-value="protocol"]').textContent = a.protocol || 'Avaliação física'
      return card
    }),
  )
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
    `${hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}, Fabio.`
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

function renderSchedule() {
  const now = new Date()
  const allUpcoming = (getData().appointments || [])
    .filter(
      (item) =>
        item.status !== 'cancelled' &&
        new Date(item.endsAt).getTime() >=
          new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
    )
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  const today = allUpcoming.filter((item) => sameLocalDay(new Date(item.startsAt), now))
  const appointments = (today.length ? today : allUpcoming).slice(0, 6)
  const list = document.querySelector('[data-schedule-list]')
  document.querySelector('[data-schedule-title]').textContent = today.length
    ? 'Agenda de hoje'
    : 'Próximos atendimentos'
  document.querySelector('[data-schedule-summary]').textContent = today.length
    ? `${today.length} atendimento${today.length === 1 ? '' : 's'} programado${today.length === 1 ? '' : 's'}`
    : allUpcoming.length
      ? `${allUpcoming.length} atendimento${allUpcoming.length === 1 ? '' : 's'} futuro${allUpcoming.length === 1 ? '' : 's'}`
      : 'Nenhum atendimento programado'
  if (!appointments.length) {
    const empty = document.createElement('p')
    empty.className = 'schedule-empty'
    empty.textContent = 'Use “Novo atendimento” para organizar sua agenda presencial.'
    list.replaceChildren(empty)
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
      avatar.textContent = initials(item.student)
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
  document.querySelector('[data-progress-avatar]').textContent = initials(student.name)
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
  document.querySelector('[data-workouts-grid]').addEventListener('click', (event) => {
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
      downloadWorkoutPdf(
        { ...workout, exercises: workout.exercisePrescriptions },
        workout.student || 'Aluno',
      )
    }
    if (b.dataset.action === 'delete' && window.confirm('Excluir esta ficha de treino?')) {
      updateData((d) => {
        d.workouts = d.workouts.filter((w) => w.id !== id)
      })
      void removeRecord('workouts', id).catch(() => {})
      showToast('Ficha excluída com sucesso.')
    }
  })
  document.querySelector('[data-exercises-list]').addEventListener('click', (event) => {
    const b = event.target.closest('[data-action="edit"]')
    if (b)
      window.dispatchEvent(
        new CustomEvent('frs:edit-exercise', {
          detail: b.closest('[data-id]').dataset.id,
        }),
      )
  })
  document.querySelector('[data-progress-student]').addEventListener('change', (event) => {
    const s = getData().students.find((i) => i.name === event.target.value)
    if (!s) return
    document.querySelector('[data-progress-name]').textContent = s.name
    document.querySelector('[data-progress-goal]').textContent = s.goal
    document.querySelector('[data-progress-avatar]').textContent = initials(s.name)
    renderProgress()
  })
  document.querySelector('[data-schedule-list]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-appointment-action]')
    if (!button) return
    const id = button.closest('[data-id]').dataset.id
    if (button.dataset.appointmentAction === 'edit')
      window.dispatchEvent(new CustomEvent('frs:edit-appointment', { detail: id }))
    if (
      button.dataset.appointmentAction === 'delete' &&
      window.confirm('Excluir este atendimento da agenda?')
    ) {
      updateData((data) => {
        data.appointments = (data.appointments || []).filter((item) => item.id !== id)
      })
      void removeRecord('appointments', id).catch((error) => showToast(error.message))
      showToast('Atendimento removido da agenda.')
    }
  })
}
