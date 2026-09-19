const BILLING_CYCLES = {
  monthly: { days: 30, months: 1, discount: 1 },
  quarterly: { days: 90, months: 3, discount: 0.95 },
  semiannual: { days: 180, months: 6, discount: 0.9 },
}

function amountFor(plan, billingCycle) {
  if (plan.accessType === 'permanent') return Number(plan.priceCents)
  const cycle = BILLING_CYCLES[billingCycle] || BILLING_CYCLES.quarterly
  return Math.round(Number(plan.priceCents) * cycle.months * cycle.discount)
}

function expiryFor(plan, billingCycle) {
  if (plan.accessType === 'permanent') return null
  const result = new Date()
  result.setUTCDate(result.getUTCDate() + (BILLING_CYCLES[billingCycle]?.days || 30))
  return result.toISOString()
}

async function mercadoPago(path, env, options = {}) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN)
    throw new Error('O Mercado Pago ainda não foi configurado pelo personal.')
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('Mercado Pago:', response.status, data)
    throw new Error('Não foi possível iniciar o pagamento. Tente novamente.')
  }
  return data
}

function checkoutSettings(method) {
  if (method === 'pix') {
    return {
      default_payment_method_id: 'pix',
      installments: 1,
      excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }],
    }
  }
  return {
    installments: 12,
    excluded_payment_types: [{ id: 'bank_transfer' }, { id: 'ticket' }],
  }
}

export async function createCheckout(db, accountId, env, body) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN)
    return { error: 'Pagamento online aguardando configuração do Mercado Pago.', status: 503 }
  const method =
    body?.method === 'pix' ? 'pix' : body?.method === 'credit_card' ? 'credit_card' : null
  if (!method) return { error: 'Escolha PIX ou cartão de crédito.', status: 400 }
  const row = (
    await db.query(
      `SELECT s.id AS "studentId", s.trainer_id AS "trainerId", s.plan_code AS "planCode",
       s.billing_cycle AS "billingCycle", a.name, a.email, p.name AS "planName",
       p.price_cents AS "priceCents", p.access_type AS "accessType"
       FROM student_accounts a JOIN students s ON s.id=a.student_id
       JOIN plans p ON p.code=s.plan_code WHERE a.id=$1 AND p.active=1 LIMIT 1`,
      [accountId],
    )
  ).rows[0]
  if (!row) return { error: 'Plano ou cadastro não encontrado.', status: 404 }
  if (row.accessType !== 'permanent' && !BILLING_CYCLES[row.billingCycle])
    row.billingCycle = 'quarterly'
  const amountCents = amountFor(row, row.billingCycle)
  const intentId = crypto.randomUUID().replaceAll('-', '')
  await db.query(
    `INSERT INTO payment_intents (id,trainer_id,student_id,plan_code,billing_cycle,amount_cents,method)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [intentId, row.trainerId, row.studentId, row.planCode, row.billingCycle, amountCents, method],
  )
  const siteUrl = String(env.PUBLIC_SITE_URL || '').replace(/\/$/u, '')
  const apiUrl = String(
    env.PUBLIC_API_URL || 'https://frs-coach-api.fabioribeirodev.workers.dev',
  ).replace(/\/$/u, '')
  try {
    const preference = await mercadoPago('/checkout/preferences', env, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': intentId },
      body: JSON.stringify({
        items: [
          {
            id: row.planCode,
            title: `${row.planName} — FRS Personal`,
            description:
              row.accessType === 'permanent' ? 'Acesso permanente' : `Plano ${row.billingCycle}`,
            currency_id: 'BRL',
            quantity: 1,
            unit_price: amountCents / 100,
          },
        ],
        payer: { name: row.name, email: row.email },
        payment_methods: checkoutSettings(method),
        external_reference: intentId,
        notification_url: `${apiUrl}/api/payments/mercadopago/webhook`,
        back_urls: {
          success: `${siteUrl}/?payment=success#painel-aluno`,
          pending: `${siteUrl}/?payment=pending#painel-aluno`,
          failure: `${siteUrl}/?payment=failure#painel-aluno`,
        },
        auto_return: 'approved',
        statement_descriptor: 'FRS PERSONAL',
        metadata: { intent_id: intentId, student_id: row.studentId, plan_code: row.planCode },
      }),
    })
    await db.query(
      `UPDATE payment_intents SET provider_reference=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [intentId, preference.id],
    )
    return { data: { checkoutUrl: preference.init_point, intentId } }
  } catch (error) {
    await db.query(
      `UPDATE payment_intents SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [intentId],
    )
    return { error: error.message, status: 502 }
  }
}

