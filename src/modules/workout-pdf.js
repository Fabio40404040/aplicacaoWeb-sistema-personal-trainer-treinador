function ascii(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\x20-\x7E]/gu, '')
}

function escapePdf(value) {
  return ascii(value).replace(/([\\()])/gu, '\\$1')
}

function wrapped(text, size = 88) {
  const words = ascii(text).split(/\s+/u)
  const lines = []
  let line = ''
  words.forEach((word) => {
    if (`${line} ${word}`.trim().length > size && line) {
      lines.push(line)
      line = word
    } else line = `${line} ${word}`.trim()
  })
  if (line) lines.push(line)
  return lines
}

function pdfDocument(pages) {
  const objects = []
  const pageIds = pages.map((_, index) => 3 + index * 2)
  const fontId = 3 + pages.length * 2
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  pages.forEach((lines, index) => {
    const pageId = pageIds[index]
    const contentId = pageId + 1
    const commands = lines
      .map(
        (line, lineIndex) =>
          `BT /F1 ${lineIndex === 0 ? 17 : 10} Tf 50 ${795 - lineIndex * 15} Td (${escapePdf(line)}) Tj ET`,
      )
      .join('\n')
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    objects[contentId] = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`
  })
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  let output = '%PDF-1.4\n'
  const offsets = [0]
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = new TextEncoder().encode(output).length
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = new TextEncoder().encode(output).length
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id += 1)
    output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return output
}

export function downloadWorkoutPdf(workout, studentName) {
  const lines = [
    'FRS PERSONAL TRAINER',
    `Aluno: ${studentName}`,
    `Ficha: ${workout.name}`,
    `Objetivo: ${workout.goal || 'Nao informado'}`,
    `Duracao: ${workout.duration || 'Nao informada'}`,
    '',
    'EXERCICIOS',
  ]
  if (!workout.exercises?.length) lines.push('Os exercicios ainda serao adicionados pelo personal.')
  workout.exercises?.forEach((exercise, index) => {
    lines.push('')
    lines.push(`${index + 1}. ${exercise.name}`)
    lines.push(
      `Series e repeticoes: ${exercise.sets} x ${exercise.repetitions}${exercise.restSeconds ? ` | Descanso: ${exercise.restSeconds}s` : ''}`,
    )
    wrapped(exercise.instructions || 'Siga a orientacao do personal.').forEach((line) =>
      lines.push(line),
    )
  })
  lines.push('', 'Documento gerado pelo FRS Personal Trainer.')
  const pages = []
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48))
  const blob = new Blob([pdfDocument(pages)], { type: 'application/pdf' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${
    ascii(workout.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-') || 'ficha-treino'
  }.pdf`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
