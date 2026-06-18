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
  type:
    | "deposit"
    | "withdrawal"
    | "fee_lock"
    | "fee_refund"
    | "prize_payout"
    | "starting_bonus"
    | "loss";
  amount: number;
  status: "pending" | "completed" | "failed";
  note: string | null;
  created_at: string;
};

export type ProfileWithWallet = {
  profile: Profile;
  wallet: Wallet;
};

/** Получить или создать профиль (и кошелёк) для анонимного player_id */
export async function getOrCreateProfile(playerId: string): Promise<ProfileWithWallet> {
  if (!supabase) throw new Error("Supabase не настроен");
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
  const { data, error } = await supabase
    .from("public_profiles")
    .select(
      "id, nickname, avatar_index, rating, total_games, wins, losses, draws, created_at, last_seen_at",
    )
    .order("rating", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[fetchLeaderboard] Error:", error.message);
    return [];
  }
  return (data ?? []) as Omit<Profile, "player_id">[];
}

/**
 * Завершить игру через защищённый RPC `process_game_result` (см. migration_v3).
 *
 * Сервер сам:
 *  • валидирует, что caller — участник матча,
 *  • валидирует, что заявленный winner — участник матча,
 *  • валидирует, что игра ещё не finished (идемпотентно),
 *  • выставляет games.status = 'finished', winner, resign_reason,
 *  • если есть ставка — выплачивает приз / возвращает при ничьей,
 *  • обновляет рейтинг.
 *
 * callerPlayerId — игрок, вызывающий RPC. Контекст RLS ставится по нему.
 * winnerPlayerId — победитель ('' или null для ничьей).
 *
 * NOTE: использовать ВМЕСТО старого `process_stake_game_result(color)`,
 * который ходит по двум таблицам и легко рассинхронизировать.
 */
export async function processGameResult(
  gameId: string,
  winnerPlayerId: string | null,
  finishReason: string,
  callerPlayerId: string,
): Promise<{ success: boolean; is_draw: boolean }> {
  if (!supabase) return { success: true, is_draw: false };
  // No more reliance on broken session context — caller passes player_id
  // explicitly so the RPC can enforce participation server-side.
  const { data, error } = await supabase.rpc("process_game_result", {
    p_game_id: gameId,
    p_winner_player_id: winnerPlayerId ?? "",
    p_finish_reason: finishReason,
    p_caller_player_id: callerPlayerId,
  });
  if (error) throw new Error(error.message);
  return data as { success: boolean; is_draw: boolean };
}
