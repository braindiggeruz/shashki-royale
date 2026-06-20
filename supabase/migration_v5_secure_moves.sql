-- ============================================================
-- ♟ ШАШКИ РОЯЛЬ v5 — SERVER-AUTHORITATIVE MOVE ENGINE
--    + RLS lockdown
--    + Device fingerprint anti-multi-account
--    + Rate limit on game creation
--    + Idempotent timeout finalizer
--
-- Применить ОДИН РАЗ через Supabase Dashboard SQL Editor:
--   https://supabase.com/dashboard/project/jsykbnkbrwwsxcdurzcw/sql/new
-- Миграция идемпотентна: можно перезапускать.
-- После применения клиент v1.4.7+ начнёт использовать новые RPC.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Новые колонки на games (мульти-захват, anti-stall)
-- ============================================================
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS last_move_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_from_row smallint,
  ADD COLUMN IF NOT EXISTS last_from_col smallint,
  ADD COLUMN IF NOT EXISTS last_to_row   smallint,
  ADD COLUMN IF NOT EXISTS last_to_col   smallint;

CREATE INDEX IF NOT EXISTS games_last_move_at_idx ON games (status, last_move_at);

-- ============================================================
-- 2. Device fingerprint на profiles (anti-multi-account welcome bonus)
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS device_fp_hash text;

CREATE INDEX IF NOT EXISTS profiles_device_fp_idx ON profiles (device_fp_hash);

