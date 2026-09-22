import {
  deleteExerciseVideo,
  loadExerciseVideo,
  persistReadyProgram,
  removeReadyProgram,
  updateStudentAccess,
  uploadExerciseVideo,
} from './api-client.js'
import { downloadWorkoutPdf } from './workout-pdf.js'
import { getData } from './state.js'
import { exerciseCatalog } from '../data/exercises.js'
import { exerciseVideoLibrary, muscleGroups } from '../data/library.js'
import { showToast } from './utils.js'
import { createWhatsappUrl, planNames } from './whatsapp.js'

const billingCycleLabels = {
  monthly: 'mensal',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  annual: 'anual',
  permanent: 'permanente',
}
const consultingPrices = { basic: 4, premium: 6, athlete: 8 }
const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})
const mediaExerciseCatalog = [
  ...exerciseCatalog,
  ...exerciseVideoLibrary.map((item) => ({
    ...item,
    mediaType: 'video',
    mediaUrl: item.videoUrl,
    animationClip: '',
  })),
]
const legMuscleGroups = ['Pernas', 'Glúteos', 'Quadríceps', 'Posteriores de coxa', 'Panturrilhas']

function workoutCatalogGroups(exercises) {
  const knownGroups = new Set([...muscleGroups.map((group) => group.name), 'Pernas'])
  const groups = muscleGroups
    .filter((group) => !legMuscleGroups.includes(group.name))
    .map((group) => ({ ...group, memberNames: [group.name] }))
  const abdomenIndex = groups.findIndex((group) => group.name === 'Abdômen')
  groups.splice(abdomenIndex + 1, 0, {
    id: 'pernas',
    name: 'Pernas',
    memberNames: legMuscleGroups,
  })
  exercises
    .filter((exercise) => !knownGroups.has(exercise.group))
    .forEach((exercise) => {
      if (groups.some((group) => group.name === exercise.group)) return
      groups.push({
        id: exercise.group,
        name: exercise.group,
        memberNames: [exercise.group],
      })
    })
  return groups
}

function field(label, html) {
  const wrapper = document.createElement('label')
  wrapper.className = 'field'
  wrapper.innerHTML = `<span>${label}</span>${html}`
  return wrapper
}

function enhanceRegistration() {
  const form = document.querySelector('[data-student-form="register"]')
  if (!form || form.elements.planCode) return
  const password = form.querySelector('input[name="password"]')?.closest('label')
  const plan = field(
    'Plano desejado',
    `<select name="planCode"><option value="ready">Treinos Prontos — R$ 2,00 — acesso permanente</option><option value="basic" selected>Consultoria Básica</option><option value="premium">Consultoria Premium</option><option value="athlete">Performance Atleta</option></select>`,
  )
  const billingCycle = field(
    'Período da consultoria',
    `<select name="billingCycle"><option value="monthly">Mensal — sem desconto</option><option value="quarterly" selected>Trimestral — recomendado, 5% de desconto</option><option value="semiannual">Semestral — 10% de desconto</option><option value="annual">Anual — melhor valor, 15% de desconto</option></select>`,
  )
  const channel = field('Forma de pagamento', '<select name="paymentChannel"></select>')
  const paymentTitle = document.createElement('span')
  paymentTitle.className = 'registration-payment-title'
  paymentTitle.textContent = 'Etapas da contratação'
  const paymentArea = document.createElement('section')
  paymentArea.className = 'registration-payment'
  paymentArea.dataset.registrationPayment = ''
  const insertionPoint =
    form.querySelector('#student-password-requirements')?.nextElementSibling ||
    password.nextElementSibling
  form.insertBefore(plan, insertionPoint)
  form.insertBefore(billingCycle, insertionPoint)
  form.insertBefore(channel, insertionPoint)
  form.insertBefore(paymentTitle, insertionPoint)
  form.insertBefore(paymentArea, insertionPoint)

  paymentArea.innerHTML = `<div class="pix-payment-content"><p><strong>1.</strong> Crie o pré-cadastro com seus dados e o plano escolhido.</p><p><strong>2.</strong> Na próxima tela, escolha PIX ou cartão de crédito.</p><p><strong>3.</strong> O acesso aos treinos será liberado somente após a aprovação do pagamento.</p></div>`

  function updateContractOptions() {
    const select = channel.querySelector('select')
    const selectedPlan = plan.querySelector('select').value
    select.innerHTML = '<option value="webapp">Pagamento online após o pré-cadastro</option>'
    channel.hidden = true
    paymentTitle.hidden = false
    form.querySelector('[type="submit"]').textContent = 'Criar pré-cadastro'
    if (selectedPlan === 'ready') {
      billingCycle.hidden = true
      billingCycle.querySelector('select').value = 'permanent'
    } else {
      const monthlyPrice = consultingPrices[selectedPlan]
      const billingSelect = billingCycle.querySelector('select')
      billingSelect.options[0].textContent = `Mensal — ${money.format(monthlyPrice)}, sem desconto`
      billingSelect.options[1].textContent = `Trimestral — ${money.format(monthlyPrice * 3 * 0.95)}, recomendado (5% off)`
      billingSelect.options[2].textContent = `Semestral — ${money.format(monthlyPrice * 6 * 0.9)} (10% off)`
      billingSelect.options[3].textContent = `Anual — ${money.format(monthlyPrice * 12 * 0.85)} (15% off)`
      billingCycle.hidden = false
      if (billingCycle.querySelector('select').value === 'permanent')
        billingCycle.querySelector('select').value = 'quarterly'
    }
  }
  plan.querySelector('select').addEventListener('change', updateContractOptions)
  const requestedPlan = new URLSearchParams(location.hash.split('?')[1] || '').get('plan')
  if ([...plan.querySelector('select').options].some((option) => option.value === requestedPlan))
    plan.querySelector('select').value = requestedPlan
  updateContractOptions()
}

function createAppointmentDialog() {
  if (document.querySelector('[data-modal="appointment"]')) return
  const dialog = document.createElement('dialog')
  dialog.className = 'modal'
  dialog.dataset.modal = 'appointment'
  const today = new Date().toISOString().slice(0, 10)
  dialog.innerHTML = `<form method="dialog" data-form="appointment"><header><div><span class="eyebrow eyebrow--blue">Agenda presencial</span><h2>Novo atendimento</h2></div><button class="icon-button" type="button" data-close-modal aria-label="Fechar">×</button></header><div class="modal-body"><label class="field"><span>Aluno</span><select name="student" data-student-options required></select></label><div class="field-grid"><label class="field"><span>Data</span><input name="date" type="date" value="${today}" required></label><label class="field"><span>Horário</span><input name="time" type="time" required></label></div><div class="field-grid"><label class="field"><span>Duração</span><select name="duration"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60" selected>1 hora</option><option value="90">1h30</option></select></label><label class="field"><span>Situação</span><select name="status"><option value="scheduled">Agendado</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></label></div><label class="field"><span>Atendimento</span><select name="service"><option>Avaliação física</option><option>Treino presencial</option><option>Reavaliação física</option><option>Orientação técnica</option></select></label><label class="field"><span>Local</span><input name="location" placeholder="Academia ou endereço"></label><label class="field"><span>Observações</span><textarea name="notes" rows="3"></textarea></label><p role="status"></p></div><footer><button class="button button--secondary" type="button" data-close-modal>Cancelar</button><button class="button button--primary" type="submit">Salvar atendimento</button></footer></form>`
  document.body.append(dialog)
}

