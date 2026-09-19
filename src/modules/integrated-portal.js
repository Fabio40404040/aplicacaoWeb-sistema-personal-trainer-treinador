import { updateStudentAccess } from './api-client.js'
import { getData } from './state.js'
import { exerciseCatalog } from '../data/exercises.js'
import {
  exerciseVideoLibrary,
  muscleGroups,
  readyWorkoutLibrary,
  videosByMuscleGroup,
} from '../data/library.js'
import { showToast } from './utils.js'
import { createWhatsappUrl, planNames } from './whatsapp.js'
import { createPixQrCode } from './pix.js'

const billingCycleLabels = {
  monthly: 'mensal',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  annual: 'anual',
  permanent: 'permanente',
}
const consultingPrices = { basic: 149, premium: 249, athlete: 399 }
const readyWorkoutPrice = 99
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const mediaExerciseCatalog = [
  ...exerciseCatalog,
  ...exerciseVideoLibrary.map((item) => ({
    ...item,
    mediaType: 'video',
    mediaUrl: item.videoUrl,
    animationClip: '',
  })),
]

function registrationAmount(planCode, billingCycle) {
  if (planCode === 'ready') return readyWorkoutPrice
  const monthly = consultingPrices[planCode] || consultingPrices.basic
  if (billingCycle === 'monthly') return monthly
  if (billingCycle === 'annual') return monthly * 12 * 0.85
  if (billingCycle === 'semiannual') return monthly * 6 * 0.9
  return monthly * 3 * 0.95
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
    `<select name="planCode"><option value="ready">Treinos Prontos — acesso permanente</option><option value="basic" selected>Consultoria Básica</option><option value="premium">Consultoria Premium</option><option value="athlete">Performance Atleta</option></select>`,
  )
  const billingCycle = field(
    'Período da consultoria',
    `<select name="billingCycle"><option value="monthly">Mensal — sem desconto</option><option value="quarterly" selected>Trimestral — recomendado, 5% de desconto</option><option value="semiannual">Semestral — 10% de desconto</option><option value="annual">Anual — melhor valor, 15% de desconto</option></select>`,
  )
  const channel = field('Forma de pagamento', '<select name="paymentChannel"></select>')
  const paymentTitle = document.createElement('span')
  paymentTitle.className = 'registration-payment-title'
  paymentTitle.textContent = 'Forma de contratação'
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

  function renderPaymentArea() {
    const planCode = plan.querySelector('select').value
    const cycle = billingCycle.querySelector('select').value
    const amount = registrationAmount(planCode, cycle)
    const submit = form.querySelector('[type="submit"]')
    paymentArea.hidden = false
    paymentArea.replaceChildren()

    const pixDetails = document.createElement('details')
    pixDetails.className = 'pix-payment-details'
    pixDetails.innerHTML = `<summary>PIX — liberação após confirmação</summary><div class="pix-payment-content"><p>Pague ${money.format(amount)} usando a chave PIX <strong>fabiogisel7@gmail.com</strong>.</p><div class="pix-placeholder"><span>QR PIX</span><small>Gerando QR Code…</small></div></div>`

    const cardDetails = document.createElement('details')
    cardDetails.className = 'pix-payment-details'
    cardDetails.innerHTML = `<summary>Cartão de crédito — liberação após confirmação</summary><div class="pix-payment-content"><strong>Formulário seguro do Mercado Pago</strong><p>Preencha os dados do cadastro acima e abra o formulário protegido. Os dados do cartão não passam pelo servidor da FRS Personal.</p><button class="button button--secondary" type="button" data-open-card-form>Abrir formulário seguro</button></div>`

    paymentArea.append(pixDetails, cardDetails)
    const select = channel.querySelector('select')
    const pixContent = pixDetails.querySelector('.pix-payment-content')
    let pixLoaded = false

    pixDetails.addEventListener('toggle', async () => {
      if (!pixDetails.open) return
      cardDetails.open = false
      select.value = 'pix'
      submit.textContent = 'Cadastrar como aluno'
      if (pixLoaded) return
      pixLoaded = true
      try {
        const { payload, imageUrl } = await createPixQrCode(amount)
        const placeholder = pixContent.querySelector('.pix-placeholder')
        const image = document.createElement('img')
        image.className = 'pix-qr-code'
        image.src = imageUrl
        image.alt = `QR Code PIX de ${money.format(amount)} para fabiogisel7@gmail.com`
        placeholder.replaceWith(image)
        const copy = document.createElement('button')
        copy.className = 'button button--secondary'
        copy.type = 'button'
        copy.textContent = 'Copiar código PIX'
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(payload)
            copy.textContent = 'Código PIX copiado'
          } catch {
            copy.textContent = 'Selecione o QR Code para pagar'
          }
        })
        pixContent.append(copy)
      } catch {
        pixContent.querySelector('.pix-placeholder').innerHTML =
          '<span>PIX</span><small>Use a chave fabiogisel7@gmail.com</small>'
      }
    })

    const selectCard = () => {
      pixDetails.open = false
      select.value = 'credit_card'
      submit.textContent = 'Cadastrar como aluno'
    }
    cardDetails.addEventListener('toggle', () => {
      if (cardDetails.open) selectCard()
    })
    cardDetails.querySelector('[data-open-card-form]').addEventListener('click', () => {
      selectCard()
      if (typeof form.requestSubmit === 'function') form.requestSubmit()
      else submit.click()
    })
    select.value = 'pix'
    submit.textContent = 'Cadastrar como aluno'
  }

  function updateContractOptions() {
    const select = channel.querySelector('select')
    const selectedPlan = plan.querySelector('select').value
    select.innerHTML =
      '<option value="pix">PIX — liberação após confirmação</option><option value="credit_card">Cartão de crédito — liberação após confirmação</option>'
    channel.hidden = true
    paymentTitle.hidden = false
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
    renderPaymentArea()
  }
  plan.querySelector('select').addEventListener('change', updateContractOptions)
  billingCycle.querySelector('select').addEventListener('change', renderPaymentArea)
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

