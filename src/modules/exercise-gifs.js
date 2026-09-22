import { getData } from './state.js'
import { showToast } from './utils.js'
import {
  deleteExerciseGif,
  forgetExerciseGif,
  loadExerciseGif,
  syncRemoteData,
  uploadExerciseGif,
} from './api-client.js'

// Grupos que a Biblioteca mostra dentro da pasta "Pernas".
const LEG_GROUPS = [
  'Glúteos',
  'Quadríceps',
  'Posteriores de coxa',
  'Panturrilhas',
  'Pernas',
]

// A pasta de origem do arquivo define o grupo muscular do GIF.
// Ex.: "1-Peitoral" -> Peitoral, "3-Menbros-inferiores-e-Gluteos" -> Pernas.
const FOLDER_GROUPS = [
  [/peitoral|chest|peito/i, 'Peitoral'],
  [/costas|trapezio|dorsal|back/i, 'Costas'],
  [/panturrilha|calf/i, 'Panturrilhas'],
  [/inferior|gluteo|perna|quadriceps|posterior|leg/i, 'Pernas'],
  [/ombro|deltoide|deltode|shoulder/i, 'Ombros'],
  [/triceps/i, 'Tríceps'],
  [/biceps/i, 'Bíceps'],
  [/antebra|forearm/i, 'Antebraços'],
  [/abdomen|abdomin|core|abs/i, 'Abdômen'],
  [/cardio|condicionamento/i, 'Cardio e condicionamento'],
  [/mobilidade|aquecimento|along|mobility/i, 'Mobilidade e aquecimento'],
]

const MAX_FRAME_SIDE = 360

function accentless(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
}

function normalized(value) {
  return accentless(value)
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\b(com|de|da|do|na|no|em|e|a|o|os|as|the|with)\b/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

export function groupFromFolder(folderName) {
  const plain = accentless(folderName)
  const match = FOLDER_GROUPS.find(([pattern]) => pattern.test(plain))
  return match ? match[1] : ''
}

function nameFromFile(filename) {
  const base = String(filename || '')
    .replace(/\.gif$/iu, '')
    .replace(/[-_+]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!base) return 'Exercício'
  return base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1)
}

// Quanto dois nomes se parecem, contando palavras em comum. Serve apenas para
// colocar o palpite na frente da lista — quem decide é o Fábio, olhando o GIF.
function similarity(a, b) {
  const first = new Set(normalized(a).split(' ').filter(Boolean))
  const second = normalized(b).split(' ').filter(Boolean)
  if (!first.size || !second.length) return 0
  const shared = second.filter((word) => first.has(word)).length
  return shared / Math.max(first.size, second.length)
}

function sameFamily(gifGroup, exerciseGroup) {
  if (!exerciseGroup || !gifGroup) return true
  if (gifGroup === exerciseGroup) return true
  return LEG_GROUPS.includes(gifGroup) && LEG_GROUPS.includes(exerciseGroup)
}

export function gifsForGroup(group) {
  const gifs = getData().exerciseGifs || []
  const family = gifs.filter((gif) => sameFamily(gif.group, group))
  return family.length ? family : gifs
}

export function findGif(id) {
  return (getData().exerciseGifs || []).find((gif) => gif.id === id) || null
}

// Primeiro quadro do GIF em JPEG pequeno: e o que entra no PDF, porque PDF
// nao aceita imagem animada.
async function firstFrameBlob(file) {
  const source = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    const side = Math.max(image.naturalWidth, image.naturalHeight) || 1
    const scale = Math.min(1, MAX_FRAME_SIDE / side)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    )
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(source)
  }
}

function gifImage(id, className) {
  const image = document.createElement('img')
  image.className = className
  image.alt = ''
  image.loading = 'lazy'
  image.decoding = 'async'
  void loadExerciseGif(id)
    .then((url) => {
      image.src = url
    })
    .catch(() => {
      image.remove()
    })
  return image
}

// Usada pela Biblioteca para trocar o bonequinho pela miniatura do GIF.
export function applyExerciseGifThumb(item, exercise) {
  const holder = item.querySelector('.exercise-glyph')
  if (!holder || !exercise?.gifId) return
  if (!findGif(exercise.gifId)) return
  holder.classList.add('exercise-glyph--gif')
  holder.replaceChildren(gifImage(exercise.gifId, 'exercise-glyph-image'))
}