function signatureParts(value) {
  return Object.fromEntries(
    String(value || '')
      .split(',')
      .map((part) => part.trim().split('=', 2))
      .filter(([key, item]) => key && item),
  )
}

async function validSignature(request, env, dataId) {
  if (!env.MERCADO_PAGO_WEBHOOK_SECRET) return false
  const parts = signatureParts(request.headers.get('x-signature'))
  const requestId = request.headers.get('x-request-id') || ''
  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.MERCADO_PAGO_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest))
  const expected = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  if (expected.length !== parts.v1.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1)
    difference |= expected.charCodeAt(index) ^ parts.v1.charCodeAt(index)
  return difference === 0
}

export async function mercadoPagoWebhook(request, env, db) {
  const url = new URL(request.url)
  const body = await request.json().catch(() => ({}))
  const paymentId = String(url.searchParams.get('data.id') || body?.data?.id || '')
  if (!/^\d{1,30}$/u.test(paymentId)) return { error: 'Notificação inválida.', status: 400 }
  if (!(await validSignature(request, env, paymentId)))
    return { error: 'Assinatura do pagamento inválida.', status: 401 }
  const payment = await mercadoPago(`/v1/payments/${paymentId}`, env)
  const intent = (
    await db.query(
      `SELECT i.*, p.access_type AS "accessType" FROM payment_intents i
       JOIN plans p ON p.code=i.plan_code WHERE i.id=$1 LIMIT 1`,
      [String(payment.external_reference || '')],
    )
  ).rows[0]
  if (!intent) return { error: 'Cobrança não encontrada.', status: 404 }
  if (payment.status !== 'approved') {
    await db.query(
      `UPDATE payment_intents SET status=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [intent.id, String(payment.status || 'pending')],
    )
    return { data: { accepted: true } }
  }
  if (
    payment.currency_id !== 'BRL' ||
    Math.round(Number(payment.transaction_amount) * 100) !== Number(intent.amount_cents)
  )
    return { error: 'Valor da cobrança não confere.', status: 400 }
  const expiresAt = expiryFor(intent, intent.billing_cycle)
  await db.batch([
    {
      sql: `UPDATE payment_intents SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      values: [intent.id],
    },
    {
      sql: `UPDATE students SET plan_code=$2,access_type=$3,billing_cycle=$4,access_status='active',access_expires_at=$5,
       payment_status='paid',payment_method=$6,authorized_at=CURRENT_TIMESTAMP,status='Ativo',updated_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      values: [
        intent.student_id,
        intent.plan_code,
        intent.accessType,
        intent.billing_cycle,
        expiresAt,
        payment.payment_type_id === 'credit_card' ? 'credit_card' : 'pix',
      ],
    },
    {
      sql: `INSERT INTO payments (trainer_id,student_id,plan_code,amount_cents,status,method,provider,provider_reference,paid_at,billing_cycle)
       VALUES ($1,$2,$3,$4,'paid',$5,'mercadopago',$6,CURRENT_TIMESTAMP,$7)
       ON CONFLICT(provider_reference) DO NOTHING`,
      values: [
        intent.trainer_id,
        intent.student_id,
        intent.plan_code,
        intent.amount_cents,
        payment.payment_type_id === 'credit_card' ? 'credit_card' : 'pix',
        paymentId,
        intent.billing_cycle,
      ],
    },
    {
      sql: `INSERT INTO access_history (trainer_id,student_id,action,plan_code,details)
       VALUES ($1,$2,'payment_confirmed',$3,$4)`,
      values: [intent.trainer_id, intent.student_id, intent.plan_code, `mercadopago:${paymentId}`],
    },
  ])
  return { data: { accepted: true } }
}
