import { getData, updateData } from './state.js'
import { formatDate, initials, showToast } from './utils.js'
import { removeRecord } from './api-client.js'

function cloneTemplate(id) {
  return document.getElementById(id).content.firstElementChild.cloneNode(true)
}

function renderStudents() {
  const { students } = getData()
  const query = document
    .querySelector('[data-table-search="students"]')
    .value.trim()
    .toLocaleLowerCase('pt-BR')
  const statusFilter = document.querySelector('[data-student-filter]').value
  const filtered = students.filter((student) => {
    const matchesQuery = `${student.name} ${student.goal}`
      .toLocaleLowerCase('pt-BR')
      .includes(query)
    return matchesQuery && (statusFilter === 'all' || student.status === statusFilter)
  })
  const table = document.querySelector('[data-students-table]')
  table.replaceChildren(
    ...filtered.map((student) => {
      const row = cloneTemplate('student-row-template')
      row.dataset.id = student.id
      row.querySelector('.avatar').textContent = initials(student.name)
      row.querySelector('.person-cell strong').textContent = student.name
      row.querySelector('.person-cell small').textContent = student.email
      row.querySelector('[data-cell="goal"]').textContent = student.goal
      row.querySelector('[data-cell="date"]').textContent = formatDate(student.assessmentDate)
      const status = row.querySelector('.status')
      status.textContent = student.status
      status.classList.add(student.status === 'Ativo' ? 'status--active' : 'status--paused')
      return row
    }),
  )
  document.querySelector('[data-students-empty]').hidden = filtered.length > 0
}

function renderRecentStudents() {
  const rows = getData()
    .students.slice(0, 4)
    .map((student) => {
      const row = cloneTemplate('recent-row-template')
      row.querySelector('.avatar').textContent = initials(student.name)
      row.querySelector('.person-cell strong').textContent = student.name
      row.querySelector('.person-cell small').textContent = student.email
      row.querySelector('[data-cell="goal"]').textContent = student.goal
      row.querySelector('[data-cell="workout"]').textContent = student.workout || 'Aguardando ficha'
      row.querySelector('[data-cell="activity"]').textContent = student.activity || 'Novo cadastro'
      const status = row.querySelector('.status')
      status.textContent = student.status
      status.classList.add(student.status === 'Ativo' ? 'status--active' : 'status--paused')
      return row
    })
  document.querySelector('[data-recent-students]').replaceChildren(...rows)
}

function renderWorkouts() {
  const { workouts } = getData()
  const cards = workouts.map((workout) => {
    const card = cloneTemplate('workout-card-template')
    card.dataset.id = workout.id
    card.querySelector('h2').textContent = workout.name
    card.querySelector('[data-card="student"]').textContent = workout.student
    card.querySelector('[data-card="goal"]').textContent = workout.goal
    card.querySelector('[data-card="duration"]').textContent = workout.duration
    card.querySelector('.workout-progress strong').textContent = `${workout.progress}%`
    card.querySelector('progress').value = workout.progress
    return card
  })
  document.querySelector('[data-workouts-grid]').replaceChildren(...cards)
  document.querySelector('[data-workouts-empty]').hidden = workouts.length > 0
}

function renderExercises() {
  const query = document
    .querySelector('[data-table-search="exercises"]')
    .value.trim()
    .toLocaleLowerCase('pt-BR')
  const group = document.querySelector('[data-exercise-filter]').value
  const filtered = getData().exercises.filter(
    (exercise) =>
      exercise.name.toLocaleLowerCase('pt-BR').includes(query) &&
      (group === 'all' || exercise.group === group),
  )
  const items = filtered.map((exercise) => {
    const item = cloneTemplate('exercise-item-template')
    item.dataset.id = exercise.id
    item.querySelector('h3').textContent = exercise.name
    item.querySelector('p').textContent =
      `${exercise.equipment} · ${exercise.instructions || 'Sem orientação cadastrada'}`
    item.querySelector('.tag').textContent = exercise.group
    return item
  })
  document.querySelector('[data-exercises-list]').replaceChildren(...items)
  document.querySelector('[data-exercises-empty]').hidden = filtered.length > 0
}

