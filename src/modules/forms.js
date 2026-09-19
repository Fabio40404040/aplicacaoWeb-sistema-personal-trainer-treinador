import { createId, getData, updateData } from './state.js'
import { showToast } from './utils.js'
import { persistRecord, syncRemoteData } from './api-client.js'

const editing = { student: null, workout: null, exercise: null }
const openModal = (name) => {
  const modal = document.querySelector(`[data-modal="${name}"]`)
  if (!modal.open) modal.showModal()
}
function closeModal(form) {
  form.closest('dialog').close()
  form.reset()
  editing[form.dataset.form] = null
}
const formData = (form) => new FormData(form)
const value = (form, field) => formData(form).get(field)?.toString().trim() || ''
const checked = (form, field) => Boolean(formData(form).get(field))

function saveAndRefresh(collection, record, id) {
  void persistRecord(collection, record, id)
    .then(syncRemoteData)
    .catch((error) => showToast(error.message))
}
function handleStudent(form) {
  const record = {
    name: value(form, 'name'),
    email: value(form, 'email'),
    goal: value(form, 'goal'),
    status: value(form, 'status'),
    assessmentDate: value(form, 'assessmentDate'),
  }
  updateData((d) => {
    const old = d.students.find((s) => s.id === editing.student)
    if (old) Object.assign(old, record)
    else
      d.students.unshift({
        id: createId('s'),
        ...record,
        workout: 'Aguardando ficha',
        activity: 'Novo cadastro',
      })
  })
  showToast(editing.student ? 'Aluno atualizado com sucesso.' : 'Aluno cadastrado com sucesso.')
  saveAndRefresh('students', record, editing.student)
  editing.student = null
}
function handleWorkout(form) {
  const data = formData(form)
  const record = {
    name: value(form, 'name'),
    student: value(form, 'student'),
    goal: value(form, 'goal'),
    duration: value(form, 'duration'),
    exerciseIds: data.getAll('exerciseIds'),
    sets: value(form, 'sets'),
    repetitions: value(form, 'repetitions'),
    restSeconds: value(form, 'restSeconds'),
    published: checked(form, 'published'),
    permanentAccess: false,
  }
  updateData((d) => {
    const old = d.workouts.find((w) => w.id === editing.workout)
    if (old)
      Object.assign(old, record, {
        publishedAt: record.published ? old.publishedAt || new Date().toISOString() : null,
        exerciseCount: record.exerciseIds.length,
      })
    else
      d.workouts.unshift({
        id: createId('w'),
        ...record,
        progress: 0,
        publishedAt: record.published ? new Date().toISOString() : null,
        exerciseCount: record.exerciseIds.length,
      })
  })
  showToast(
    record.published ? 'Ficha salva e publicada para o aluno.' : 'Ficha salva como rascunho.',
  )
  saveAndRefresh('workouts', record, editing.workout)
  editing.workout = null
}
function handleExercise(form) {
  const record = {
    name: value(form, 'name'),
    group: value(form, 'group'),
    equipment: value(form, 'equipment'),
    instructions: value(form, 'instructions'),
    difficulty: value(form, 'difficulty'),
    mediaType: value(form, 'mediaType'),
    mediaUrl: value(form, 'mediaUrl'),
    animationClip: value(form, 'animationClip'),
  }
  updateData((d) => {
    const old = d.exercises.find((e) => e.id === editing.exercise)
    if (old) Object.assign(old, record)
    else d.exercises.unshift({ id: createId('e'), ...record })
  })
  showToast(
    editing.exercise ? 'Exercício atualizado com sucesso.' : 'Exercício adicionado com sucesso.',
  )
  saveAndRefresh('exercises', record, editing.exercise)
  editing.exercise = null
}
function handleAssessment(form) {
  const r = {
    student: value(form, 'student'),
    protocol: value(form, 'protocol'),
    weight: value(form, 'weight'),
    height: value(form, 'height'),
    fat: value(form, 'fat'),
    waist: value(form, 'waist'),
    hip: value(form, 'hip'),
    chest: value(form, 'chest'),
    arm: value(form, 'arm'),
    thigh: value(form, 'thigh'),
    calf: value(form, 'calf'),
    bloodPressure: value(form, 'bloodPressure'),
    restingHR: value(form, 'restingHR'),
    restriction: value(form, 'restriction'),
    parq: value(form, 'parq'),
    pushUps: value(form, 'pushUps'),
    plank: value(form, 'plank'),
    sitAndReach: value(form, 'sitAndReach'),
    notes: value(form, 'notes'),
    published: checked(form, 'published'),
  }
  const h = Number(r.height) / 100,
    hip = Number(r.hip),
    waist = Number(r.waist)
  updateData((d) =>
    d.assessments.unshift({
      id: createId('a'),
      student: r.student,
      date: new Intl.DateTimeFormat('pt-BR').format(new Date()),
      protocol: r.protocol,
      weight: `${r.weight} kg`,
      height: `${r.height} cm`,
      bmi: h ? (Number(r.weight) / h ** 2).toFixed(1) : '',
      fat: `${r.fat}%`,
      waist: `${r.waist} cm`,
      hip: r.hip ? `${r.hip} cm` : '',
      whr: hip ? (waist / hip).toFixed(2) : '',
      restingHR: r.restingHR ? `${r.restingHR} bpm` : '',
      ...r,
      publishedAt: r.published ? new Date().toISOString() : null,
    }),
  )
  saveAndRefresh('assessments', r)
  showToast(r.published ? 'Avaliação salva e publicada.' : 'Avaliação salva como rascunho.')
}
function fillForm(type, id) {
  const collection = type === 'student' ? 'students' : type === 'workout' ? 'workouts' : 'exercises'
  const record = getData()[collection].find((item) => item.id === id)
  if (!record) return
  editing[type] = id
  const form = document.querySelector(`[data-form="${type}"]`)
  Object.entries(record).forEach(([key, val]) => {
    const field = form.elements[key]
    if (!field) return
    if (field instanceof RadioNodeList) {
      ;[...field].forEach((entry) => {
        entry.checked = Array.isArray(val) ? val.includes(entry.value) : entry.value === val
      })
    } else if (field.type === 'checkbox') field.checked = Boolean(val)
    else if (field.multiple) {
      ;[...field.options].forEach((o) => {
        o.selected = (record.exerciseIds || []).includes(o.value)
      })
    } else field.value = val ?? ''
  })
  if (form.elements.published) form.elements.published.checked = Boolean(record.publishedAt)
  openModal(type)
}
export function initForms() {
  document.querySelectorAll('[data-open-modal]').forEach((b) =>
    b.addEventListener('click', () => {
      editing[b.dataset.openModal] = null
      openModal(b.dataset.openModal)
    }),
  )
  const handlers = {
    student: handleStudent,
    workout: handleWorkout,
    exercise: handleExercise,
    assessment: handleAssessment,
  }
  document
    .querySelectorAll('[data-close-modal]')
    .forEach((b) => b.addEventListener('click', () => closeModal(b.closest('form'))))
  document.querySelectorAll('dialog[data-modal]').forEach((m) =>
    m.addEventListener('cancel', (e) => {
      e.preventDefault()
      closeModal(m.querySelector('form'))
    }),
  )
  document.querySelectorAll('[data-form]').forEach((form) =>
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      if (!form.reportValidity()) return
      handlers[form.dataset.form](form)
      closeModal(form)
    }),
  )
  window.addEventListener('frs:edit-student', (e) => fillForm('student', e.detail))
  window.addEventListener('frs:edit-workout', (e) => fillForm('workout', e.detail))
  window.addEventListener('frs:edit-exercise', (e) => fillForm('exercise', e.detail))
}