const workoutSessionLetters = ['A', 'B', 'C', 'D', 'E', 'F']

function workoutSessionLabels(form) {
  return workoutSessionLetters.slice(0, form.workoutSessionCount || 1)
}

function renderWorkoutSessionTabs(form) {
  const tabs = form.querySelector('[data-workout-session-tabs]')
  const labels = workoutSessionLabels(form)
  tabs.replaceChildren(
    ...labels.map((label) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ready-session-tab'
      button.textContent = `Treino ${label}`
      button.classList.toggle('is-active', label === form.workoutActiveSession)
      button.addEventListener('click', () => {
        form.workoutActiveSession = label
        renderWorkoutWizard(form)
      })
      return button
    }),
  )
}

function renderWorkoutExerciseCatalog(form) {
  const catalog = form.querySelector('[data-workout-exercise-catalog]')
  const exercises = getData().exercises || []
  const groups = workoutCatalogGroups(exercises)
  catalog.replaceChildren(
    ...groups.map((group) => {
      const items = exercises
        .filter((exercise) => group.memberNames.includes(exercise.group))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      const details = document.createElement('details')
      details.className = 'ready-exercise-group'
      const selectedCount = items.filter(
        (exercise) =>
          form.workoutPrescriptionMap.get(String(exercise.id))?.sessionLabel ===
          form.workoutActiveSession,
      ).length
      details.innerHTML = `<summary><strong></strong><span></span></summary><div class="ready-exercise-options"></div>`
      details.querySelector('summary strong').textContent = group.name
      details.querySelector('summary span').textContent =
        `${items.length} exercícios${selectedCount ? ` · ${selectedCount} selecionado${selectedCount === 1 ? '' : 's'}` : ''}`
      const options = details.querySelector('.ready-exercise-options')
      if (!items.length) options.textContent = 'Nenhum exercício cadastrado neste grupo.'
      items.forEach((exercise) => {
        const exerciseId = String(exercise.id)
        const assignment = form.workoutPrescriptionMap.get(exerciseId)
        const label = document.createElement('label')
        label.className = 'ready-exercise-option'
        label.innerHTML = `<input type="checkbox"><span><strong></strong><small></small></span>`
        const checkbox = label.querySelector('input')
        checkbox.checked = assignment?.sessionLabel === form.workoutActiveSession
        label.querySelector('strong').textContent = exercise.name
        label.querySelector('small').textContent = assignment
          ? assignment.sessionLabel === form.workoutActiveSession
            ? `${exercise.equipment || 'Sem equipamento'} · neste treino`
            : `${exercise.equipment || 'Sem equipamento'} · usado no Treino ${assignment.sessionLabel}`
          : exercise.equipment || 'Sem equipamento'
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            form.workoutPrescriptionMap.set(exerciseId, {
              ...(assignment || {}),
              exerciseId,
              sessionLabel: form.workoutActiveSession,
              sets: assignment?.sets || '3',
              repetitions: assignment?.repetitions || '10-12',
              restSeconds: assignment?.restSeconds ?? '60',
              notes: assignment?.notes || '',
              position: assignment?.position || form.workoutPrescriptionMap.size + 1,
            })
          } else if (assignment?.sessionLabel === form.workoutActiveSession) {
            form.workoutPrescriptionMap.delete(exerciseId)
          }
          renderWorkoutWizard(form)
          const reopened = [...catalog.querySelectorAll('details')].find(
            (item) => item.querySelector('summary strong')?.textContent === group.name,
          )
          if (reopened) reopened.open = true
        })
        options.append(label)
      })
      return details
    }),
  )
}

function renderWorkoutPrescriptionBuilder(form) {
  const builder = form.querySelector('[data-workout-prescriptions]')
  if (!builder) return
  const selected = [...form.workoutPrescriptionMap.values()]
    .filter((item) => item.sessionLabel === form.workoutActiveSession)
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
  builder.replaceChildren()
  if (!selected.length) {
    const empty = document.createElement('p')
    empty.className = 'workout-builder-empty'
    empty.textContent = `Abra uma pasta muscular e escolha os exercícios do Treino ${form.workoutActiveSession}.`
    builder.append(empty)
    return
  }
  selected.forEach((current, index) => {
    const exercise = getData().exercises.find(
      (item) => String(item.id) === String(current.exerciseId),
    )
    const row = document.createElement('section')
    row.className = 'workout-prescription-row'
    row.dataset.workoutPrescription = ''
    row.dataset.exerciseId = current.exerciseId
    row.innerHTML = `<header><span></span><strong></strong><button class="remove-exercise-button" type="button" aria-label="Remover exercício">Remover</button></header><input name="prescriptionSession" type="hidden"><div class="field-grid field-grid--three"><label class="field"><span>Séries</span><input name="prescriptionSets" type="number" min="1" max="20" required></label><label class="field"><span>Repetições ou tempo</span><input name="prescriptionRepetitions" maxlength="40" required></label><label class="field"><span>Intervalo (segundos)</span><input name="prescriptionRestSeconds" type="number" min="0" max="1800" required></label></div><label class="field"><span>Observação individual</span><input name="prescriptionNotes" maxlength="500" placeholder="Ex.: cadência controlada, última série até a falha"></label>`
    row.querySelector('header span').textContent = String(index + 1).padStart(2, '0')
    row.querySelector('header strong').textContent =
      `${exercise?.name || 'Exercício'} · ${exercise?.group || 'Grupo muscular'}`
    row.querySelector('[name="prescriptionSession"]').value = current.sessionLabel
    row.querySelector('[name="prescriptionSets"]').value = current.sets || 3
    row.querySelector('[name="prescriptionRepetitions"]').value = current.repetitions || '10-12'
    row.querySelector('[name="prescriptionRestSeconds"]').value = current.restSeconds ?? 60
    row.querySelector('[name="prescriptionNotes"]').value = current.notes || ''
    row.querySelectorAll('input').forEach((input) => {
      input.addEventListener('input', () => {
        Object.assign(current, {
          sets: row.querySelector('[name="prescriptionSets"]').value,
          repetitions: row.querySelector('[name="prescriptionRepetitions"]').value,
          restSeconds: row.querySelector('[name="prescriptionRestSeconds"]').value,
          notes: row.querySelector('[name="prescriptionNotes"]').value,
        })
      })
    })
    row.querySelector('.remove-exercise-button').addEventListener('click', () => {
      form.workoutPrescriptionMap.delete(String(current.exerciseId))
      renderWorkoutWizard(form)
    })
    builder.append(row)
  })
}

