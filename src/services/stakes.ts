import { supabase, supabaseConfigured, setPlayerContext } from "../lib/supabase";

export type StakeGame = {
  id: string;
  game_id: string;
  entry_fee: number;
  pot_amount: number;
  white_profile_id: string | null;
  black_profile_id: string | null;
  escrow_status: "waiting" | "locked" | "paid" | "refunded";
  payout_status: "pending" | "paid" | "failed" | "refunded";
  created_at: string;
  updated_at: string;
};

export type Wallet = {
  profile_id: string;
  crypto_balance: number;
  locked_balance: number;
  updated_at: string;
};

export type WalletTransaction = {
  id: string;
  profile_id: string;
  game_id: string | null;
  type: "deposit" | "withdrawal" | "fee_lock" | "fee_refund" | "prize_payout" | "starting_bonus" | "loss";
  amount: number;
  status: "pending" | "completed" | "failed";
  note: string | null;
  created_at: string;
};

/**
 * Получить кошелёк пользователя.
 *
 * SECURITY: дополнительно фильтруем по profile.player_id чтобы НИКОГДА не
 * вернуть чужой wallet, даже если setPlayerContext() молча упал.
 */
export async function getWallet(playerId: string): Promise<Wallet | null> {
  if (!supabase) return null;

  try {
    await setPlayerContext(playerId);

    // 1) Найти свой profile.id строго по player_id
    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("player_id", playerId)
      .maybeSingle();

    if (profileErr) {
      console.error("[getWallet] profile lookup error:", profileErr.message);
      return null;
    }
    if (!profileRow) return null; // профиль ещё не создан — wallet тоже нет

    // 2) Кошелёк только для этого profile_id
    const { data, error } = await supabase
      .from("wallets")
      .select("*")
      .eq("profile_id", profileRow.id)
      .maybeSingle();

    if (error) {
      console.error("[getWallet] Error:", error.message);
      return null;
    }

    return (data as Wallet) ?? null;
  } catch (err) {
    console.error("[getWallet] Error:", err);
    return null;
  }
}

/**
 * Получить историю транзакций
 */
export async function getWalletTransactions(
  playerId: string,
  limit: number = 50,
): Promise<WalletTransaction[]> {
  if (!supabase) return [];

  try {
    await setPlayerContext(playerId);

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[getWalletTransactions] Error:", error.message);
      return [];
    }

    return (data ?? []) as WalletTransaction[];
  } catch (err) {
    console.error("[getWalletTransactions] Error:", err);
    return [];
  }
}

/**
 * Создать игру со ставкой
 */
export async function createStakeGame(
  playerId: string,
  entryFee: number,
  roomCode: string,
  boardState: unknown,
): Promise<{ game_id: string; room_code: string; error: string | null }> {
  if (!supabase) return { game_id: "", room_code: "", error: "Supabase не настроен" };

  // Frontend валидация (после миграции v4 минимум = 1 Coin)
  if (entryFee < 1) return { game_id: "", room_code: "", error: "Минимальная ставка: 1 Coin" };
  if (entryFee > 10000) return { game_id: "", room_code: "", error: "Максимальная ставка: 10000 Coin" };
  if (!Number.isFinite(entryFee) || entryFee !== Math.floor(entryFee)) {
    return { game_id: "", room_code: "", error: "Ставка должна быть целым числом" };
  }

  try {
    await setPlayerContext(playerId);

    const { data, error } = await supabase.rpc("create_stake_game", {
      p_player_id: playerId,
      p_entry_fee: entryFee,
      p_room_code: roomCode,
      p_board_state: boardState,
    });

    if (error) {
      return { game_id: "", room_code: "", error: error.message };
    }

    // RPC возвращает массив строк
    const row = Array.isArray(data) ? data[0] : data;

    if (row?.error) {
      return { game_id: "", room_code: "", error: row.error };
    }

    return {
      game_id: row?.game_id ?? "",
      room_code: row?.room_code ?? roomCode,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { game_id: "", room_code: "", error: message };
  }
}

/**
 * Присоединиться к игре со ставкой
 */
export async function joinStakeGame(
  playerId: string,
  gameId: string,
): Promise<{ success: boolean; entry_fee: number; error: string | null }> {
  if (!supabase) return { success: false, entry_fee: 0, error: "Supabase не настроен" };

  try {
    await setPlayerContext(playerId);

    const { data, error } = await supabase.rpc("join_stake_game", {
      p_player_id: playerId,
      p_game_id: gameId,
    });

    if (error) {
      return { success: false, entry_fee: 0, error: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (row?.error) {
      return { success: false, entry_fee: 0, error: row.error };
    }

    return {
      success: row?.success ?? false,
      entry_fee: row?.entry_fee ?? 0,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { success: false, entry_fee: 0, error: message };
  }
}

/**
 * Обработать результат игры со ставками
 * ВАЖНО: winnerColor — это "white", "black" или null для ничьей
 * RPC функция сама определит winner_profile_id по цвету
 */
export async function processStakeGameResult(
  gameId: string,
  winnerColor: string | null,
  finishReason: string,
  callerPlayerId: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: "Supabase не настроен" };

  try {
    await setPlayerContext(callerPlayerId);

    const { data, error } = await supabase.rpc("process_stake_game_result", {
      p_game_id: gameId,
      p_winner_color: winnerColor ?? "",
      p_finish_reason: finishReason,
      p_caller_player_id: callerPlayerId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (row?.error) {
      return { success: false, error: row.error };
    }

    return { success: row?.success ?? false, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { success: false, error: message };
  }
}

/**
 * Отменить ставку (если соперник не найден)
 */
export async function cancelStakeGame(
  playerId: string,
  gameId: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!supabase) return { success: false, error: "Supabase не настроен" };

  try {
    await setPlayerContext(playerId);

    const { data, error } = await supabase.rpc("cancel_stake_game", {
      p_player_id: playerId,
      p_game_id: gameId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (row?.error) {
      return { success: false, error: row.error };
    }

    return { success: row?.success ?? false, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { success: false, error: message };
  }
}

/**
 * Получить активные столы со ставками
 */
export async function fetchStakeTables(limit: number = 50) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("games")
      .select(
        `
        id, room_code, status, white_player_id,
        game_stakes(entry_fee, pot_amount, escrow_status),
        white_profile:profiles!games_white_player_id_fkey(id, nickname, avatar_index, rating)
      `,
      )
      .eq("status", "waiting")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[fetchStakeTables] Error:", error.message);
      return [];
    }

    return data ?? [];
  } catch (err) {
    console.error("[fetchStakeTables] Error:", err);
    return [];
  }
}

/**
 * Получить информацию о ставке для игры
 */
export async function getGameStake(gameId: string): Promise<StakeGame | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("game_stakes")
      .select("*")
      .eq("game_id", gameId)
      .single();

    if (error) {
      // Если ставка не найдена — это нормально (обычная игра без ставки)
      if (error.code === "PGRST116") return null;
      console.error("[getGameStake] Error:", error.message);
      return null;
    }

    return data as StakeGame;
  } catch (err) {
    console.error("[getGameStake] Error:", err);
    return null;
  }
}
