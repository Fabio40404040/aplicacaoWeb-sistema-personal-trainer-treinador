import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = new Set()
let stopping = false

function run(args) {
  const child = spawn(npmCommand, args, {
    cwd: projectDirectory,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

function waitFor(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`Processo encerrado (${signal || `código ${code}`}).`))
    })
  })
}

function ensurePortAvailable(port, service) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `A porta ${port} (${service}) já está em uso. Encerre a execução anterior do projeto antes de usar npm run dev novamente.`,
          ),
        )
      } else reject(error)
    })
    server.listen(port, '127.0.0.1', () => server.close(resolve))
  })
}

function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error.message)
    }
  }
  setTimeout(() => process.exit(exitCode), 250)
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

try {
  await ensurePortAvailable(5173, 'site')
  await ensurePortAvailable(8787, 'API')
  console.log('\nPreparando o banco de dados local...\n')
  await waitFor(run(['run', 'db:migrate:local']))

  const siteUrl = 'http://localhost:5173'
  console.log(`\nIniciando API e site em ${siteUrl}...\n`)
  const backend = run([
    '--prefix',
    'backend',
    'run',
    'dev',
    '--',
    '--var',
    `PUBLIC_SITE_URL:${siteUrl}`,
  ])
  const frontend = run(['run', 'dev:frontend'])

  for (const child of [backend, frontend]) {
    child.once('error', (error) => {
      console.error(error.message)
      stop(1)
    })
    child.once('exit', (code, signal) => {
      if (!stopping) {
        const expectedStop = code === 0 || ['SIGINT', 'SIGTERM'].includes(signal)
        if (!expectedStop)
          console.error(`\nUm serviço foi encerrado (${signal || `código ${code}`}).`)
        stop(expectedStop ? 0 : code || 1)
      }
    })
  }
} catch (error) {
  console.error(`\nNão foi possível iniciar o projeto: ${error.message}`)
  stop(1)
}
