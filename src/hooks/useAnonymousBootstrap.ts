import { useEffect, useRef } from "react";
import { getOrCreatePlayerId } from "../lib/storage";
import { getOrCreateProfile } from "../services/profiles";
import { supabaseConfigured } from "../lib/supabase";
import { invalidateProfileCache } from "./use-profile";

/**
 * Ensure every visitor has an anonymous player_id + Supabase profile + wallet
 * BEFORE they tap any "Play" button. Runs once on app mount.
 *
 * - Idempotent: server-side `get_or_create_profile` only grants welcome bonus
 *   the first time a player_id is seen.
 * - Silent: errors are logged but don't block the UI — the home screen still
 *   renders and `useProfile` will retry on demand.
 */
export function useAnonymousBootstrap(): void {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!supabaseConfigured) return;

    const run = async () => {
      try {
        const playerId = getOrCreatePlayerId();
        await getOrCreateProfile(playerId);
        // Invalidate so useProfile picks up the fresh wallet on next render
        invalidateProfileCache();
      } catch (err) {
        // Don't crash the app; log for diagnostics.
        // eslint-disable-next-line no-console
        console.warn("[useAnonymousBootstrap] profile bootstrap failed:", err);
      }
    };

    void run();
  }, []);
}
