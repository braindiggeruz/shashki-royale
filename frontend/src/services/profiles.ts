import { supabase, setPlayerContext } from "../lib/supabase.ts";

export type Profile = {
  id: string;
  player_id: string;
  nickname: string;
  avatar_index: number;
  avatar_url?: string | null; // Google profile picture or custom avatar URL
  display_name?: string | null; // Display name from Google or custom
  rating: number;
  total_games: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
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
  type: "deposit" | "withdrawal" | "fee_lock" | "fee_refund" | "prize_payout" | "starting_bonus";
  amount: number;
  status: "pending" | "completed" | "failed";
  note: string | null;
  created_at: string;
};

export type GameStake = {
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

export type ProfileWithWallet = {
  profile: Profile;
  wallet: Wallet;
};

/** Получить или создать профиль (и кошелёк) для анонимного player_id */
export async function getOrCreateProfile(playerId: string): Promise<ProfileWithWallet> {
  if (!supabase) throw new Error("Supabase не настроен");
  // Устанавливаем контекст для RLS политик
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("get_or_create_profile", {
    p_player_id: playerId,
  });
  if (error) throw new Error(error.message);
  return data as ProfileWithWallet;
}

/** Обновить никнейм и аватар */
export async function updateProfile(
  playerId: string,
  nickname: string,
  avatarIndex: number,
): Promise<Profile> {
  if (!supabase) throw new Error("Supabase не настроен");
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 20) {
    throw new Error("Никнейм должен быть от 2 до 20 символов");
  }
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("update_profile", {
    p_player_id: playerId,
    p_nickname: trimmed,
    p_avatar_index: avatarIndex,
  });
  if (error) throw new Error(error.message);
  return data as Profile;
}

/** Обновить профиль с Google данными */
export async function updateProfileWithGoogleData(
  playerId: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<Profile> {
  if (!supabase) throw new Error("Supabase не настроен");
  await setPlayerContext(playerId);
  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("player_id", playerId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

/** Получить последние 20 транзакций профиля (только владелец) */
export async function fetchTransactions(
  profileId: string,
  playerId: string,
): Promise<WalletTransaction[]> {
  if (!supabase) return [];
  // Устанавливаем контекст — только владелец видит свои транзакции
  await setPlayerContext(playerId);
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[fetchTransactions] Error:", error.message);
    throw new Error("Не удалось загрузить транзакции");
  }
  return (data ?? []) as WalletTransaction[];
}

/** Получить топ-100 лидерборда (публичные данные, без player_id) */
export async function fetchLeaderboard(): Promise<Omit<Profile, "player_id">[]> {
  if (!supabase) return [];
  // Используем безопасное представление public_profiles (без player_id)
  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, nickname, avatar_index, rating, total_games, wins, losses, draws, created_at, last_seen_at")
    .order("rating", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[fetchLeaderboard] Error:", error.message);
    return [];
  }
  return (data ?? []) as Omit<Profile, "player_id">[];
}

/** Получить активные столы со ставками для лобби */
export async function fetchStakeTables() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("games")
    .select(`
      id, room_code, status, match_type, white_profile_id,
      game_stakes(entry_fee, pot_amount, escrow_status),
      white_profile:profiles!games_white_profile_id_fkey(nickname, avatar_index, rating)
    `)
    .eq("match_type", "stake")
    .eq("status", "waiting")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[fetchStakeTables] Error:", error.message);
    return [];
  }
  return data ?? [];
}

/** Создать игру со ставкой через RPC */
export async function createStakeGame(
  playerId: string,
  entryFee: number,
  roomCode: string,
  boardState: unknown,
): Promise<{ game_id: string; room_code: string }> {
  if (!supabase) throw new Error("Supabase не настроен");
  if (entryFee < 10) throw new Error("Минимальная ставка: 10 токенов");
  if (entryFee > 10000) throw new Error("Максимальная ставка: 10000 токенов");
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("create_stake_game", {
    p_player_id: playerId,
    p_entry_fee: entryFee,
    p_room_code: roomCode,
    p_board_state: boardState,
  });
  if (error) throw new Error(error.message);
  return data as { game_id: string; room_code: string };
}

/** Присоединиться к игре со ставкой через RPC */
export async function joinStakeGame(
  playerId: string,
  gameId: string,
): Promise<{ success: boolean; entry_fee: number }> {
  if (!supabase) throw new Error("Supabase не настроен");
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("join_stake_game", {
    p_player_id: playerId,
    p_game_id: gameId,
  });
  if (error) throw new Error(error.message);
  return data as { success: boolean; entry_fee: number };
}

/**
 * Обработать результат игры через RPC (идемпотентно).
 * Сервер проверяет что вызывающий — участник игры.
 * Сервер проверяет что победитель — участник игры.
 * callerPlayerId — player_id того, кто вызывает функцию.
 */
export async function processGameResult(
  gameId: string,
  winnerPlayerId: string | null,
  finishReason: string,
  callerPlayerId: string,
): Promise<{ success: boolean; is_draw: boolean }> {
  if (!supabase) return { success: true, is_draw: false };
  // Контекст обязателен — сервер проверит авторизацию
  await setPlayerContext(callerPlayerId);
  const { data, error } = await supabase.rpc("process_game_result", {
    p_game_id: gameId,
    p_winner_player_id: winnerPlayerId ?? "",
    p_finish_reason: finishReason,
  });
  if (error) throw new Error(error.message);
  return data as { success: boolean; is_draw: boolean };
}