function renderWorkoutWizard(form) {
  renderWorkoutSessionTabs(form)
  renderWorkoutExerciseCatalog(form)
  renderWorkoutPrescriptionBuilder(form)
  form.querySelector('[data-workout-current-title]').textContent =
    `Montando Treino ${form.workoutActiveSession}`
  const add = form.querySelector('[data-workout-add-session]')
  const next = workoutSessionLetters[form.workoutSessionCount || 1]
  add.hidden = !next
  if (next) add.textContent = `+ Adicionar Treino ${next} / grupo muscular`
}

function resetWorkoutWizard(form, saved = []) {
  form.workoutPrescriptionMap = new Map(
    saved.map((item, index) => [
      String(item.exerciseId),
      {
        ...item,
        exerciseId: String(item.exerciseId),
        sessionLabel: item.sessionLabel || 'A',
        position: item.position || index + 1,
      },
    ]),
  )
  const highestSession = saved.reduce(
    (highest, item) =>
      Math.max(highest, workoutSessionLetters.indexOf(item.sessionLabel || 'A') + 1),
    1,
  )
  form.workoutSessionCount = highestSession
  form.workoutActiveSession = 'A'
  renderWorkoutWizard(form)
}

function enhanceWorkout() {
  const body = document.querySelector('[data-form="workout"] .modal-body')
  if (!body || body.querySelector('[data-workout-wizard]')) return
  body.closest('dialog').classList.add('modal--wide')
  const wizard = document.createElement('section')
  wizard.className = 'ready-workout-wizard'
  wizard.dataset.workoutWizard = ''
  wizard.innerHTML = `<div class="ready-session-tabs" data-workout-session-tabs></div><div class="ready-wizard-heading"><div><span class="eyebrow eyebrow--blue">Etapa atual</span><h3 data-workout-current-title></h3></div><p>Abra Peitoral, Costas, Ombros ou outro grupo e marque os exercícios deste treino.</p></div><div class="ready-exercise-catalog" data-workout-exercise-catalog></div><button class="button button--secondary workout-add-session" type="button" data-workout-add-session></button><div class="workout-prescription-builder" data-workout-prescriptions></div>`
  const publish = document.createElement('label')
  publish.className = 'check-field'
  publish.innerHTML = `<input name="published" type="checkbox" value="1"><span>Publicar esta ficha personalizada para o aluno selecionado</span>`
  body.append(wizard, publish)
  const form = body.closest('form')
  form.workoutPrescriptionMap = new Map()
  form.workoutSessionCount = 1
  form.workoutActiveSession = 'A'
  wizard.querySelector('[data-workout-add-session]').addEventListener('click', () => {
    if (form.workoutSessionCount >= workoutSessionLetters.length) return
    form.workoutSessionCount += 1
    form.workoutActiveSession = workoutSessionLetters[form.workoutSessionCount - 1]
    renderWorkoutWizard(form)
  })
  document
    .querySelectorAll('[data-open-modal="workout"]')
    .forEach((button) =>
      button.addEventListener('click', () => queueMicrotask(() => resetWorkoutWizard(form))),
    )
  resetWorkoutWizard(form)
}

function enhanceExercise() {
  const form = document.querySelector('[data-form="exercise"]')
  const body = form?.querySelector('.modal-body')
  if (!body || form.elements.mediaUrl) return
  const name = form.elements.name
  name.setAttribute('list', 'exercise-catalog-list')
  const list = document.createElement('datalist')
  list.id = 'exercise-catalog-list'
  mediaExerciseCatalog.forEach((item) => {
    const option = document.createElement('option')
    option.value = item.name
    list.append(option)
  })
  body.append(list)
  const extra = document.createElement('div')
  extra.innerHTML = `<div class="field-grid"><label class="field"><span>Dificuldade</span><select name="difficulty"><option>Iniciante</option><option selected>Intermediário</option><option>Avançado</option></select></label><label class="field"><span>Formato da mídia</span><select name="mediaType"><option value="3d">Animação 3D</option><option value="video">Vídeo</option><option value="image">Imagem</option></select></label></div><label class="field"><span>Arquivo 3D, vídeo ou imagem (URL)</span><input name="mediaUrl" placeholder="/models/exercises/exercicio.glb"></label><label class="field"><span>Nome da animação 3D</span><input name="animationClip" placeholder="Ex.: Squat"></label>`
  body.append(...extra.children)
  const picker = field('Selecionar da biblioteca de vídeos', '<select data-video-picker></select>')
  const pickerSelect = picker.querySelector('select')
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = exerciseVideoLibrary.length
    ? 'Escolha um exercício para preencher o formulário'
    : 'Nenhum MP4 cadastrado em src/data/library.js'
  pickerSelect.append(placeholder)
  muscleGroups.forEach((group) => {
    const items = exerciseVideoLibrary.filter((item) => item.group === group.name)
    if (!items.length) return
    const options = document.createElement('optgroup')
    options.label = group.name
    items.forEach((item) => {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.name
      options.append(option)
    })
    pickerSelect.append(options)
  })
  body.insertBefore(picker, body.firstElementChild)
  const applyCatalogItem = (item) => {
    if (!item) return
    name.value = item.name
    ;[
      'group',
      'equipment',
      'difficulty',
      'mediaType',
      'mediaUrl',
      'animationClip',
      'instructions',
    ].forEach((key) => {
      if (form.elements[key]) form.elements[key].value = item[key] || ''
    })
  }
  pickerSelect.addEventListener('change', () =>
    applyCatalogItem(mediaExerciseCatalog.find((entry) => entry.id === pickerSelect.value)),
  )
  name.addEventListener('change', () => {
    applyCatalogItem(mediaExerciseCatalog.find((entry) => entry.name === name.value))
  })
}

function configureMuscleGroupFields() {
  const values = muscleGroups.map((group) => group.name)
  const groupSelect = document.querySelector('[data-form="exercise"] [name="group"]')
  const filter = document.querySelector('[data-exercise-filter]')
  if (groupSelect) {
    const selected = groupSelect.value
    groupSelect.replaceChildren(
      ...values.map((value) => {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        return option
      }),
    )
    if (values.includes(selected)) groupSelect.value = selected
  }
  if (filter) {
    const all = document.createElement('option')
    all.value = 'all'
    all.textContent = 'Todos os grupos'
    const filterValues = workoutCatalogGroups(getData().exercises || []).map((group) => group.name)
    filter.replaceChildren(
      all,
      ...filterValues.map((value) => {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        return option
      }),
    )
  }
}

let editingReadyProgram = null
const readyDivisions = {
  fullbody: ['A'],
  ab: ['A', 'B'],
  abc: ['A', 'B', 'C'],
  abcd: ['A', 'B', 'C', 'D'],
  abcde: ['A', 'B', 'C', 'D', 'E'],
  abcdef: ['A', 'B', 'C', 'D', 'E', 'F'],
}

function readySessionLabels(form) {
  return readyDivisions[form.elements.division.value] || readyDivisions.abcde
}

