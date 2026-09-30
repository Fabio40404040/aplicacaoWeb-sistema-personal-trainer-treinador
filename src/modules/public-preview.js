// "Ver prévia" do plano Treinos Prontos no site: mostra o treino pronto que o
// personal marcou como prévia no painel (Treinos Prontos → "Usar como prévia
// do site"). Sem prévia marcada, o botão fica escondido.
import { showWorkoutPdfPreview } from './workout-pdf.js'

const API_URL = import.meta.env.VITE_API_URL || ''

async function loadPreview() {
  const response = await fetch(`${API_URL}/api/public/ready-preview`, { cache: 'no-store' })
  if (!response.ok) return null
  const program = await response.json()
  if (!program) return null
  try {
    program.exercises = JSON.parse(program.exercisePrescriptionsJson || '[]')
  } catch {
    program.exercises = []
  }
  return program.exercises.length ? program : null
}

async function loadFrame(id) {
  const response = await fetch(`${API_URL}/api/public/exercise-gifs/${id}/frame`)
  if (!response.ok) return null
  return new Uint8Array(await response.arrayBuffer())
}

export function initPublicPreview() {
  const button = document.querySelector('[data-ready-preview]')
  if (!button) return
  let program = null
  loadPreview()
    .then((result) => {
      program = result
      button.hidden = !program
    })
    .catch(() => {
      button.hidden = true
    })
  button.addEventListener('click', async (event) => {
    event.preventDefault()
    if (!program) return
    const label = button.textContent
    button.textContent = 'Abrindo…'
    button.setAttribute('aria-busy', 'true')
    try {
      await showWorkoutPdfPreview({ ...program, readyProgram: true }, 'Prévia', loadFrame)
    } catch {
      button.textContent = 'Prévia indisponível'
      window.setTimeout(() => (button.textContent = label), 2500)
      return
    } finally {
      button.removeAttribute('aria-busy')
    }
    button.textContent = label
  })
}
