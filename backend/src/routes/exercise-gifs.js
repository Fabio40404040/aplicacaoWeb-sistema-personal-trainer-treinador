const MAX_GIF_BYTES = 12 * 1024 * 1024;
const MAX_FRAME_BYTES = 1024 * 1024;

const selectFields = `id,name,muscle_group AS "group",original_filename AS "originalFilename",
  size_bytes AS "sizeBytes",created_at AS "createdAt"`;

function storageUnavailable() {
  return {
    error:
      "O armazenamento de arquivos ainda não foi ativado. Habilite o Cloudflare R2 e vincule o bucket MEDIA.",
    status: 503,
  };
}

function mediaResponse(object, contentType, filename) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "private, max-age=604800");
  headers.set(
    "Content-Disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(filename || "exercicio")}`,
  );
  return new Response(object.body, { headers });
}

function isGif(bytes) {
  const header = new TextDecoder().decode(bytes.slice(0, 6));
  return header === "GIF87a" || header === "GIF89a";
}

export async function listExerciseGifs(db, trainerId) {
  return (
    await db.query(
      `SELECT ${selectFields} FROM exercise_gifs WHERE trainer_id=$1
       ORDER BY muscle_group,name`,
      [trainerId],
    )
  ).rows;
}

export async function uploadExerciseGif(request, env, db, trainerId) {
  if (!env.MEDIA) return storageUnavailable();
  const form = await request.formData();
  const file = form.get("gif");
  if (
    !(file instanceof File) ||
    !file.name.toLocaleLowerCase("pt-BR").endsWith(".gif")
  )
    return { error: "Selecione um arquivo GIF válido.", status: 400 };
  if (!file.size || file.size > MAX_GIF_BYTES)
    return { error: "Cada GIF deve ter no máximo 12 MB.", status: 400 };

  const name = String(form.get("name") || "").trim();
  const group = String(form.get("group") || "").trim();
  if (!name || !group)
    return { error: "Informe o nome e o grupo muscular do GIF.", status: 400 };

  const existing = (
    await db.query(
      `SELECT ${selectFields} FROM exercise_gifs
       WHERE trainer_id=$1 AND original_filename=$2 LIMIT 1`,
      [trainerId, file.name],
    )
  ).rows[0];
  if (existing) return { ...existing, alreadyStored: true };

  const bytes = await file.arrayBuffer();
  if (!isGif(bytes))
    return { error: "O arquivo enviado não é um GIF válido.", status: 400 };

  const id = crypto.randomUUID().replaceAll("-", "");
  const objectKey = `trainers/${trainerId}/exercise-gifs/${id}.gif`;
  const frameKey = `trainers/${trainerId}/exercise-gifs/${id}.jpg`;
  await env.MEDIA.put(objectKey, bytes, {
    httpMetadata: { contentType: "image/gif" },
    customMetadata: { originalFilename: file.name, trainerId },
  });

  // Quadro estatico gerado no navegador, usado no PDF (PDF nao aceita GIF animado).
  const frame = form.get("frame");
  let storedFrameKey = null;
  if (frame instanceof File && frame.size && frame.size <= MAX_FRAME_BYTES) {
    await env.MEDIA.put(frameKey, await frame.arrayBuffer(), {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: { trainerId },
    });
    storedFrameKey = frameKey;
  }

  try {
    const result = await db.query(
      `INSERT INTO exercise_gifs
        (id,trainer_id,name,muscle_group,object_key,frame_key,original_filename,size_bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING ${selectFields}`,
      [id, trainerId, name, group, objectKey, storedFrameKey, file.name, file.size],
    );
    return result.rows[0];
  } catch (error) {
    await env.MEDIA.delete(objectKey);
    if (storedFrameKey) await env.MEDIA.delete(storedFrameKey);
    throw error;
  }
}

export async function deleteExerciseGif(env, db, trainerId, id) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT object_key AS "objectKey",frame_key AS "frameKey"
       FROM exercise_gifs WHERE id=$1 AND trainer_id=$2 LIMIT 1`,
      [id, trainerId],
    )
  ).rows[0];
  if (!row) return { error: "GIF não encontrado.", status: 404 };
  await env.MEDIA.delete(row.objectKey);
  if (row.frameKey) await env.MEDIA.delete(row.frameKey);
  await db.batch([
    {
      sql: "UPDATE exercises SET gif_id=NULL WHERE gif_id=$1 AND trainer_id=$2",
      values: [id, trainerId],
    },
    {
      sql: "DELETE FROM exercise_gifs WHERE id=$1 AND trainer_id=$2",
      values: [id, trainerId],
    },
  ]);
  return null;
}

export async function trainerExerciseGifFile(env, db, trainerId, id, kind) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT object_key AS "objectKey",frame_key AS "frameKey",original_filename AS "originalFilename"
       FROM exercise_gifs WHERE id=$1 AND trainer_id=$2 LIMIT 1`,
      [id, trainerId],
    )
  ).rows[0];
  if (!row) return { error: "GIF não encontrado.", status: 404 };
  const wantsFrame = kind === "frame";
  const key = wantsFrame ? row.frameKey : row.objectKey;
  if (!key) return { error: "Arquivo não encontrado.", status: 404 };
  const object = await env.MEDIA.get(key);
  return object
    ? mediaResponse(
        object,
        wantsFrame ? "image/jpeg" : "image/gif",
        row.originalFilename,
      )
    : { error: "Arquivo não encontrado.", status: 404 };
}

export async function studentExerciseGifFile(env, db, accountId, id, kind) {
  if (!env.MEDIA) return storageUnavailable();
  const row = (
    await db.query(
      `SELECT g.object_key AS "objectKey",g.frame_key AS "frameKey",
         g.original_filename AS "originalFilename"
       FROM student_accounts a
       JOIN students s ON s.id=a.student_id AND s.account_id=a.id
       JOIN plans p ON p.code=s.plan_code
       JOIN exercise_gifs g ON g.trainer_id=s.trainer_id
       WHERE a.id=$1 AND g.id=$2
         AND s.access_status='active' AND s.payment_status='paid'
         AND instr(p.features_json, '"exercises"') > 0
         AND (s.access_type='permanent' OR datetime(s.access_expires_at) > datetime('now'))
       LIMIT 1`,
      [accountId, id],
    )
  ).rows[0];
  if (!row) return { error: "GIF indisponível para esta conta.", status: 403 };
  const wantsFrame = kind === "frame";
  const key = wantsFrame ? row.frameKey : row.objectKey;
  if (!key) return { error: "Arquivo não encontrado.", status: 404 };
  const object = await env.MEDIA.get(key);
  return object
    ? mediaResponse(
        object,
        wantsFrame ? "image/jpeg" : "image/gif",
        row.originalFilename,
      )
    : { error: "Arquivo não encontrado.", status: 404 };
}