function enhanceWorkout() {
  const body = document.querySelector('[data-form="workout"] .modal-body')
  if (!body || body.querySelector('[name="exerciseIds"]')) return
  const select = field(
    'Exercícios da ficha',
    `<select name="exerciseIds" multiple size="6" aria-describedby="workout-exercise-help"></select>`,
  )
  const help = document.createElement('small')
  help.id = 'workout-exercise-help'
  help.textContent = 'Use Ctrl/Command para selecionar vários exercícios.'
  select.append(help)
  const prescription = document.createElement('div')
  prescription.className = 'field-grid field-grid--three'
  prescription.innerHTML = `<label class="field"><span>Séries</span><input name="sets" type="number" min="1" value="3"></label><label class="field"><span>Repetições</span><input name="repetitions" value="10"></label><label class="field"><span>Descanso (s)</span><input name="restSeconds" type="number" min="0" value="60"></label>`
  const publish = document.createElement('label')
  publish.className = 'check-field'
  publish.innerHTML = `<input name="published" type="checkbox" value="1"><span>Publicar esta ficha para o aluno</span>`
  body.append(select, prescription, publish)
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
    filter.replaceChildren(
      all,
      ...values.map((value) => {
        const option = document.createElement('option')
        option.value = value
        option.textContent = value
        return option
      }),
    )
  }
}