function captureReadyPrescriptionFields(form) {
  form.readyPrescriptionMap ||= new Map()
  form.querySelectorAll('[data-ready-prescription]').forEach((row) => {
    const current = form.readyPrescriptionMap.get(row.dataset.exerciseId)
    if (!current) return
    Object.assign(current, {
      sets: row.querySelector('[name="sets"]').value,
      repetitions: row.querySelector('[name="repetitions"]').value,
      restSeconds: row.querySelector('[name="restSeconds"]').value,
      notes: row.querySelector('[name="notes"]').value,
    })
  })
}

function readyPrescriptionValues(form) {
  captureReadyPrescriptionFields(form)
  return [...(form.readyPrescriptionMap?.values() || [])].sort(
    (a, b) =>
      a.sessionLabel.localeCompare(b.sessionLabel) ||
      Number(a.position || 0) - Number(b.position || 0),
  )
}

function renderReadySessionTabs(form) {
  const tabs = form.querySelector('[data-ready-session-tabs]')
  const labels = readySessionLabels(form).slice(0, form.readyVisibleSessionCount || 1)
  tabs.replaceChildren(
    ...labels.map((label) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'ready-session-tab'
      button.textContent =
        form.elements.division.value === 'fullbody' ? 'Full body' : `Treino ${label}`
      button.classList.toggle('is-active', label === form.readyActiveSession)
      button.addEventListener('click', () => {
        captureReadyPrescriptionFields(form)
        form.readyActiveSession = label
        renderReadyWizard(form)
      })
      return button
    }),
  )
}

function renderReadyExerciseCatalog(form) {
  const catalog = form.querySelector('[data-ready-exercise-catalog]')
  const exercises = getData().exercises || []
  const groups = workoutCatalogGroups(exercises)
  catalog.replaceChildren(
    ...groups.map((group) => {
      const items = exercises
        .filter((exercise) => group.memberNames.includes(exercise.group))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      const details = document.createElement('details')
      details.className = 'ready-exercise-group'
      const selectedCount = items.filter(
        (exercise) =>
          form.readyPrescriptionMap.get(String(exercise.id))?.sessionLabel ===
          form.readyActiveSession,
      ).length
      details.innerHTML = `<summary><strong></strong><span></span></summary><div class="ready-exercise-options"></div>`
      details.querySelector('summary strong').textContent = group.name
      details.querySelector('summary span').textContent =
        `${items.length} exercícios${selectedCount ? ` · ${selectedCount} neste treino` : ''}`
      const options = details.querySelector('.ready-exercise-options')
      if (!items.length) {
        options.textContent = 'Nenhum exercício cadastrado neste grupo.'
      }
      items.forEach((exercise) => {
        const assignment = form.readyPrescriptionMap.get(String(exercise.id))
        const label = document.createElement('label')
        label.className = 'ready-exercise-option'
        label.innerHTML = `<input type="checkbox"><span><strong></strong><small></small></span>`
        const checkbox = label.querySelector('input')
        checkbox.checked = assignment?.sessionLabel === form.readyActiveSession
        label.querySelector('span strong').textContent = exercise.name
        label.querySelector('small').textContent = assignment
          ? assignment.sessionLabel === form.readyActiveSession
            ? `${exercise.equipment || 'Sem equipamento'} · selecionado neste treino`
            : `${exercise.equipment || 'Sem equipamento'} · atualmente no Treino ${assignment.sessionLabel}`
          : exercise.equipment || 'Sem equipamento'
        checkbox.addEventListener('change', () => {
          captureReadyPrescriptionFields(form)
          if (checkbox.checked) {
            form.readyPrescriptionMap.set(String(exercise.id), {
              ...(assignment || {}),
              exerciseId: String(exercise.id),
              sessionLabel: form.readyActiveSession,
              sets: assignment?.sets || 3,
              repetitions: assignment?.repetitions || '10-12',
              restSeconds: assignment?.restSeconds ?? 60,
              notes: assignment?.notes || '',
              position: assignment?.position || form.readyPrescriptionMap.size + 1,
            })
          } else if (assignment?.sessionLabel === form.readyActiveSession) {
            form.readyPrescriptionMap.delete(String(exercise.id))
          }
          renderReadyWizard(form)
          const reopened = [...catalog.querySelectorAll('details')].find(
            (item) => item.querySelector('summary strong')?.textContent === group.name,
          )
          if (reopened) reopened.open = true
        })
        options.append(label)
      })
      return details
    }),
  )
}

function renderReadyPrescriptionBuilder(form) {
  const builder = form.querySelector('[data-ready-prescriptions]')
  builder.replaceChildren()
  const selected = [...form.readyPrescriptionMap.values()].filter(
    (item) => item.sessionLabel === form.readyActiveSession,
  )
  selected.forEach((current, index) => {
    const exercise = getData().exercises.find(
      (item) => String(item.id) === String(current.exerciseId),
    )
    const row = document.createElement('section')
    row.className = 'workout-prescription-row'
    row.dataset.readyPrescription = ''
    row.dataset.exerciseId = current.exerciseId
    row.innerHTML = `<header><span>${String(index + 1).padStart(2, '0')}</span><strong></strong><button class="remove-exercise-button" type="button" aria-label="Remover exercício">Remover</button></header><div class="field-grid field-grid--three"><label class="field"><span>Séries</span><input name="sets" type="number" min="1" max="20" value="3" required></label><label class="field"><span>Repetições/tempo</span><input name="repetitions" value="10-12" required></label><label class="field"><span>Intervalo (s)</span><input name="restSeconds" type="number" min="0" max="1800" value="60" required></label></div><label class="field"><span>Observação</span><input name="notes" maxlength="500" placeholder="Ex.: cadência controlada"></label>`
    row.querySelector('strong').textContent =
      `${exercise?.name || 'Exercício'} · ${exercise?.group || 'Grupo muscular'}`
    row.querySelector('[name="sets"]').value = current.sets || 3
    row.querySelector('[name="repetitions"]').value = current.repetitions || '10-12'
    row.querySelector('[name="restSeconds"]').value = current.restSeconds ?? 60
    row.querySelector('[name="notes"]').value = current.notes || ''
    row.querySelector('.remove-exercise-button').addEventListener('click', () => {
      captureReadyPrescriptionFields(form)
      form.readyPrescriptionMap.delete(String(current.exerciseId))
      renderReadyWizard(form)
    })
    builder.append(row)
  })
  if (!builder.children.length) {
    const empty = document.createElement('p')
    empty.className = 'workout-builder-empty'
    empty.textContent = `Abra um grupo muscular e escolha os exercícios do ${form.elements.division.value === 'fullbody' ? 'Full body' : `Treino ${form.readyActiveSession}`}.`
    builder.append(empty)
  }
}

