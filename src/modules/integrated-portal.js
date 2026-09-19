import { updateStudentAccess } from './api-client.js'
import { getData } from './state.js'
import { exerciseCatalog } from '../data/exercises.js'
import { showToast } from './utils.js'
import { createWhatsappUrl, planNames } from './whatsapp.js'
import { createPixQrCode, hasPixConfiguration } from './pix.js'

const billingCycleLabels = {
  monthly: 'mensal',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  permanent: 'permanente',
}
const consultingPrices = { basic: 149, premium: 249, athlete: 399 }
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

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
    `<select name="billingCycle"><option value="monthly">Mensal — sem desconto</option><option value="quarterly" selected>Trimestral — recomendado, 5% de desconto</option><option value="semiannual">Semestral — melhor valor, 10% de desconto</option></select>`,
  )
  const channel = field('Forma de contratação', '<select name="paymentChannel"></select>')
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
    paymentArea.replaceChildren()
    if (plan.querySelector('select').value !== 'ready') {
      paymentArea.hidden = true
      return
    }
    paymentArea.hidden = false

    const pixDetails = document.createElement('details')
    pixDetails.className = 'pix-payment-details'
    const pixSummary = document.createElement('summary')
    pixSummary.textContent = 'PIX com QR Code'
    const pixContent = document.createElement('div')
    pixContent.className = 'pix-payment-content'
    pixDetails.append(pixSummary, pixContent)

    const cardDetails = document.createElement('details')
    cardDetails.className = 'pix-payment-details'
    const cardSummary = document.createElement('summary')
    cardSummary.textContent = 'Pedir link de cartão pelo WhatsApp'
    const cardContent = document.createElement('div')
    cardContent.className = 'pix-payment-content'
    const cardText = document.createElement('p')
    cardText.textContent =
      'O personal enviará um link seguro para o pagamento no cartão de crédito.'
    const cardLink = document.createElement('a')
    cardLink.className = 'button button--secondary'
    cardLink.href = createWhatsappUrl({ planCode: 'ready', purpose: 'card' })
    cardLink.target = '_blank'
    cardLink.rel = 'noreferrer'
    cardLink.textContent = 'Solicitar link pelo WhatsApp'
    cardContent.append(cardText, cardLink)
    cardDetails.append(cardSummary, cardContent)
    paymentArea.append(pixDetails, cardDetails)

    let loaded = false
    pixDetails.addEventListener('toggle', async () => {
      if (!pixDetails.open) return
      cardDetails.open = false
      channel.querySelector('select').value = 'pix'
      if (loaded) return
      loaded = true
      if (!hasPixConfiguration()) {
        const placeholder = document.createElement('div')
        placeholder.className = 'pix-placeholder'
        placeholder.innerHTML = '<span>QR PIX</span><small>Aguardando cadastro da chave PIX</small>'
        pixContent.append(placeholder)
        return
      }
      const { payload, imageUrl } = await createPixQrCode(99)
      const image = document.createElement('img')
      image.className = 'pix-qr-code'
      image.src = imageUrl
      image.alt = 'QR Code PIX para pagamento de Treinos Prontos'
      const copy = document.createElement('button')
      copy.className = 'button button--secondary'
      copy.type = 'button'
      copy.textContent = 'Copiar código PIX'
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(payload)
          copy.textContent = 'Código PIX copiado'
        } catch {
          copy.textContent = 'Não foi possível copiar'
        }
      })
      pixContent.append(image, copy)
    })
    cardDetails.addEventListener('toggle', () => {
      if (!cardDetails.open) return
      pixDetails.open = false
      channel.querySelector('select').value = 'card_whatsapp'
    })
  }

  function updateContractOptions() {
    const select = channel.querySelector('select')
    const selectedPlan = plan.querySelector('select').value
    if (selectedPlan === 'ready') {
      select.innerHTML =
        '<option value="pix">PIX com QR Code</option><option value="card_whatsapp">Pedir link de cartão pelo WhatsApp</option>'
      channel.hidden = true
      billingCycle.hidden = true
      billingCycle.querySelector('select').value = 'permanent'
      paymentTitle.hidden = false
    } else {
      const monthlyPrice = consultingPrices[selectedPlan]
      const billingSelect = billingCycle.querySelector('select')
      billingSelect.options[0].textContent = `Mensal — ${money.format(monthlyPrice)}, sem desconto`
      billingSelect.options[1].textContent = `Trimestral — ${money.format(monthlyPrice * 3 * 0.95)}, recomendado (5% off)`
      billingSelect.options[2].textContent = `Semestral — ${money.format(monthlyPrice * 6 * 0.9)} (10% off)`
      select.innerHTML =
        '<option value="whatsapp">Combinar pelo WhatsApp</option><option value="webapp">Pagar pelo WebApp (em preparação)</option>'
      channel.hidden = false
      billingCycle.hidden = false
      if (billingCycle.querySelector('select').value === 'permanent')
        billingCycle.querySelector('select').value = 'quarterly'
      paymentTitle.hidden = true
    }
    renderPaymentArea()
  }
  plan.querySelector('select').addEventListener('change', updateContractOptions)
  updateContractOptions()
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
  exerciseCatalog.forEach((item) => {
    const option = document.createElement('option')
    option.value = item.name
    list.append(option)
  })
  body.append(list)
  const extra = document.createElement('div')
  extra.innerHTML = `<div class="field-grid"><label class="field"><span>Dificuldade</span><select name="difficulty"><option>Iniciante</option><option selected>Intermediário</option><option>Avançado</option></select></label><label class="field"><span>Formato da mídia</span><select name="mediaType"><option value="3d">Animação 3D</option><option value="video">Vídeo</option><option value="image">Imagem</option></select></label></div><label class="field"><span>Arquivo 3D, vídeo ou imagem (URL)</span><input name="mediaUrl" placeholder="/models/exercises/exercicio.glb"></label><label class="field"><span>Nome da animação 3D</span><input name="animationClip" placeholder="Ex.: Squat"></label>`
  body.append(...extra.children)
  name.addEventListener('change', () => {
    const item = exerciseCatalog.find((entry) => entry.name === name.value)
    if (!item) return
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
  dialog.innerHTML = `<form method="dialog" data-access-form><header><div><span class="eyebrow eyebrow--blue">Plano e pagamento</span><h2>Liberar acesso do aluno</h2></div><button class="icon-button" type="button" data-access-close aria-label="Fechar">×</button></header><div class="modal-body"><p data-access-student></p><label class="field"><span>Plano</span><select name="planCode"><option value="ready">Treinos Prontos — permanente</option><option value="basic">Consultoria Básica</option><option value="premium">Consultoria Premium</option><option value="athlete">Performance Atleta</option></select></label><label class="field" data-access-billing-field><span>Período</span><select name="billingCycle"><option value="monthly">Mensal — 30 dias</option><option value="quarterly">Trimestral — 90 dias, recomendado</option><option value="semiannual">Semestral — 180 dias</option></select></label><div class="field-grid"><label class="field"><span>Situação</span><select name="accessStatus"><option value="active">Liberar acesso</option><option value="pending">Aguardando</option><option value="paused">Pausar</option><option value="cancelled">Cancelar</option></select></label><label class="field"><span>Pagamento</span><select name="paymentStatus"><option value="paid">Confirmado</option><option value="pending">Pendente</option><option value="refunded">Estornado</option></select></label></div><label class="field"><span>Forma de pagamento</span><select name="paymentMethod"><option value="whatsapp">WhatsApp / pessoalmente</option><option value="pix">PIX manual</option><option value="cash">Dinheiro</option><option value="webapp">WebApp</option></select></label><label class="field"><span>Validade personalizada (opcional)</span><input name="expiresAt" type="date"></label><p class="password-requirements">A validade é calculada pelo período: 30, 90 ou 180 dias. Treinos Prontos não expiram.</p><p role="status"></p></div><footer><button class="button button--secondary" type="button" data-access-close>Cancelar</button><button class="button button--primary" type="submit">Salvar acesso</button></footer></form>`
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
    form.elements.billingCycle.value = ['monthly', 'quarterly', 'semiannual'].includes(
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
  enhanceAssessment()
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