export function exerciseGifStatus(exercise) {
  return exercise?.gifId && findGif(exercise.gifId) ? 'com GIF' : 'sem GIF'
}

/* ------------------------------------------------------------------ */
/* Seletor visual                                                      */
/* ------------------------------------------------------------------ */

let pickerDialog = null

function buildPickerDialog() {
  if (pickerDialog) return pickerDialog
  const dialog = document.createElement('dialog')
  dialog.className = 'modal gif-picker'
  dialog.dataset.gifPicker = ''
  dialog.innerHTML = `<form method="dialog">
    <header>
      <div>
        <span class="eyebrow eyebrow--blue">Biblioteca de GIFs</span>
        <h2>Escolher o GIF do exercício</h2>
      </div>
      <button class="icon-button" type="button" data-gif-close aria-label="Fechar">×</button>
    </header>
    <div class="modal-body">
      <div class="gif-upload">
        <label class="button button--primary gif-upload-button">
          Enviar pasta de GIFs
          <input type="file" accept=".gif,image/gif" multiple webkitdirectory directory hidden data-gif-picker-folder>
        </label>
        <label class="button button--secondary gif-upload-button">
          Enviar GIFs avulsos
          <input type="file" accept=".gif,image/gif" multiple hidden data-gif-picker-files>
        </label>
        <progress data-gif-picker-progress hidden value="0" max="100"></progress>
        <p role="status" aria-live="polite" data-gif-picker-status></p>
      </div>
      <label class="field">
        <span>Buscar GIF</span>
        <input type="search" data-gif-search placeholder="Ex.: supino, crossover, flexão">
      </label>
      <p class="password-requirements" data-gif-hint></p>
      <div class="gif-grid" data-gif-grid></div>
    </div>
    <footer>
      <button class="button button--secondary" type="button" data-gif-clear>Deixar sem GIF</button>
      <button class="button button--secondary" type="button" data-gif-close>Cancelar</button>
    </footer>
  </form>`
  document.body.append(dialog)
  pickerDialog = dialog
  return dialog
}

export function openGifPicker(exercise) {
  const dialog = buildPickerDialog()
  const grid = dialog.querySelector('[data-gif-grid]')
  const search = dialog.querySelector('[data-gif-search]')
  const hint = dialog.querySelector('[data-gif-hint]')
  const uploadStatus = dialog.querySelector('[data-gif-picker-status]')
  const uploadBar = dialog.querySelector('[data-gif-picker-progress]')
  let available = gifsForGroup(exercise?.group)
  search.value = ''

  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      dialog.close()
      cleanup()
      resolve(value)
    }
    const onClose = () => finish(undefined)
    const closeButtons = [...dialog.querySelectorAll('[data-gif-close]')]
    const clearButton = dialog.querySelector('[data-gif-clear]')
    const onClear = () => finish(null)
    const onGridClick = (event) => {
      const card = event.target.closest('[data-gif-id]')
      if (card) finish(card.dataset.gifId)
    }
    const onSearch = () => render()
    const folderInput = dialog.querySelector('[data-gif-picker-folder]')
    const filesInput = dialog.querySelector('[data-gif-picker-files]')
    const onUpload = async (event) => {
      const input = event.target
      if (!input.files?.length) return
      const files = input.files
      input.value = ''
      try {
        await sendGifFolder(files, uploadStatus, uploadBar, exercise?.group)
        available = gifsForGroup(exercise?.group)
        render()
      } catch (error) {
        uploadBar.hidden = true
        uploadStatus.textContent = error.message
      }
    }

    function cleanup() {
      dialog.removeEventListener('close', onClose)
      closeButtons.forEach((button) =>
        button.removeEventListener('click', onClose),
      )
      clearButton.removeEventListener('click', onClear)
      grid.removeEventListener('click', onGridClick)
      search.removeEventListener('input', onSearch)
      folderInput.removeEventListener('change', onUpload)
      filesInput.removeEventListener('change', onUpload)
    }

    function render() {
      const query = normalized(search.value)
      const list = available
        .filter((gif) => !query || normalized(gif.name).includes(query))
        .map((gif) => ({
          gif,
          score: exercise?.name ? similarity(exercise.name, gif.name) : 0,
        }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.gif.name.localeCompare(b.gif.name, 'pt-BR'),
        )
      grid.replaceChildren(
        ...list.map(({ gif, score }, index) => {
          const card = document.createElement('button')
          card.type = 'button'
          card.className = 'gif-card'
          card.dataset.gifId = gif.id
          if (gif.id === exercise?.gifId) card.classList.add('is-current')
          card.append(gifImage(gif.id, 'gif-card-image'))
          const label = document.createElement('span')
          label.className = 'gif-card-name'
          label.textContent = gif.name
          card.append(label)
          if (index === 0 && score > 0.34 && !query) {
            const badge = document.createElement('span')
            badge.className = 'gif-card-badge'
            badge.textContent = 'sugestão'
            card.append(badge)
          }
          return card
        }),
      )
      hint.textContent = list.length
        ? `${list.length} GIF(s) disponíveis${exercise?.group ? ` para ${exercise.group}` : ''}. Clique no que mostrar o movimento certo.`
        : 'Nenhum GIF enviado ainda. Use "Enviar pasta de GIFs" na página de Exercícios.'
    }

    dialog.addEventListener('close', onClose)
    closeButtons.forEach((button) => button.addEventListener('click', onClose))
    clearButton.addEventListener('click', onClear)
    grid.addEventListener('click', onGridClick)
    search.addEventListener('input', onSearch)
    folderInput.addEventListener('change', onUpload)
    filesInput.addEventListener('change', onUpload)
    uploadStatus.textContent = ''
    uploadBar.hidden = true
    render()
    dialog.showModal()
  })
}

