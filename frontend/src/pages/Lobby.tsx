import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Copy, Check, Share2, Users, Zap } from "lucide-react";
import CustomKeypad from "../components/CustomKeypad.tsx";
import { motion, AnimatePresence } from "motion/react";
import { supabase, supabaseConfigured } from "../lib/supabase.ts";
import { getOrCreatePlayerId, saveActiveGame } from "../lib/storage.ts";
import { createRoom, joinRoom, fetchGame, extractRoomCode, findAndJoinRandomRoom, type GameRow } from "../services/gameRooms.ts";
import PrimaryButton from "../components/PrimaryButton.tsx";
import { toast } from "sonner";

type LobbyMode = "menu" | "quickplay" | "quickplay_waiting" | "creating" | "waiting" | "friend_menu" | "joining" | "error";

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

export default function Lobby() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const playerId = getOrCreatePlayerId();

  const [mode, setMode] = useState<LobbyMode>("menu");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [useMobile] = useState(() => isMobileDevice());
  const [waitElapsed, setWaitElapsed] = useState(0);

  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const autoJoinStartedRef = useRef(false);

  // Tick elapsed counter for quickplay_waiting and waiting
  useEffect(() => {
    if (mode !== "quickplay_waiting" && mode !== "waiting") {
      setWaitElapsed(0);
      return;
    }
    setWaitElapsed(0);
    const t = setInterval(() => setWaitElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [mode]);

  const cleanup = useCallback(() => {
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const navigateToGame = useCallback(
    (gameId: string, color: "white" | "black", code: string) => {
      cleanup();
      saveActiveGame({
        gameId,
        roomCode: code,
        playerId,
        playerColor: color,
        savedAt: Date.now(),
      });
      navigate("/online-game", { state: { gameId, myColor: color } });
    },
    [cleanup, navigate, playerId],
  );

  // ═══════════════════════════════════════════════════
  // 🚀 БЫСТРАЯ ИГРА — главная фича
  // ═══════════════════════════════════════════════════
  const handleQuickPlay = async () => {
    if (!supabaseConfigured) {
      setErrorMsg("Сервер не подключён. Попробуйте позже.");
      setMode("error");
      return;
    }
    setMode("quickplay");

    try {
      // 1. Ищем свободную комнату
      const found = await findAndJoinRandomRoom(playerId);

      if (found) {
        // Нашли! Мгновенно подключаемся
        toast.success("Соперник найден!");
        navigateToGame(found.id, "black", found.room_code);
        return;
      }

      // 2. Не нашли — создаём свою quickplay-комнату и ждём
      const game = await createRoom(playerId, "quickplay");
      gameIdRef.current = game.id;
      setRoomCode(game.room_code);
      setMode("quickplay_waiting");

      if (!supabase) return;

      // Realtime подписка
      const ch = supabase
        .channel(`lobby_wait:${game.id}`, { config: { broadcast: { self: false } } })
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "games",
            filter: `id=eq.${game.id}`,
          },
          (payload) => {
            const updated = payload.new as GameRow;
            if (updated.status === "playing" && updated.black_player_id) {
              toast.success("Соперник найден!");
              navigateToGame(game.id, "white", game.room_code);
            }
          },
        )
        .subscribe();
      channelRef.current = ch;

      // Polling fallback
      pollRef.current = setInterval(async () => {
        const fresh = await fetchGame(game.id);
        if (!fresh) return;
        if (fresh.status === "playing" && fresh.black_player_id) {
          toast.success("Соперник найден!");
          navigateToGame(game.id, "white", game.room_code);
        }
      }, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка подключения";
      setErrorMsg(russianError(msg));
      setMode("error");
    }
  };

  // ═══════════════════════════════════════════════════
  // 🤝 ИГРАТЬ С ДРУГОМ — по коду
  // ═══════════════════════════════════════════════════
  const handleCreateRoom = async () => {
    if (!supabaseConfigured) {
      setErrorMsg("Сервер не подключён.");
      setMode("error");
      return;
    }
    setMode("creating");
    try {
      const game = await createRoom(playerId, "friend");
      gameIdRef.current = game.id;
      setRoomCode(game.room_code);
      setMode("waiting");

      if (!supabase) return;

      const ch = supabase
        .channel(`lobby_wait:${game.id}`, { config: { broadcast: { self: false } } })
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "games",
            filter: `id=eq.${game.id}`,
          },
          (payload) => {
            const updated = payload.new as GameRow;
            if (updated.status === "playing" && updated.black_player_id) {
              navigateToGame(game.id, "white", game.room_code);
            }
          },
        )
        .subscribe();
      channelRef.current = ch;

      pollRef.current = setInterval(async () => {
        const fresh = await fetchGame(game.id);
        if (!fresh) return;
        if (fresh.status === "playing" && fresh.black_player_id) {
          navigateToGame(game.id, "white", game.room_code);
        }
      }, 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка создания комнаты";
      setErrorMsg(russianError(msg));
      setMode("error");
    }
  };

  const handleJoinRoom = useCallback(
    async (rawCode?: string) => {
      if (!supabaseConfigured) {
        setErrorMsg("Сервер не подключён.");
        setMode("error");
        return;
      }
      const code = extractRoomCode(rawCode ?? joinCode);
      if (code.length < 6) {
        setErrorMsg("Введите 6-значный код комнаты");
        setMode("error");
        return;
      }
      setJoinCode(code);
      setMode("joining");
      try {
        const game = await joinRoom(code, playerId);
        navigateToGame(game.id, "black", game.room_code);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ошибка подключения";
        setErrorMsg(russianError(msg));
        setMode("error");
      }
    },
    [joinCode, navigateToGame, playerId],
  );

  // Auto-join по ссылке
  useEffect(() => {
    const roomFromLink = searchParams.get("room") ?? searchParams.get("code");
    if (!supabaseConfigured || !roomFromLink || autoJoinStartedRef.current) return;
    const code = extractRoomCode(roomFromLink);
    if (code.length !== 6) return;
    autoJoinStartedRef.current = true;
    setJoinCode(code);
    void handleJoinRoom(code);
  }, [handleJoinRoom, searchParams]);

  const getInviteLink = useCallback((code: string) => {
    if (typeof window === "undefined") return code;
    const url = new URL("/lobby", window.location.origin);
    url.searchParams.set("room", code);
    return url.toString();
  }, []);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).catch(() => {});
    setCopied(true);
    toast.success("Код скопирован ✓");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareInvite = async () => {
    const inviteLink = getInviteLink(roomCode);
    const text = `Играй со мной в Шашки Рояль! Код: ${roomCode}\n${inviteLink}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Шашки Рояль", text, url: inviteLink });
        return;
      } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(text).catch(() => {});
    setInviteCopied(true);
    toast.success("Приглашение скопировано ✓");
    setTimeout(() => setInviteCopied(false), 2200);
  };

  const goBack = () => {
    cleanup();
    // Если у нас есть наша waiting-комната — закроем её, чтобы не висеть
    // в очереди quickplay для других игроков
    const ourId = gameIdRef.current;
    if (ourId && supabase) {
      void supabase
        .from("games")
        .update({ status: "finished", resign_reason: "Поиск отменён" })
        .eq("id", ourId)
        .eq("status", "waiting");
    }
    gameIdRef.current = null;
    setMode("menu");
    setJoinCode("");
    setRoomCode("");
  };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(120, 50, 0, 0.3) 0%, transparent 50%), linear-gradient(180deg, #0d0400 0%, #1a0800 100%)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(200,150,30,0.15)" }}
      >
        <button
          onClick={() => { cleanup(); navigate("/"); }}
          className="p-2 cursor-pointer rounded-xl"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "#ffd700" }} />
        </button>
        <h1
          className="text-xl font-bold"
          style={{
            fontFamily: "Cinzel, serif",
            background: "linear-gradient(135deg, #ffd700, #b8860b)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Онлайн игра
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto py-6">
        <AnimatePresence mode="wait">

          {/* ═══════════════ MENU ═══════════════ */}
          {mode === "menu" && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm space-y-4"
            >
              {/* Icon */}
              <div className="text-center mb-4">
                <motion.div
                  className="mx-auto mb-3 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                >
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(212,175,55,0.1)", border: "2px solid rgba(212,175,55,0.3)" }}>
                    <Zap className="w-8 h-8" style={{ color: "#FFD700" }} />
                  </div>
                </motion.div>
                <p className="text-sm" style={{ color: "rgba(212,175,55,0.7)", fontFamily: "Cinzel, serif" }}>
                  Выберите режим
                </p>
              </div>

              {/* 🚀 БЫСТРАЯ ИГРА — главная кнопка */}
              <motion.button
                onClick={handleQuickPlay}
                whileTap={{ scale: 0.97 }}
                data-testid="lobby-quickplay-btn"
                className="w-full py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)",
                  color: "#0d0400",
                  boxShadow: "0 4px 24px rgba(255,215,0,0.3), 0 0 60px rgba(255,215,0,0.1)",
                  fontFamily: "Cinzel, serif",
                }}
              >
                <Zap className="w-6 h-6" />
                Быстрая игра
              </motion.button>
              <p className="text-center text-xs" style={{ color: "rgba(212,175,55,0.45)" }}>
                Автоматический поиск соперника — без кодов
              </p>

              {/* Разделитель */}
              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1 h-px" style={{ background: "rgba(212,175,55,0.15)" }} />
                <span className="text-xs" style={{ color: "rgba(212,175,55,0.4)" }}>или</span>
                <div className="flex-1 h-px" style={{ background: "rgba(212,175,55,0.15)" }} />
              </div>

              {/* 🤝 ИГРАТЬ С ДРУГОМ */}
              <motion.button
                onClick={() => setMode("friend_menu")}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 cursor-pointer"
                style={{
                  background: "rgba(212,175,55,0.08)",
                  border: "1px solid rgba(212,175,55,0.25)",
                  color: "#FFD700",
                  fontFamily: "Cinzel, serif",
                }}
              >
                <Users className="w-5 h-5" />
                Играть с другом
              </motion.button>
              <p className="text-center text-xs" style={{ color: "rgba(212,175,55,0.35)" }}>
                Создайте комнату и отправьте код другу
              </p>
            </motion.div>
          )}

          {/* ═══════════════ QUICK PLAY SEARCH ═══════════════ */}
          {mode === "quickplay" && (
            <motion.div
              key="quickplay"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-sm text-center space-y-5"
            >
              <motion.div
                className="w-20 h-20 mx-auto rounded-full flex items-center justify-center"
                style={{ background: "rgba(212,175,55,0.1)", border: "2px solid rgba(212,175,55,0.3)" }}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
              >
                <Zap className="w-10 h-10" style={{ color: "#FFD700" }} />
              </motion.div>
              <div>
                <p className="text-lg font-bold" style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}>
                  Поиск соперника...
                </p>
                <div className="flex justify-center gap-1 mt-3">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: "#D4AF37" }}
                      animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs" style={{ color: "rgba(212,175,55,0.5)" }}>
                Подключим к первому свободному сопернику
              </p>
              <button
                onClick={goBack}
                className="text-sm cursor-pointer py-2 px-4 rounded-lg"
                style={{ color: "rgba(212,175,55,0.5)", background: "rgba(255,255,255,0.04)" }}
              >
                Отмена
              </button>
            </motion.div>
          )}

          {/* ═══════════════ QUICKPLAY WAITING (created own room, listening) ═══════════════ */}
          {mode === "quickplay_waiting" && (
            <motion.div
              key="quickplay_waiting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-sm text-center space-y-6"
              data-testid="quickplay-waiting"
            >
              {/* Pulsing search ring */}
              <div className="relative w-24 h-24 mx-auto">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: "2px solid rgba(212,175,55,0.35)" }}
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ border: "2px solid rgba(212,175,55,0.35)" }}
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut", delay: 0.5 }}
                />
                <div
                  className="absolute inset-2 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(212,175,55,0.10)",
                    border: "2px solid rgba(212,175,55,0.5)",
                  }}
                >
                  <Zap className="w-9 h-9" style={{ color: "#FFD700" }} />
                </div>
              </div>

              <div className="space-y-1">
                <p
                  className="text-xl font-bold"
                  style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
                  data-testid="quickplay-waiting-title"
                >
                  Ищем соперника...
                </p>
                <p
                  className="text-sm tabular-nums"
                  style={{ color: "rgba(212,175,55,0.6)" }}
                  data-testid="quickplay-elapsed"
                >
                  {waitElapsed} сек
                </p>
              </div>

              <div className="flex justify-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#D4AF37" }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                  />
                ))}
              </div>

              <div
                className="rounded-xl px-4 py-3 text-left"
                style={{
                  background: "rgba(212,175,55,0.06)",
                  border: "1px solid rgba(212,175,55,0.18)",
                }}
              >
                <p className="text-xs leading-relaxed" style={{ color: "rgba(212,175,55,0.75)" }}>
                  💡 Подскажите другу: пусть тоже нажмёт «Быстрая игра» —
                  вы автоматически попадёте в одну партию.
                </p>
              </div>

              <button
                onClick={goBack}
                className="text-sm cursor-pointer py-2 px-6 rounded-lg"
                style={{
                  color: "rgba(212,175,55,0.7)",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(212,175,55,0.15)",
                }}
                data-testid="quickplay-cancel"
              >
                Отменить
              </button>
            </motion.div>
          )}

          {/* ═══════════════ FRIEND MENU ═══════════════ */}
          {mode === "friend_menu" && (
            <motion.div
              key="friend_menu"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm space-y-4"
            >
              <div className="text-center mb-2">
                <Users className="w-10 h-10 mx-auto mb-2" style={{ color: "#FFD700" }} />
                <p className="text-sm" style={{ color: "rgba(212,175,55,0.7)", fontFamily: "Cinzel, serif" }}>
                  Создайте комнату или войдите по коду
                </p>
              </div>

              <PrimaryButton onClick={handleCreateRoom} variant="gold">
                Создать комнату
              </PrimaryButton>

              <div
                className="rounded-2xl p-4 space-y-3"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(200,150,30,0.15)",
                }}
              >
                <p className="text-xs text-center" style={{ color: "rgba(200,150,50,0.7)", fontFamily: "Cinzel, serif" }}>
                  Войти по коду друга
                </p>
                {useMobile ? (
                  <CustomKeypad
                    value={joinCode}
                    onChange={setJoinCode}
                    maxLength={120}
                  />
                ) : (
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(extractRoomCode(e.target.value))}
                    placeholder="КОД ИЛИ ССЫЛКА"
                    maxLength={120}
                    className="w-full text-center text-2xl font-black tracking-[0.35em] py-3 outline-none"
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(212,175,55,0.3)",
                      borderRadius: "12px",
                      color: "#FFD700",
                      fontFamily: "Cinzel, serif",
                      caretColor: "#FFD700",
                    }}
                    autoFocus
                  />
                )}
                <PrimaryButton
                  onClick={() => handleJoinRoom()}
                  variant="ghost"
                  disabled={joinCode.trim().length < 6}
                >
                  Войти в комнату
                </PrimaryButton>
              </div>

              <button
                onClick={goBack}
                className="w-full text-sm cursor-pointer py-2"
                style={{ color: "rgba(212,175,55,0.4)" }}
              >
                ← Назад
              </button>
            </motion.div>
          )}

          {/* ═══════════════ CREATING SPINNER ═══════════════ */}
          {mode === "creating" && (
            <motion.div
              key="creating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-3"
            >
              <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p style={{ color: "rgba(200,150,50,0.8)" }}>Создание комнаты...</p>
            </motion.div>
          )}

          {/* ═══════════════ WAITING FOR OPPONENT ═══════════════ */}
          {mode === "waiting" && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-sm space-y-5 text-center"
            >
              {/* Room code card */}
              <div
                className="p-5 rounded-2xl"
                style={{
                  background: "rgba(212,175,55,0.05)",
                  border: "1px solid rgba(212,175,55,0.3)",
                  boxShadow: "0 0 30px rgba(212,175,55,0.08)",
                }}
              >
                <p className="text-xs uppercase tracking-[0.3em] mb-2" style={{ color: "rgba(212,175,55,0.5)", fontFamily: "Cinzel, serif" }}>
                  Код комнаты
                </p>
                <p className="text-5xl font-black tracking-[0.3em] mb-4" style={{ fontFamily: "Cinzel, serif", color: "#FFD700" }}>
                  {roomCode}
                </p>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 mx-auto py-2.5 px-6 cursor-pointer text-sm font-semibold transition-all active:scale-95"
                  style={{
                    borderRadius: "12px",
                    background: copied ? "rgba(100,200,100,0.15)" : "rgba(212,175,55,0.12)",
                    border: `1px solid ${copied ? "rgba(100,200,100,0.4)" : "rgba(212,175,55,0.35)"}`,
                    color: copied ? "#86efac" : "#FFD700",
                    fontFamily: "Cinzel, serif",
                  }}
                >
                  {copied ? <><Check className="w-4 h-4" /> Скопировано</> : <><Copy className="w-4 h-4" /> Скопировать код</>}
                </button>
                <button
                  onClick={handleShareInvite}
                  className="mt-3 flex items-center gap-2 mx-auto py-2.5 px-6 cursor-pointer text-sm font-semibold transition-all active:scale-95"
                  style={{
                    borderRadius: "12px",
                    background: inviteCopied ? "rgba(100,200,100,0.15)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${inviteCopied ? "rgba(100,200,100,0.4)" : "rgba(212,175,55,0.22)"}`,
                    color: inviteCopied ? "#86efac" : "rgba(255,215,0,0.9)",
                    fontFamily: "Cinzel, serif",
                  }}
                >
                  {inviteCopied ? <><Check className="w-4 h-4" /> Готово</> : <><Share2 className="w-4 h-4" /> Поделиться</>}
                </button>
              </div>

              {/* Searching animation */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full"
                        style={{ background: "#D4AF37" }}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                        transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                  <p className="text-sm" style={{ color: "rgba(212,175,55,0.7)", fontFamily: "Cinzel, serif" }}>
                    Ожидание соперника...
                  </p>
                </div>
                <p className="text-xs" style={{ color: "rgba(212,175,55,0.35)" }}>
                  Друг может войти по коду или по ссылке
                </p>
              </div>

              <button
                onClick={goBack}
                className="text-sm cursor-pointer"
                style={{ color: "rgba(212,175,55,0.4)" }}
              >
                Отмена
              </button>
            </motion.div>
          )}

          {/* ═══════════════ JOINING SPINNER ═══════════════ */}
          {mode === "joining" && (
            <motion.div
              key="joining"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-3"
            >
              <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p style={{ color: "rgba(200,150,50,0.8)" }}>Подключение к комнате...</p>
            </motion.div>
          )}

          {/* ═══════════════ ERROR ═══════════════ */}
          {mode === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-sm space-y-4 text-center"
            >
              <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center" style={{ background: "rgba(255,100,100,0.1)" }}>
                <span className="text-2xl">⚠️</span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,150,100,0.9)" }}>
                {errorMsg}
              </p>
              <button
                onClick={goBack}
                className="py-2 px-6 rounded-xl text-sm cursor-pointer"
                style={{
                  background: "rgba(200,150,30,0.15)",
                  border: "1px solid rgba(200,150,30,0.3)",
                  color: "#ffd700",
                }}
              >
                Попробовать снова
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

/** Map common errors to Russian */
function russianError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("комната не найдена") || lower.includes("no rows") || lower.includes("invalid input")) {
    return "Комната не найдена. Проверьте код.";
  }
  if (lower.includes("уже занята") || lower.includes("already")) {
    return "Комната уже занята. Создайте новую.";
  }
  if (lower.includes("уже в этой")) {
    return "Вы уже в этой комнате.";
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed")) {
    return "Ошибка сети. Проверьте интернет.";
  }
  if (lower.includes("timeout")) {
    return "Время ожидания вышло.";
  }
  if (lower.includes("не настроен") || lower.includes("not configured")) {
    return "Сервер не подключён. Попробуйте позже.";
  }
  return msg;
}
