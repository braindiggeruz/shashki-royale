import { useEffect, useRef } from "react";
import { getOrCreatePlayerId } from "../lib/storage";
import { getOrCreateProfile } from "../services/profiles";
import { supabaseConfigured } from "../lib/supabase";
import { invalidateProfileCache } from "./use-profile";
import {
  claimWelcomeBonus,
  computeDeviceFingerprint,
} from "../services/secureMoves";
import { registerReferral, recordDailyLogin } from "../services/engagement";

const FP_STORAGE_KEY = "sr_device_fp_v1";
const BONUS_CLAIMED_KEY = "sr_welcome_claimed_v1";
const REF_PROCESSED_KEY = "sr_ref_processed_v1";

/**
 * Bootstrap анонимного игрока:
 *  1. Создаёт/получает player_id (UUID в localStorage).
 *  2. Создаёт профиль + кошелёк через защищённый RPC.
 *  3. Вычисляет device fingerprint (canvas + UA + screen + timezone).
 *  4. Atomic-claim welcome bonus с anti-farm защитой:
 *     • один welcome bonus на профиль (server-side check);
 *     • один welcome bonus на device fingerprint;
 *     • максимум 3 профиля с одного fp.
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

        // Daily login streak — pure local, бесплатно
        recordDailyLogin();

        // Реферальная связь — если пришли по ?ref=<player_id> и связь
        // ещё не зарегистрирована для этого устройства
        if (!localStorage.getItem(REF_PROCESSED_KEY)) {
          try {
            const params = new URLSearchParams(window.location.search);
            const referrerId = params.get("ref");
            if (referrerId && referrerId !== playerId) {
              await registerReferral(playerId, referrerId);
            }
          } catch (refErr) {
            // eslint-disable-next-line no-console
            console.warn("[useAnonymousBootstrap] referral register failed:", refErr);
          }
          localStorage.setItem(REF_PROCESSED_KEY, "1");
        }

        // Welcome bonus claim только если не пытались ранее (защита от спама RPC)
        if (!localStorage.getItem(BONUS_CLAIMED_KEY)) {
          try {
            let fp = localStorage.getItem(FP_STORAGE_KEY);
            if (!fp) {
              fp = await computeDeviceFingerprint();
              localStorage.setItem(FP_STORAGE_KEY, fp);
            }
            await claimWelcomeBonus(playerId, fp, 100);
            localStorage.setItem(BONUS_CLAIMED_KEY, "1");
          } catch (bonusErr) {
            // eslint-disable-next-line no-console
            console.warn("[useAnonymousBootstrap] welcome bonus claim failed:", bonusErr);
          }
        }

        invalidateProfileCache();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[useAnonymousBootstrap] profile bootstrap failed:", err);
      }
    };

    void run();
  }, []);
}