/* ------------------------------------------------------------------ */
/* Campo do GIF dentro do formulário de exercício                      */
/* ------------------------------------------------------------------ */

function currentExerciseFromForm(form) {
  return {
    name: form.elements.name?.value || '',
    group: form.elements.group?.value || '',
    gifId: form.elements.gifId?.value || '',
  }
}

function paintGifField(form) {
  const preview = form.querySelector('[data-gif-preview]')
  const label = form.querySelector('[data-gif-label]')
  if (!preview || !label) return
  const id = form.elements.gifId?.value || ''
  const gif = id ? findGif(id) : null
  preview.replaceChildren()
  if (gif) {
    preview.append(gifImage(gif.id, 'gif-field-image'))
    label.textContent = gif.name
  } else {
    label.textContent = 'Nenhum GIF escolhido'
  }
  const clear = form.querySelector('[data-gif-field-clear]')
  if (clear) clear.hidden = !gif
}

export function setExerciseGifField(form, gifId) {
  if (!form?.elements?.gifId) return
  form.elements.gifId.value = gifId || ''
  paintGifField(form)
}

export function refreshExerciseGifField() {
  const form = document.querySelector('[data-form="exercise"]')
  if (form?.elements?.gifId) paintGifField(form)
}

function enhanceExerciseForm() {
  const form = document.querySelector('[data-form="exercise"]')
  const body = form?.querySelector('.modal-body')
  if (!body || body.querySelector('[data-gif-field]')) return
  const field = document.createElement('div')
  field.className = 'field gif-field'
  field.dataset.gifField = ''
  field.innerHTML = `<span>GIF do exercício</span>
    <div class="gif-field-row">
      <div class="gif-field-preview" data-gif-preview></div>
      <div class="gif-field-info">
        <strong data-gif-label>Nenhum GIF escolhido</strong>
        <small>O aluno vê o GIF mexendo e o PDF recebe um quadro dele.</small>
      </div>
      <button class="button button--secondary" type="button" data-gif-choose>Escolher GIF</button>
      <button class="icon-button" type="button" data-gif-field-clear aria-label="Remover GIF" hidden>×</button>
    </div>
    <input type="hidden" name="gifId">`
  body.append(field)
  field.querySelector('[data-gif-choose]').addEventListener('click', async () => {
    const chosen = await openGifPicker(currentExerciseFromForm(form))
    if (chosen === undefined) return
    setExerciseGifField(form, chosen)
  })
  field
    .querySelector('[data-gif-field-clear]')
    .addEventListener('click', () => setExerciseGifField(form, ''))
  paintGifField(form)
}

