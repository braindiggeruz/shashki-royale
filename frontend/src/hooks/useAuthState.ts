import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { onAuthStateChange, getCurrentUser } from "../lib/auth";

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Получить текущего пользователя при монтировании
    const initUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Ошибка загрузки пользователя";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    initUser();

    // Подписаться на изменения auth состояния
    const unsubscribe = onAuthStateChange((updatedUser) => {
      setUser(updatedUser);
      setLoading(false);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return { user, loading, error, isAuthenticated: !!user };
}
