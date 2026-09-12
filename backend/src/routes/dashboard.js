export async function dashboard(db, trainerId) {
  const [students, exercises, workouts, assessments] = await Promise.all([
    db.query(
      `SELECT s.id,
      s.name,
      s.email,
      s.goal,
      s.status,
      s.assessment_date AS "assessmentDate",
      COALESCE((SELECT name
      FROM workouts
      WHERE student_id=s.id AND trainer_id=s.trainer_id
      ORDER BY created_at DESC LIMIT 1),
      'Aguardando ficha') AS workout,
      'Atividade recente' AS activity
      FROM students s
      WHERE s.trainer_id=$1
      ORDER BY s.created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT id,
      name,
      muscle_group AS "group",
      equipment,
      instructions
      FROM exercises
      WHERE trainer_id=$1
      ORDER BY created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT w.id,
      w.name,
      s.name AS student,
      w.goal,
      w.duration,
      w.progress
      FROM workouts w
      JOIN students s ON s.id=w.student_id
      WHERE w.trainer_id=$1
      ORDER BY w.created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT a.id,
      s.name AS student,
      strftime('%d/%m/%Y',
      a.assessed_at) AS date,
      a.weight_kg || ' kg' AS weight,
      a.height_cm || ' cm' AS height,
      a.bmi,
      a.body_fat_percent || '%' AS fat,
      a.waist_cm || ' cm' AS waist,
      a.hip_cm || ' cm' AS hip,
      a.whr,
      a.protocol,
      a.blood_pressure AS bloodPressure,
      a.resting_hr || ' bpm' AS restingHR,
      a.restriction,
      a.parq,
      a.push_ups AS pushUps,
      a.plank_seconds AS plank,
      a.sit_and_reach_cm AS sitAndReach,
      a.notes
      FROM assessments a
      JOIN students s ON s.id=a.student_id
      WHERE a.trainer_id=$1
      ORDER BY a.assessed_at DESC`,
      [trainerId],
    ),
  ])
  return {
    students: students.rows,
    exercises: exercises.rows,
    workouts: workouts.rows,
    assessments: assessments.rows,
  }
}
