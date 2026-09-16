export function hasRecoveryEmailProvider(env) {
  return Boolean((env.BREVO_API_KEY && env.BREVO_FROM_EMAIL) || env.PASSWORD_MAILER)
}

export async function sendRecoveryEmail(env, message, idempotencyKey) {
  if (env.BREVO_API_KEY && env.BREVO_FROM_EMAIL) {
    return fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: env.BREVO_FROM_NAME || 'FRS Personal Trainer',
          email: env.BREVO_FROM_EMAIL,
        },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        tags: ['password-reset'],
        headers: { 'X-FRS-Reset-ID': idempotencyKey },
        ...(env.BREVO_REPLY_TO ? { replyTo: { email: env.BREVO_REPLY_TO } } : {}),
      }),
    })
  }
  if (env.PASSWORD_MAILER)
    return env.PASSWORD_MAILER.fetch('https://mailer.internal/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  return null
}
