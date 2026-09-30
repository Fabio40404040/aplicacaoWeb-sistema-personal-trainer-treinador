ALTER TABLE workout_exercises ADD COLUMN preferred_media TEXT NOT NULL DEFAULT 'gif';
ALTER TABLE ready_program_exercises ADD COLUMN preferred_media TEXT NOT NULL DEFAULT 'gif';
