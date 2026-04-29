-- ═══════════════════════════════════════════════════════════════════
-- Шашки Рояль — миграция для разделения режимов quickplay / friend
-- Запустить ОДИН РАЗ в Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════════
-- ⚠️ Колонка названа `play_mode` (а не `mode`), потому что `mode` — это
-- зарезервированное имя агрегатной функции PostgreSQL и PostgREST не может
-- по нему фильтровать без специального экранирования.

-- 1) Добавить колонку play_mode в games. Дефолт 'friend' для совместимости —
--    до миграции все комнаты создавались с кодом для друга.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS play_mode TEXT NOT NULL DEFAULT 'friend'
  CHECK (play_mode IN ('quickplay', 'friend'));

-- 2) Индекс для быстрого поиска свободных quickplay-комнат.
CREATE INDEX IF NOT EXISTS idx_games_status_playmode_created
  ON games (status, play_mode, created_at)
  WHERE status = 'waiting';

-- 3) (Опционально) денормализованные поля для быстрого отображения профилей.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS white_player_name TEXT,
  ADD COLUMN IF NOT EXISTS black_player_name TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- 4) Готово. Проверяем:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'games'
ORDER BY ordinal_position;
