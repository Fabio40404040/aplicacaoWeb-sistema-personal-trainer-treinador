import { withDb } from './lib/db.js'
import { corsHeaders, json, readJson } from './lib/http.js'
import { readSession } from './lib/session.js'
import { login } from './routes/auth.js'
import { personalRecovery } from './routes/personal-recovery.js'
import { studentAuth } from './routes/student-auth.js'
import { studentRecovery } from './routes/student-recovery.js'
import { dashboard } from './routes/dashboard.js'
import { createResource, deleteResource, listResource, updateResource } from './routes/resources.js'
import { paymentWebhook, updateStudentAccess } from './routes/access.js'
import { requestPlan, studentPortal, submitCheckin } from './routes/student-portal.js'

async function handle(request, env) {
  const url = new URL(request.url)
  const segments = url.pathname
    .replace(/^\/api\/?/u, '')
    .split('/')
    .filter(Boolean)
  const route = segments.join('/')
  if (request.method === 'POST' && route === 'payments/webhook')
    return withDb(env, (db) => paymentWebhook(request, env, db))
  if (request.method === 'POST' && ['student/auth/forgot', 'student/auth/reset'].includes(route))
    return withDb(env, (db) => studentRecovery(request, env, db, segments[2]))
  if (request.method === 'POST' && ['auth/forgot', 'auth/reset'].includes(route))
    return withDb(env, (db) => personalRecovery(request, env, db, segments[1]))
  if (request.method === 'POST' && route === 'auth/login')
    return withDb(env, (db) => login(request, env, db))
  if (request.method === 'POST' && ['student/auth/login', 'student/auth/register'].includes(route))
    return withDb(env, (db) => studentAuth(request, env, db, segments[2]))

  const session = await readSession(request, env)
  if (!session) return { error: 'Sessão inválida ou expirada.', status: 401 }
  if (segments[0] === 'student') {
    if (session.role !== 'student') return { error: 'Use sua conta de aluno.', status: 403 }
    return withDb(env, async (db) => {
      if (request.method === 'GET' && route === 'student/me') {
        const data = await studentPortal(db, session.sub, session.version)
        return data ? { data } : { error: 'Conta não encontrada.', status: 401 }
      }
      if (request.method === 'POST' && route === 'student/checkins')
        return submitCheckin(db, session.sub, await readJson(request))
      if (request.method === 'POST' && route === 'student/plan-request')
        return requestPlan(db, session.sub, await readJson(request))
      return { error: 'Rota não encontrada.', status: 404 }
    })
  }
  if (session.role !== 'coach')
    return { error: 'Acesso exclusivo do personal trainer.', status: 403 }

  return withDb(env, async (db) => {
    const trainer = await db.query(
      'SELECT id FROM trainers WHERE id=$1 AND auth_version=$2 LIMIT 1',
      [session.sub, session.version || 0],
    )
    if (!trainer.rows.length) return { error: 'Sessão inválida ou expirada.', status: 401 }
    if (request.method === 'GET' && segments[0] === 'dashboard')
      return { data: await dashboard(db, session.sub) }
    if (request.method === 'PUT' && segments[0] === 'students' && segments[2] === 'access')
      return updateStudentAccess(db, session.sub, segments[1], await readJson(request))
    const [resource, id] = segments
    if (request.method === 'GET' && !id)
      return { data: await listResource(db, resource, session.sub) }
    if (request.method === 'POST' && !id)
      return {
        data: await createResource(db, resource, session.sub, await readJson(request)),
        status: 201,
      }
    if (request.method === 'PUT' && id)
      return { data: await updateResource(db, resource, session.sub, id, await readJson(request)) }
    if (request.method === 'DELETE' && id) {
      await deleteResource(db, resource, session.sub, id)
      return { data: null, status: 204 }
    }
    return { error: 'Rota não encontrada.', status: 404 }
  })
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    try {
      const result = await handle(request, env)
      if (result?.error) return json({ error: result.error }, result.status || 400, cors)
      return json(result?.data ?? null, result?.status || 200, cors)
    } catch (error) {
      console.error(error)
      return json({ error: 'Não foi possível concluir a solicitação.' }, 500, cors)
    }
  },
}
