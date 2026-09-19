// Biblioteca de conteúdo da FRS Personal.
//
// COMO ADICIONAR UM PDF
// 1. Coloque o arquivo em: public/library/workouts/pdfs/
// 2. Copie um objeto de readyWorkoutLibrary e altere os dados.
// 3. Use published: true quando quiser liberar o PDF aos alunos de Treinos Prontos.
//
// COMO ADICIONAR UM VÍDEO MP4
// 1. Coloque o arquivo na pasta do grupo em: public/library/exercises/videos/
// 2. Copie um objeto de exerciseVideoLibrary e altere os dados.
// 3. Use published: true para exibir o vídeo aos alunos com acesso ativo.
//
// Use caminhos iniciados por /library/. Não coloque arquivos grandes dentro de src/.

export const muscleGroups = [
  { id: 'peitoral', name: 'Peitoral' },
  { id: 'costas', name: 'Costas' },
  { id: 'ombros', name: 'Ombros' },
  { id: 'biceps', name: 'Bíceps' },
  { id: 'triceps', name: 'Tríceps' },
  { id: 'antebracos', name: 'Antebraços' },
  { id: 'abdomen', name: 'Abdômen' },
  { id: 'gluteos', name: 'Glúteos' },
  { id: 'quadriceps', name: 'Quadríceps' },
  { id: 'posteriores', name: 'Posteriores de coxa' },
  { id: 'panturrilhas', name: 'Panturrilhas' },
  { id: 'cardio', name: 'Cardio e condicionamento' },
  { id: 'mobilidade', name: 'Mobilidade e aquecimento' },
]

export const readyWorkoutLibrary = [
  {
    id: 'demonstracao-peito-completo',
    name: 'Demonstração — Peito completo',
    goal: 'Hipertrofia',
    level: 'Intermediário',
    duration: 'Treino demonstrativo',
    muscleGroups: ['Peitoral', 'Tríceps', 'Ombros'],
    pdfUrl: '/library/workouts/pdfs/ficha-demonstrativa-peito-completo.pdf',
    description: 'Arquivo de demonstração. Troque published para true quando quiser liberá-lo.',
    published: false,
  },
  // MODELO PARA COPIAR:
  // {
  //   id: 'pernas-completo-iniciante',
  //   name: 'Pernas completo — iniciante',
  //   goal: 'Hipertrofia',
  //   level: 'Iniciante',
  //   duration: '8 semanas',
  //   muscleGroups: ['Quadríceps', 'Posteriores de coxa', 'Glúteos', 'Panturrilhas'],
  //   pdfUrl: '/library/workouts/pdfs/pernas-completo-iniciante.pdf',
  //   description: 'Programa completo para membros inferiores.',
  //   published: true,
  // },
]

export const exerciseVideoLibrary = [
  // MODELO PARA COPIAR:
  // {
  //   id: 'supino-reto-barra',
  //   name: 'Supino reto com barra',
  //   group: 'Peitoral',
  //   equipment: 'Barra e banco',
  //   difficulty: 'Intermediário',
  //   videoUrl: '/library/exercises/videos/peitoral/supino-reto-barra.mp4',
  //   posterUrl: '',
  //   instructions: 'Mantenha as escápulas retraídas e controle a descida.',
  //   published: true,
  // },
]

export function publishedReadyWorkouts() {
  return readyWorkoutLibrary.filter((item) => item.published)
}

export function publishedExerciseVideos() {
  return exerciseVideoLibrary.filter((item) => item.published)
}

export function videosByMuscleGroup(items = publishedExerciseVideos()) {
  return muscleGroups.map((group) => ({
    ...group,
    exercises: items.filter((item) => item.group === group.name),
  }))
}

export function findExerciseVideo(exercise) {
  const id = String(exercise?.libraryId || exercise?.id || '').toLocaleLowerCase('pt-BR')
  const name = String(exercise?.name || '').trim().toLocaleLowerCase('pt-BR')
  return exerciseVideoLibrary.find(
    (item) =>
      item.published &&
      (item.id.toLocaleLowerCase('pt-BR') === id ||
        item.name.trim().toLocaleLowerCase('pt-BR') === name),
  )
}
