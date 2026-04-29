-- ============================================================
-- 🎮 ШАШКИ РОЯЛЬ v2.1 — ФИНАЛЬНАЯ МИГРАЦИЯ
-- Запускать в Supabase SQL Editor ОДИН РАЗ
-- Порядок: schema → v2 → v3_last_move → v3_security → auth → stakes
-- ============================================================
-- Этот файл объединяет ВСЕ миграции в правильном порядке.
-- Если у вас НОВЫЙ проект — просто запустите этот файл целиком.
-- ============================================================

-- ============================================================
-- ЧАСТЬ 1: БАЗОВАЯ СХЕМА (schema.sql)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Таблица игр
CREATE TABLE IF NOT EXISTS games (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code       text UNIQUE NOT NULL,
  status          text NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting', 'playing', 'finished')),
  white_player_id text NOT NULL,
  black_player_id text,
  current_turn    text NOT NULL DEFAULT 'white'
                    CHECK (current_turn IN ('white', 'black')),
  board_state     jsonb NOT NULL,
  move_number     integer NOT NULL DEFAULT 1,
  winner          text CHECK (winner IN ('white', 'black', NULL)),
  resign_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Таблица ходов
CREATE TABLE IF NOT EXISTS moves (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id      uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number  integer NOT NULL,
  player_color text NOT NULL CHECK (player_color IN ('white', 'black')),
  move_data    jsonb NOT NULL,
  board_state  jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Индексы
CREATE INDEX IF NOT EXISTS games_room_code_idx ON games (room_code);
CREATE INDEX IF NOT EXISTS games_status_idx ON games (status);
CREATE INDEX IF NOT EXISTS games_white_player_idx ON games (white_player_id);
CREATE INDEX IF NOT EXISTS games_black_player_idx ON games (black_player_id);
CREATE INDEX IF NOT EXISTS moves_game_id_idx ON moves (game_id);
CREATE INDEX IF NOT EXISTS moves_game_move_number_idx ON moves (game_id, move_number);

-- Триггер updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS games_updated_at ON games;
CREATE TRIGGER games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS для games и moves
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read games" ON games;
CREATE POLICY "Anyone can read games"
  ON games FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert games" ON games;
CREATE POLICY "Anyone can insert games"
  ON games FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Players can update their game" ON games;
CREATE POLICY "Players can update their game"
  ON games FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can read moves" ON moves;
CREATE POLICY "Anyone can read moves"
  ON moves FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert moves" ON moves;
CREATE POLICY "Anyone can insert moves"
  ON moves FOR INSERT WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE moves;

-- ============================================================
-- ЧАСТЬ 2: ПРОФИЛИ, КОШЕЛЬКИ, СТАВКИ (migration_v2.sql)
-- ============================================================

-- Профили
CREATE TABLE IF NOT EXISTS profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       text UNIQUE,
  nickname        text NOT NULL DEFAULT 'Player',
  avatar_index    int  NOT NULL DEFAULT 0,
  rating          int  NOT NULL DEFAULT 1000,
  total_games     int  NOT NULL DEFAULT 0,
  wins            int  NOT NULL DEFAULT 0,
  losses          int  NOT NULL DEFAULT 0,
  draws           int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_player_id_idx ON profiles(player_id);
CREATE INDEX IF NOT EXISTS profiles_rating_idx ON profiles(rating DESC);

-- Кошельки (NUMERIC для точных финансовых расчётов)
CREATE TABLE IF NOT EXISTS wallets (
  profile_id      uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  crypto_balance  NUMERIC(20,2) NOT NULL DEFAULT 1000.00 CHECK (crypto_balance >= 0),
  locked_balance  NUMERIC(20,2) NOT NULL DEFAULT 0.00 CHECK (locked_balance >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Транзакции кошелька
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id         uuid REFERENCES games(id) ON DELETE SET NULL,
  type            text NOT NULL CHECK (type IN (
    'deposit', 'withdrawal', 'fee_lock', 'fee_refund', 
    'prize_payout', 'starting_bonus', 'loss'
  )),
  amount          NUMERIC(20,2) NOT NULL CHECK (amount >= 0),
  status          text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Ставки в играх (entry_fee >= 1 для поддержки ставок 1, 5, 10, 50)
CREATE TABLE IF NOT EXISTS game_stakes (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id             uuid UNIQUE NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  entry_fee           NUMERIC(20,2) NOT NULL CHECK (entry_fee >= 1 AND entry_fee <= 10000),
  pot_amount          NUMERIC(20,2) NOT NULL,
  white_profile_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  black_profile_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  escrow_status       text NOT NULL DEFAULT 'waiting' CHECK (
    escrow_status IN ('waiting', 'locked', 'paid', 'refunded')
  ),
  payout_status       text NOT NULL DEFAULT 'pending' CHECK (
    payout_status IN ('pending', 'paid', 'failed', 'refunded')
  ),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Дополнительные колонки для games
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='match_type') THEN
    ALTER TABLE games ADD COLUMN match_type text NOT NULL DEFAULT 'friendly' CHECK (match_type IN ('friendly','stake'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='white_profile_id') THEN
    ALTER TABLE games ADD COLUMN white_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='black_profile_id') THEN
    ALTER TABLE games ADD COLUMN black_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='winner_profile_id') THEN
    ALTER TABLE games ADD COLUMN winner_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Индексы для новых таблиц
CREATE INDEX IF NOT EXISTS wallets_balance_idx ON wallets(crypto_balance);
CREATE INDEX IF NOT EXISTS wallet_transactions_profile_id_idx ON wallet_transactions(profile_id);
CREATE INDEX IF NOT EXISTS wallet_transactions_game_id_idx ON wallet_transactions(game_id);
CREATE INDEX IF NOT EXISTS wallet_transactions_type_idx ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS wallet_transactions_created_at_idx ON wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS game_stakes_game_id_idx ON game_stakes(game_id);
CREATE INDEX IF NOT EXISTS game_stakes_white_profile_idx ON game_stakes(white_profile_id);
CREATE INDEX IF NOT EXISTS game_stakes_black_profile_idx ON game_stakes(black_profile_id);
CREATE INDEX IF NOT EXISTS game_stakes_escrow_status_idx ON game_stakes(escrow_status);
CREATE INDEX IF NOT EXISTS game_stakes_payout_status_idx ON game_stakes(payout_status);
CREATE INDEX IF NOT EXISTS games_match_type_status_idx ON games(match_type, status);

-- ============================================================
-- ЧАСТЬ 3: LAST MOVE COLUMNS (migration_v3_last_move.sql)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='last_from_row') THEN
    ALTER TABLE games ADD COLUMN last_from_row integer;
    ALTER TABLE games ADD COLUMN last_from_col integer;
    ALTER TABLE games ADD COLUMN last_to_row integer;
    ALTER TABLE games ADD COLUMN last_to_col integer;
  END IF;
END $$;

-- ============================================================
-- ЧАСТЬ 4: AUTH ИНТЕГРАЦИЯ (migration_auth.sql)
-- ============================================================

-- Добавить колонки для auth в profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS profiles_auth_user_id_idx ON profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

-- ============================================================
-- ЧАСТЬ 5: SECURITY — set_player_context
-- ============================================================

CREATE OR REPLACE FUNCTION set_player_context(p_player_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_player_id', p_player_id, true);
END;
$$;

-- ============================================================
-- ЧАСТЬ 6: RPC ФУНКЦИИ
-- ============================================================

-- 6.1 Создание профиля для auth пользователя
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
  -- player_id = 'auth_' + UUID (совпадает с usePlayerId() на клиенте)
  v_player_id := 'auth_' || p_auth_user_id::TEXT;

  INSERT INTO profiles (
    player_id, auth_user_id, email, email_verified,
    nickname, avatar_index, rating,
    total_games, wins, losses, draws,
    created_at, updated_at, last_seen_at
  ) VALUES (
    v_player_id, p_auth_user_id, p_email, FALSE,
    p_nickname, p_avatar_index, 1500,
    0, 0, 0, 0,
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (player_id) DO NOTHING
  RETURNING profiles.id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    SELECT id INTO v_profile_id FROM profiles WHERE player_id = v_player_id LIMIT 1;
  END IF;

  -- Кошелёк с бонусом 1000 токенов
  INSERT INTO wallets (profile_id, crypto_balance, locked_balance, updated_at)
  VALUES (v_profile_id, 1000, 0, NOW())
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN QUERY SELECT v_profile_id, TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.2 Триггер: автоматическое создание профиля при регистрации
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_profile_for_auth(
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nickname', NEW.user_metadata->>'nickname', 'Player_' || SUBSTR(NEW.id::TEXT, 1, 8)),
    COALESCE((NEW.raw_user_meta_data->>'avatar_index')::INT, (NEW.user_metadata->>'avatar_index')::INT, 0)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- 6.3 get_or_create_profile (для анонимных и auth пользователей)
CREATE OR REPLACE FUNCTION get_or_create_profile(p_player_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_wallet  wallets%ROWTYPE;
BEGIN
  -- Устанавливаем контекст для RLS
  PERFORM set_config('app.current_player_id', p_player_id, true);

  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    -- Создаём профиль
    INSERT INTO profiles (player_id, nickname, avatar_index)
    VALUES (p_player_id, 'Player_' || substring(p_player_id, 3, 6), 0)
    RETURNING * INTO v_profile;

    -- Стартовый бонус 1000 токенов
    INSERT INTO wallets (profile_id, crypto_balance, locked_balance)
    VALUES (v_profile.id, 1000, 0)
    RETURNING * INTO v_wallet;

    INSERT INTO wallet_transactions (profile_id, type, amount, note)
    VALUES (v_profile.id, 'starting_bonus', 1000, 'Стартовый бонус');
  ELSE
    SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id;

    IF NOT FOUND THEN
      INSERT INTO wallets (profile_id, crypto_balance, locked_balance)
      VALUES (v_profile.id, 1000, 0)
      RETURNING * INTO v_wallet;
    END IF;
  END IF;

  UPDATE profiles SET last_seen_at = now() WHERE id = v_profile.id;

  RETURN json_build_object(
    'profile', row_to_json(v_profile),
    'wallet', row_to_json(v_wallet)
  );
END;
$$;

-- 6.4 update_profile
CREATE OR REPLACE FUNCTION update_profile(
  p_player_id text,
  p_nickname text,
  p_avatar_index int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
BEGIN
  UPDATE profiles
  SET nickname     = p_nickname,
      avatar_index = p_avatar_index,
      updated_at   = now()
  WHERE player_id = p_player_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN row_to_json(v_profile);
END;
$$;

-- 6.5 create_stake_game (СТАВКА >= 1 для поддержки 1, 5, 10, 50)
CREATE OR REPLACE FUNCTION create_stake_game(
  p_player_id TEXT,
  p_entry_fee NUMERIC,
  p_room_code TEXT,
  p_board_state JSONB
)
RETURNS TABLE(game_id UUID, room_code TEXT, error TEXT) AS $$
DECLARE
  v_profile_id UUID;
  v_game_id UUID;
  v_balance NUMERIC;
  v_active_games INT;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE player_id = p_player_id LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'Профиль не найден'::TEXT;
    RETURN;
  END IF;

  -- Лимит активных игр
  SELECT COUNT(*) INTO v_active_games
  FROM game_stakes gs
  JOIN games g ON gs.game_id = g.id
  WHERE gs.white_profile_id = v_profile_id
    AND g.status IN ('waiting', 'playing');

  IF v_active_games >= 5 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'Слишком много активных игр (макс 5)'::TEXT;
    RETURN;
  END IF;

  -- Проверка баланса
  SELECT crypto_balance INTO v_balance FROM wallets WHERE profile_id = v_profile_id FOR UPDATE;
  
  IF v_balance IS NULL OR v_balance < p_entry_fee THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'Недостаточно средств'::TEXT;
    RETURN;
  END IF;

  -- Создать игру
  INSERT INTO games (
    room_code, status, white_player_id, current_turn, board_state, move_number, match_type, white_profile_id
  ) VALUES (
    p_room_code, 'waiting', p_player_id, 'white', p_board_state, 1, 'stake', v_profile_id
  )
  RETURNING games.id INTO v_game_id;

  -- Создать ставку
  INSERT INTO game_stakes (
    game_id, entry_fee, pot_amount, white_profile_id, escrow_status
  ) VALUES (
    v_game_id, p_entry_fee, p_entry_fee, v_profile_id, 'waiting'
  );

  -- Блокировка средств
  UPDATE wallets
  SET crypto_balance = crypto_balance - p_entry_fee,
      locked_balance = locked_balance + p_entry_fee,
      updated_at = NOW()
  WHERE profile_id = v_profile_id;

  INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
  VALUES (v_profile_id, v_game_id, 'fee_lock', p_entry_fee, 'completed', 
    'Ставка заблокирована для игры ' || v_game_id::TEXT);

  RETURN QUERY SELECT v_game_id, p_room_code, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.6 join_stake_game
CREATE OR REPLACE FUNCTION join_stake_game(
  p_player_id TEXT,
  p_game_id UUID
)
RETURNS TABLE(success BOOLEAN, entry_fee NUMERIC, error TEXT) AS $$
DECLARE
  v_profile_id UUID;
  v_entry_fee NUMERIC;
  v_balance NUMERIC;
  v_white_player_id TEXT;
  v_game_status TEXT;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE player_id = p_player_id LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Профиль не найден'::TEXT;
    RETURN;
  END IF;

  SELECT gs.entry_fee, g.white_player_id, g.status 
  INTO v_entry_fee, v_white_player_id, v_game_status
  FROM game_stakes gs
  JOIN games g ON gs.game_id = g.id
  WHERE gs.game_id = p_game_id
  FOR UPDATE OF gs, g;

  IF v_entry_fee IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Игра не найдена'::TEXT;
    RETURN;
  END IF;

  IF v_game_status != 'waiting' THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Игра уже началась или завершена'::TEXT;
    RETURN;
  END IF;

  IF v_white_player_id = p_player_id THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Вы не можете присоединиться к своей игре'::TEXT;
    RETURN;
  END IF;

  SELECT crypto_balance INTO v_balance FROM wallets WHERE profile_id = v_profile_id FOR UPDATE;
  
  IF v_balance IS NULL OR v_balance < v_entry_fee THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Недостаточно средств'::TEXT;
    RETURN;
  END IF;

  UPDATE games
  SET black_player_id = p_player_id,
      black_profile_id = v_profile_id,
      status = 'playing',
      updated_at = NOW()
  WHERE id = p_game_id;

  UPDATE game_stakes
  SET black_profile_id = v_profile_id,
      pot_amount = pot_amount + v_entry_fee,
      escrow_status = 'locked',
      updated_at = NOW()
  WHERE game_id = p_game_id;

  UPDATE wallets
  SET crypto_balance = crypto_balance - v_entry_fee,
      locked_balance = locked_balance + v_entry_fee,
      updated_at = NOW()
  WHERE profile_id = v_profile_id;

  INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
  VALUES (v_profile_id, p_game_id, 'fee_lock', v_entry_fee, 'completed', 
    'Ставка заблокирована для присоединения к игре');

  RETURN QUERY SELECT TRUE, v_entry_fee, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.7 process_stake_game_result
CREATE OR REPLACE FUNCTION process_stake_game_result(
  p_game_id UUID,
  p_winner_color TEXT,
  p_finish_reason TEXT,
  p_caller_player_id TEXT
)
RETURNS TABLE(success BOOLEAN, error TEXT) AS $$
DECLARE
  v_white_profile_id UUID;
  v_black_profile_id UUID;
  v_white_player_id TEXT;
  v_black_player_id TEXT;
  v_pot_amount NUMERIC;
  v_entry_fee NUMERIC;
  v_commission NUMERIC;
  v_payout NUMERIC;
  v_game_status TEXT;
  v_escrow_status TEXT;
  v_winner_profile_id UUID;
  v_loser_profile_id UUID;
BEGIN
  SELECT 
    gs.white_profile_id, gs.black_profile_id, gs.pot_amount, gs.entry_fee,
    gs.escrow_status, g.status, g.white_player_id, g.black_player_id
  INTO 
    v_white_profile_id, v_black_profile_id, v_pot_amount, v_entry_fee,
    v_escrow_status, v_game_status, v_white_player_id, v_black_player_id
  FROM game_stakes gs
  JOIN games g ON gs.game_id = g.id
  WHERE gs.game_id = p_game_id
  FOR UPDATE OF gs;

  IF v_white_profile_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Ставка не найдена'::TEXT;
    RETURN;
  END IF;

  -- Проверка: caller — участник игры
  IF p_caller_player_id != v_white_player_id AND p_caller_player_id != v_black_player_id THEN
    RETURN QUERY SELECT FALSE, 'Вы не участник этой игры'::TEXT;
    RETURN;
  END IF;

  -- Проверка: ставка ещё не обработана
  IF v_escrow_status IN ('paid', 'refunded') THEN
    RETURN QUERY SELECT FALSE, 'Ставка уже обработана'::TEXT;
    RETURN;
  END IF;

  -- Если только один игрок — возврат
  IF v_black_profile_id IS NULL THEN
    UPDATE wallets
    SET crypto_balance = crypto_balance + v_entry_fee,
        locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
        updated_at = NOW()
    WHERE profile_id = v_white_profile_id;

    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES (v_white_profile_id, p_game_id, 'fee_refund', v_entry_fee, 'completed', 'Возврат ставки (соперник не найден)');

    UPDATE game_stakes SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = NOW()
    WHERE game_id = p_game_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT;
    RETURN;
  END IF;

  -- Комиссия 5%
  v_commission := v_pot_amount * 0.05;
  v_payout := v_pot_amount - v_commission;

  -- Ничья
  IF p_winner_color IS NULL OR p_winner_color = '' OR p_winner_color = 'draw' THEN
    UPDATE wallets
    SET crypto_balance = crypto_balance + v_entry_fee,
        locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
        updated_at = NOW()
    WHERE profile_id = v_white_profile_id;

    UPDATE wallets
    SET crypto_balance = crypto_balance + v_entry_fee,
        locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
        updated_at = NOW()
    WHERE profile_id = v_black_profile_id;

    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES 
      (v_white_profile_id, p_game_id, 'fee_refund', v_entry_fee, 'completed', 'Возврат ставки (ничья)'),
      (v_black_profile_id, p_game_id, 'fee_refund', v_entry_fee, 'completed', 'Возврат ставки (ничья)');

    UPDATE game_stakes
    SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = NOW()
    WHERE game_id = p_game_id;

    -- Обновить статистику
    UPDATE profiles SET draws = draws + 1, total_games = total_games + 1, updated_at = now()
    WHERE id IN (v_white_profile_id, v_black_profile_id);

  ELSE
    -- Определить победителя
    IF p_winner_color = 'white' THEN
      v_winner_profile_id := v_white_profile_id;
      v_loser_profile_id := v_black_profile_id;
    ELSE
      v_winner_profile_id := v_black_profile_id;
      v_loser_profile_id := v_white_profile_id;
    END IF;

    -- Выплата победителю
    UPDATE wallets
    SET crypto_balance = crypto_balance + v_payout,
        locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
        updated_at = NOW()
    WHERE profile_id = v_winner_profile_id;

    -- Проигравший теряет ставку
    UPDATE wallets
    SET locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
        updated_at = NOW()
    WHERE profile_id = v_loser_profile_id;

    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES 
      (v_winner_profile_id, p_game_id, 'prize_payout', v_payout, 'completed', 'Выигрыш ставки (комиссия 5%)'),
      (v_loser_profile_id, p_game_id, 'loss', v_entry_fee, 'completed', 'Проигрыш ставки');

    UPDATE game_stakes
    SET escrow_status = 'paid', payout_status = 'paid', updated_at = NOW()
    WHERE game_id = p_game_id;

    -- Обновить статистику
    UPDATE profiles SET wins = wins + 1, total_games = total_games + 1,
           rating = LEAST(rating + 25, 9999), updated_at = now()
    WHERE id = v_winner_profile_id;

    UPDATE profiles SET losses = losses + 1, total_games = total_games + 1,
           rating = GREATEST(rating - 15, 100), updated_at = now()
    WHERE id = v_loser_profile_id;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.8 cancel_stake_game
CREATE OR REPLACE FUNCTION cancel_stake_game(
  p_player_id TEXT,
  p_game_id UUID
)
RETURNS TABLE(success BOOLEAN, error TEXT) AS $$
DECLARE
  v_profile_id UUID;
  v_entry_fee NUMERIC;
  v_white_player_id TEXT;
  v_game_status TEXT;
  v_escrow_status TEXT;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE player_id = p_player_id LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Профиль не найден'::TEXT;
    RETURN;
  END IF;

  SELECT gs.entry_fee, g.white_player_id, g.status, gs.escrow_status
  INTO v_entry_fee, v_white_player_id, v_game_status, v_escrow_status
  FROM game_stakes gs
  JOIN games g ON gs.game_id = g.id
  WHERE gs.game_id = p_game_id
  FOR UPDATE OF gs, g;

  IF v_entry_fee IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Ставка не найдена'::TEXT;
    RETURN;
  END IF;

  IF v_white_player_id != p_player_id THEN
    RETURN QUERY SELECT FALSE, 'Только создатель может отменить игру'::TEXT;
    RETURN;
  END IF;

  IF v_game_status != 'waiting' THEN
    RETURN QUERY SELECT FALSE, 'Игра уже началась, отмена невозможна'::TEXT;
    RETURN;
  END IF;

  IF v_escrow_status IN ('paid', 'refunded') THEN
    RETURN QUERY SELECT FALSE, 'Ставка уже обработана'::TEXT;
    RETURN;
  END IF;

  UPDATE wallets
  SET crypto_balance = crypto_balance + v_entry_fee,
      locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
      updated_at = NOW()
  WHERE profile_id = v_profile_id;

  INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
  VALUES (v_profile_id, p_game_id, 'fee_refund', v_entry_fee, 'completed', 'Отмена ставки');

  UPDATE game_stakes SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = NOW()
  WHERE game_id = p_game_id;

  UPDATE games SET status = 'finished', winner = NULL, updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.9 process_game_result (для обычных игр без ставок)
CREATE OR REPLACE FUNCTION process_game_result(
  p_game_id uuid,
  p_winner_player_id text,
  p_finish_reason text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stake game_stakes%ROWTYPE;
  v_winner_profile profiles%ROWTYPE;
  v_loser_profile profiles%ROWTYPE;
  v_game games%ROWTYPE;
  v_is_draw boolean;
BEGIN
  SELECT * INTO v_stake FROM game_stakes WHERE game_id = p_game_id;
  IF NOT FOUND THEN
    -- Нет ставки — обычная игра, обновляем только статистику
    SELECT * INTO v_game FROM games WHERE id = p_game_id;
    v_is_draw := (p_winner_player_id IS NULL OR p_winner_player_id = '');
    
    IF NOT v_is_draw THEN
      SELECT * INTO v_winner_profile FROM profiles WHERE player_id = p_winner_player_id;
      IF FOUND THEN
        UPDATE profiles SET wins = wins + 1, total_games = total_games + 1,
               rating = LEAST(rating + 25, 9999), updated_at = now()
        WHERE id = v_winner_profile.id;
      END IF;
    END IF;
    
    RETURN json_build_object('success', true, 'note', 'no_stake');
  END IF;

  -- Идемпотентность
  IF v_stake.payout_status IN ('paid', 'refunded') THEN
    RETURN json_build_object('success', true, 'note', 'already_processed');
  END IF;

  RETURN json_build_object('success', true, 'note', 'use_process_stake_game_result');
END;
$$;

-- 6.10 Получить профиль текущего auth пользователя
CREATE OR REPLACE FUNCTION get_current_user_profile()
RETURNS TABLE(
  id UUID, player_id TEXT, nickname TEXT, avatar_index INT,
  rating INT, total_games INT, wins INT, losses INT, draws INT,
  email TEXT, email_verified BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.player_id, p.nickname, p.avatar_index,
         p.rating, p.total_games, p.wins, p.losses, p.draws,
         p.email, p.email_verified
  FROM profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.11 Обновить профиль через auth
CREATE OR REPLACE FUNCTION update_user_profile(
  p_nickname TEXT DEFAULT NULL,
  p_avatar_index INT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Профиль не найден'::TEXT;
    RETURN;
  END IF;

  UPDATE profiles
  SET nickname = COALESCE(p_nickname, nickname),
      avatar_index = COALESCE(p_avatar_index, avatar_index),
      updated_at = NOW()
  WHERE id = v_profile_id;

  RETURN QUERY SELECT TRUE, 'Профиль обновлён'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ЧАСТЬ 7: RLS ПОЛИТИКИ (ФИНАЛЬНЫЕ)
-- ============================================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Users can read all profiles"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT WITH CHECK (
    auth_user_id = auth.uid()
    OR auth.uid() IS NULL  -- для анонимных
  );

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (
    auth_user_id = auth.uid()
    OR player_id = current_setting('app.current_player_id', true)
  );

-- Wallets
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_read_own" ON wallets;
DROP POLICY IF EXISTS "Users can read their wallet" ON wallets;

CREATE POLICY "Users can read their wallet"
  ON wallets FOR SELECT USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR
    profile_id IN (SELECT id FROM profiles WHERE player_id = current_setting('app.current_player_id', true))
  );

-- Wallet Transactions
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "txns_read_all" ON wallet_transactions;
DROP POLICY IF EXISTS "Users can read their transactions" ON wallet_transactions;

CREATE POLICY "Users can read their transactions"
  ON wallet_transactions FOR SELECT USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR
    profile_id IN (SELECT id FROM profiles WHERE player_id = current_setting('app.current_player_id', true))
  );

-- Game Stakes
ALTER TABLE game_stakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stakes_read_all" ON game_stakes;
DROP POLICY IF EXISTS "Anyone can read stakes" ON game_stakes;

CREATE POLICY "Anyone can read stakes"
  ON game_stakes FOR SELECT USING (true);

-- ============================================================
-- ЧАСТЬ 8: ПУБЛИЧНОЕ ПРЕДСТАВЛЕНИЕ (без player_id)
-- ============================================================

CREATE OR REPLACE VIEW public_profiles AS
SELECT id, nickname, avatar_index, rating, total_games,
       wins, losses, draws, created_at, last_seen_at
FROM profiles;

GRANT SELECT ON public_profiles TO anon, authenticated;

-- ============================================================
-- ЧАСТЬ 9: RATE LIMITING
-- ============================================================

CREATE TABLE IF NOT EXISTS profile_creation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pcl_created_idx ON profile_creation_log(created_at);

CREATE OR REPLACE FUNCTION cleanup_profile_creation_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM profile_creation_log WHERE created_at < now() - interval '1 day';
END;
$$;

-- ============================================================
-- ЧАСТЬ 10: REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE moves;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE wallet_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_stakes;

-- ============================================================
-- ✅ МИГРАЦИЯ ЗАВЕРШЕНА!
-- 
-- ВАЖНО: После запуска этого SQL:
-- 1. Включите Google OAuth в Supabase Dashboard → Authentication → Providers → Google
-- 2. Добавьте Redirect URL: https://your-domain.com/auth/callback
-- 3. Включите Realtime для таблиц games в Dashboard → Database → Replication
-- ============================================================
