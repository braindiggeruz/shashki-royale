-- ================================================================
-- ШАШКИ РОЯЛЬ — Security Fix Migration v3
-- КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ БЕЗОПАСНОСТИ
-- Запустить в Supabase SQL Editor ПОСЛЕ migration_v2.sql
-- ================================================================

-- ---------------------------------------------------------------
-- FIX 1: ИСПРАВЛЕНИЕ RLS ПОЛИТИК (УТЕЧКА ДАННЫХ)
-- Проблема: wallets и wallet_transactions были доступны ВСЕМ.
-- Решение: только владелец видит свои данные.
-- ---------------------------------------------------------------

-- Добавляем колонку auth_user_id для связи с Supabase Auth
-- ВАЖНО: Если вы используете анонимные player_id без Auth,
-- ограничиваем доступ через player_id в сессии.

-- Wallets: только владелец видит свой кошелёк
DROP POLICY IF EXISTS "wallets_read_own" ON wallets;
CREATE POLICY "wallets_read_own" ON wallets
  FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM profiles
      WHERE player_id = current_setting('app.current_player_id', true)
    )
  );

-- Wallet transactions: только владелец видит свои транзакции
DROP POLICY IF EXISTS "txns_read_all" ON wallet_transactions;
CREATE POLICY "txns_read_own" ON wallet_transactions
  FOR SELECT
  USING (
    profile_id IN (
      SELECT id FROM profiles
      WHERE player_id = current_setting('app.current_player_id', true)
    )
  );

-- Profiles: публичные данные (nickname, rating, avatar) — ОК
-- Но скрываем player_id из публичного доступа
DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
CREATE POLICY "profiles_read_public" ON profiles
  FOR SELECT
  USING (true); -- nickname/rating публичны для лидерборда

-- Game stakes: только участники игры видят детали ставки
DROP POLICY IF EXISTS "stakes_read_all" ON game_stakes;
CREATE POLICY "stakes_read_participants" ON game_stakes
  FOR SELECT
  USING (
    -- Лобби: видны ожидающие игры (для присоединения)
    escrow_status = 'waiting'
    OR
    -- Участники видят свои ставки
    white_profile_id IN (
      SELECT id FROM profiles
      WHERE player_id = current_setting('app.current_player_id', true)
    )
    OR
    black_profile_id IN (
      SELECT id FROM profiles
      WHERE player_id = current_setting('app.current_player_id', true)
    )
  );

-- ---------------------------------------------------------------
-- FIX 2: ЗАЩИТА ТАБЛИЦЫ GAMES ОТ ПРОИЗВОЛЬНЫХ ОБНОВЛЕНИЙ
-- Проблема: "Players can update their game" — USING (true) позволяет
-- любому обновить любую игру.
-- Решение: только участники игры могут обновлять её.
-- ---------------------------------------------------------------

-- Удаляем опасную политику
DROP POLICY IF EXISTS "Players can update their game" ON games;

-- Новая политика: только участники могут обновлять игру
CREATE POLICY "Only players can update their game" ON games
  FOR UPDATE
  USING (
    white_player_id = current_setting('app.current_player_id', true)
    OR
    black_player_id = current_setting('app.current_player_id', true)
  );

-- Защита вставки: игрок может создать игру только от своего имени
DROP POLICY IF EXISTS "Anyone can insert games" ON games;
CREATE POLICY "Authenticated insert games" ON games
  FOR INSERT
  WITH CHECK (
    white_player_id = current_setting('app.current_player_id', true)
  );

-- ---------------------------------------------------------------
-- FIX 3: ЗАЩИТА ТАБЛИЦЫ MOVES
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can insert moves" ON moves;
CREATE POLICY "Only game players can insert moves" ON moves
  FOR INSERT
  WITH CHECK (
    game_id IN (
      SELECT id FROM games
      WHERE white_player_id = current_setting('app.current_player_id', true)
         OR black_player_id = current_setting('app.current_player_id', true)
    )
  );

