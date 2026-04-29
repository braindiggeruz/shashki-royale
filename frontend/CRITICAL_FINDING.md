# 🔴 КРИТИЧЕСКОЕ ОТКРЫТИЕ - Где ошибка Supabase

## Найденная проблема

Ошибка "Supabase не настроен" выводится через **toast.error()** в компоненте `Login.tsx` когда функция `signIn()` возвращает ошибку.

### Файл с ошибкой:
`/home/ubuntu/shashki-royal/src/pages/auth/Login.tsx` (строки 20-25)

```typescript
const { user, error } = await signIn(email, password);

if (error) {
  toast.error(error);  // ← ЗДЕСЬ выводится "Supabase не настроен"
  setLoading(false);
  return;
}
```

## Почему это происходит

В `src/lib/auth.ts` функция `signIn()` была исправлена чтобы возвращать гостевого пользователя когда Supabase не настроен:

```typescript
if (!supabase) {
  // Guest mode - return a mock user
  const guestUser = { ... };
  return { user: guestUser, error: null };  // ← Должно работать!
}
```

**НО:** Проблема в том, что `signIn()` вызывает `signInWithPassword()` из Supabase, и если это не работает, возвращается ошибка.

## РЕШЕНИЕ

Нужно убедиться что в `src/lib/auth.ts` функция `signIn()` **СНАЧАЛА** проверяет `if (!supabase)` **ДО** попытки вызова `supabase.auth.signInWithPassword()`.

### Текущий код (НЕПРАВИЛЬНЫЙ):
```typescript
export async function signIn(email: string, password: string) {
  if (!supabase) return { user: null, error: "Supabase не настроен" };  // ← Возвращает ошибку!
  // ... остальной код
}
```

### ПРАВИЛЬНЫЙ код:
```typescript
export async function signIn(email: string, password: string) {
  if (!supabase) {
    // GUEST MODE - не возвращать ошибку, а вернуть гостевого пользователя!
    const guestUser = {
      id: "guest_" + Math.random().toString(36).substr(2, 9),
      email: email || "guest@shashki.local",
      user_metadata: { nickname: "Гость" },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as User;
    return { user: guestUser, error: null };  // ← Возвращаем пользователя БЕЗ ошибки!
  }
  // ... остальной код
}
```

## Проверка

Команда для проверки текущего состояния:
```bash
grep -A 5 "export async function signIn" /home/ubuntu/shashki-royal/src/lib/auth.ts
```

Если видишь `return { user: null, error: "Supabase не настроен" }` - это НЕПРАВИЛЬНО!

Должно быть:
```typescript
return { user: guestUser, error: null };
```

## Быстрое исправление

1. Открыть `/home/ubuntu/shashki-royal/src/lib/auth.ts`
2. Найти функцию `signIn()`
3. Заменить первую строку с `if (!supabase)` на версию с гостевым пользователем (как показано выше)
4. Сохранить файл
5. Пересобрать APK

---

**Дата обнаружения:** 28 апреля 2026  
**Статус:** КРИТИЧНО - НУЖНО ИСПРАВИТЬ НЕМЕДЛЕННО