/* ------------------------------------------------------------------ */
/* Envio da pasta de GIFs                                              */
/* ------------------------------------------------------------------ */

async function sendOneGif(file, group) {
  const payload = new FormData()
  payload.append('gif', file)
  payload.append('name', nameFromFile(file.name))
  payload.append('group', group)
  const frame = await firstFrameBlob(file)
  if (frame) payload.append('frame', frame, 'frame.jpg')
  return uploadExerciseGif(payload)
}

async function sendGifFolder(files, status, bar, fallbackGroup = '') {
  const chosen = [...files].filter((file) =>
    file.name.toLocaleLowerCase('pt-BR').endsWith('.gif'),
  )
  if (!chosen.length) {
    status.textContent = 'Nenhum arquivo .gif encontrado na pasta escolhida.'
    return
  }
  let enviados = 0
  let repetidos = 0
  const falhas = []
  let concluidos = 0
  const paint = () => {
    bar.value = concluidos
    status.textContent = `Enviando ${concluidos} de ${chosen.length}… (${enviados} novos, ${repetidos} já existiam${falhas.length ? `, ${falhas.length} com erro` : ''})`
  }
  bar.max = chosen.length
  bar.value = 0
  bar.hidden = false
  paint()

  const queue = chosen.slice()
  const worker = async () => {
    while (queue.length) {
      const file = queue.shift()
      const folder = (file.webkitRelativePath || '').split('/').slice(-2, -1)[0]
      const group =
        groupFromFolder(folder) || groupFromFolder(file.name) || fallbackGroup
      try {
        if (!group)
          throw new Error(
            'escolha o grupo muscular ao lado antes de enviar arquivos soltos',
          )
        const saved = await sendOneGif(file, group)
        if (saved?.alreadyStored) repetidos += 1
        else enviados += 1
      } catch (error) {
        falhas.push(`${file.name}: ${error.message}`)
      }
      concluidos += 1
      paint()
    }
  }
  await Promise.all([worker(), worker(), worker()])

  await syncRemoteData()
  bar.hidden = true
  status.textContent = `Pronto: ${enviados} GIF(s) enviados, ${repetidos} já estavam na biblioteca${falhas.length ? `, ${falhas.length} não subiram` : ''}.`
  if (falhas.length) console.warn('GIFs com erro:', falhas)
  showToast(`Biblioteca de GIFs atualizada (${enviados} novos).`)
}

function createGifLibraryPanel() {
  const page = document.querySelector('[data-route="exercicios"]')
  if (!page || page.querySelector('[data-gif-library]')) return
  const panel = document.createElement('article')
  panel.className = 'panel media-library-panel'
  panel.dataset.gifLibrary = ''
  panel.innerHTML = `<div class="panel-heading">
      <div>
        <span class="eyebrow eyebrow--blue">Biblioteca de GIFs</span>
        <h2>GIFs animados dos exercícios</h2>
        <p>Envie a pasta inteira de uma vez. O grupo muscular vem do nome da pasta de origem, e depois você escolhe o GIF de cada exercício vendo o movimento.</p>
      </div>
    </div>
    <div class="gif-upload">
      <label class="button button--primary gif-upload-button">
        Enviar pasta de GIFs
        <input type="file" accept=".gif,image/gif" multiple webkitdirectory directory hidden data-gif-folder-input>
      </label>
      <label class="button button--secondary gif-upload-button">
        Enviar GIFs avulsos
        <input type="file" accept=".gif,image/gif" multiple hidden data-gif-file-input>
      </label>
      <select class="gif-loose-group" data-gif-loose-group aria-label="Grupo muscular dos GIFs avulsos"></select>
      <progress data-gif-progress hidden value="0" max="100"></progress>
      <p role="status" aria-live="polite" data-gif-status></p>
    </div>
    <div class="gif-library-groups" data-gif-groups></div>`
  // Logo abaixo da lista de exercicios, para nao ficar escondido no fim da
  // pagina embaixo da biblioteca de MP4.
  const listPanel = page.querySelector('.content-panel')
  if (listPanel) listPanel.after(panel)
  else page.append(panel)

  const status = panel.querySelector('[data-gif-status]')
  const bar = panel.querySelector('[data-gif-progress]')
  const looseGroup = panel.querySelector('[data-gif-loose-group]')
  const filterGroups = [
    ...(document.querySelector('[data-exercise-filter]')?.options || []),
  ]
    .map((option) => option.value)
    .filter((value) => value && value !== 'all')
  looseGroup.replaceChildren(
    ...(filterGroups.length
      ? filterGroups
      : FOLDER_GROUPS.map(([, group]) => group)
    ).map((group) => {
      const option = document.createElement('option')
      option.value = group
      option.textContent = group
      return option
    }),
  )
  const handle = async (input) => {
    if (!input.files?.length) return
    const files = input.files
    input.value = ''
    try {
      await sendGifFolder(files, status, bar, looseGroup.value)
      renderGifLibrary()
    } catch (error) {
      bar.hidden = true
      status.textContent = error.message
    }
  }
  panel
    .querySelector('[data-gif-folder-input]')
    .addEventListener('change', (event) => handle(event.target))
  panel
    .querySelector('[data-gif-file-input]')
    .addEventListener('change', (event) => handle(event.target))
  renderGifLibrary()
}

