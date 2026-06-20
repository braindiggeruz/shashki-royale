import { supabase, setPlayerContext } from "../lib/supabase.ts";

/**
 * Engagement-фичи v6 (миграция migration_v6_engagement.sql):
 *  • win_streak / best_win_streak (видны сопернику в матчмейкинге)
 *  • daily_challenge — Win N сегодня
 *  • referral program — 1 Coin пригласившему после 3 партий приглашённого
 */

export type EngagementUpdateResult = {
  ok: boolean;
  duplicate?: boolean;
  win_streak?: number;
  daily_challenge_wins?: number;
};

/**
 * Вызывается ОДИН раз после game over (идемпотентно по game_id+player_id).
 * Обновляет win streak и daily challenge для caller.
 */
export async function updateEngagementAfterGame(
  playerId: string,
  gameId: string,
  won: boolean,
  isDraw: boolean,
): Promise<EngagementUpdateResult> {
  if (!supabase) return { ok: false };
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("update_engagement_after_game", {
    p_player_id: playerId,
    p_game_id: gameId,
    p_won: won,
    p_is_draw: isDraw,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[updateEngagementAfterGame]", error.message);
    return { ok: false };
  }
  return data as EngagementUpdateResult;
}

/** Регистрация реферальной связи. Вызывается один раз на первом визите по ?ref=. */
export async function registerReferral(
  playerId: string,
  referrerId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: "offline" };
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("register_referral", {
    p_player_id: playerId,
    p_referrer_id: referrerId,
  });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; reason?: string };
}

/**
 * Попытаться выплатить реф-бонус пригласившему. Server проверит что:
 *  • у этого юзера есть referrer;
 *  • referrer ещё не получал бонус за этого юзера;
 *  • этот юзер сыграл ≥3 партии.
 * Метод можно дёргать после каждой партии — он сам решит когда платить.
 */
export async function claimReferralPayout(
  playerId: string,
): Promise<{ ok: boolean; bonus?: number; reason?: string }> {
  if (!supabase) return { ok: false, reason: "offline" };
  await setPlayerContext(playerId);
  const { data, error } = await supabase.rpc("claim_referral_payout", {
    p_player_id: playerId,
  });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; bonus?: number; reason?: string };
}

// ─── Daily login streak (полностью client-side, localStorage) ──────────────
// Дешёво и без нагрузки на БД. Только prestige (badge на главной).

const DAILY_LOGIN_KEY = "sr_daily_login_v1";

export type DailyLoginState = {
  streak: number;
  lastDate: string; // YYYY-MM-DD
};

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayYMD(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Зарегистрировать сегодняшний визит. Возвращает текущий streak. */
export function recordDailyLogin(): DailyLoginState {
  let state: DailyLoginState = { streak: 0, lastDate: "" };
  try {
    const raw = localStorage.getItem(DAILY_LOGIN_KEY);
    if (raw) state = JSON.parse(raw) as DailyLoginState;
  } catch {
    /* ignore */
  }

  const today = todayYMD();
  if (state.lastDate === today) {
    // Уже зарегистрирован сегодня — без изменений
    return state;
  }

  if (state.lastDate === yesterdayYMD()) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }
  state.lastDate = today;

  try {
    localStorage.setItem(DAILY_LOGIN_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  return state;
}

/** Прочитать сохранённый streak без модификации. */
export function readDailyLogin(): DailyLoginState {
  try {
    const raw = localStorage.getItem(DAILY_LOGIN_KEY);
    if (raw) return JSON.parse(raw) as DailyLoginState;
  } catch {
    /* ignore */
  }
  return { streak: 0, lastDate: "" };
}
