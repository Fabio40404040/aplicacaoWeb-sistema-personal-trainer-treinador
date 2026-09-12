import { readJson } from '../lib/http.js'
import { createSession, hashPassword, isStrongPassword, verifyPassword } from '../lib/session.js'

export async function studentAuth(request, env, db, action) {
  const body = await readJson(request)
  const { email, password, name } = body || {}
  if (
    typeof email !== 'string' ||
    email.length > 180 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length > 128 ||
    password.length < 8
  ) {
    return { error: 'Informe um e-mail válido e uma senha de 8 a 128 caracteres.', status: 400 }
  }
  let account
  if (action === 'register') {
    if (!isStrongPassword(password))
      return {
        error:
          'A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.',
        status: 400,
      }
    if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 140)
      return { error: 'Informe seu nome completo.', status: 400 }
    const result = await db.query(
      'INSERT INTO student_accounts (name, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id, name, email',
      [name.trim(), email.trim().toLowerCase(), await hashPassword(password)],
    )
    account = result.rows[0]
    if (!account)
      return {
        error: 'Não foi possível cadastrar este e-mail. Tente entrar na sua conta.',
        status: 409,
      }
  } else {
    const result = await db.query(
      'SELECT id, name, email, password_hash, auth_version FROM student_accounts WHERE lower(email) = lower($1) LIMIT 1',
      [email.trim()],
    )
    account = result.rows[0]
    if (!account || !(await verifyPassword(password, account.password_hash)))
      return { error: 'E-mail ou senha incorretos.', status: 401 }
  }
  return {
    data: {
      token: await createSession(account, env, 'student'),
      user: { id: account.id, name: account.name, email: account.email },
    },
    status: action === 'register' ? 201 : 200,
  }
}
