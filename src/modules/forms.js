import { createId, getData, updateData } from './state.js'
import { showToast } from './utils.js'
import { persistRecord, syncRemoteData } from './api-client.js'

const editing = { student: null, workout: null, exercise: null }

function openModal(name) {
  const modal = document.querySelector(`[data-modal="${name}"]`)
  if (!modal.open) modal.showModal()
}

function closeModal(form) {
  form.closest('dialog').close()
  form.reset()
  editing[form.dataset.form] = null
}

function value(form, field) {
  return new FormData(form).get(field).toString().trim()
}

function optionalValue(form, field) {
  return new FormData(form).get(field)?.toString().trim() || ''
}

function handleStudent(form) {
  const record = {
    name: value(form, 'name'),
    email: value(form, 'email'),
    goal: value(form, 'goal'),
    status: value(form, 'status'),
    assessmentDate: value(form, 'assessmentDate'),
  }
  updateData((data) => {
    const existing = data.students.find((student) => student.id === editing.student)
    if (existing) Object.assign(existing, record)
    else
      data.students.unshift({
        id: createId('s'),
        ...record,
        workout: 'Aguardando ficha',
        activity: 'Novo cadastro',
      })
  })
  showToast(editing.student ? 'Aluno atualizado com sucesso.' : 'Aluno cadastrado com sucesso.')
  void persistRecord('students', record, editing.student)
    .then(syncRemoteData)
    .catch(() => {})
  editing.student = null
}

function handleWorkout(form) {
  const record = {
    name: value(form, 'name'),
    student: value(form, 'student'),
    goal: value(form, 'goal'),
    duration: value(form, 'duration'),
  }
  updateData((data) => {
    const existing = data.workouts.find((workout) => workout.id === editing.workout)
    if (existing) Object.assign(existing, record)
    else data.workouts.unshift({ id: createId('w'), ...record, progress: 0 })
  })
  showToast(editing.workout ? 'Ficha atualizada com sucesso.' : 'Ficha criada com sucesso.')
  void persistRecord('workouts', record, editing.workout)
    .then(syncRemoteData)
    .catch(() => {})
  editing.workout = null
}

function handleExercise(form) {
  const record = {
    name: value(form, 'name'),
    group: value(form, 'group'),
    equipment: value(form, 'equipment'),
    instructions: value(form, 'instructions'),
  }
  updateData((data) => {
    const existing = data.exercises.find((exercise) => exercise.id === editing.exercise)
    if (existing) Object.assign(existing, record)
    else data.exercises.unshift({ id: createId('e'), ...record })
  })
  showToast(
    editing.exercise ? 'Exercício atualizado com sucesso.' : 'Exercício adicionado com sucesso.',
  )
  void persistRecord('exercises', record, editing.exercise)
    .then(syncRemoteData)
    .catch(() => {})
  editing.exercise = null
}

function handleAssessment(form) {
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const record = {
    student: value(form, 'student'),
    protocol: value(form, 'protocol'),
    weight: value(form, 'weight'),
    height: value(form, 'height'),
    fat: value(form, 'fat'),
    waist: value(form, 'waist'),
    hip: optionalValue(form, 'hip'),
    chest: optionalValue(form, 'chest'),
    arm: optionalValue(form, 'arm'),
    thigh: optionalValue(form, 'thigh'),
    calf: optionalValue(form, 'calf'),
    bloodPressure: optionalValue(form, 'bloodPressure'),
    restingHR: optionalValue(form, 'restingHR'),
    restriction: optionalValue(form, 'restriction'),
    parq: optionalValue(form, 'parq'),
    pushUps: optionalValue(form, 'pushUps'),
    plank: optionalValue(form, 'plank'),
    sitAndReach: optionalValue(form, 'sitAndReach'),
    notes: value(form, 'notes'),
  }
  const weight = Number(record.weight)
  const heightMeters = Number(record.height) / 100
  const hip = Number(record.hip)
  const waist = Number(record.waist)
  updateData((data) =>
    data.assessments.unshift({
      id: createId('a'),
      student: record.student,
      date: formatter.format(new Date()).replace('.', ''),
      protocol: record.protocol,
      weight: `${record.weight.replace('.', ',')} kg`,
      height: `${record.height.replace('.', ',')} cm`,
      bmi: heightMeters ? (weight / heightMeters ** 2).toFixed(1).replace('.', ',') : '',
      fat: `${record.fat.replace('.', ',')}%`,
      waist: `${record.waist.replace('.', ',')} cm`,
      hip: record.hip ? `${record.hip.replace('.', ',')} cm` : '',
      whr: hip ? (waist / hip).toFixed(2).replace('.', ',') : '',
      chest: record.chest,
      arm: record.arm,
      thigh: record.thigh,
      calf: record.calf,
      bloodPressure: record.bloodPressure,
      restingHR: record.restingHR ? `${record.restingHR} bpm` : '',
      restriction: record.restriction,
      parq: record.parq,
      pushUps: record.pushUps,
      plank: record.plank,
      sitAndReach: record.sitAndReach,
      notes: record.notes,
    }),
  )
  void persistRecord('assessments', record)
    .then(syncRemoteData)
    .catch(() => {})
  showToast('Avaliação registrada com sucesso.')
}

function fillForm(type, id) {
  const collection = type === 'student' ? 'students' : type === 'workout' ? 'workouts' : 'exercises'
  const record = getData()[collection].find((item) => item.id === id)
  if (!record) return
  editing[type] = id
  const form = document.querySelector(`[data-form="${type}"]`)
  Object.entries(record).forEach(([key, fieldValue]) => {
    if (form.elements[key]) form.elements[key].value = fieldValue
  })
  openModal(type)
}

export function initForms() {
  document.querySelectorAll('[data-open-modal]').forEach((button) =>
    button.addEventListener('click', () => {
      editing[button.dataset.openModal] = null
      openModal(button.dataset.openModal)
    }),
  )

  const handlers = {
    student: handleStudent,
    workout: handleWorkout,
    exercise: handleExercise,
    assessment: handleAssessment,
  }
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.closest('form')))
  })
  document.querySelectorAll('dialog[data-modal]').forEach((modal) => {
    modal.addEventListener('cancel', (event) => {
      event.preventDefault()
      closeModal(modal.querySelector('form'))
    })
  })
  document.querySelectorAll('[data-form]').forEach((form) =>
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (!form.reportValidity()) return
      handlers[form.dataset.form](form)
      closeModal(form)
    }),
  )

  window.addEventListener('frs:edit-student', (event) => fillForm('student', event.detail))
  window.addEventListener('frs:edit-workout', (event) => fillForm('workout', event.detail))
  window.addEventListener('frs:edit-exercise', (event) => fillForm('exercise', event.detail))
}
