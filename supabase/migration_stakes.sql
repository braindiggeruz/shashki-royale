-- ============================================================
-- Миграция: Система ставок и кошельков (v2 — SECURITY FIXED)
-- ============================================================

-- 1. Таблица: Wallets (кошельки)
CREATE TABLE IF NOT EXISTS wallets (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  crypto_balance NUMERIC(20,2) NOT NULL DEFAULT 1000.00 CHECK (crypto_balance >= 0),
  locked_balance NUMERIC(20,2) NOT NULL DEFAULT 0.00 CHECK (locked_balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Таблица: Wallet Transactions (история транзакций)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'deposit', 'withdrawal', 'fee_lock', 'fee_refund', 
    'prize_payout', 'starting_bonus', 'loss'
  )),
  amount NUMERIC(20,2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Таблица: Game Stakes (ставки в играх)
CREATE TABLE IF NOT EXISTS game_stakes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  entry_fee NUMERIC(20,2) NOT NULL CHECK (entry_fee >= 10 AND entry_fee <= 10000),
  pot_amount NUMERIC(20,2) NOT NULL,
  white_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  black_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  escrow_status TEXT NOT NULL DEFAULT 'waiting' CHECK (
    escrow_status IN ('waiting', 'locked', 'paid', 'refunded')
  ),
  payout_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    payout_status IN ('pending', 'paid', 'failed', 'refunded')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Создать индексы
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

-- ============================================================
-- RPC ФУНКЦИЯ: Создать игру со ставкой (SECURITY FIXED)
-- ============================================================

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
  -- Получить profile_id по player_id
  SELECT id INTO v_profile_id FROM profiles WHERE player_id = p_player_id LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'Профиль не найден'::TEXT;
    RETURN;
  END IF;

  -- RATE LIMITING: Проверить количество активных игр (макс 5)
  SELECT COUNT(*) INTO v_active_games
  FROM game_stakes gs
  JOIN games g ON gs.game_id = g.id
  WHERE gs.white_profile_id = v_profile_id
    AND g.status IN ('waiting', 'playing');

  IF v_active_games >= 5 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'Слишком много активных игр (макс 5)'::TEXT;
    RETURN;
  END IF;

  -- Проверить баланс (ДОСТУПНЫЙ баланс = crypto_balance, НЕ locked)
  SELECT crypto_balance INTO v_balance FROM wallets WHERE profile_id = v_profile_id FOR UPDATE;
  
  IF v_balance IS NULL OR v_balance < p_entry_fee THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, 'Недостаточно средств'::TEXT;
    RETURN;
  END IF;

  -- Создать игру
  INSERT INTO games (
    room_code, status, white_player_id, current_turn, board_state, move_number
  ) VALUES (
    p_room_code, 'waiting', p_player_id, 'white', p_board_state, 1
  )
  RETURNING games.id INTO v_game_id;

  -- Создать ставку
  INSERT INTO game_stakes (
    game_id, entry_fee, pot_amount, white_profile_id, escrow_status
  ) VALUES (
    v_game_id, p_entry_fee, p_entry_fee, v_profile_id, 'waiting'
  );

  -- ВЫЧИТАЕМ средства из баланса И блокируем
  UPDATE wallets
  SET 
    crypto_balance = crypto_balance - p_entry_fee,
    locked_balance = locked_balance + p_entry_fee,
    updated_at = NOW()
  WHERE profile_id = v_profile_id;

  -- Записать транзакцию
  INSERT INTO wallet_transactions (
    profile_id, game_id, type, amount, status, note
  ) VALUES (
    v_profile_id, v_game_id, 'fee_lock', p_entry_fee, 'completed', 
    'Ставка заблокирована для игры ' || v_game_id::TEXT
  );

  RETURN QUERY SELECT v_game_id, p_room_code, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC ФУНКЦИЯ: Присоединиться к игре со ставкой (SECURITY FIXED)
-- ============================================================

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
  -- Получить profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE player_id = p_player_id LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Профиль не найден'::TEXT;
    RETURN;
  END IF;

  -- Получить информацию о ставке (с блокировкой строки для предотвращения race condition)
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

  -- Проверить статус игры
  IF v_game_status != 'waiting' THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Игра уже началась или завершена'::TEXT;
    RETURN;
  END IF;

  -- Проверить, что это не создатель игры
  IF v_white_player_id = p_player_id THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Вы не можете присоединиться к своей игре'::TEXT;
    RETURN;
  END IF;

  -- Проверить баланс (с блокировкой)
  SELECT crypto_balance INTO v_balance FROM wallets WHERE profile_id = v_profile_id FOR UPDATE;
  
  IF v_balance IS NULL OR v_balance < v_entry_fee THEN
    RETURN QUERY SELECT FALSE, NULL::NUMERIC, 'Недостаточно средств'::TEXT;
    RETURN;
  END IF;

  -- Обновить игру
  UPDATE games
  SET 
    black_player_id = p_player_id,
    status = 'playing',
    updated_at = NOW()
  WHERE id = p_game_id;

  -- Обновить ставку
  UPDATE game_stakes
  SET 
    black_profile_id = v_profile_id,
    pot_amount = pot_amount + v_entry_fee,
    escrow_status = 'locked',
    updated_at = NOW()
  WHERE game_id = p_game_id;

  -- ВЫЧИТАЕМ средства из баланса И блокируем
  UPDATE wallets
  SET 
    crypto_balance = crypto_balance - v_entry_fee,
    locked_balance = locked_balance + v_entry_fee,
    updated_at = NOW()
  WHERE profile_id = v_profile_id;

  -- Записать транзакцию
  INSERT INTO wallet_transactions (
    profile_id, game_id, type, amount, status, note
  ) VALUES (
    v_profile_id, p_game_id, 'fee_lock', v_entry_fee, 'completed', 
    'Ставка заблокирована для присоединения к игре'
  );

  RETURN QUERY SELECT TRUE, v_entry_fee, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC ФУНКЦИЯ: Обработать результат игры со ставками (SECURITY FIXED)
-- ============================================================

CREATE OR REPLACE FUNCTION process_stake_game_result(
  p_game_id UUID,
  p_winner_color TEXT,  -- 'white', 'black', или NULL для ничьей
  p_finish_reason TEXT,
  p_caller_player_id TEXT  -- Для проверки, что caller — участник игры
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
  -- Получить информацию о ставке (с блокировкой для предотвращения двойной обработки)
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

  -- ЗАЩИТА: Проверить, что caller — участник игры
  IF p_caller_player_id != v_white_player_id AND p_caller_player_id != v_black_player_id THEN
    RETURN QUERY SELECT FALSE, 'Вы не участник этой игры'::TEXT;
    RETURN;
  END IF;

  -- ЗАЩИТА: Проверить, что ставка ещё не обработана
  IF v_escrow_status IN ('paid', 'refunded') THEN
    RETURN QUERY SELECT FALSE, 'Ставка уже обработана'::TEXT;
    RETURN;
  END IF;

  -- Проверить, что оба игрока присоединились
  IF v_black_profile_id IS NULL THEN
    -- Только один игрок — вернуть ставку создателю
    UPDATE wallets
    SET 
      crypto_balance = crypto_balance + v_entry_fee,
      locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
      updated_at = NOW()
    WHERE profile_id = v_white_profile_id;

    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES (v_white_profile_id, p_game_id, 'fee_refund', v_entry_fee, 'completed', 'Возврат ставки (соперник не найден)');

    UPDATE game_stakes
    SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = NOW()
    WHERE game_id = p_game_id;

    RETURN QUERY SELECT TRUE, NULL::TEXT;
    RETURN;
  END IF;

  -- Вычислить комиссию (5%)
  v_commission := v_pot_amount * 0.05;
  v_payout := v_pot_amount - v_commission;

  -- Если ничья
  IF p_winner_color IS NULL OR p_winner_color = '' OR p_winner_color = 'draw' THEN
    -- Вернуть ставки обоим игрокам (из locked обратно в crypto)
    UPDATE wallets
    SET 
      crypto_balance = crypto_balance + v_entry_fee,
      locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
      updated_at = NOW()
    WHERE profile_id = v_white_profile_id;

    UPDATE wallets
    SET 
      crypto_balance = crypto_balance + v_entry_fee,
      locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
      updated_at = NOW()
    WHERE profile_id = v_black_profile_id;

    -- Записать транзакции
    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES 
      (v_white_profile_id, p_game_id, 'fee_refund', v_entry_fee, 'completed', 'Возврат ставки (ничья)'),
      (v_black_profile_id, p_game_id, 'fee_refund', v_entry_fee, 'completed', 'Возврат ставки (ничья)');

    -- Обновить ставку
    UPDATE game_stakes
    SET 
      escrow_status = 'refunded',
      payout_status = 'refunded',
      updated_at = NOW()
    WHERE game_id = p_game_id;

  ELSE
    -- Определить победителя по цвету
    IF p_winner_color = 'white' THEN
      v_winner_profile_id := v_white_profile_id;
      v_loser_profile_id := v_black_profile_id;
    ELSE
      v_winner_profile_id := v_black_profile_id;
      v_loser_profile_id := v_white_profile_id;
    END IF;

    -- Выплатить победителю (из locked в crypto + выигрыш)
    UPDATE wallets
    SET 
      crypto_balance = crypto_balance + v_payout,
      locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
      updated_at = NOW()
    WHERE profile_id = v_winner_profile_id;

    -- Проигравший теряет ставку (убираем из locked)
    UPDATE wallets
    SET 
      locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
      updated_at = NOW()
    WHERE profile_id = v_loser_profile_id;

    -- Записать транзакции
    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
    VALUES 
      (v_winner_profile_id, p_game_id, 'prize_payout', v_payout, 'completed', 'Выигрыш ставки (комиссия 5%)'),
      (v_loser_profile_id, p_game_id, 'loss', v_entry_fee, 'completed', 'Проигрыш ставки');

    -- Обновить ставку
    UPDATE game_stakes
    SET 
      escrow_status = 'paid',
      payout_status = 'paid',
      updated_at = NOW()
    WHERE game_id = p_game_id;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC ФУНКЦИЯ: Отменить ставку (если соперник не найден)
-- ============================================================

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
  -- Получить profile_id
  SELECT id INTO v_profile_id FROM profiles WHERE player_id = p_player_id LIMIT 1;
  
  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Профиль не найден'::TEXT;
    RETURN;
  END IF;

  -- Получить информацию о ставке
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

  -- Проверить, что caller — создатель игры
  IF v_white_player_id != p_player_id THEN
    RETURN QUERY SELECT FALSE, 'Только создатель может отменить игру'::TEXT;
    RETURN;
  END IF;

  -- Проверить, что игра ещё в ожидании
  IF v_game_status != 'waiting' THEN
    RETURN QUERY SELECT FALSE, 'Игра уже началась, отмена невозможна'::TEXT;
    RETURN;
  END IF;

  -- Проверить, что ставка не обработана
  IF v_escrow_status IN ('paid', 'refunded') THEN
    RETURN QUERY SELECT FALSE, 'Ставка уже обработана'::TEXT;
    RETURN;
  END IF;

  -- Вернуть средства
  UPDATE wallets
  SET 
    crypto_balance = crypto_balance + v_entry_fee,
    locked_balance = GREATEST(locked_balance - v_entry_fee, 0),
    updated_at = NOW()
  WHERE profile_id = v_profile_id;

  -- Записать транзакцию
  INSERT INTO wallet_transactions (profile_id, game_id, type, amount, status, note)
  VALUES (v_profile_id, p_game_id, 'fee_refund', v_entry_fee, 'completed', 'Отмена ставки');

  -- Обновить ставку
  UPDATE game_stakes
  SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = NOW()
  WHERE game_id = p_game_id;

  -- Удалить игру
  UPDATE games SET status = 'finished', winner = NULL, updated_at = NOW()
  WHERE id = p_game_id;

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RLS ПОЛИТИКИ (STRICT — только через RPC!)
-- ============================================================

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_stakes ENABLE ROW LEVEL SECURITY;

-- Wallets: Пользователь может ТОЛЬКО ЧИТАТЬ свой кошелёк
-- Все обновления идут через SECURITY DEFINER RPC функции
DROP POLICY IF EXISTS "Users can read their wallet" ON wallets;
DROP POLICY IF EXISTS "System can manage wallets" ON wallets;
DROP POLICY IF EXISTS "System can update wallets" ON wallets;

CREATE POLICY "Users can read their wallet"
  ON wallets FOR SELECT USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR
    profile_id IN (SELECT id FROM profiles WHERE player_id = current_setting('app.current_player_id', true))
  );

-- Wallet Transactions: Пользователь может ТОЛЬКО ЧИТАТЬ свои транзакции
DROP POLICY IF EXISTS "Users can read their transactions" ON wallet_transactions;
DROP POLICY IF EXISTS "System can insert transactions" ON wallet_transactions;

CREATE POLICY "Users can read their transactions"
  ON wallet_transactions FOR SELECT USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
    OR
    profile_id IN (SELECT id FROM profiles WHERE player_id = current_setting('app.current_player_id', true))
  );

-- Game Stakes: Все могут читать ставки (для лобби), но никто не может модифицировать напрямую
DROP POLICY IF EXISTS "Anyone can read stakes" ON game_stakes;
DROP POLICY IF EXISTS "System can manage stakes" ON game_stakes;

CREATE POLICY "Anyone can read stakes"
  ON game_stakes FOR SELECT USING (true);

-- ============================================================
-- ПУБЛИКАЦИЯ REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE wallet_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE game_stakes;

-- ============================================================
-- МИГРАЦИЯ ЗАВЕРШЕНА (v2 — SECURITY FIXED)
-- ============================================================