function renderReadyWizard(form) {
  renderReadySessionTabs(form)
  renderReadyExerciseCatalog(form)
  renderReadyPrescriptionBuilder(form)
  const labels = readySessionLabels(form)
  const currentIndex = labels.indexOf(form.readyActiveSession)
  const next = form.querySelector('[data-ready-next]')
  next.hidden = currentIndex === labels.length - 1
  if (!next.hidden) {
    const nextLabel = labels[currentIndex + 1]
    const alreadyVisible = currentIndex + 1 < (form.readyVisibleSessionCount || 1)
    next.textContent = alreadyVisible
      ? `Continuar para o Treino ${nextLabel}`
      : `+ Adicionar Treino ${nextLabel} / grupo muscular`
  }
  form.querySelector('[data-ready-current-title]').textContent =
    form.elements.division.value === 'fullbody'
      ? 'Montando Full body'
      : `Montando Treino ${form.readyActiveSession}`
}

function openReadyProgramDialog(program = null) {
  const dialog = document.querySelector('[data-ready-program-dialog]')
  const form = dialog.querySelector('form')
  editingReadyProgram = program?.id || null
  form.reset()
  form.querySelector('h2').textContent = program
    ? 'Editar treino pronto'
    : 'Montar treino pronto completo'
  form.elements.name.value = program?.name || ''
  form.elements.goal.value = program?.goal || 'Hipertrofia'
  form.elements.level.value = program?.level || 'Intermediário'
  form.elements.durationWeeks.value = Number.parseInt(program?.duration, 10) || 12
  form.elements.description.value = program?.description || ''
  form.elements.colorTheme.value = program?.colorTheme || 'red'
  form.elements.published.checked = Boolean(program?.published)
  let prescriptions
  try {
    prescriptions =
      program?.exercisePrescriptions || JSON.parse(program?.exercisePrescriptionsJson || '[]')
  } catch {
    prescriptions = []
  }
  const sessionCount = new Set(prescriptions.map((item) => item.sessionLabel || 'A')).size
  form.elements.division.value = program
    ? sessionCount <= 1
      ? 'fullbody'
      : Object.keys(readyDivisions).find((key) => readyDivisions[key].length === sessionCount) ||
        'abcde'
    : 'abcde'
  form.readyPrescriptionMap = new Map(
    prescriptions.map((item, index) => [
      String(item.exerciseId),
      {
        ...item,
        exerciseId: String(item.exerciseId),
        position: item.position || index + 1,
      },
    ]),
  )
  form.readyVisibleSessionCount = program ? Math.max(1, sessionCount) : 1
  form.readyActiveSession = readySessionLabels(form)[0]
  renderReadyWizard(form)
  dialog.showModal()
}

function createReadyWorkoutLibraryPanel() {
  const page = document.querySelector('[data-route="treinos"]')
  if (!page || page.querySelector('[data-ready-workout-library]')) return
  const panel = document.createElement('article')
  panel.className = 'panel media-library-panel'
  panel.dataset.readyWorkoutLibrary = ''
  panel.innerHTML = `<div class="panel-heading"><div><span class="eyebrow eyebrow--blue">Produto de valor único</span><h2>Treinos Prontos — acesso permanente</h2><p>Monte o PDF completo dentro do sistema. Ao publicar, ele aparece automaticamente para todos os compradores desta modalidade.</p></div><button class="button button--primary workout-create-button" type="button" data-new-ready-program>+ Novo treino</button></div><div class="media-library-grid" data-ready-workout-grid></div>`
  page.append(panel)

  const dialog = document.createElement('dialog')
  dialog.className = 'modal modal--wide'
  dialog.dataset.readyProgramDialog = ''
  dialog.innerHTML = `<form method="dialog"><header><div><span class="eyebrow eyebrow--blue">Ficha geral</span><h2>Montar treino pronto completo</h2></div><button class="icon-button" type="button" data-ready-close aria-label="Fechar">×</button></header><div class="modal-body"><label class="field"><span>Nome do programa</span><input name="name" required placeholder="Ex.: Hipertrofia avançada"></label><div class="field-grid field-grid--three"><label class="field"><span>Objetivo</span><select name="goal"><option>Hipertrofia</option><option>Emagrecimento</option><option>Condicionamento</option><option>Força</option></select></label><label class="field"><span>Nível</span><select name="level"><option>Iniciante</option><option selected>Intermediário</option><option>Avançado</option></select></label><label class="field"><span>Quantidade de semanas</span><input name="durationWeeks" type="number" min="1" max="104" value="12" required></label></div><div class="field-grid field-grid--three"><label class="field"><span>Divisão do treino</span><select name="division"><option value="fullbody">Full body</option><option value="ab">AB</option><option value="abc">ABC</option><option value="abcd">ABCD</option><option value="abcde" selected>ABCDE</option><option value="abcdef">ABCDEF</option></select></label><label class="field"><span>Cor da ficha</span><select name="colorTheme"><option value="red">Vermelho e grafite</option><option value="blue">Azul FRS</option><option value="green">Verde</option><option value="black">Preto</option></select></label><label class="field"><span>Descrição</span><input name="description" placeholder="Resumo e orientações gerais"></label></div><section class="ready-workout-wizard"><div class="ready-session-tabs" data-ready-session-tabs></div><div class="ready-wizard-heading"><div><span class="eyebrow eyebrow--blue">Etapa atual</span><h3 data-ready-current-title></h3></div><p>Abra um grupo muscular e marque os exercícios desta etapa.</p></div><div class="ready-exercise-catalog" data-ready-exercise-catalog></div><button class="button button--secondary ready-next-button" type="button" data-ready-next></button><div class="workout-prescription-builder" data-ready-prescriptions></div></section><label class="check-field"><input name="published" type="checkbox" value="1"><span>Publicar para todos que compraram Treinos Prontos</span></label><p role="status" aria-live="polite"></p></div><footer><button class="button button--secondary" type="button" data-ready-close>Cancelar</button><button class="button button--primary" type="submit">Salvar treino pronto</button></footer></form>`
  document.body.append(dialog)
  const form = dialog.querySelector('form')
  form.elements.division.addEventListener('change', () => {
    captureReadyPrescriptionFields(form)
    const allowed = new Set(readySessionLabels(form))
    ;[...form.readyPrescriptionMap.entries()].forEach(([id, item]) => {
      if (!allowed.has(item.sessionLabel)) form.readyPrescriptionMap.delete(id)
    })
    form.readyActiveSession = readySessionLabels(form)[0]
    form.readyVisibleSessionCount = 1
    renderReadyWizard(form)
  })
  form.querySelector('[data-ready-next]').addEventListener('click', () => {
    captureReadyPrescriptionFields(form)
    const labels = readySessionLabels(form)
    const nextIndex = labels.indexOf(form.readyActiveSession) + 1
    if (labels[nextIndex]) {
      form.readyVisibleSessionCount = Math.max(form.readyVisibleSessionCount || 1, nextIndex + 1)
      form.readyActiveSession = labels[nextIndex]
      renderReadyWizard(form)
    }
  })
  dialog
    .querySelectorAll('[data-ready-close]')
    .forEach((button) => button.addEventListener('click', () => dialog.close()))
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const exercisePrescriptions = readyPrescriptionValues(form)
    if (!exercisePrescriptions.length) return
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    try {
      await persistReadyProgram(
        {
          name: form.elements.name.value,
          goal: form.elements.goal.value,
          level: form.elements.level.value,
          duration: `${form.elements.durationWeeks.value} ${Number(form.elements.durationWeeks.value) === 1 ? 'semana' : 'semanas'}`,
          description: form.elements.description.value,
          colorTheme: form.elements.colorTheme.value,
          published: form.elements.published.checked,
          exercisePrescriptions,
        },
        editingReadyProgram,
      )
      dialog.close()
      showToast(
        form.elements.published.checked
          ? 'Treino pronto publicado para os compradores.'
          : 'Treino pronto salvo como rascunho.',
      )
      window.dispatchEvent(new Event('frs:remote-refresh'))
    } catch (error) {
      form.querySelector('[role="status"]').textContent = error.message
    } finally {
      button.disabled = false
    }
  })
  panel
    .querySelector('[data-new-ready-program]')
    .addEventListener('click', () => openReadyProgramDialog())
  renderReadyWorkoutLibrary()
}

