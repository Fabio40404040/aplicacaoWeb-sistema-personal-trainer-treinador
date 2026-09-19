import { getData, updateData } from './state.js'
import { formatDate, initials, showToast } from './utils.js'
import { removeRecord } from './api-client.js'

const cloneTemplate = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true)
const billingCycleLabels = {
  monthly: 'mensal',
  quarterly: 'trimestral',
  semiannual: 'semestral',
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
      const manage = document.createElement('button')
      manage.className = 'icon-button'
      manage.type = 'button'
      manage.dataset.action = 'access'
      manage.title = 'Plano, pagamento e acesso'
      manage.setAttribute('aria-label', 'Gerenciar plano e acesso')
      manage.textContent = '✓'
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
      row.querySelector('.avatar').textContent = initials(s.name)
      row.querySelector('.person-cell strong').textContent = s.name
      row.querySelector('.person-cell small').textContent = `${s.email} · ${planSummary(s)}`
      row.querySelector('[data-cell="goal"]').textContent = s.goal
      row.querySelector('[data-cell="workout"]').textContent = s.workout || 'Aguardando ficha'
      row.querySelector('[data-cell="activity"]').textContent = s.activity || 'Novo cadastro'
      const status = row.querySelector('.status')
      status.textContent = accessLabel(s)
      status.classList.add(s.accessStatus === 'active' ? 'status--active' : 'status--paused')
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
      return card
    }),
  )
  document.querySelector('[data-workouts-empty]').hidden = workouts.length > 0
}
function renderExercises() {
  const query = document
      .querySelector('[data-table-search="exercises"]')
      .value.trim()
      .toLocaleLowerCase('pt-BR'),
    group = document.querySelector('[data-exercise-filter]').value
  const filtered = getData().exercises.filter(
    (e) =>
      e.name.toLocaleLowerCase('pt-BR').includes(query) && (group === 'all' || e.group === group),
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
    const selected = select.value
    select.replaceChildren(
      ...students.map((s) => {
        const o = document.createElement('option')
        o.value = s.name
        o.textContent = s.name
        return o
      }),
    )
    if (students.some((s) => s.name === selected)) select.value = selected
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
  document.querySelector('[data-stat-students]').textContent = d.students.filter((s) =>
    s.accessStatus ? s.accessStatus === 'active' : s.status === 'Ativo',
  ).length
  document.querySelector('[data-stat-workouts]').textContent = d.workouts.length
  document.querySelector('[data-student-count]').textContent = d.students.length
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
  document.querySelector('[data-students-table]').addEventListener('click', (event) => {
    const b = event.target.closest('[data-action]')
    if (!b) return
    const id = b.closest('tr').dataset.id
    if (b.dataset.action === 'edit')
      window.dispatchEvent(new CustomEvent('frs:edit-student', { detail: id }))
    if (b.dataset.action === 'access')
      window.dispatchEvent(new CustomEvent('frs:manage-access', { detail: id }))
    if (b.dataset.action === 'delete' && window.confirm('Excluir este aluno?')) {
      updateData((d) => {
        d.students = d.students.filter((s) => s.id !== id)
      })
      void removeRecord('students', id).catch(() => {})
      showToast('Aluno excluído com sucesso.')
    }
  })
  document.querySelector('[data-workouts-grid]').addEventListener('click', (event) => {
    const b = event.target.closest('[data-action]')
    if (!b) return
    const id = b.closest('[data-id]').dataset.id
    if (b.dataset.action === 'edit')
      window.dispatchEvent(new CustomEvent('frs:edit-workout', { detail: id }))
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
        new CustomEvent('frs:edit-exercise', { detail: b.closest('[data-id]').dataset.id }),
      )
  })
  document.querySelector('[data-progress-student]').addEventListener('change', (event) => {
    const s = getData().students.find((i) => i.name === event.target.value)
    if (!s) return
    document.querySelector('[data-progress-name]').textContent = s.name
    document.querySelector('[data-progress-goal]').textContent = s.goal
    document.querySelector('[data-progress-avatar]').textContent = initials(s.name)
  })
}
