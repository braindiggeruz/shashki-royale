import { useMemo } from "react";
import { useAuthState } from "./useAuthState";
import { getOrCreatePlayerId } from "../lib/storage";

/**
 * Гибридный хук для получения player_id.
 * 
 * ПРИОРИТЕТ:
 * 1. Если пользователь авторизован через Supabase Auth → используем auth.user.id
 * 2. Если не авторизован → используем localStorage UUID (для LocalGame)
 * 
 * БЕЗОПАСНОСТЬ:
 * - Для ставок (StakeLobby, OnlineGame со ставками) ВСЕГДА требуется авторизация
 * - ProtectedRoute гарантирует что user !== null для защищённых маршрутов
 * - RLS политики на сервере проверяют auth.uid() для финансовых операций
 */
export function usePlayerId(): {
  playerId: string;
  isAuthenticated: boolean;
  isLoading: boolean;
} {
  const { user, loading, isAuthenticated } = useAuthState();

  const playerId = useMemo(() => {
    if (user) {
      // Авторизованный пользователь — формат совпадает с create_profile_for_auth в БД
      return `auth_${user.id}`;
    }
    // Анонимный пользователь — только для LocalGame
    return getOrCreatePlayerId();
  }, [user]);

  return {
    playerId,
    isAuthenticated,
    isLoading: loading,
  };
}