function renderReadyWorkoutLibrary() {
  const grid = document.querySelector('[data-ready-workout-grid]')
  if (!grid) return
  const programs = getData().readyPrograms || []
  grid.replaceChildren()
  programs.forEach((program) => {
    try {
      program.exercisePrescriptions = JSON.parse(program.exercisePrescriptionsJson || '[]')
    } catch {
      program.exercisePrescriptions = []
    }
    const sessions = [
      ...new Set(program.exercisePrescriptions.map((item) => item.sessionLabel)),
    ].sort()
    const card = document.createElement('section')
    card.className = 'media-library-card'
    card.innerHTML = `<div><span class="tag">${program.published ? 'Publicado' : 'Rascunho'}</span><h3></h3><p></p><small></small></div><div class="media-library-actions"></div>`
    card.querySelector('h3').textContent = program.name
    card.querySelector('p').textContent =
      program.description || `${program.goal} · ${program.level}`
    card.querySelector('small').textContent =
      `${program.duration} · Treinos ${sessions.join(', ') || 'A'} · ${program.exercisePrescriptions.length} exercícios`
    const actions = card.querySelector('.media-library-actions')
    const pdf = document.createElement('button')
    pdf.className = 'button button--secondary'
    pdf.type = 'button'
    pdf.textContent = 'Baixar PDF completo'
    pdf.addEventListener('click', () =>
      downloadWorkoutPdf(
        {
          ...program,
          exercises: program.exercisePrescriptions,
          readyProgram: true,
        },
        'Treino Pronto',
      ),
    )
    const edit = document.createElement('button')
    edit.className = 'button button--secondary'
    edit.type = 'button'
    edit.textContent = 'Editar'
    edit.addEventListener('click', () => openReadyProgramDialog(program))
    const remove = document.createElement('button')
    remove.className = 'button button--secondary'
    remove.type = 'button'
    remove.textContent = 'Excluir'
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Excluir o treino pronto “${program.name}”?`)) return
      await removeReadyProgram(program.id)
      showToast('Treino pronto excluído.')
      window.dispatchEvent(new Event('frs:remote-refresh'))
    })
    actions.append(pdf, edit, remove)
    grid.append(card)
  })
  if (!programs.length) {
    const empty = document.createElement('p')
    empty.textContent = 'Nenhum treino pronto montado. Crie o primeiro programa completo ABCDE.'
    grid.append(empty)
  }
}

function createExerciseVideoLibraryPanel() {
  const page = document.querySelector('[data-route="exercicios"]')
  if (!page || page.querySelector('[data-exercise-video-library]')) return
  const panel = document.createElement('article')
  panel.className = 'panel media-library-panel'
  panel.dataset.exerciseVideoLibrary = ''
  panel.innerHTML = `<div class="panel-heading"><div><span class="eyebrow eyebrow--blue">Biblioteca de MP4</span><h2>Vídeos por grupo muscular</h2><p>Envie e publique os vídeos diretamente pelo painel.</p></div></div><form class="media-upload-form" data-exercise-video-upload><div class="field-grid"><label class="field"><span>Nome do exercício</span><input name="name" required placeholder="Ex.: Supino reto com barra"></label><label class="field"><span>Arquivo MP4</span><input name="video" type="file" accept="video/mp4,.mp4" required></label></div><div class="field-grid field-grid--three"><label class="field"><span>Grupo muscular</span><select name="group" required data-video-muscle-group></select></label><label class="field"><span>Equipamento</span><input name="equipment" placeholder="Ex.: Barra e banco"></label><label class="field"><span>Dificuldade</span><select name="difficulty"><option>Iniciante</option><option selected>Intermediário</option><option>Avançado</option></select></label></div><label class="field"><span>Instruções</span><textarea name="instructions" rows="3" placeholder="Orientações de execução e segurança"></textarea></label><label class="check-field"><input name="published" type="checkbox" value="1"><span>Publicar imediatamente para alunos com acesso ativo</span></label><small>Somente MP4, com no máximo 90 MB.</small><button class="button button--primary" type="submit">Enviar vídeo</button><p role="status" aria-live="polite"></p></form><div class="video-group-library" data-exercise-video-groups></div>`
  const groupSelect = panel.querySelector('[data-video-muscle-group]')
  const videoUploadGroups = [...muscleGroups]
  const abdomenIndex = videoUploadGroups.findIndex((group) => group.name === 'Abdômen')
  videoUploadGroups.splice(abdomenIndex + 1, 0, { id: 'pernas', name: 'Pernas' })
  groupSelect.replaceChildren(
    ...videoUploadGroups.map((group) => {
      const option = document.createElement('option')
      option.value = group.name
      option.textContent = group.name
      return option
    }),
  )
  const form = panel.querySelector('form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const button = form.querySelector('[type="submit"]')
    const status = form.querySelector('[role="status"]')
    button.disabled = true
    button.textContent = 'Enviando vídeo…'
    status.textContent = ''
    try {
      await uploadExerciseVideo(new FormData(form))
      form.reset()
      showToast('Vídeo enviado para a biblioteca.')
      window.dispatchEvent(new Event('frs:remote-refresh'))
    } catch (error) {
      status.textContent = error.message
    } finally {
      button.disabled = false
      button.textContent = 'Enviar vídeo'
    }
  })
  page.append(panel)
  renderExerciseVideoLibrary()
}

function confirmExerciseVideoDeletion(exercise) {
  let dialog = document.querySelector('[data-delete-exercise-video]')
  if (!dialog) {
    dialog = document.createElement('dialog')
    dialog.className = 'modal'
    dialog.dataset.deleteExerciseVideo = ''
    dialog.innerHTML = `<form method="dialog"><header><div><span class="eyebrow eyebrow--blue">Biblioteca de MP4</span><h2>Excluir vídeo?</h2></div><button class="icon-button" type="submit" value="cancel" aria-label="Fechar">×</button></header><div class="modal-body"><p>O vídeo <strong data-exercise-video-name></strong> será removido da biblioteca e deixará de aparecer para os alunos.</p><p class="password-requirements">Esta ação não pode ser desfeita.</p></div><footer><button class="button button--secondary" type="submit" value="cancel">Cancelar</button><button class="button button--primary" type="submit" value="confirm">Excluir vídeo</button></footer></form>`
    document.body.append(dialog)
  }
  dialog.querySelector('[data-exercise-video-name]').textContent = exercise.name
  dialog.returnValue = 'cancel'
  dialog.showModal()
  return new Promise((resolve) =>
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {
      once: true,
    }),
  )
}

function renderExerciseVideoLibrary() {
  const groups = document.querySelector('[data-exercise-video-groups]')
  if (!groups) return
  const videos = getData().exerciseVideos || []
  groups.replaceChildren()
  workoutCatalogGroups(videos)
    .map((group) => ({
      ...group,
      exercises: videos.filter((video) => group.memberNames.includes(video.group)),
    }))
    .forEach((group) => {
      const section = document.createElement('details')
      section.className = 'video-muscle-group'
      if (group.exercises.length) section.open = true
      const summary = document.createElement('summary')
      summary.textContent = `${group.name} (${group.exercises.length})`
      const content = document.createElement('div')
      content.className = 'video-library-grid'
      if (!group.exercises.length) {
        const empty = document.createElement('p')
        empty.textContent = 'Nenhum MP4 enviado para este grupo.'
        content.append(empty)
      }
      group.exercises.forEach((exercise) => {
        const card = document.createElement('article')
        card.className = 'video-library-card'
        const title = document.createElement('h3')
        title.textContent = exercise.name
        const meta = document.createElement('p')
        meta.textContent = `${exercise.equipment || 'Sem equipamento'} · ${exercise.difficulty}${exercise.published ? ' · publicado' : ' · rascunho'}`
        const instructions = document.createElement('p')
        instructions.textContent = exercise.instructions || 'Sem instruções adicionais.'
        const size = document.createElement('small')
        size.textContent = `${(Number(exercise.sizeBytes) / 1024 / 1024).toFixed(1)} MB`
        const actions = document.createElement('div')
        actions.className = 'media-library-actions'
        const preview = document.createElement('button')
        preview.className = 'button button--secondary'
        preview.type = 'button'
        preview.textContent = 'Carregar vídeo'
        preview.addEventListener('click', async () => {
          preview.disabled = true
          preview.textContent = 'Carregando…'
          try {
            const video = document.createElement('video')
            video.controls = true
            video.preload = 'metadata'
            video.playsInline = true
            video.src = await loadExerciseVideo(exercise.id)
            video.addEventListener('loadedmetadata', () => video.play().catch(() => {}), {
              once: true,
            })
            card.prepend(video)
            preview.remove()
          } catch (error) {
            preview.disabled = false
            preview.textContent = 'Carregar vídeo'
            showToast(error.message)
          }
        })
        const remove = document.createElement('button')
        remove.className = 'button button--secondary'
        remove.type = 'button'
        remove.textContent = 'Excluir'
        remove.addEventListener('click', async () => {
          if (!(await confirmExerciseVideoDeletion(exercise))) return
          remove.disabled = true
          try {
            await deleteExerciseVideo(exercise.id)
            showToast('Vídeo excluído da biblioteca.')
            window.dispatchEvent(new Event('frs:remote-refresh'))
          } catch (error) {
            remove.disabled = false
            showToast(error.message)
          }
        })
        actions.append(preview, remove)
        card.append(title, meta, instructions, size, actions)
        content.append(card)
      })
      section.append(summary, content)
      groups.append(section)
    })
}

function enhanceAssessment() {
  const body = document.querySelector('[data-form="assessment"] .modal-body')
  if (!body || body.querySelector('[name="published"]')) return
  const publish = document.createElement('label')
  publish.className = 'check-field'
  publish.innerHTML = `<input name="published" type="checkbox" value="1"><span>Publicar esta avaliação para o aluno</span>`
  body.append(publish)
}

function createAccessDialog() {
  if (document.querySelector('[data-access-dialog]')) return
  const dialog = document.createElement('dialog')
  dialog.className = 'modal'
  dialog.dataset.accessDialog = ''
  dialog.innerHTML = `<form method="dialog" data-access-form><header><div><span class="eyebrow eyebrow--blue">Plano e pagamento</span><h2>Liberar acesso do aluno</h2></div><button class="icon-button" type="button" data-access-close aria-label="Fechar">×</button></header><div class="modal-body"><p data-access-student></p><label class="field"><span>Plano</span><select name="planCode"><option value="ready">Treinos Prontos — permanente</option><option value="basic">Consultoria Básica</option><option value="premium">Consultoria Premium</option><option value="athlete">Performance Atleta</option></select></label><label class="field" data-access-billing-field><span>Período</span><select name="billingCycle"><option value="monthly">Mensal — 30 dias</option><option value="quarterly">Trimestral — 90 dias, recomendado</option><option value="semiannual">Semestral — 180 dias</option><option value="annual">Anual — 365 dias</option></select></label><div class="field-grid"><label class="field"><span>Situação</span><select name="accessStatus"><option value="active">Liberar acesso</option><option value="pending">Aguardando</option><option value="paused">Pausar</option><option value="cancelled">Cancelar</option></select></label><label class="field"><span>Pagamento</span><select name="paymentStatus"><option value="paid">Confirmado</option><option value="pending">Pendente</option><option value="refunded">Estornado</option></select></label></div><label class="field"><span>Forma de pagamento</span><select name="paymentMethod"><option value="whatsapp">WhatsApp / pessoalmente</option><option value="pix">PIX manual</option><option value="cash">Dinheiro</option><option value="webapp">WebApp</option></select></label><label class="field"><span>Validade personalizada (opcional)</span><input name="expiresAt" type="date"></label><p class="password-requirements">A validade é calculada pelo período: 30, 90, 180 ou 365 dias. Treinos Prontos não expiram.</p><p role="status"></p></div><footer><button class="button button--secondary" type="button" data-access-close>Cancelar</button><button class="button button--primary" type="submit">Salvar acesso</button></footer></form>`
  document.body.append(dialog)
  const accessForm = dialog.querySelector('form')
  const syncAccessPeriod = () => {
    const permanent = accessForm.elements.planCode.value === 'ready'
    accessForm.querySelector('[data-access-billing-field]').hidden = permanent
    if (permanent) accessForm.elements.billingCycle.value = 'monthly'
  }
  accessForm.elements.planCode.addEventListener('change', syncAccessPeriod)
  dialog
    .querySelectorAll('[data-access-close]')
    .forEach((button) => button.addEventListener('click', () => dialog.close()))
  dialog.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const status = form.querySelector('[role="status"]')
    const button = form.querySelector('[type="submit"]')
    button.disabled = true
    status.textContent = 'Salvando…'
    try {
      await updateStudentAccess(form.dataset.studentId, Object.fromEntries(new FormData(form)))
      dialog.close()
      showToast('Acesso do aluno atualizado.')
      window.dispatchEvent(new Event('frs:remote-refresh'))
    } catch (error) {
      status.textContent = error.message
    } finally {
      button.disabled = false
    }
  })
  window.addEventListener('frs:manage-access', (event) => {
    const student = getData().students.find(
      (item) => String(item.id) === String(event.detail),
    )
    if (!student) return
    const form = dialog.querySelector('form')
    form.dataset.studentId = student.id
    form.querySelector('[data-access-student]').textContent = `${student.name} · ${student.email}`
    form.elements.planCode.value = student.planCode || 'basic'
    form.elements.billingCycle.value = ['monthly', 'quarterly', 'semiannual', 'annual'].includes(
      student.billingCycle,
    )
      ? student.billingCycle
      : 'quarterly'
    syncAccessPeriod()
    form.elements.accessStatus.value = student.accessStatus || 'pending'
    form.elements.paymentStatus.value = student.paymentStatus || 'pending'
    form.elements.paymentMethod.value = student.paymentMethod || 'whatsapp'
    form.elements.expiresAt.value = student.accessExpiresAt?.slice(0, 10) || ''
    form.querySelector('[role="status"]').textContent = ''
    dialog.showModal()
  })
}

function connectPlanCards() {
  const mapping = ['ready', 'basic', 'premium', 'athlete']
  document.querySelectorAll('.plan-card').forEach((card, index) => {
    const link = card.querySelector('a:not(.plan-whatsapp-link)')
    if (!link || !mapping[index]) return
    link.href = `#cadastro-aluno?plan=${mapping[index]}`
    link.textContent = index === 0 ? 'Escolher Treinos Prontos' : 'Escolher este plano'
    if (card.querySelector('.plan-whatsapp-link')) return
    const whatsapp = document.createElement('a')
    whatsapp.className = 'plan-whatsapp-link'
    whatsapp.href = createWhatsappUrl({ planCode: mapping[index] })
    whatsapp.target = '_blank'
    whatsapp.rel = 'noreferrer'
    whatsapp.textContent = 'Tirar dúvidas pelo WhatsApp'
    whatsapp.setAttribute(
      'aria-label',
      `Tirar dúvidas sobre ${planNames[mapping[index]]} pelo WhatsApp`,
    )
    card.append(whatsapp)
  })
}