function renderAssessments() {
  const cards = getData().assessments.map((assessment) => {
    const card = cloneTemplate('assessment-card-template')
    card.querySelector('.avatar').textContent = initials(assessment.student)
    card.querySelector('h2').textContent = assessment.student
    card.querySelector('.person-cell p').textContent = 'Avaliação física'
    card.querySelector('[data-value="weight"]').textContent = assessment.weight
    card.querySelector('[data-value="bmi"]').textContent = assessment.bmi || '—'
    card.querySelector('[data-value="fat"]').textContent = assessment.fat
    card.querySelector('[data-value="waist"]').textContent = assessment.waist
    card.querySelector('[data-value="whr"]').textContent = assessment.whr || '—'
    card.querySelector('[data-value="restingHR"]').textContent = assessment.restingHR || '—'
    card.querySelector('[data-value="date"]').textContent = assessment.date
    card.querySelector('[data-value="protocol"]').textContent =
      assessment.protocol || 'Avaliação física'
    return card
  })
  document.querySelector('[data-assessments-grid]').replaceChildren(...cards)
}

function renderStudentOptions() {
  const { students } = getData()
  document.querySelectorAll('[data-student-options], [data-progress-student]').forEach((select) => {
    const selected = select.value
    const options = students.map((student) => {
      const option = document.createElement('option')
      option.value = student.name
      option.textContent = student.name
      return option
    })
    select.replaceChildren(...options)
    if (students.some((student) => student.name === selected)) select.value = selected
  })
}

function renderStats() {
  const data = getData()
  document.querySelector('[data-stat-students]').textContent = data.students.filter(
    (student) => student.status === 'Ativo',
  ).length
  document.querySelector('[data-stat-workouts]').textContent = data.workouts.length
  document.querySelector('[data-student-count]').textContent = data.students.length
}

export function renderAll() {
  renderStudents()
  renderRecentStudents()
  renderWorkouts()
  renderExercises()
  renderAssessments()
  renderStudentOptions()
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
    const button = event.target.closest('[data-action]')
    if (!button) return
    const id = button.closest('tr').dataset.id
    if (button.dataset.action === 'edit')
      window.dispatchEvent(new CustomEvent('frs:edit-student', { detail: id }))
    if (button.dataset.action === 'delete' && window.confirm('Excluir este aluno?')) {
      updateData((data) => {
        data.students = data.students.filter((student) => student.id !== id)
      })
      void removeRecord('students', id).catch(() => {})
      showToast('Aluno excluído com sucesso.')
    }
  })

  document.querySelector('[data-workouts-grid]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]')
    if (!button) return
    const id = button.closest('[data-id]').dataset.id
    if (button.dataset.action === 'edit')
      window.dispatchEvent(new CustomEvent('frs:edit-workout', { detail: id }))
    if (button.dataset.action === 'delete' && window.confirm('Excluir esta ficha de treino?')) {
      updateData((data) => {
        data.workouts = data.workouts.filter((workout) => workout.id !== id)
      })
      void removeRecord('workouts', id).catch(() => {})
      showToast('Ficha excluída com sucesso.')
    }
  })

  document.querySelector('[data-exercises-list]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="edit"]')
    if (button)
      window.dispatchEvent(
        new CustomEvent('frs:edit-exercise', { detail: button.closest('[data-id]').dataset.id }),
      )
  })

  document.querySelector('[data-progress-student]').addEventListener('change', (event) => {
    const student = getData().students.find((item) => item.name === event.target.value)
    if (!student) return
    document.querySelector('[data-progress-name]').textContent = student.name
    document.querySelector('[data-progress-goal]').textContent = student.goal
    document.querySelector('[data-progress-avatar]').textContent = initials(student.name)
  })
}
