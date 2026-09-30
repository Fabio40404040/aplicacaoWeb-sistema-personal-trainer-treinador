-- Treino pronto usado como prévia pública (botão "Ver prévia" do plano
-- Treinos Prontos no site). No máximo um por personal.
ALTER TABLE ready_workout_programs ADD COLUMN is_preview INTEGER NOT NULL DEFAULT 0;
