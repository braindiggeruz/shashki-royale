import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { updateProfileWithGoogleData } from "../../services/profiles";
import { getOrCreatePlayerId } from "../../lib/storage";

/**
 * OAuth Callback страница.
 * Supabase автоматически обрабатывает hash-фрагмент (#access_token=...)
 * при загрузке страницы. Мы просто ждём сессию и редиректим.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        if (!supabase) {
          navigate("/", { replace: true });
          return;
        }

        // Supabase JS автоматически парсит hash из URL
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        if (data.session) {
          // Успешная авторизация — сохраняем Google данные
          const user = data.session.user;
          if (user && user.user_metadata) {
            const playerId = `auth_${user.id}`;
            const displayName = user.user_metadata.full_name || user.user_metadata.name || user.email || "Пользователь";
            const avatarUrl = user.user_metadata.picture || null;
            try {
              await updateProfileWithGoogleData(playerId, displayName, avatarUrl);
            } catch (err) {
              console.error("[Callback] Failed to update profile with Google data:", err);
              // Не блокируем вход если обновление профиля не удалось
            }
          }
          navigate("/", { replace: true });
        } else {
          // Нет сессии — возможно, ещё обрабатывается
          // Подождём событие auth state change
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_IN" && session) {
              subscription.unsubscribe();
              // Сохраняем Google данные
              const user = session.user;
              if (user && user.user_metadata) {
                const playerId = `auth_${user.id}`;
                const displayName = user.user_metadata.full_name || user.user_metadata.name || user.email || "Пользователь";
                const avatarUrl = user.user_metadata.picture || null;
                updateProfileWithGoogleData(playerId, displayName, avatarUrl).catch((err) => {
                  console.error("[Callback] Failed to update profile with Google data:", err);
                });
              }
              navigate("/", { replace: true });
            }
          });

          // Таймаут на 10 секунд
          setTimeout(() => {
            subscription.unsubscribe();
            setError("Время ожидания истекло. Попробуйте войти снова.");
          }, 10000);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center h-svh gap-6 px-4"
        style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-lg font-bold" style={{ color: "#ef4444" }}>
            Ошибка авторизации
          </p>
          <p className="text-sm max-w-md" style={{ color: "rgba(212,175,55,0.7)" }}>
            {error}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/", { replace: true })}
            className="px-4 py-2 rounded-lg"
            style={{
              background: "rgba(212,175,55,0.15)",
              border: "1px solid rgba(212,175,55,0.3)",
              color: "#D4AF37",
            }}
          >
            На главную
          </button>
          <button
            onClick={() => navigate("/auth/login", { replace: true })}
            className="px-4 py-2 rounded-lg font-bold"
            style={{
              background: "linear-gradient(135deg, #D4AF37 0%, #FFD700 100%)",
              color: "#0d0400",
            }}
          >
            Войти снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center h-svh gap-4"
      style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
    >
      <div
        className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
      />
      <p className="text-sm" style={{ color: "rgba(212,175,55,0.7)" }}>
        Авторизация...
      </p>
    </div>
  );
}
