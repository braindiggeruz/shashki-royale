-- ============================================================
-- Миграция: Добавление Supabase Auth интеграции
-- ============================================================

-- 1. Добавить колонки для auth в profiles таблицу
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- 2. Создать индексы
CREATE INDEX IF NOT EXISTS profiles_auth_user_id_idx ON profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

-- ============================================================
-- RPC ФУНКЦИЯ: Создание профиля для auth пользователя
-- ============================================================

CREATE OR REPLACE FUNCTION create_profile_for_auth(
  p_auth_user_id UUID,
  p_email TEXT,
  p_nickname TEXT,
  p_avatar_index INT
)
RETURNS TABLE(profile_id UUID, success BOOLEAN) AS $$
DECLARE
  v_profile_id UUID;
  v_player_id TEXT;
BEGIN
  -- Генерируем player_id на основе auth_user_id
  v_player_id := 'auth_' || p_auth_user_id::TEXT;

  -- Вставляем профиль
  INSERT INTO profiles (
    player_id,
    auth_user_id,
    email,
    email_verified,
    nickname,
    avatar_index,
    rating,
    total_games,
    wins,
    losses,
    draws,
    created_at,
    updated_at,
    last_seen_at
  ) VALUES (
    v_player_id,
    p_auth_user_id,
    p_email,
    FALSE,
    p_nickname,
    p_avatar_index,
    1500,  -- Начальный рейтинг
    0,
    0,
    0,
    0,
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (player_id) DO NOTHING
  RETURNING profiles.id INTO v_profile_id;

  -- Если профиль уже существует, получаем его ID
  IF v_profile_id IS NULL THEN
    SELECT id INTO v_profile_id FROM profiles WHERE player_id = v_player_id LIMIT 1;
  END IF;

  -- Создаём кошелёк для профиля
  INSERT INTO wallets (profile_id, crypto_balance, locked_balance, updated_at)
  VALUES (v_profile_id, 1000, 0, NOW())
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN QUERY SELECT v_profile_id, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ТРИГГЕР: Автоматическое создание профиля при регистрации
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Вызываем RPC функцию для создания профиля
  PERFORM create_profile_for_auth(
    NEW.id,
    NEW.email,
    COALESCE(NEW.user_metadata->>'nickname', 'Player_' || SUBSTR(NEW.id::TEXT, 1, 8)),
    COALESCE((NEW.user_metadata->>'avatar_index')::INT, 0)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- RLS ПОЛИТИКИ: Обновление для auth пользователей
-- ============================================================

-- Удалить старые политики
DROP POLICY IF NOT EXISTS "Anyone can read profiles" ON profiles;
DROP POLICY IF NOT EXISTS "Anyone can insert profiles" ON profiles;
DROP POLICY IF NOT EXISTS "Anyone can update profiles" ON profiles;

-- Новые политики
CREATE POLICY "Users can read all profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth_user_id = auth.uid());

-- ============================================================
-- RLS ПОЛИТИКИ: Wallets (кошельки)
-- Все модификации идут ТОЛЬКО через SECURITY DEFINER RPC функции!
-- ============================================================

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their wallet" ON wallets;
DROP POLICY IF EXISTS "Users can update their wallet" ON wallets;
DROP POLICY IF EXISTS "System can update wallets" ON wallets;
DROP POLICY IF EXISTS "System can manage wallets" ON wallets;

CREATE POLICY "Users can read their wallet"
  ON wallets FOR SELECT USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
    OR
    profile_id IN (
      SELECT id FROM profiles WHERE player_id = current_setting('app.current_player_id', true)
    )
  );

-- НЕТ политики на UPDATE/INSERT/DELETE для wallets!
-- Все обновления через RPC (SECURITY DEFINER)

-- ============================================================
-- RLS ПОЛИТИКИ: Wallet Transactions
-- ============================================================

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their transactions" ON wallet_transactions;
DROP POLICY IF EXISTS "System can insert transactions" ON wallet_transactions;

CREATE POLICY "Users can read their transactions"
  ON wallet_transactions FOR SELECT USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
    OR
    profile_id IN (
      SELECT id FROM profiles WHERE player_id = current_setting('app.current_player_id', true)
    )
  );

-- НЕТ политики на INSERT для wallet_transactions!
-- Все вставки через RPC (SECURITY DEFINER)

-- ============================================================
-- RLS ПОЛИТИКИ: Game Stakes
-- ============================================================

ALTER TABLE game_stakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read stakes" ON game_stakes;
DROP POLICY IF EXISTS "System can manage stakes" ON game_stakes;

CREATE POLICY "Anyone can read stakes"
  ON game_stakes FOR SELECT USING (true);

-- НЕТ политики на INSERT/UPDATE/DELETE для game_stakes!
-- Все операции через RPC (SECURITY DEFINER)

-- ============================================================
-- ФУНКЦИЯ: Получить профиль текущего пользователя
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_user_profile()
RETURNS TABLE(
  id UUID,
  player_id TEXT,
  nickname TEXT,
  avatar_index INT,
  rating INT,
  total_games INT,
  wins INT,
  losses INT,
  draws INT,
  email TEXT,
  email_verified BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.player_id,
    p.nickname,
    p.avatar_index,
    p.rating,
    p.total_games,
    p.wins,
    p.losses,
    p.draws,
    p.email,
    p.email_verified
  FROM profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ФУНКЦИЯ: Обновить профиль
-- ============================================================

CREATE OR REPLACE FUNCTION update_user_profile(
  p_nickname TEXT DEFAULT NULL,
  p_avatar_index INT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Получить profile_id текущего пользователя
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Профиль не найден'::TEXT;
    RETURN;
  END IF;

  -- Обновить профиль
  UPDATE profiles
  SET 
    nickname = COALESCE(p_nickname, nickname),
    avatar_index = COALESCE(p_avatar_index, avatar_index),
    updated_at = NOW()
  WHERE id = v_profile_id;

  RETURN QUERY SELECT TRUE, 'Профиль обновлён'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ПУБЛИКАЦИЯ REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE wallet_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_stakes;

-- ============================================================
-- МИГРАЦИЯ ЗАВЕРШЕНА
-- ============================================================
