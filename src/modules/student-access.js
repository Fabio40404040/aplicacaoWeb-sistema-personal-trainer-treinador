import { createWhatsappUrl } from './whatsapp.js'
import { downloadWorkoutPdf } from './workout-pdf.js'
import { openSecureCardForm } from './mercado-pago-card.js'

const TOKEN_KEY = 'frs-student-token'
const API_URL = import.meta.env.VITE_API_URL || ''
async function studentRequest(path, data) {
  const token = sessionStorage.getItem(TOKEN_KEY)
  let response
  try {
    response = await fetch(`${API_URL}/api/student/${path}`, {
      method: data ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    })
  } catch {
    throw new Error('Não foi possível conectar ao serviço de contas. Tente novamente mais tarde.')
  }
  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('O serviço de contas está indisponível. Tente novamente mais tarde.')
  }
  if (!response.ok) throw new Error(result?.error || 'Não foi possível acessar sua conta.')
  return result
}
const element = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
function article(title) {
  const card = element('article')
  card.append(element('h2', '', title))
  return card
}
function addLine(parent, text, strong = false) {
  parent.append(element(strong ? 'strong' : 'p', '', text))
}
const billingCycleLabels = {
  monthly: 'Plano mensal · 30 dias',
  quarterly: 'Plano trimestral · 90 dias',
  semiannual: 'Plano semestral · 180 dias',
  permanent: 'Acesso permanente',
}
function billingCycleLabel(access) {
  return billingCycleLabels[access.billingCycle] || ''
}
function renderLocked(container, data, refresh) {
  const plan = article('Plano e acesso')
  addLine(plan, data.access.planName, true)
  if (billingCycleLabel(data.access)) addLine(plan, billingCycleLabel(data.access))
  const messages = {
    pending: 'Aguardando a confirmação do pagamento e a liberação do personal.',
    paused: 'Seu acesso está pausado. Fale com o personal.',
    cancelled: 'Seu acesso foi cancelado. Fale com o personal.',
  }
  addLine(plan, messages[data.access.status] || 'Aguardando liberação.')
  const whatsapp = element('a', 'button button--secondary', 'Continuar pelo WhatsApp')
  whatsapp.href = createWhatsappUrl({ name: data.name, planName: data.access.planName })
  whatsapp.target = '_blank'
  whatsapp.rel = 'noreferrer'
  plan.append(whatsapp)
  if (data.access.paymentStatus === 'pending') {
    const updateNote = element(
      'p',
      'student-payment-update-note',
      'Já concluiu o pagamento? Atualize a página ou toque abaixo para confirmar a liberação.',
    )
    const updateButton = element(
      'button',
      'button button--secondary',
      'Atualizar situação do pagamento',
    )
    updateButton.type = 'button'
    updateButton.addEventListener('click', async () => {
      updateButton.disabled = true
      updateButton.textContent = 'Consultando o Mercado Pago…'
      await refresh()
    })
    plan.append(updateNote, updateButton)
  }
  container.replaceChildren(plan)
  const payment = article('Pagamento online')
  addLine(
    payment,
    'Pague por PIX ou cartão. Após a confirmação, o acesso será liberado automaticamente.',
  )
  const actions = element('div', 'student-payment-actions')
  const status = element('p', 'student-payment-status')
  ;[
    ['pix', 'Pagar com PIX'],
    ['credit_card', 'Pagar com cartão de crédito'],
  ].forEach(([method, label]) => {
    const button = element('button', 'button button--primary', label)
    button.type = 'button'
    button.addEventListener('click', async () => {
      button.disabled = true
      status.textContent =
        method === 'credit_card'
          ? 'Abrindo o formulário seguro do cartão…'
          : 'Abrindo o pagamento seguro…'
      try {
        if (method === 'credit_card') {
          await openSecureCardForm(studentRequest, { onApproved: refresh })
          status.textContent = ''
          button.disabled = false
          return
        }
        const result = await studentRequest('payments/checkout', { method })
        location.href = result.checkoutUrl
      } catch (error) {
        status.textContent = error.message
        button.disabled = false
      }
    })
    actions.append(button)
  })
  payment.append(actions, status)
  container.append(payment)
  ;['Ficha de treino', 'Exercícios', 'Avaliação física', 'Progresso', 'Check-in semanal'].forEach(
    (title) => {
      const card = article(title)
      addLine(card, 'Será liberado conforme o seu plano.')
      container.append(card)
    },
  )
}
function renderPortal(container, data) {
  const plan = article('Meu plano')
  addLine(plan, data.access.planName, true)
  if (billingCycleLabel(data.access)) addLine(plan, billingCycleLabel(data.access))
  addLine(
    plan,
    data.access.accessType === 'permanent'
      ? 'Acesso permanente.'
      : `Acesso até ${new Intl.DateTimeFormat('pt-BR').format(new Date(data.access.expiresAt))}.`,
  )
  container.replaceChildren(plan)
  const workouts = article('Ficha de treino e exercícios')
  if (!data.workouts.length) addLine(workouts, 'Nenhuma ficha foi publicada pelo personal.')
  data.workouts.forEach((workout) => {
    const workoutBlock = element('section', 'student-workout')
    addLine(workoutBlock, `${workout.name} · ${workout.goal} · ${workout.duration}`, true)
    const download = element('button', 'button button--secondary', 'Baixar ficha em PDF')
    download.type = 'button'
    download.addEventListener('click', () => downloadWorkoutPdf(workout, data.name))
    workoutBlock.append(download)
    if (!workout.exercises.length)
      addLine(workoutBlock, 'O personal ainda não adicionou exercícios.')
    if (!workout.exercises.length) {
      const library = element(
        'div',
        'exercise-3d-pending',
        'Biblioteca de animações 3D em preparação. Os exercícios aparecerão aqui quando forem cadastrados.',
      )
      workoutBlock.append(library)
    }
    const list = element('ol')
    workout.exercises.forEach((exercise) => {
      const item = element('li')
      const prescription = `${exercise.sets} × ${exercise.repetitions}${exercise.restSeconds ? ` · descanso ${exercise.restSeconds}s` : ''}`
      addLine(item, `${exercise.name} — ${prescription}`, true)
      addLine(item, exercise.instructions || 'Siga a orientação do personal.')
      if (exercise.mediaUrl) {
        const media = element(
          'a',
          '',
          exercise.mediaType === '3d' ? 'Abrir demonstração 3D' : 'Abrir demonstração',
        )
        media.href = exercise.mediaUrl
        media.target = '_blank'
        media.rel = 'noreferrer'
        item.append(media)
      } else {
        const pending3d = element('span', 'exercise-3d-pending', 'Animação 3D em preparação')
        item.append(pending3d)
      }
      list.append(item)
    })
    workoutBlock.append(list)
    workouts.append(workoutBlock)
  })
  container.append(workouts)
  if (data.access.features.includes('assessments')) {
    const assessmentCard = article('Avaliação física')
    if (!data.assessments.length) addLine(assessmentCard, 'Nenhuma avaliação foi publicada.')
    data.assessments.forEach((a) =>
      addLine(
        assessmentCard,
        `${a.protocol} · ${new Intl.DateTimeFormat('pt-BR').format(new Date(a.assessedAt))} · ${a.weightKg} kg · IMC ${a.bmi || '—'} · gordura ${a.bodyFatPercent ?? '—'}%`,
      ),
    )
    container.append(assessmentCard)
  }
  if (data.access.features.includes('progress')) {
    const progress = article('Progresso')
    if (data.assessments.length < 2)
      addLine(progress, 'O progresso aparecerá após a próxima reavaliação.')
    else {
      const latest = data.assessments[0],
        oldest = data.assessments.at(-1),
        change = (Number(latest.weightKg) - Number(oldest.weightKg)).toFixed(1)
      addLine(progress, `Variação de peso entre avaliações: ${change} kg.`)
    }
    container.append(progress)
  }
  if (data.access.features.includes('checkins')) {
    const checkin = article('Check-in semanal')
    const form = element('form')
    form.dataset.checkinForm = ''
    form.innerHTML = `<label class="field"><span>Energia (1 a 5)</span><input name="energy" type="number" min="1" max="5" required></label><label class="field"><span>Qualidade do sono (1 a 5)</span><input name="sleep" type="number" min="1" max="5" required></label><label class="field"><span>Dor ou desconforto</span><input name="pain" maxlength="200"></label><label class="field"><span>Como foi sua semana?</span><textarea name="notes" rows="3" maxlength="1000"></textarea></label><button class="button button--primary" type="submit">Enviar check-in</button><p role="status"></p>`
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const status = form.querySelector('[role="status"]')
      try {
        await studentRequest('checkins', Object.fromEntries(new FormData(form)))
        form.reset()
        status.textContent = 'Check-in enviado ao personal.'
      } catch (error) {
        status.textContent = error.message
      }
    })
    checkin.append(form)
    if (data.checkins.length)
      addLine(
        checkin,
        `Último envio: ${new Intl.DateTimeFormat('pt-BR').format(new Date(data.checkins[0].createdAt))}.`,
      )
    container.append(checkin)
  }
  const unavailable = [
    ['assessments', 'Avaliação física', 'Disponível a partir da Consultoria Básica.'],
    ['progress', 'Progresso', 'Disponível a partir da Consultoria Básica.'],
    ['checkins', 'Check-in semanal', 'Disponível nos planos Premium e Atleta.'],
  ]
  unavailable
    .filter(([feature]) => !data.access.features.includes(feature))
    .forEach(([, title, message]) => {
      const locked = article(`🔒 ${title}`)
      locked.classList.add('student-feature-locked')
      addLine(locked, message)
      addLine(
        locked,
        'O recurso permanece visível para você conhecer as opções de evolução do plano.',
      )
      container.append(locked)
    })
}
function applyPlanFromHash() {
  const select = document.querySelector('[data-student-form="register"] [name="planCode"]')
  if (!select) return
  const plan = new URLSearchParams(location.hash.split('?')[1] || '').get('plan')
  if ([...select.options].some((o) => o.value === plan)) {
    select.value = plan
    select.dispatchEvent(new Event('change'))
  }
}
export function initStudentAccess() {
  let generation = 0
  async function loadPanel() {
    applyPlanFromHash()
    const current = ++generation
    if (location.hash.split('?')[0] !== '#painel-aluno') return
    const status = document.querySelector('[data-student-panel-status]'),
      container = document.querySelector('.student-access-features')
    document.querySelector('[data-student-name]').textContent = 'Área do Aluno'
    status.textContent = 'Carregando seu acompanhamento…'
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      location.hash = '#entrar-aluno'
      return
    }
    try {
      const data = await studentRequest('me')
      if (current !== generation) return
      document.querySelector('[data-student-name]').textContent = `Olá, ${data.name}`
      const paymentMessage = sessionStorage.getItem('frs-student-payment-message')
      if (paymentMessage) {
        sessionStorage.removeItem('frs-student-payment-message')
        status.textContent = `Sua conta foi criada. ${paymentMessage}`
      } else {
        status.textContent = data.access.active
          ? 'Seu acompanhamento está ativo e sincronizado com o personal.'
          : data.access.paymentStatus === 'pending'
            ? 'Cadastro recebido. Se você já pagou, atualize a página para confirmar o pagamento e liberar o acesso.'
            : 'Seu acompanhamento está aguardando liberação.'
      }
      if (data.access.active) renderPortal(container, data)
      else renderLocked(container, data, loadPanel)
    } catch (error) {
      if (current === generation) status.textContent = error.message
    }
  }
  document.querySelectorAll('[data-student-form]').forEach((form) =>
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      if (!form.reportValidity()) return
      const status = form.querySelector('[role="status"]'),
        button = form.querySelector('[type="submit"]'),
        label = button.textContent.trim()
      button.disabled = true
      status.textContent = 'Aguarde…'
      try {
        const data = Object.fromEntries(new FormData(form)),
          action = form.dataset.studentForm
        if (action === 'reset')
          data.token = new URLSearchParams(location.hash.split('?')[1] || '').get('token')
        const result = await studentRequest(`auth/${action}`, data)
        if (['forgot', 'reset'].includes(action)) {
          form.reset()
          status.textContent = result.message
          if (action === 'reset') {
            sessionStorage.removeItem(TOKEN_KEY)
            history.replaceState(null, '', '#nova-senha')
          }
          return
        }
        if (!result?.token) throw new Error('O servidor não retornou uma sessão válida.')
        sessionStorage.setItem(TOKEN_KEY, result.token)
        if (action === 'register' && data.paymentChannel === 'credit_card') {
          status.textContent = 'Abrindo o formulário seguro do cartão…'
          form.reset()
          location.hash = '#painel-aluno'
          try {
            await openSecureCardForm(studentRequest, { onApproved: loadPanel })
            return
          } catch (error) {
            sessionStorage.setItem('frs-student-payment-message', error.message)
            await loadPanel()
            return
          }
        }
        form.reset()
        status.textContent = ''
        location.hash = '#painel-aluno'
      } catch (error) {
        status.textContent = error.message
      } finally {
        button.disabled = false
        button.textContent = label
      }
    }),
  )
  document.querySelector('[data-student-logout]').addEventListener('click', () => {
    generation++
    sessionStorage.removeItem(TOKEN_KEY)
    document.querySelector('[data-student-name]').textContent = 'Área do Aluno'
    location.hash = '#entrar-aluno'
  })
  window.addEventListener('hashchange', loadPanel)
  window.addEventListener('focus', loadPanel)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadPanel()
  })
  window.setInterval(() => {
    if (!document.hidden && location.hash.split('?')[0] === '#painel-aluno') loadPanel()
  }, 30000)
  loadPanel()
}
