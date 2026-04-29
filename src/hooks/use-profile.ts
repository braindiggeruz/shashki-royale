import { useState, useEffect, useCallback, useRef } from "react";
import { getOrCreateProfile, type Profile, type Wallet } from "../services/profiles.ts";
import { usePlayerId } from "./usePlayerId";
import { supabaseConfigured } from "../lib/supabase.ts";

export type UseProfileResult = {
  profile: Profile | null;
  wallet: Wallet | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

// TTL кэша: 60 секунд. После этого данные считаются устаревшими.
const CACHE_TTL_MS = 60_000;

type ProfileCache = {
  profile: Profile;
  wallet: Wallet;
  loadedAt: number;
};

// Модульный кэш с TTL (не глобальные переменные без контроля)
let _cache: ProfileCache | null = null;

function isCacheValid(): boolean {
  if (!_cache) return false;
  return Date.now() - _cache.loadedAt < CACHE_TTL_MS;
}

export function useProfile(): UseProfileResult {
  const { playerId, isLoading: authLoading } = usePlayerId();
  const [profile, setProfile] = useState<Profile | null>(_cache?.profile ?? null);
  const [wallet, setWallet] = useState<Wallet | null>(_cache?.wallet ?? null);
  const [isLoading, setIsLoading] = useState(!isCacheValid() && supabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!supabaseConfigured || authLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getOrCreateProfile(playerId);
      // Обновляем кэш с временной меткой
      _cache = {
        profile: result.profile,
        wallet: result.wallet,
        loadedAt: Date.now(),
      };
      if (mountedRef.current) {
        setProfile(result.profile);
        setWallet(result.wallet);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки профиля");
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [playerId, authLoading]);

  useEffect(() => {
    // Загружаем если кэш невалиден
    if (!isCacheValid()) {
      void load();
    }
  }, [load]);

  return { profile, wallet, isLoading, error, refresh: load };
}

/**
 * Инвалидировать кэш профиля.
 * Вызывать после: завершения игры, обновления профиля, пополнения кошелька.
 */
export function invalidateProfileCache(): void {
  _cache = null;
}