function createOperationsPanel() {
  const page = document.querySelector('[data-route="painel"]')
  if (!page || page.querySelector('[data-operations-panel]')) return
  const panel = document.createElement('article')
  panel.className = 'panel'
  panel.dataset.operationsPanel = ''
  const heading = document.createElement('div')
  heading.className = 'panel-heading'
  heading.innerHTML =
    '<div><h2>Solicitações e check-ins</h2><p>Cadastros e retornos enviados pelos alunos</p></div>'
  const content = document.createElement('div')
  content.dataset.operationsContent = ''
  panel.append(heading, content)
  page.append(panel)
}

function renderOperations() {
  const content = document.querySelector('[data-operations-content]')
  if (!content) return
  const data = getData()
  const pending = (data.students || []).filter(
    (student) => student.accessStatus !== 'active' || student.paymentStatus !== 'paid',
  )
  const checkins = data.checkins || []
  content.replaceChildren()
  if (!pending.length && !checkins.length) {
    content.append(document.createTextNode('Nenhuma solicitação ou check-in pendente.'))
    return
  }
  pending.slice(0, 6).forEach((student) => {
    const item = document.createElement('p')
    if (student.accountId) {
      item.textContent = `${student.name} · pagamento online pendente · a liberação será automática após a confirmação do Mercado Pago.`
      content.append(item)
      return
    }
    const release = document.createElement('button')
    release.className = 'link-button'
    release.type = 'button'
    release.textContent = 'Confirmar pagamento presencial e liberar'
    release.addEventListener('click', async () => {
      if (
        !window.confirm(
          `Confirma que o pagamento de ${student.name} foi recebido e deseja liberar o acesso?`,
        )
      )
        return
      release.disabled = true
      release.textContent = 'Liberando…'
      try {
        await updateStudentAccess(student.id, {
          planCode: student.planCode || 'basic',
          billingCycle: student.billingCycle || 'quarterly',
          accessStatus: 'active',
          paymentStatus: 'paid',
          paymentMethod: student.paymentMethod || 'manual',
        })
        showToast('Pagamento confirmado. O conteúdo já está liberado para o aluno.')
        window.dispatchEvent(new Event('frs:remote-refresh'))
      } catch (error) {
        showToast(error.message)
        release.disabled = false
        release.textContent = 'Confirmar pagamento presencial e liberar'
      }
    })
    const button = document.createElement('button')
    button.className = 'link-button'
    button.type = 'button'
    button.textContent = 'Gerenciar acesso'
    button.addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('frs:manage-access', { detail: student.id })),
    )
    item.append(
      document.createTextNode(
        `${student.name} · ${student.planCode || 'basic'} · ${billingCycleLabels[student.billingCycle] || 'período não definido'} · pagamento pendente · `,
      ),
      release,
      document.createTextNode(' · '),
      button,
    )
    content.append(item)
  })
  checkins.slice(0, 8).forEach((checkin) => {
    const item = document.createElement('p')
    const date = new Intl.DateTimeFormat('pt-BR').format(new Date(checkin.createdAt))
    item.textContent = `${checkin.student} · ${date} · energia ${checkin.energy}/5 · sono ${checkin.sleep}/5${checkin.pain ? ` · desconforto: ${checkin.pain}` : ''}${checkin.notes ? ` · ${checkin.notes}` : ''}`
    content.append(item)
  })
}