function createReadyWorkoutLibraryPanel() {
  const page = document.querySelector('[data-route="treinos"]')
  if (!page || page.querySelector('[data-ready-workout-library]')) return
  const panel = document.createElement('article')
  panel.className = 'panel media-library-panel'
  panel.dataset.readyWorkoutLibrary = ''
  panel.innerHTML = `<div class="panel-heading"><div><span class="eyebrow eyebrow--blue">Biblioteca de PDFs</span><h2>Treinos Prontos</h2><p>Adicione os arquivos em <code>public/library/workouts/pdfs</code> e edite <code>src/data/library.js</code>.</p></div></div>`
  const grid = document.createElement('div')
  grid.className = 'media-library-grid'
  readyWorkoutLibrary.forEach((workout) => {
    const card = document.createElement('section')
    card.className = 'media-library-card'
    const groups = workout.muscleGroups?.join(', ') || 'Treino completo'
    card.innerHTML = `<div><span class="tag">${workout.published ? 'Publicado' : 'Rascunho'}</span><h3></h3><p></p><small></small></div>`
    card.querySelector('h3').textContent = workout.name
    card.querySelector('p').textContent = workout.description || `${workout.goal} · ${workout.level}`
    card.querySelector('small').textContent = `${groups} · ${workout.duration}`
    const open = document.createElement('a')
    open.className = 'button button--secondary'
    open.href = workout.pdfUrl
    open.target = '_blank'
    open.rel = 'noreferrer'
    open.textContent = 'Abrir PDF'
    card.append(open)
    grid.append(card)
  })
  if (!readyWorkoutLibrary.length) {
    const empty = document.createElement('p')
    empty.textContent = 'Nenhum PDF cadastrado em src/data/library.js.'
    grid.append(empty)
  }
  panel.append(grid)
  page.append(panel)
}

function createExerciseVideoLibraryPanel() {
  const page = document.querySelector('[data-route="exercicios"]')
  if (!page || page.querySelector('[data-exercise-video-library]')) return
  const panel = document.createElement('article')
  panel.className = 'panel media-library-panel'
  panel.dataset.exerciseVideoLibrary = ''
  panel.innerHTML = `<div class="panel-heading"><div><span class="eyebrow eyebrow--blue">Biblioteca de MP4</span><h2>Vídeos por grupo muscular</h2><p>Copie os vídeos para <code>public/library/exercises/videos</code> e cadastre nome e caminho em <code>src/data/library.js</code>.</p></div></div>`
  const groups = document.createElement('div')
  groups.className = 'video-group-library'
  videosByMuscleGroup(exerciseVideoLibrary).forEach((group) => {
    const section = document.createElement('details')
    section.className = 'video-muscle-group'
    if (group.exercises.length) section.open = true
    const summary = document.createElement('summary')
    summary.textContent = `${group.name} (${group.exercises.length})`
    const content = document.createElement('div')
    content.className = 'video-library-grid'
    if (!group.exercises.length) {
      const empty = document.createElement('p')
      empty.textContent = `Nenhum MP4 cadastrado na pasta ${group.id}.`
      content.append(empty)
    }
    group.exercises.forEach((exercise) => {
      const card = document.createElement('article')
      card.className = 'video-library-card'
      const video = document.createElement('video')
      video.controls = true
      video.preload = 'metadata'
      video.playsInline = true
      video.src = exercise.videoUrl
      if (exercise.posterUrl) video.poster = exercise.posterUrl
      const title = document.createElement('h3')
      title.textContent = exercise.name
      const meta = document.createElement('p')
      meta.textContent = `${exercise.equipment} · ${exercise.difficulty}${exercise.published ? ' · publicado' : ' · rascunho'}`
      card.append(video, title, meta)
      content.append(card)
    })
    section.append(summary, content)
    groups.append(section)
  })
  panel.append(groups)
  page.append(panel)
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
    const student = getData().students.find((item) => item.id === event.detail)
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
    const release = document.createElement('button')
    release.className = 'link-button'
    release.type = 'button'
    release.textContent = 'Confirmar pagamento e liberar'
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
        release.textContent = 'Confirmar pagamento e liberar'
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
    const workout = getData().workouts.find((item) => item.id === event.detail)
    if (!workout || workout.exerciseIds) return
    try {
      workout.exerciseIds = JSON.parse(workout.exerciseIdsJson || '[]')
    } catch {
      workout.exerciseIds = []
    }
  })
  window.addEventListener('frs:data-changed', () => {
    renderOperations()
    const select = document.querySelector('[name="exerciseIds"]')
    if (!select) return
    const selected = new Set([...select.selectedOptions].map((o) => o.value))
    select.replaceChildren(
      ...getData().exercises.map((exercise) => {
        const option = document.createElement('option')
        option.value = exercise.id
        option.textContent = `${exercise.name} — ${exercise.group}`
        option.selected = selected.has(exercise.id)
        return option
      }),
    )
  })
}