function renderGifLibrary() {
  const holder = document.querySelector('[data-gif-groups]')
  if (!holder) return
  const gifs = getData().exerciseGifs || []
  const exercises = getData().exercises || []
  const usados = new Set(exercises.map((item) => item.gifId).filter(Boolean))
  holder.replaceChildren()
  if (!gifs.length) {
    const empty = document.createElement('p')
    empty.className = 'password-requirements'
    empty.textContent =
      'Nenhum GIF enviado ainda. Use o botão acima e escolha a pasta com os arquivos .gif.'
    holder.append(empty)
    return
  }
  const grupos = new Map()
  gifs.forEach((gif) => {
    if (!grupos.has(gif.group)) grupos.set(gif.group, [])
    grupos.get(gif.group).push(gif)
  })
  const resumo = document.createElement('p')
  resumo.className = 'password-requirements'
  resumo.textContent = `${gifs.length} GIF(s) na biblioteca, ${usados.size} já ligados a exercícios.`
  holder.append(resumo)
  ;[...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .forEach(([group, lista]) => {
      const folder = document.createElement('details')
      folder.className = 'exercise-folder'
      const summary = document.createElement('summary')
      const name = document.createElement('span')
      name.className = 'exercise-folder-name'
      name.textContent = group
      const count = document.createElement('span')
      count.className = 'exercise-folder-count'
      count.textContent = `${lista.length} GIF(s)`
      summary.append(name, count)
      const body = document.createElement('div')
      body.className = 'gif-grid gif-grid--library'
      body.append(
        ...lista.map((gif) => {
          const card = document.createElement('div')
          card.className = 'gif-card'
          if (usados.has(gif.id)) card.classList.add('is-current')
          card.append(gifImage(gif.id, 'gif-card-image'))
          const label = document.createElement('span')
          label.className = 'gif-card-name'
          label.textContent = gif.name
          const remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'icon-button gif-card-remove'
          remove.textContent = '×'
          remove.title = 'Excluir este GIF'
          remove.addEventListener('click', async () => {
            if (!window.confirm(`Excluir o GIF “${gif.name}”?`)) return
            try {
              await deleteExerciseGif(gif.id)
              forgetExerciseGif(gif.id)
              await syncRemoteData()
              renderGifLibrary()
              showToast('GIF excluído.')
            } catch (error) {
              showToast(error.message)
            }
          })
          card.append(label, remove)
          return card
        }),
      )
      folder.append(summary, body)
      holder.append(folder)
    })
}

export function initExerciseGifs() {
  const start = () => {
    createGifLibraryPanel()
    enhanceExerciseForm()
    renderGifLibrary()
    refreshExerciseGifField()
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
  // syncRemoteData troca o estado e dispara frs:data-changed, entao um
  // ouvinte so ja cobre o envio em lote e o refresh remoto.
  window.addEventListener('frs:data-changed', () => {
    renderGifLibrary()
    refreshExerciseGifField()
  })
}
