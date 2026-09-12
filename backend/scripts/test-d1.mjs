import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { withDb } from '../src/lib/db.js'
import { createResource, updateResource, deleteResource } from '../src/routes/resources.js'
import { dashboard } from '../src/routes/dashboard.js'
import { studentRecovery } from '../src/routes/student-recovery.js'

// SQLite contract check; the live Wrangler registration test covers D1 itself.
const sqlite = new DatabaseSync(':memory:')
for (const file of [
  '001_initial.sql',
  '002_student_accounts.sql',
  '003_password_recovery.sql',
  '004_physical_assessment.sql',
]) {
  sqlite.exec(readFileSync(new URL(`../migrations-d1/${file}`, import.meta.url), 'utf8'))
}
const binding = {
  prepare(sql) {
    let values = []
    return {
      bind(...args) {
        values = args
        return this
      },
      all() {
        return { results: sqlite.prepare(sql).all(...values) }
      },
    }
  },
  batch(statements) {
    sqlite.exec('BEGIN')
    try {
      const results = statements.map((s) => s.all())
      sqlite.exec('COMMIT')
      return results
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  },
}
await withDb({ DB: binding }, async (db) => {
  const trainer = (
    await db.query(
      'INSERT INTO trainers (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id',
      ['Coach', 'coach@example.invalid', 'hash'],
    )
  ).rows[0]
  const other = (
    await db.query(
      'INSERT INTO trainers (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id',
      ['Outro', 'other@example.invalid', 'hash'],
    )
  ).rows[0]
  const student = await createResource(db, 'students', trainer.id, {
    name: 'Aluno',
    email: 'student@example.invalid',
    goal: 'Força',
  })
  await createResource(db, 'exercises', trainer.id, {
    name: 'Agachamento',
    group: 'Pernas',
    equipment: 'Barra',
  })
  const workout = await createResource(db, 'workouts', trainer.id, {
    student: 'Aluno',
    name: 'Treino A',
    goal: 'Força',
    duration: '4 semanas',
  })
  await createResource(db, 'assessments', trainer.id, {
    student: 'Aluno',
    weight: 80,
    fat: 18,
    waist: 85,
  })
  const data = await dashboard(db, trainer.id)
  assert.equal(data.students[0].workout, 'Treino A')
  assert.equal(data.assessments.length, 1)
  assert.equal(data.exercises.length, 1)
  assert.equal((await dashboard(db, other.id)).students.length, 0)
  assert.equal(
    await updateResource(db, 'students', other.id, student.id, {
      name: 'Bad',
      email: 'bad@example.invalid',
      goal: 'Força',
    }),
    undefined,
  )
  await updateResource(db, 'workouts', trainer.id, workout.id, {
    student: 'Aluno',
    name: 'Treino B',
    goal: 'Força',
    duration: '8 semanas',
  })
  assert.equal((await dashboard(db, trainer.id)).workouts[0].name, 'Treino B')
  await deleteResource(db, 'workouts', trainer.id, workout.id)
  assert.equal((await dashboard(db, trainer.id)).workouts.length, 0)
  const account = (
    await db.query(
      'INSERT INTO student_accounts (name,email,password_hash) VALUES ($1,$2,$3) RETURNING id',
      ['Conta', 'account@example.invalid', 'hash'],
    )
  ).rows[0]
  let mail
  const env = {
    PUBLIC_SITE_URL: 'https://example.invalid',
    PASSWORD_MAILER: {
      fetch: async (_url, options) => {
        mail = JSON.parse(options.body)
        return new Response(null, { status: 202 })
      },
    },
  }
  const req = (body) =>
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  await studentRecovery(req({ email: 'account@example.invalid' }), env, db, 'forgot')
  assert.ok(mail)
  const token = mail.text.match(/token=([a-f0-9]{64})/u)[1]
  const reset = await studentRecovery(req({ token, password: 'Nova@Senha2026' }), env, db, 'reset')
  assert.match(reset.data.message, /Senha alterada/u)
  assert.equal(
    (await db.query('SELECT auth_version FROM student_accounts WHERE id=$1', [account.id])).rows[0]
      .auth_version,
    1,
  )
  assert.equal(
    (await studentRecovery(req({ token, password: 'Nova@Senha2026' }), env, db, 'reset')).status,
    400,
  )
  assert.equal((await db.query('SELECT * FROM student_password_resets')).rows.length, 0)

  await db.query('INSERT INTO student_accounts (name,email,password_hash) VALUES ($1,$2,$3)', [
    'Conta Resend',
    'resend@example.invalid',
    'hash',
  ])
  let resendRequest
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    resendRequest = { url, options }
    return new Response(JSON.stringify({ id: 'email-id' }), { status: 200 })
  }
  try {
    await studentRecovery(
      req({ email: 'resend@example.invalid' }),
      {
        PUBLIC_SITE_URL: 'https://example.invalid',
        RESEND_API_KEY: 're_test',
        RESEND_FROM_EMAIL: 'FRS Coach <coach@example.invalid>',
      },
      db,
      'forgot',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(resendRequest.url, 'https://api.resend.com/emails')
  assert.equal(resendRequest.options.headers.Authorization, 'Bearer re_test')
  assert.equal(JSON.parse(resendRequest.options.body).to[0], 'resend@example.invalid')
})
sqlite.close()
console.log('D1 SQL: migrations, CRUD, ownership, dashboard and password reset batch passed.')
