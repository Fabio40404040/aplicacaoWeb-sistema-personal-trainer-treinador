export async function dashboard(db, trainerId) {
  const [students, exercises, workouts, assessments, checkins, plans] = await Promise.all([
    db.query(
      `SELECT s.id, s.name, s.email, s.goal, s.status, s.assessment_date AS "assessmentDate",
       s.access_status AS "accessStatus", s.plan_code AS "planCode", s.access_type AS "accessType", s.billing_cycle AS "billingCycle",
       s.access_expires_at AS "accessExpiresAt", s.payment_status AS "paymentStatus",
       s.payment_method AS "paymentMethod", s.account_id AS "accountId",
       COALESCE((SELECT name FROM workouts WHERE student_id=s.id AND trainer_id=s.trainer_id ORDER BY created_at DESC LIMIT 1),'Aguardando ficha') AS workout,
       CASE WHEN s.account_id IS NOT NULL THEN 'Cadastro pelo aplicativo' ELSE 'Cadastro pelo personal' END AS activity
       FROM students s WHERE s.trainer_id=$1 ORDER BY s.created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT id, name, muscle_group AS "group", equipment, instructions, difficulty,
       media_type AS "mediaType", media_url AS "mediaUrl", thumbnail_url AS "thumbnailUrl",
       animation_clip AS "animationClip", is_active AS "isActive"
       FROM exercises WHERE trainer_id=$1 ORDER BY created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT w.id, w.name, s.name AS student, w.goal, w.duration, w.progress,
       w.published_at AS "publishedAt", w.permanent_access AS "permanentAccess",
       (SELECT count(*) FROM workout_exercises we WHERE we.workout_id=w.id) AS "exerciseCount",
       COALESCE((SELECT json_group_array(exercise_id) FROM workout_exercises we WHERE we.workout_id=w.id),'[]') AS "exerciseIdsJson"
       FROM workouts w JOIN students s ON s.id=w.student_id WHERE w.trainer_id=$1 ORDER BY w.created_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT a.id, s.name AS student, strftime('%d/%m/%Y',a.assessed_at) AS date,
       a.weight_kg || ' kg' AS weight, a.height_cm || ' cm' AS height, a.bmi,
       a.body_fat_percent || '%' AS fat, a.waist_cm || ' cm' AS waist, a.hip_cm || ' cm' AS hip,
       a.whr, a.protocol, a.blood_pressure AS "bloodPressure", a.resting_hr || ' bpm' AS "restingHR",
       a.restriction, a.parq, a.push_ups AS "pushUps", a.plank_seconds AS plank,
       a.sit_and_reach_cm AS "sitAndReach", a.notes, a.published_at AS "publishedAt"
       FROM assessments a JOIN students s ON s.id=a.student_id WHERE a.trainer_id=$1 ORDER BY a.assessed_at DESC`,
      [trainerId],
    ),
    db.query(
      `SELECT c.id, s.name AS student, c.energy, c.sleep, c.pain, c.notes,
       c.trainer_feedback AS "trainerFeedback", c.created_at AS "createdAt"
       FROM checkins c JOIN students s ON s.id=c.student_id WHERE c.trainer_id=$1 ORDER BY c.created_at DESC LIMIT 30`,
      [trainerId],
    ),
    db.query(
      `SELECT code, name, price_cents AS "priceCents", access_type AS "accessType", duration_days AS "durationDays" FROM plans WHERE active=1 ORDER BY price_cents`,
    ),
  ])
  return {
    students: students.rows,
    exercises: exercises.rows,
    workouts: workouts.rows,
    assessments: assessments.rows,
    checkins: checkins.rows,
    plans: plans.rows,
  }
}