export function initIntegratedPortal() {
  enhanceRegistration()
  enhanceWorkout()
  enhanceExercise()
  configureMuscleGroupFields()
  createReadyWorkoutLibraryPanel()
  createExerciseVideoLibraryPanel()
  enhanceAssessment()
  createAppointmentDialog()
  createAccessDialog()
  connectPlanCards()
  createOperationsPanel()
  renderOperations()
  window.addEventListener('frs:edit-workout', (event) => {
    const workout = getData().workouts.find(
      (item) => String(item.id) === String(event.detail),
    )
    if (!workout) return
    if (!Array.isArray(workout.exerciseIds))
      try {
        workout.exerciseIds = JSON.parse(workout.exerciseIdsJson || '[]')
      } catch {
        workout.exerciseIds = []
      }
    if (!Array.isArray(workout.exercisePrescriptions))
      try {
        workout.exercisePrescriptions = JSON.parse(workout.exercisePrescriptionsJson || '[]')
      } catch {
        workout.exercisePrescriptions = []
      }
    queueMicrotask(() => {
      const form = document.querySelector('[data-form="workout"]')
      resetWorkoutWizard(form, workout.exercisePrescriptions)
    })
  })
  window.addEventListener('frs:data-changed', () => {
    renderOperations()
    renderReadyWorkoutLibrary()
    renderExerciseVideoLibrary()
    const workoutForm = document.querySelector('[data-form="workout"]')
    if (workoutForm?.workoutPrescriptionMap) renderWorkoutWizard(workoutForm)
  })
}
