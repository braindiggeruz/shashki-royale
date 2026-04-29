import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabaseConfigured =
  !!supabaseUrl && !!supabaseAnonKey &&
  supabaseUrl !== "" && supabaseAnonKey !== "";

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

/**
 * Устанавливает контекст текущего игрока для RLS политик.
 * ОБЯЗАТЕЛЬНО вызывать перед запросами к защищённым таблицам
 * (wallets, wallet_transactions, games UPDATE/INSERT).
 */
export async function setPlayerContext(playerId: string): Promise<void> {
  if (!supabase || !playerId) return;
  try {
    await supabase.rpc("set_player_context", { p_player_id: playerId });
  } catch {
    console.warn("[Supabase] Failed to set player context");
  }
}