-- ============================================================
-- 3. Rate-limit таблица (создания игр / ставок)
-- ============================================================
CREATE TABLE IF NOT EXISTS action_log (
  id          bigserial PRIMARY KEY,
  player_id   text NOT NULL,
  action      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS action_log_player_action_time_idx
  ON action_log (player_id, action, created_at DESC);

-- ============================================================
-- 4. Helpers: безопасное чтение board
-- ============================================================

-- board[r][c] — возвращает JSONB клетки или null
CREATE OR REPLACE FUNCTION _cell(b jsonb, r int, c int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN r < 0 OR r > 7 OR c < 0 OR c > 7 THEN NULL
    ELSE b->r->c
  END
$$;

CREATE OR REPLACE FUNCTION _is_empty(cell jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT cell IS NULL OR cell = 'null'::jsonb OR jsonb_typeof(cell) = 'null'
$$;

CREATE OR REPLACE FUNCTION _cell_color(cell jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _is_empty(cell) THEN NULL ELSE cell->>'color' END
$$;

CREATE OR REPLACE FUNCTION _cell_is_king(cell jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _is_empty(cell) THEN false ELSE (cell->>'type') = 'king' END
$$;

CREATE OR REPLACE FUNCTION _sign(x int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN x > 0 THEN 1 WHEN x < 0 THEN -1 ELSE 0 END
$$;

-- ============================================================
-- 5. _has_capture_at(board, r, c, color, excluded_keys)
--    Возвращает true если шашка на (r,c) цвета color имеет ход-взятие.
--    excluded_keys — захваты, уже совершённые в текущей цепочке (формата "r,c").
-- ============================================================
CREATE OR REPLACE FUNCTION _has_capture_at(
  b jsonb, r int, c int, color text, excluded_keys text[]
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  cell jsonb := _cell(b, r, c);
  is_king boolean;
  opponent text;
  dr int; dc int;
  k int;
  mr int; mc int; lr int; lc int;
  mcell jsonb; lcell jsonb;
  i int;
BEGIN
  IF _is_empty(cell) OR _cell_color(cell) <> color THEN RETURN false; END IF;
  is_king := _cell_is_king(cell);
  opponent := CASE WHEN color='white' THEN 'black' ELSE 'white' END;

  FOR i IN 1..4 LOOP
    dr := CASE i WHEN 1 THEN -1 WHEN 2 THEN -1 WHEN 3 THEN 1 ELSE 1 END;
    dc := CASE i WHEN 1 THEN -1 WHEN 2 THEN  1 WHEN 3 THEN -1 ELSE 1 END;

    IF NOT is_king THEN
      -- Man: соседняя клетка opponent, landing пустая
      mr := r + dr; mc := c + dc;
      lr := r + 2*dr; lc := c + 2*dc;
      IF lr BETWEEN 0 AND 7 AND lc BETWEEN 0 AND 7 THEN
        mcell := _cell(b, mr, mc);
        lcell := _cell(b, lr, lc);
        IF NOT _is_empty(mcell)
           AND _cell_color(mcell) = opponent
           AND _is_empty(lcell)
           AND NOT ((mr::text || ',' || mc::text) = ANY(COALESCE(excluded_keys, '{}'))) THEN
          RETURN true;
        END IF;
      END IF;
    ELSE
      -- King: slide
      k := 1;
      LOOP
        mr := r + k*dr; mc := c + k*dc;
        EXIT WHEN mr < 0 OR mr > 7 OR mc < 0 OR mc > 7;
        mcell := _cell(b, mr, mc);
        IF _is_empty(mcell) THEN
          k := k + 1; CONTINUE;
        END IF;
        -- Нашли шашку
        IF _cell_color(mcell) = opponent
           AND NOT ((mr::text || ',' || mc::text) = ANY(COALESCE(excluded_keys, '{}'))) THEN
          -- Проверяем landing на любом расстоянии за ней
          lr := mr + dr; lc := mc + dc;
          LOOP
            EXIT WHEN lr < 0 OR lr > 7 OR lc < 0 OR lc > 7;
            lcell := _cell(b, lr, lc);
            EXIT WHEN NOT _is_empty(lcell);
            -- Нашли пустую landing
            RETURN true;
          END LOOP;
        END IF;
        EXIT;  -- встретили шашку — дальше по диагонали смотреть нельзя
      END LOOP;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- ============================================================
-- 6. _has_any_capture(board, color) — есть ли у color хоть один ход-взятие
-- ============================================================
CREATE OR REPLACE FUNCTION _has_any_capture(b jsonb, color text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r int; c int;
BEGIN
  FOR r IN 0..7 LOOP
    FOR c IN 0..7 LOOP
      IF _cell_color(_cell(b, r, c)) = color THEN
        IF _has_capture_at(b, r, c, color, '{}') THEN RETURN true; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

-- ============================================================
-- 7. _has_any_noncapture(board, color) — есть ли обычный ход
-- ============================================================
CREATE OR REPLACE FUNCTION _has_any_noncapture(b jsonb, color text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  r int; c int;
  cell jsonb;
  is_king boolean;
  forward int;
  dc int;
  k int; nr int; nc int;
  dir_idx int;
  dr_k int; dc_k int;
BEGIN
  forward := CASE WHEN color='white' THEN -1 ELSE 1 END;
  FOR r IN 0..7 LOOP
    FOR c IN 0..7 LOOP
      cell := _cell(b, r, c);
      IF _cell_color(cell) <> color THEN CONTINUE; END IF;
      is_king := _cell_is_king(cell);
      IF NOT is_king THEN
        FOR dc IN -1..1 LOOP
          IF dc = 0 THEN CONTINUE; END IF;
          nr := r + forward; nc := c + dc;
          IF nr BETWEEN 0 AND 7 AND nc BETWEEN 0 AND 7
             AND _is_empty(_cell(b, nr, nc)) THEN RETURN true; END IF;
        END LOOP;
      ELSE
        FOR dir_idx IN 1..4 LOOP
          dr_k := CASE dir_idx WHEN 1 THEN -1 WHEN 2 THEN -1 WHEN 3 THEN 1 ELSE 1 END;
          dc_k := CASE dir_idx WHEN 1 THEN -1 WHEN 2 THEN  1 WHEN 3 THEN -1 ELSE 1 END;
          k := 1;
          LOOP
            nr := r + k*dr_k; nc := c + k*dc_k;
            EXIT WHEN nr < 0 OR nr > 7 OR nc < 0 OR nc > 7;
            EXIT WHEN NOT _is_empty(_cell(b, nr, nc));
            RETURN true;
          END LOOP;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

-- ============================================================
-- 8. _count_pieces(board, color)
-- ============================================================
CREATE OR REPLACE FUNCTION _count_pieces(b jsonb, color text)
RETURNS int LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r int; c int; n int := 0;
BEGIN
  FOR r IN 0..7 LOOP
    FOR c IN 0..7 LOOP
      IF _cell_color(_cell(b, r, c)) = color THEN n := n + 1; END IF;
    END LOOP;
  END LOOP;
  RETURN n;
END;
$$;

-- ============================================================
-- 9. submit_move — главный RPC, server-authoritative
-- ============================================================
CREATE OR REPLACE FUNCTION submit_move(
  p_game_id              uuid,
  p_player_id            text,
  p_expected_move_number int,
  p_jumps                jsonb  -- [{from_row, from_col, to_row, to_col, captured_row?, captured_col?}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g          games%ROWTYPE;
  my_color   text;
  new_turn   text;
  board      jsonb;
  has_global_capture boolean;
  jumps_count int;
  jump       jsonb;
  from_r int; from_c int; to_r int; to_c int;
  cap_r  int; cap_c  int;
  src    jsonb; tgt jsonb; cap_cell jsonb;
  is_king boolean;
  is_capture_jump boolean;
  dr int; dc int; sdr int; sdc int;
  k  int;
  captured_keys text[] := '{}';
  current_r int; current_c int;
  promoted_now boolean;
  final_type text;
  opp text;
  opp_has_pieces boolean;
  opp_has_moves  boolean;
  game_over boolean := false;
  winner_c  text;
  end_reason text;
  start_from_r int; start_from_c int;
  i int;
BEGIN
  -- 1. Lock & sanity
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF g.status <> 'playing' THEN RAISE EXCEPTION 'GAME_NOT_PLAYING %', g.status; END IF;

  -- 2. Caller color
  IF g.white_player_id = p_player_id THEN my_color := 'white';
  ELSIF g.black_player_id = p_player_id THEN my_color := 'black';
  ELSE RAISE EXCEPTION 'NOT_A_PARTICIPANT'; END IF;

  IF g.current_turn <> my_color THEN RAISE EXCEPTION 'NOT_YOUR_TURN'; END IF;

  -- 3. Move number (idempotency: если клиент дублирует, отдадим текущее состояние)
  IF p_expected_move_number = g.move_number - 1 THEN
    -- Уже применили — возвращаем как есть
    RETURN jsonb_build_object(
      'ok', true, 'duplicate', true,
      'board', g.board_state,
      'current_turn', g.current_turn,
      'move_number', g.move_number,
      'game_over', g.status = 'finished',
      'winner', g.winner,
      'reason', g.resign_reason
    );
  END IF;
  IF g.move_number <> p_expected_move_number THEN
    RAISE EXCEPTION 'STALE_MOVE_NUMBER expected=% got=%', g.move_number, p_expected_move_number;
  END IF;

  -- 4. Validate jumps
  jumps_count := jsonb_array_length(p_jumps);
  IF jumps_count < 1 THEN RAISE EXCEPTION 'NO_JUMPS'; END IF;

  board := g.board_state;
  has_global_capture := _has_any_capture(board, my_color);

  start_from_r := (p_jumps->0->>'from_row')::int;
  start_from_c := (p_jumps->0->>'from_col')::int;
  current_r := start_from_r; current_c := start_from_c;

  FOR i IN 0..jumps_count-1 LOOP
    jump := p_jumps->i;
    from_r := (jump->>'from_row')::int;
    from_c := (jump->>'from_col')::int;
    to_r   := (jump->>'to_row')::int;
    to_c   := (jump->>'to_col')::int;
    cap_r  := NULLIF(jump->>'captured_row', '')::int;
    cap_c  := NULLIF(jump->>'captured_col', '')::int;
    is_capture_jump := cap_r IS NOT NULL AND cap_c IS NOT NULL;

    -- chain integrity
    IF i > 0 AND (from_r <> current_r OR from_c <> current_c) THEN
      RAISE EXCEPTION 'CHAIN_BROKEN';
    END IF;

    src := _cell(board, from_r, from_c);
    IF _is_empty(src) THEN RAISE EXCEPTION 'EMPTY_SOURCE'; END IF;
    IF _cell_color(src) <> my_color THEN RAISE EXCEPTION 'NOT_YOUR_PIECE'; END IF;
    is_king := _cell_is_king(src);

    tgt := _cell(board, to_r, to_c);
    IF NOT _is_empty(tgt) THEN RAISE EXCEPTION 'TARGET_OCCUPIED'; END IF;

    dr := to_r - from_r; dc := to_c - from_c;
    IF abs(dr) <> abs(dc) OR dr = 0 THEN RAISE EXCEPTION 'NOT_DIAGONAL'; END IF;
    sdr := _sign(dr); sdc := _sign(dc);

    IF is_capture_jump THEN
      -- Каптурная клетка должна лежать на диагонали между from и to
      IF NOT is_king THEN
        IF abs(dr) <> 2 THEN RAISE EXCEPTION 'INVALID_MAN_CAPTURE_DISTANCE'; END IF;
        IF cap_r <> from_r + sdr OR cap_c <> from_c + sdc THEN
          RAISE EXCEPTION 'INVALID_CAPTURE_SQUARE_MAN';
        END IF;
      ELSE
        -- King: cap должен быть один из путевых, и все остальные пути пустые
        DECLARE found boolean := false;
        BEGIN
          FOR k IN 1..abs(dr)-1 LOOP
            IF from_r + k*sdr = cap_r AND from_c + k*sdc = cap_c THEN
              found := true; EXIT;
            END IF;
          END LOOP;
          IF NOT found THEN RAISE EXCEPTION 'INVALID_CAPTURE_SQUARE_KING'; END IF;
          FOR k IN 1..abs(dr)-1 LOOP
            IF from_r + k*sdr <> cap_r OR from_c + k*sdc <> cap_c THEN
              IF NOT _is_empty(_cell(board, from_r + k*sdr, from_c + k*sdc)) THEN
                RAISE EXCEPTION 'KING_PATH_BLOCKED';
              END IF;
            END IF;
          END LOOP;
        END;
      END IF;

      cap_cell := _cell(board, cap_r, cap_c);
      IF _is_empty(cap_cell) THEN RAISE EXCEPTION 'CAPTURED_SQUARE_EMPTY'; END IF;
      IF _cell_color(cap_cell) = my_color THEN RAISE EXCEPTION 'CAPTURED_OWN_PIECE'; END IF;

      IF (cap_r::text || ',' || cap_c::text) = ANY(captured_keys) THEN
        RAISE EXCEPTION 'PIECE_ALREADY_CAPTURED_IN_CHAIN';
      END IF;
      captured_keys := array_append(captured_keys, cap_r::text || ',' || cap_c::text);
    ELSE
      -- Не-захват
      IF has_global_capture THEN RAISE EXCEPTION 'MUST_CAPTURE'; END IF;
      IF jumps_count <> 1 THEN RAISE EXCEPTION 'MULTI_JUMP_REQUIRES_CAPTURE'; END IF;

      IF NOT is_king THEN
        IF abs(dr) <> 1 THEN RAISE EXCEPTION 'INVALID_MAN_DISTANCE'; END IF;
        IF dr <> (CASE WHEN my_color='white' THEN -1 ELSE 1 END) THEN
          RAISE EXCEPTION 'MAN_BACKWARD';
        END IF;
      ELSE
        FOR k IN 1..abs(dr)-1 LOOP
          IF NOT _is_empty(_cell(board, from_r + k*sdr, from_c + k*sdc)) THEN
            RAISE EXCEPTION 'KING_PATH_BLOCKED';
          END IF;
        END LOOP;
      END IF;
    END IF;

    -- Apply jump
    promoted_now := false;
    final_type := src->>'type';
    IF NOT is_king
       AND ((my_color='white' AND to_r = 0) OR (my_color='black' AND to_r = 7)) THEN
      promoted_now := true;
      final_type := 'king';
    END IF;

    board := jsonb_set(board, ARRAY[from_r::text, from_c::text], 'null'::jsonb, true);
    IF is_capture_jump THEN
      board := jsonb_set(board, ARRAY[cap_r::text, cap_c::text], 'null'::jsonb, true);
    END IF;
    board := jsonb_set(board, ARRAY[to_r::text, to_c::text],
      jsonb_build_object('color', my_color, 'type', final_type), true);

    current_r := to_r; current_c := to_c;

    -- Chain length check
    IF is_capture_jump THEN
      DECLARE can_continue boolean;
      BEGIN
        IF promoted_now THEN
          can_continue := false;  -- русские шашки: только что превратился в дамку — не продолжает в этой цепочке
        ELSE
          can_continue := _has_capture_at(board, current_r, current_c, my_color, captured_keys);
        END IF;
        IF i < jumps_count - 1 AND NOT can_continue THEN
          RAISE EXCEPTION 'CHAIN_TOO_LONG';
        END IF;
        IF i = jumps_count - 1 AND can_continue THEN
          RAISE EXCEPTION 'CHAIN_MUST_CONTINUE';
        END IF;
      END;
    END IF;
  END LOOP;

  -- Switch turn
  new_turn := CASE WHEN my_color='white' THEN 'black' ELSE 'white' END;
  opp := new_turn;

  opp_has_pieces := _count_pieces(board, opp) > 0;
  IF opp_has_pieces THEN
    opp_has_moves := _has_any_capture(board, opp) OR _has_any_noncapture(board, opp);
  ELSE
    opp_has_moves := false;
  END IF;

  IF NOT opp_has_pieces OR NOT opp_has_moves THEN
    game_over := true;
    winner_c := my_color;
    end_reason := CASE WHEN NOT opp_has_pieces THEN 'no_pieces' ELSE 'no_moves' END;
  END IF;

  -- Persist
  UPDATE games SET
    board_state    = board,
    current_turn   = new_turn,
    move_number    = g.move_number + 1,
    status         = CASE WHEN game_over THEN 'finished' ELSE 'playing' END,
    winner         = COALESCE(winner_c, winner),
    resign_reason  = COALESCE(end_reason, resign_reason),
    last_move_at   = now(),
    last_from_row  = start_from_r,
    last_from_col  = start_from_c,
    last_to_row    = current_r,
    last_to_col    = current_c,
    updated_at     = now()
  WHERE id = p_game_id;

  -- Записываем move (для replay / аудита)
  INSERT INTO moves (game_id, move_number, player_color, move_data, board_state)
    VALUES (p_game_id, g.move_number, my_color, p_jumps, board);

  -- Settlement (для ставочных матчей) — внутри той же транзакции
  IF game_over THEN
    DECLARE
      winner_pid text := CASE WHEN winner_c = 'white' THEN g.white_player_id ELSE g.black_player_id END;
    BEGIN
      PERFORM process_game_result(p_game_id, COALESCE(winner_pid, ''), COALESCE(end_reason, 'win'), p_player_id);
    EXCEPTION WHEN OTHERS THEN
      -- Если нет ставки или функция уже срабатывала — игнорируем (idempotent)
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'board', board,
    'current_turn', new_turn,
    'move_number', g.move_number + 1,
    'game_over', game_over,
    'winner', winner_c,
    'reason', end_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_move(uuid, text, int, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION submit_move(uuid, text, int, jsonb) TO anon, authenticated;

-- ============================================================
-- 10. submit_resign — атомарно сдать партию
-- ============================================================
CREATE OR REPLACE FUNCTION submit_resign(
  p_game_id   uuid,
  p_player_id text,
  p_reason    text DEFAULT 'Сдача'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g       games%ROWTYPE;
  winner_c text;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF g.status = 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true,
      'winner', g.winner, 'reason', g.resign_reason);
  END IF;

  IF g.white_player_id = p_player_id THEN winner_c := 'black';
  ELSIF g.black_player_id = p_player_id THEN winner_c := 'white';
  ELSE RAISE EXCEPTION 'NOT_A_PARTICIPANT'; END IF;

  UPDATE games SET
    status = 'finished',
    winner = winner_c,
    resign_reason = p_reason,
    last_move_at = now(),
    updated_at = now()
  WHERE id = p_game_id;

  BEGIN
    DECLARE winner_pid text := CASE WHEN winner_c = 'white' THEN g.white_player_id ELSE g.black_player_id END;
    BEGIN
      PERFORM process_game_result(p_game_id, COALESCE(winner_pid, ''), p_reason, p_player_id);
    END;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'winner', winner_c, 'reason', p_reason);
END;
$$;
REVOKE ALL ON FUNCTION submit_resign(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION submit_resign(uuid, text, text) TO anon, authenticated;

-- ============================================================
-- 11. claim_timeout_win — соперник не ходит больше TIMEOUT секунд
-- ============================================================
CREATE OR REPLACE FUNCTION claim_timeout_win(
  p_game_id    uuid,
  p_player_id  text,
  p_timeout_s  int DEFAULT 90
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g       games%ROWTYPE;
  my_color text;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF g.status = 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true,
      'winner', g.winner, 'reason', g.resign_reason);
  END IF;
  IF g.status <> 'playing' THEN RAISE EXCEPTION 'GAME_NOT_PLAYING'; END IF;

  IF g.white_player_id = p_player_id THEN my_color := 'white';
  ELSIF g.black_player_id = p_player_id THEN my_color := 'black';
  ELSE RAISE EXCEPTION 'NOT_A_PARTICIPANT'; END IF;

  IF g.current_turn = my_color THEN RAISE EXCEPTION 'NOT_OPPONENT_TURN'; END IF;
  IF g.last_move_at > now() - make_interval(secs => p_timeout_s) THEN
    RAISE EXCEPTION 'TIMEOUT_NOT_REACHED';
  END IF;

  UPDATE games SET
    status = 'finished',
    winner = my_color,
    resign_reason = 'Тайм-аут соперника',
    last_move_at = now(),
    updated_at = now()
  WHERE id = p_game_id;

  BEGIN
    DECLARE winner_pid text := CASE WHEN my_color = 'white' THEN g.white_player_id ELSE g.black_player_id END;
    BEGIN
      PERFORM process_game_result(p_game_id, COALESCE(winner_pid, ''), 'timeout', p_player_id);
    END;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'winner', my_color, 'reason', 'timeout');
END;
$$;
REVOKE ALL ON FUNCTION claim_timeout_win(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION claim_timeout_win(uuid, text, int) TO anon, authenticated;

-- ============================================================
-- 12. cancel_waiting_room — отменить свою комнату пока никто не подключился
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_waiting_room(
  p_game_id uuid, p_player_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE g games%ROWTYPE;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF g.status <> 'waiting' THEN RAISE EXCEPTION 'NOT_WAITING'; END IF;
  IF g.white_player_id <> p_player_id THEN RAISE EXCEPTION 'NOT_HOST'; END IF;

  UPDATE games SET status='finished', resign_reason='Комната отменена', updated_at=now()
    WHERE id = p_game_id;

  -- Refund если ставка — делает существующий cancel_stake_game (если есть)
  BEGIN
    PERFORM cancel_stake_game(p_game_id, p_player_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION cancel_waiting_room(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION cancel_waiting_room(uuid, text) TO anon, authenticated;

-- ============================================================
-- 13. claim_welcome_bonus(player_id, device_fp_hash)
--     • даёт welcome bonus один раз на профиль
--     • защита от multi-account: один device_fp — максимум 3 профиля,
--       и welcome bonus claim'ится только если у device_fp ещё нет
--       выданного welcome bonus.
-- ============================================================
CREATE OR REPLACE FUNCTION claim_welcome_bonus(
  p_player_id      text,
  p_device_fp_hash text,
  p_bonus_amount   numeric DEFAULT 100
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
  already_claimed boolean;
  fp_profiles_count int;
  fp_already_bonused int;
BEGIN
  SELECT id INTO p_id FROM profiles WHERE player_id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  -- Уже забирал?
  SELECT EXISTS(
    SELECT 1 FROM wallet_transactions
     WHERE profile_id = p_id AND transaction_type = 'welcome_bonus'
  ) INTO already_claimed;
  IF already_claimed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
  END IF;

  -- Записываем device_fp в profile если ещё пусто
  UPDATE profiles SET device_fp_hash = COALESCE(device_fp_hash, p_device_fp_hash)
    WHERE id = p_id;

  -- Анти-фарм: с одного device_fp_hash максимум 3 профиля и максимум 1 welcome bonus
  IF p_device_fp_hash IS NOT NULL THEN
    SELECT COUNT(*) INTO fp_profiles_count FROM profiles
      WHERE device_fp_hash = p_device_fp_hash;
    IF fp_profiles_count > 3 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'too_many_devices');
    END IF;

    SELECT COUNT(*) INTO fp_already_bonused FROM wallet_transactions wt
      JOIN profiles p ON p.id = wt.profile_id
     WHERE p.device_fp_hash = p_device_fp_hash
       AND wt.transaction_type = 'welcome_bonus';
    IF fp_already_bonused > 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'device_already_bonused');
    END IF;
  END IF;

  -- Начисляем
  UPDATE wallets SET coin_balance = coin_balance + p_bonus_amount,
                     updated_at = now()
   WHERE profile_id = p_id;
  INSERT INTO wallet_transactions(profile_id, transaction_type, amount, description)
    VALUES (p_id, 'welcome_bonus', p_bonus_amount, 'Welcome bonus');

  RETURN jsonb_build_object('ok', true, 'amount', p_bonus_amount);
END;
$$;
REVOKE ALL ON FUNCTION claim_welcome_bonus(text, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION claim_welcome_bonus(text, text, numeric) TO anon, authenticated;

-- ============================================================
-- 14. Rate-limit на создание игр (через триггер на games INSERT)
--     Максимум 10 inserts за 60 секунд с одного player_id.
-- ============================================================
CREATE OR REPLACE FUNCTION _rl_check_game_create()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recent_n int;
BEGIN
  SELECT COUNT(*) INTO recent_n
    FROM action_log
   WHERE player_id = NEW.white_player_id
     AND action = 'create_game'
     AND created_at > now() - interval '60 seconds';
  IF recent_n >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT_GAME_CREATE';
  END IF;
  INSERT INTO action_log(player_id, action)
    VALUES (NEW.white_player_id, 'create_game');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS games_rate_limit_trg ON games;
CREATE TRIGGER games_rate_limit_trg
  BEFORE INSERT ON games
  FOR EACH ROW EXECUTE FUNCTION _rl_check_game_create();

-- ============================================================
-- 15. RLS LOCKDOWN
-- ============================================================

-- games: SELECT — все (matchmaking видит свободные комнаты);
--        INSERT — только своим player_id;
--        UPDATE — запрещено напрямую (всё через RPC submit_move/resign);
--        DELETE — запрещено.
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read games" ON games;
DROP POLICY IF EXISTS "Anyone can insert games" ON games;
DROP POLICY IF EXISTS "Players can update their game" ON games;
DROP POLICY IF EXISTS "v5_games_select" ON games;
DROP POLICY IF EXISTS "v5_games_insert" ON games;

CREATE POLICY "v5_games_select" ON games FOR SELECT USING (true);
CREATE POLICY "v5_games_insert" ON games FOR INSERT
  WITH CHECK (
    white_player_id = current_setting('app.current_player_id', true)
    AND status = 'waiting'
  );
-- UPDATE/DELETE: нет policy → запрещено всем кроме SECURITY DEFINER функций

-- moves: SELECT — все; INSERT/UPDATE/DELETE — запрещено (всё через submit_move).
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read moves" ON moves;
DROP POLICY IF EXISTS "Anyone can insert moves" ON moves;
DROP POLICY IF EXISTS "v5_moves_select" ON moves;

CREATE POLICY "v5_moves_select" ON moves FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE: нет policy → запрещено

-- profiles: видит только свой профиль, INSERT — только свой, UPDATE — только свой.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "v5_profiles_select" ON profiles;
DROP POLICY IF EXISTS "v5_profiles_insert" ON profiles;
DROP POLICY IF EXISTS "v5_profiles_update" ON profiles;
DROP POLICY IF EXISTS "v5_profiles_select_public" ON profiles;

-- Публичная часть — display_name, player_id (нужно для отображения никнейма соперника).
-- Дополнительные поля (device_fp_hash, email и пр.) защищаем через view-based RLS не делаем —
-- вместо этого client не должен SELECT'ить эти поля напрямую (они есть только в SECURITY DEFINER функциях).
CREATE POLICY "v5_profiles_select_public" ON profiles FOR SELECT USING (true);

CREATE POLICY "v5_profiles_insert" ON profiles FOR INSERT
  WITH CHECK (player_id = current_setting('app.current_player_id', true));
CREATE POLICY "v5_profiles_update" ON profiles FOR UPDATE
  USING (player_id = current_setting('app.current_player_id', true))
  WITH CHECK (player_id = current_setting('app.current_player_id', true));

-- wallets: SELECT/UPDATE только владельцем
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "v5_wallets_select" ON wallets;
DROP POLICY IF EXISTS "v5_wallets_insert" ON wallets;
DROP POLICY IF EXISTS "v5_wallets_update" ON wallets;

CREATE POLICY "v5_wallets_select" ON wallets FOR SELECT
  USING (profile_id IN (
    SELECT id FROM profiles
    WHERE player_id = current_setting('app.current_player_id', true)
  ));
-- INSERT/UPDATE wallets через RPC только (SECURITY DEFINER bypasses RLS)

-- wallet_transactions: SELECT только своего
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "v5_wt_select" ON wallet_transactions;
CREATE POLICY "v5_wt_select" ON wallet_transactions FOR SELECT
  USING (profile_id IN (
    SELECT id FROM profiles
    WHERE player_id = current_setting('app.current_player_id', true)
  ));

-- ============================================================
-- 16. action_log RLS: запрещаем читать чужие действия
-- ============================================================
ALTER TABLE action_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "v5_action_log_select_own" ON action_log;
CREATE POLICY "v5_action_log_select_own" ON action_log FOR SELECT
  USING (player_id = current_setting('app.current_player_id', true));

COMMIT;

-- Sanity check
DO $$ BEGIN
  RAISE NOTICE 'v5 migration applied. submit_move/submit_resign/claim_timeout_win/cancel_waiting_room/claim_welcome_bonus ready.';
END $$;
