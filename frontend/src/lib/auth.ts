import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
  avatar_index: number;
};

function createGuestUser(email = "guest@shashki.local", nickname = "Гость"): User {
  return {
    id: "guest_" + Math.random().toString(36).slice(2, 11),
    email,
    user_metadata: { nickname },
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as User;
}

/**
 * Регистрация нового пользователя.
 * Если Supabase не подключён, приложение работает как локальная гостевая версия,
 * поэтому регистрация не должна блокировать вход в игру сообщением о настройке Supabase.
 */
export async function signUp(
  email: string = "",
  password: string = "",
  nickname: string = "",
  avatarIndex?: number,
): Promise<{ user: User; error: null } | { user: null; error: string }> {
  if (!supabase) {
    return { user: createGuestUser(email || "guest@shashki.local", nickname || "Гость"), error: null };
  }

  // Валидация
  if (!email || !password || !nickname) {
    return { user: null, error: "Заполните все поля" };
  }
  if (password.length < 8) {
    return { user: null, error: "Пароль должен быть минимум 8 символов" };
  }
  if (nickname.length < 3 || nickname.length > 20) {
    return { user: null, error: "Никнейм должен быть 3-20 символов" };
  }

  try {
    // 1. Создаём пользователя в auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nickname,
          avatar_index: avatarIndex ?? Math.floor(Math.random() * 8),
        },
      },
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: "Ошибка создания пользователя" };
    }

    // 2. Создаём профиль в profiles таблице через RPC
    const { error: profileError } = await supabase.rpc("create_profile_for_auth", {
      p_auth_user_id: data.user.id,
      p_email: email,
      p_nickname: nickname,
      p_avatar_index: data.user.user_metadata?.avatar_index ?? 0,
    });

    if (profileError) {
      console.error("[signUp] Profile creation error:", profileError);
      // Не критично - профиль может быть создан триггером
    }

    return { user: data.user, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { user: null, error: message };
  }
}

/**
 * Вход в систему.
 * В локальной сборке без Supabase вход работает как гостевой пропуск в приложение.
 */
export async function signIn(
  email: string = "",
  password: string = "",
): Promise<{ user: User; error: null } | { user: null; error: string }> {
  if (!supabase) {
    return { user: createGuestUser(email || "guest@shashki.local"), error: null };
  }

  if (!email || !password) {
    return { user: null, error: "Заполните email и пароль" };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: "Ошибка входа" };
    }

    return { user: data.user, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { user: null, error: message };
  }
}

/**
 * Вход через Google OAuth.
 * В гостевой локальной версии отсутствие Supabase не считается ошибкой интерфейса.
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  if (!supabase) return { error: null };

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { error: message };
  }
}

/**
 * Выход из системы
 */
export async function signOut(): Promise<{ error: string | null }> {
  if (!supabase) return { error: null };

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { error: message };
  }
}

/**
 * Получить текущего пользователя
 */
export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) {
    return createGuestUser();
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? createGuestUser();
  } catch (err) {
    console.error("[getCurrentUser] Error:", err);
    return createGuestUser();
  }
}

/**
 * Получить сессию
 */
export async function getSession() {
  if (!supabase) return null;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  } catch (err) {
    console.error("[getSession] Error:", err);
    return null;
  }
}

/**
 * Отправить email для восстановления пароля
 */
export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (!supabase) {
    return { error: "Восстановление пароля доступно только после подключения онлайн-аккаунтов" };
  }

  if (!email) {
    return { error: "Введите email" };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { error: message };
  }
}

/**
 * Обновить пароль
 */
export async function updatePassword(newPassword: string): Promise<{ error: string | null }> {
  if (!supabase) {
    return { error: "Смена пароля доступна только после подключения онлайн-аккаунтов" };
  }

  if (!newPassword || newPassword.length < 8) {
    return { error: "Пароль должен быть минимум 8 символов" };
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Неизвестная ошибка";
    return { error: message };
  }
}

/**
 * Подписаться на изменения auth состояния
 */
export function onAuthStateChange(
  callback: (user: User | null) => void,
): (() => void) | null {
  if (!supabase) return null;

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return () => subscription?.unsubscribe();
}