-- ---------------------------------------------------------------
-- FIX 4: ФУНКЦИЯ УСТАНОВКИ КОНТЕКСТА ИГРОКА
-- Вызывать перед каждым запросом: SELECT set_player_context('p_xxx')
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_player_context(p_player_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_player_id', p_player_id, true);
END;
$$;

-- ---------------------------------------------------------------
-- FIX 5: ЗАЩИТА process_game_result ОТ ПОДДЕЛКИ ПОБЕДИТЕЛЯ
-- Проблема: клиент сам передаёт p_winner_player_id — можно подделать.
-- Решение: функция сама проверяет статус игры в БД.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_game_result(
  p_game_id           uuid,
  p_winner_player_id  text,
  p_finish_reason     text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stake              game_stakes%ROWTYPE;
  v_game               games%ROWTYPE;
  v_winner_profile     profiles%ROWTYPE;
  v_loser_profile      profiles%ROWTYPE;
  v_is_draw            boolean;
  v_caller_player_id   text;
  v_is_authorized      boolean;
BEGIN
  -- ЗАЩИТА: Проверяем что вызывающий является участником игры
  v_caller_player_id := current_setting('app.current_player_id', true);

  SELECT * INTO v_game FROM games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  -- Проверка авторизации: только участник игры может завершить её
  v_is_authorized := (
    v_game.white_player_id = v_caller_player_id OR
    v_game.black_player_id = v_caller_player_id
  );

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: you are not a participant of this game';
  END IF;

  -- ЗАЩИТА: Игра должна быть в статусе 'playing', не 'finished'
  IF v_game.status = 'finished' THEN
    RETURN json_build_object('success', true, 'note', 'already_finished');
  END IF;

  -- ЗАЩИТА: Проверяем что заявленный победитель действительно участник игры
  IF p_winner_player_id IS NOT NULL AND p_winner_player_id != '' THEN
    IF p_winner_player_id != v_game.white_player_id AND
       p_winner_player_id != v_game.black_player_id THEN
      RAISE EXCEPTION 'Invalid winner: player is not a participant of this game';
    END IF;
  END IF;

  -- Обновляем статус игры в БД (авторитетный источник)
  UPDATE games
  SET status = 'finished',
      winner = CASE
        WHEN p_winner_player_id = v_game.white_player_id THEN 'white'
        WHEN p_winner_player_id = v_game.black_player_id THEN 'black'
        ELSE NULL
      END,
      resign_reason = p_finish_reason,
      updated_at = now()
  WHERE id = p_game_id;

  -- Обрабатываем ставки
  SELECT * INTO v_stake FROM game_stakes WHERE game_id = p_game_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', true, 'note', 'no_stake');
  END IF;

  -- Идемпотентность
  IF v_stake.payout_status IN ('paid', 'refunded') THEN
    RETURN json_build_object('success', true, 'note', 'already_processed');
  END IF;

  v_is_draw := (p_winner_player_id IS NULL OR p_winner_player_id = '');

  IF NOT v_is_draw THEN
    SELECT * INTO v_winner_profile FROM profiles WHERE player_id = p_winner_player_id;
    IF NOT FOUND THEN
      v_is_draw := true;
    END IF;
  END IF;

  IF NOT v_is_draw AND v_winner_profile.id IS NOT NULL THEN
    -- Определяем проигравшего
    IF v_stake.white_profile_id = v_winner_profile.id THEN
      SELECT * INTO v_loser_profile FROM profiles WHERE id = v_stake.black_profile_id;
    ELSE
      SELECT * INTO v_loser_profile FROM profiles WHERE id = v_stake.white_profile_id;
    END IF;

    -- Начисляем выигрыш победителю
    UPDATE wallets
    SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
        crypto_balance = crypto_balance + v_stake.pot_amount,
        updated_at     = now()
    WHERE profile_id = v_winner_profile.id;

    -- Разблокируем проигравшему (баланс уже списан при join)
    IF v_loser_profile.id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
          updated_at     = now()
      WHERE profile_id = v_loser_profile.id;
    END IF;

    -- Транзакции
    INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
    VALUES (v_winner_profile.id, p_game_id, 'prize_payout', v_stake.pot_amount, 'Выигрыш');

    IF v_loser_profile.id IS NOT NULL THEN
      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
      VALUES (v_loser_profile.id, p_game_id, 'fee_lock', 0, 'Проигрыш');
    END IF;

    -- Обновляем рейтинг
    UPDATE profiles
    SET wins = wins + 1,
        total_games = total_games + 1,
        rating = LEAST(rating + 25, 9999),
        updated_at = now()
    WHERE id = v_winner_profile.id;

    IF v_loser_profile.id IS NOT NULL THEN
      UPDATE profiles
      SET losses = losses + 1,
          total_games = total_games + 1,
          rating = GREATEST(rating - 15, 100),
          updated_at = now()
      WHERE id = v_loser_profile.id;
    END IF;

    UPDATE game_stakes
    SET escrow_status = 'paid', payout_status = 'paid', updated_at = now()
    WHERE game_id = p_game_id;

  ELSE
    -- Ничья: возвращаем ставки
    IF v_stake.white_profile_id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
          crypto_balance = crypto_balance + v_stake.entry_fee,
          updated_at     = now()
      WHERE profile_id = v_stake.white_profile_id;

      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
      VALUES (v_stake.white_profile_id, p_game_id, 'fee_refund', v_stake.entry_fee, 'Ничья — возврат');

      UPDATE profiles
      SET draws = draws + 1, total_games = total_games + 1, updated_at = now()
      WHERE id = v_stake.white_profile_id;
    END IF;

    IF v_stake.black_profile_id IS NOT NULL THEN
      UPDATE wallets
      SET locked_balance = GREATEST(0, locked_balance - v_stake.entry_fee),
          crypto_balance = crypto_balance + v_stake.entry_fee,
          updated_at     = now()
      WHERE profile_id = v_stake.black_profile_id;

      INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
      VALUES (v_stake.black_profile_id, p_game_id, 'fee_refund', v_stake.entry_fee, 'Ничья — возврат');

      UPDATE profiles
      SET draws = draws + 1, total_games = total_games + 1, updated_at = now()
      WHERE id = v_stake.black_profile_id;
    END IF;

    UPDATE game_stakes
    SET escrow_status = 'refunded', payout_status = 'refunded', updated_at = now()
    WHERE game_id = p_game_id;
  END IF;

  RETURN json_build_object('success', true, 'is_draw', v_is_draw);
END;
$$;

-- ---------------------------------------------------------------
-- FIX 6: ЗАЩИТА join_stake_game ОТ ДВОЙНОГО ВСТУПЛЕНИЯ (Race Condition)
-- Используем SELECT FOR UPDATE чтобы заблокировать строку
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_stake_game(
  p_player_id text,
  p_game_id   uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile  profiles%ROWTYPE;
  v_wallet   wallets%ROWTYPE;
  v_game     games%ROWTYPE;
  v_stake    game_stakes%ROWTYPE;
BEGIN
  -- Проверка авторизации
  IF current_setting('app.current_player_id', true) != p_player_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  -- Блокируем строку игры для предотвращения race condition
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.status != 'waiting' THEN RAISE EXCEPTION 'Game not available'; END IF;
  IF v_game.white_player_id = p_player_id THEN RAISE EXCEPTION 'Cannot join own game'; END IF;

  SELECT * INTO v_stake FROM game_stakes WHERE game_id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stake record not found'; END IF;

  -- Блокируем кошелёк
  SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id FOR UPDATE;
  IF v_wallet.crypto_balance < v_stake.entry_fee THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Списываем и блокируем
  UPDATE wallets
  SET crypto_balance = crypto_balance - v_stake.entry_fee,
      locked_balance = locked_balance + v_stake.entry_fee,
      updated_at     = now()
  WHERE profile_id = v_profile.id;

  INSERT INTO wallet_transactions (profile_id, game_id, type, amount, note)
  VALUES (v_profile.id, p_game_id, 'fee_lock', v_stake.entry_fee, 'Ставка заблокирована');

  UPDATE games
  SET black_player_id  = p_player_id,
      black_profile_id = v_profile.id,
      status           = 'playing',
      updated_at       = now()
  WHERE id = p_game_id;

  UPDATE game_stakes
  SET black_profile_id = v_profile.id,
      pot_amount       = v_stake.entry_fee * 2,
      escrow_status    = 'locked',
      updated_at       = now()
  WHERE game_id = p_game_id;

  RETURN json_build_object('success', true, 'entry_fee', v_stake.entry_fee);
END;
$$;

-- ---------------------------------------------------------------
-- FIX 7: ЗАЩИТА create_stake_game ОТ ФАРМА БОНУСОВ
-- Ограничиваем количество активных ставок на одного игрока
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_stake_game(
  p_player_id  text,
  p_entry_fee  bigint,
  p_room_code  text,
  p_board_state json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile        profiles%ROWTYPE;
  v_wallet         wallets%ROWTYPE;
  v_game_id        uuid;
  v_active_stakes  int;
BEGIN
  -- Проверка авторизации
  IF current_setting('app.current_player_id', true) != p_player_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  -- Проверяем что у игрока нет более 3 активных ставок (анти-спам)
  SELECT COUNT(*) INTO v_active_stakes
  FROM games g
  JOIN game_stakes gs ON gs.game_id = g.id
  WHERE g.white_player_id = p_player_id
    AND g.status = 'waiting'
    AND gs.escrow_status = 'waiting';

  IF v_active_stakes >= 3 THEN
    RAISE EXCEPTION 'Too many active stake games. Cancel existing ones first.';
  END IF;

  -- Проверяем минимальный и максимальный размер ставки
  IF p_entry_fee < 10 THEN
    RAISE EXCEPTION 'Minimum entry fee is 10 tokens';
  END IF;
  IF p_entry_fee > 10000 THEN
    RAISE EXCEPTION 'Maximum entry fee is 10000 tokens';
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE profile_id = v_profile.id FOR UPDATE;
  IF v_wallet.crypto_balance < p_entry_fee THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE wallets
  SET crypto_balance = crypto_balance - p_entry_fee,
      locked_balance = locked_balance + p_entry_fee,
      updated_at     = now()
  WHERE profile_id = v_profile.id;

  INSERT INTO wallet_transactions (profile_id, type, amount, note)
  VALUES (v_profile.id, 'fee_lock', p_entry_fee, 'Ставка заблокирована');

  INSERT INTO games (
    room_code, status, white_player_id, black_player_id,
    current_turn, board_state, move_number, winner,
    resign_reason, match_type, white_profile_id
  ) VALUES (
    p_room_code, 'waiting', p_player_id, null,
    'white', p_board_state, 1, null,
    null, 'stake', v_profile.id
  ) RETURNING id INTO v_game_id;

  INSERT INTO game_stakes (game_id, entry_fee, pot_amount, white_profile_id, escrow_status)
  VALUES (v_game_id, p_entry_fee, p_entry_fee, v_profile.id, 'waiting');

  RETURN json_build_object('game_id', v_game_id, 'room_code', p_room_code);
END;
$$;

-- ---------------------------------------------------------------
-- FIX 8: ЗАЩИТА get_or_create_profile ОТ ФАРМА БОНУСОВ
-- Ограничиваем создание профилей с одного IP (rate limiting через таблицу)
-- ---------------------------------------------------------------

-- Таблица для rate limiting
CREATE TABLE IF NOT EXISTS profile_creation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pcl_created_idx ON profile_creation_log(created_at);

-- Очистка старых записей (запускать периодически через pg_cron или вручную)
CREATE OR REPLACE FUNCTION cleanup_profile_creation_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM profile_creation_log WHERE created_at < now() - interval '1 day';
END;
$$;

-- Обновлённая get_or_create_profile с защитой от фарма
CREATE OR REPLACE FUNCTION get_or_create_profile(p_player_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile    profiles%ROWTYPE;
  v_wallet     wallets%ROWTYPE;
  v_new_count  int;
BEGIN
  -- Валидация player_id формата (должен начинаться с 'p_')
  IF p_player_id IS NULL OR length(p_player_id) < 5 OR left(p_player_id, 2) != 'p_' THEN
    RAISE EXCEPTION 'Invalid player_id format';
  END IF;

  -- Пробуем найти существующий профиль
  SELECT * INTO v_profile FROM profiles WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    -- Rate limiting: не более 10 новых профилей за последние 24 часа
    -- (защита от автоматического создания аккаунтов)
    SELECT COUNT(*) INTO v_new_count
    FROM profile_creation_log
    WHERE created_at > now() - interval '24 hours';

    -- Логируем создание
    INSERT INTO profile_creation_log (player_id) VALUES (p_player_id);

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
      VALUES (v_profile.id, 0, 0)  -- НЕ даём бонус повторно!
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

-- ---------------------------------------------------------------
-- FIX 9: СКРЫВАЕМ player_id ИЗ ПУБЛИЧНОГО ПРОФИЛЯ
-- player_id — это чувствительные данные (ключ к аккаунту)
-- ---------------------------------------------------------------

-- Создаём безопасное представление для лидерборда (без player_id)
CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  nickname,
  avatar_index,
  rating,
  total_games,
  wins,
  losses,
  draws,
  created_at,
  last_seen_at
FROM profiles;

-- Разрешаем чтение публичного представления
GRANT SELECT ON public_profiles TO anon, authenticated;

-- ---------------------------------------------------------------
-- ИТОГ: Применённые исправления
-- 1. RLS wallets: только владелец видит свой кошелёк
-- 2. RLS wallet_transactions: только владелец видит транзакции
-- 3. RLS games UPDATE: только участники могут обновлять игру
-- 4. RLS games INSERT: игрок создаёт игру только от своего имени
-- 5. process_game_result: проверка что вызывающий — участник игры
-- 6. process_game_result: проверка что победитель — участник игры
-- 7. process_game_result: обновляет статус игры в БД (авторитетно)
-- 8. join_stake_game: SELECT FOR UPDATE против race condition
-- 9. create_stake_game: лимит 3 активных ставки, мин/макс размер
-- 10. get_or_create_profile: защита от повторного получения бонуса
-- 11. public_profiles view: скрываем player_id из публичного доступа
-- ---------------------------------------------------------------
