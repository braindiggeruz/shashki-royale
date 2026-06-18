import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, Plus, RefreshCw, Trophy, Users, Star } from "lucide-react";
import { useProfile } from "../hooks/use-profile.ts";
import { fetchStakeTables, createStakeGame, joinStakeGame } from "../services/stakes.ts";
import { saveActiveGame } from "../lib/storage.ts";
import { usePlayerId } from "../hooks/usePlayerId";
import { createInitialBoard } from "../game/initialBoard.ts";
import { supabase, supabaseConfigured } from "../lib/supabase.ts";
import { toast } from "sonner";

const ROYAL_BG = {
  background:
    "radial-gradient(ellipse at 50% 0%, rgba(120,50,0,0.35) 0%, transparent 60%), linear-gradient(180deg, #0d0400 0%, #1a0800 50%, #0d0400 100%)",
};

const AVATARS = ["♟", "♛", "⚔️", "🛡️", "🦁", "🐺", "🔥", "🌙"];
const FEE_OPTIONS = [1, 5, 10, 50] as const;

type FeeFilter = "all" | "mine" | "beginner" | "master";

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

type StakeTable = {
  id: string;
  room_code: string;
  status: string;
  match_type: string;
  white_profile_id: string | null;
  game_stakes: { entry_fee: number; pot_amount: number; escrow_status: string }[] | null;
  white_profile:
    | { id: string; nickname: string; avatar_index: number; rating: number }
    | { id: string; nickname: string; avatar_index: number; rating: number }[]
    | null;
};

function getCreator(
  raw: StakeTable["white_profile"],
): { id: string; nickname: string; avatar_index: number; rating: number } | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function getTierLabel(fee: number): { label: string; color: string } {
  if (fee <= 1) return { label: "Новичок", color: "rgba(100,200,100,0.8)" };
  if (fee <= 10) return { label: "Опытный", color: "rgba(212,175,55,0.9)" };
  return { label: "Мастер", color: "rgba(220,80,80,0.9)" };
}

/** Gold coin SVG reused in multiple places */
function GoldCoin({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ filter: "drop-shadow(0 0 4px rgba(255,215,0,0.5))", flexShrink: 0 }}
    >
      <defs>
        <radialGradient id="gc" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FFE566" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#B8860B" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#gc)" stroke="#D4AF37" strokeWidth="0.8" />
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#7a5200" fontFamily="serif">
        ₿
      </text>
    </svg>
  );
}

export default function StakeLobbyPage() {
  const navigate = useNavigate();
  const { profile, wallet, refresh: refreshProfile } = useProfile();

  const { playerId, isAuthenticated } = usePlayerId();
  const [tables, setTables] = useState<StakeTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FeeFilter>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  const loadTables = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchStakeTables();
      setTables(data as unknown as StakeTable[]);
    } catch {
      setTables([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load + realtime subscription for new/updated stake tables
  useEffect(() => {
    if (!supabaseConfigured) {
      setIsLoading(false);
      return;
    }
    void loadTables();

    if (!supabase) return;
    // Subscribe to INSERT/UPDATE on games table for stake match_type
    const ch = supabase
      .channel("stake_lobby_updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "games", filter: "match_type=eq.stake" },
        () => {
          // Refresh table list on any change
          void loadTables();
        },
      )
      .subscribe();
    channelRef.current = ch;

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current).catch(() => null);
        channelRef.current = null;
      }
    };
  }, [loadTables]);

  const handleJoin = async (table: StakeTable) => {
    if (!profile) {
      toast.error("Профиль не загружен");
      return;
    }
    const fee = table.game_stakes?.[0]?.entry_fee ?? 0;
    if ((wallet?.crypto_balance ?? 0) < fee) {
      toast.error("❌ Недостаточно жетонов. Пополните баланс!", {
        style: {
          background: "#2a0a00",
          border: "1px solid rgba(220,50,50,0.5)",
          color: "#ffd700",
          fontFamily: "Cinzel, serif",
        },
      });
      return;
    }
    setJoiningId(table.id);
    try {
      await joinStakeGame(playerId, table.id);
      saveActiveGame({
        gameId: table.id,
        roomCode: table.room_code,
        playerId,
        playerColor: "black",
        savedAt: Date.now(),
      });
      await refreshProfile();
      toast.success(`🏆 Входим в игру! Взнос: ${fee} 🪙`, {
        style: { background: "#0d2200", border: "1px solid rgba(100,200,50,0.4)", color: "#90ee90" },
      });
      navigate("/online-game", { state: { gameId: table.id, myColor: "black", stake: fee } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка подключения";
      toast.error(`Ошибка: ${msg}`, {
        style: {
          background: "#2a0a00",
          border: "1px solid rgba(220,50,50,0.5)",
          color: "#ffd700",
          fontFamily: "Cinzel, serif",
        },
      });
    } finally {
      setJoiningId(null);
    }
  };

  const filtered = tables.filter((tbl) => {
    if (filter === "all") return true;
    if (filter === "mine") return tbl.white_profile_id === profile?.id;
    const fee = tbl.game_stakes?.[0]?.entry_fee ?? 0;
    if (filter === "beginner") return fee <= 5;
    if (filter === "master") return fee > 5;
    return true;
  });

  const TABS: { key: FeeFilter; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "Все столы", icon: <Users className="w-3 h-3" /> },
    { key: "mine", label: "Мои столы", icon: <Star className="w-3 h-3" /> },
    { key: "beginner", label: "Начальные", icon: <span style={{ fontSize: 10 }}>🪙</span> },
    { key: "master", label: "Мастерские", icon: <Trophy className="w-3 h-3" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={ROYAL_BG}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <ChevronLeft className="w-5 h-5" style={{ color: "rgba(200,150,50,0.8)" }} />
          </button>
          <h1
            className="text-base font-bold tracking-widest uppercase"
            style={{ fontFamily: "Cinzel, serif", color: "#ffd700" }}
          >
            Турниры
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadTables()}
            className="p-2 rounded-xl cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)" }}
            title="Обновить"
          >
            <RefreshCw className="w-4 h-4" style={{ color: "rgba(200,150,50,0.6)" }} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl cursor-pointer transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #b8860b, #ffd700)", color: "#1a0800" }}
          >
            <Plus className="w-4 h-4" />
            <span className="text-xs font-bold" style={{ fontFamily: "Cinzel, serif" }}>
              Создать стол
            </span>
          </button>
        </div>
      </div>

      {/* Premium balance banner */}
      <div className="px-4 pt-3 pb-2">
        <div
          className="flex items-center justify-between px-4 py-3 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(184,134,11,0.14) 0%, rgba(255,215,0,0.05) 100%)",
            border: "1px solid rgba(255,215,0,0.18)",
            boxShadow: "0 0 24px rgba(212,175,55,0.07)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-xs uppercase tracking-widest"
              style={{ color: "rgba(200,150,50,0.55)", fontFamily: "Cinzel, serif" }}
            >
              Ваш баланс
            </span>
          </div>
          <div className="flex items-center gap-2">
            <GoldCoin size={20} />
            <span
              className="text-xl font-black"
              style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
            >
              {wallet ? wallet.crypto_balance.toLocaleString() : "—"}
            </span>
            <span className="text-xs" style={{ color: "rgba(200,150,50,0.5)" }}>
              жетонов
            </span>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all"
            style={{
              background: filter === tab.key ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.04)",
              border:
                filter === tab.key
                  ? "1px solid rgba(255,215,0,0.4)"
                  : "1px solid rgba(255,255,255,0.07)",
              color: filter === tab.key ? "#ffd700" : "rgba(200,150,50,0.5)",
              fontFamily: "Cinzel, serif",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table count badge */}
      {!isLoading && supabaseConfigured && (
        <div className="px-4 pb-2">
          <p className="text-xs" style={{ color: "rgba(200,150,50,0.35)" }}>
            Доступно столов:{" "}
            <span style={{ color: "rgba(200,150,50,0.6)" }}>{filtered.length}</span>
          </p>
        </div>
      )}

      {/* Table list */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {!supabaseConfigured ? (
          <NoSupabase />
        ) : isLoading ? (
          <LoadingSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} filter={filter} />
        ) : (
          <div className="space-y-3">
            {filtered.map((table, i) => {
              const fee = table.game_stakes?.[0]?.entry_fee ?? 0;
              const pot = table.game_stakes?.[0]?.pot_amount ?? fee * 2;
              const creator = getCreator(table.white_profile);
              const isJoining = joiningId === table.id;
              const canAfford = (wallet?.crypto_balance ?? 0) >= fee;
              const isMyTable = table.white_profile_id === profile?.id;
              const tier = getTierLabel(fee);

              return (
                <motion.div
                  key={table.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: isMyTable
                      ? "rgba(212,175,55,0.06)"
                      : "rgba(255,255,255,0.025)",
                    border: isMyTable
                      ? "1px solid rgba(212,175,55,0.25)"
                      : "1px solid rgba(255,215,0,0.08)",
                  }}
                >
                  {/* Table row */}
                  <div className="flex items-center justify-between px-4 py-3.5 gap-3">
                    {/* Avatar + info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: "rgba(180,130,0,0.12)", fontSize: 20 }}
                      >
                        {AVATARS[creator?.avatar_index ?? 0]}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className="text-sm font-bold truncate"
                            style={{ color: "rgba(220,190,90,0.95)", fontFamily: "Cinzel, serif" }}
                          >
                            {creator?.nickname ?? "Unknown"}
                          </p>
                          {isMyTable && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                background: "rgba(212,175,55,0.15)",
                                color: "#ffd700",
                                border: "1px solid rgba(212,175,55,0.3)",
                                fontFamily: "Cinzel, serif",
                              }}
                            >
                              Ваш стол
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs" style={{ color: "rgba(200,150,50,0.4)" }}>
                            Рейтинг: {creator?.rating ?? "?"}
                          </span>
                          <span className="text-[11px] font-semibold" style={{ color: tier.color }}>
                            {tier.label}
                          </span>
                        </div>
                        <p
                          className="text-xs mt-0.5 font-mono tracking-widest"
                          style={{ color: "rgba(200,150,50,0.35)" }}
                        >
                          {table.room_code}
                        </p>
                      </div>
                    </div>

                    {/* Fee/pot + action */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* Entry fee */}
                      <div
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
                        style={{
                          background: "rgba(255,215,0,0.08)",
                          border: "1px solid rgba(255,215,0,0.15)",
                        }}
                      >
                        <GoldCoin size={12} />
                        <span className="text-xs font-black" style={{ color: "#ffd700" }}>
                          {fee}
                        </span>
                        <span className="text-[10px]" style={{ color: "rgba(200,150,50,0.5)" }}>
                          → {pot}
                        </span>
                      </div>

                      {/* Join button */}
                      {!isMyTable && (
                        <button
                          onClick={() => void handleJoin(table)}
                          disabled={isJoining || !canAfford}
                          className="px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                          style={{
                            background: canAfford
                              ? "linear-gradient(135deg, #8b1a1a, #c0392b)"
                              : "rgba(255,255,255,0.06)",
                            color: canAfford ? "#ffd700" : "rgba(200,150,50,0.4)",
                            fontFamily: "Cinzel, serif",
                            border: "1px solid rgba(180,50,50,0.3)",
                            minWidth: 72,
                          }}
                        >
                          {isJoining ? (
                            <span className="flex items-center gap-1 justify-center">
                              <span className="w-3 h-3 border border-yellow-400 border-t-transparent rounded-full animate-spin" />
                              Вход...
                            </span>
                          ) : !canAfford ? (
                            "Мало жетонов"
                          ) : (
                            "Войти"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Table Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateTableModal
            wallet={wallet}
            profileId={profile?.id ?? null}
            playerId={playerId}
            onClose={() => setShowCreate(false)}
            onCreated={async (gameId, roomCode, stake) => {
              setShowCreate(false);
              await refreshProfile();
              void loadTables();
              navigate("/online-game", { state: { gameId, myColor: "white", stake } });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Create Table Modal
// ──────────────────────────────────────────────────────────────

function CreateTableModal({
  wallet,
  profileId,
  playerId,
  onClose,
  onCreated,
}: {
  wallet: { crypto_balance: number } | null;
  profileId: string | null;
  playerId: string;
  onClose: () => void;
  onCreated: (gameId: string, roomCode: string, stake: number) => Promise<void>;
}) {
  const [selectedFee, setSelectedFee] = useState<number>(5);
  const [creating, setCreating] = useState(false);

  const balance = wallet?.crypto_balance ?? 0;
  const canAfford = balance >= selectedFee;
  const pot = selectedFee * 2;

  const handleCreate = async () => {
    if (!profileId || !canAfford) return;
    setCreating(true);
    try {
      const roomCode = generateRoomCode();
      const board = createInitialBoard();
      const result = await createStakeGame(playerId, selectedFee, roomCode, board);
      saveActiveGame({
        gameId: result.game_id,
        roomCode: result.room_code,
        playerId,
        playerColor: "white",
        savedAt: Date.now(),
      });
      toast.success(`♛ Стол создан! Ждём соперника...`, {
        style: { background: "#0d2200", border: "1px solid rgba(100,200,50,0.4)", color: "#90ee90" },
      });
      await onCreated(result.game_id, result.room_code, selectedFee);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка создания стола";
      toast.error(`Ошибка: ${msg}`, {
        style: {
          background: "#2a0a00",
          border: "1px solid rgba(220,50,50,0.5)",
          color: "#ffd700",
          fontFamily: "Cinzel, serif",
        },
      });
      setCreating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="w-full max-w-sm rounded-3xl p-6 space-y-5"
        style={{ background: "#1a0800", border: "1px solid rgba(255,215,0,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="text-center">
          <h2
            className="text-lg font-bold"
            style={{ color: "#ffd700", fontFamily: "Cinzel, serif" }}
          >
            Создать стол
          </h2>
          <p className="text-xs mt-1" style={{ color: "rgba(200,150,50,0.5)" }}>
            Выберите взнос для участия в турнире
          </p>
        </div>

        {/* Balance display */}
        <div
          className="flex items-center justify-between px-4 py-2.5 rounded-xl"
          style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.12)" }}
        >
          <span className="text-xs" style={{ color: "rgba(200,150,50,0.6)" }}>
            Доступно:
          </span>
          <div className="flex items-center gap-1.5">
            <GoldCoin size={14} />
            <span className="text-sm font-black" style={{ color: "#ffd700" }}>
              {balance}
            </span>
          </div>
        </div>

        {/* Fee options */}
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-3"
            style={{ color: "rgba(200,150,50,0.45)", fontFamily: "Cinzel, serif" }}
          >
            Взнос за участие
          </p>
          <div className="grid grid-cols-4 gap-2">
            {FEE_OPTIONS.map((fee) => {
              const affordable = balance >= fee;
              const isSelected = selectedFee === fee;
              const tier = getTierLabel(fee);
              return (
                <button
                  key={fee}
                  onClick={() => setSelectedFee(fee)}
                  disabled={!affordable}
                  className="py-3 rounded-xl text-sm font-bold cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed flex flex-col items-center gap-1"
                  style={{
                    background: isSelected ? "rgba(255,215,0,0.18)" : "rgba(255,255,255,0.04)",
                    border: isSelected
                      ? "1px solid rgba(255,215,0,0.55)"
                      : "1px solid rgba(255,255,255,0.07)",
                    color: isSelected ? "#ffd700" : "rgba(200,150,50,0.5)",
                    fontFamily: "Cinzel, serif",
                    boxShadow: isSelected ? "0 0 12px rgba(255,215,0,0.18)" : "none",
                  }}
                >
                  <GoldCoin size={14} />
                  <span>{fee}</span>
                  <span style={{ fontSize: 8, color: isSelected ? tier.color : "rgba(200,150,50,0.3)" }}>
                    {tier.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pot info */}
        <div
          className="flex items-center justify-between px-4 py-2.5 rounded-xl"
          style={{ background: "rgba(180,30,0,0.1)", border: "1px solid rgba(180,30,0,0.2)" }}
        >
          <span className="text-xs" style={{ color: "rgba(200,150,50,0.5)" }}>
            Победный приз:
          </span>
          <div className="flex items-center gap-1.5">
            <GoldCoin size={14} />
            <span className="text-sm font-black" style={{ color: "#ffd700" }}>
              {pot}
            </span>
            <span className="text-xs" style={{ color: "rgba(200,150,50,0.4)" }}>
              (взнос × 2)
            </span>
          </div>
        </div>

        {!canAfford && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-center font-semibold"
            style={{ color: "#f87171" }}
          >
            ❌ Недостаточно жетонов для этого взноса
          </motion.p>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm cursor-pointer transition-all active:scale-95"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "rgba(200,150,50,0.6)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            Отмена
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !canAfford}
            className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            style={{
              background: "linear-gradient(135deg, #b8860b, #ffd700)",
              color: "#1a0800",
              fontFamily: "Cinzel, serif",
              boxShadow: canAfford ? "0 4px 16px rgba(180,140,0,0.35)" : "none",
            }}
          >
            {creating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-amber-900 border-t-transparent rounded-full animate-spin" />
                Создание...
              </span>
            ) : (
              "♛ Создать"
            )}
          </button>
        </div>

        <p className="text-xs text-center" style={{ color: "rgba(200,150,50,0.2)" }}>
          Жетоны виртуальные и не имеют реальной ценности
        </p>
      </motion.div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────
// Helper components
// ──────────────────────────────────────────────────────────────

function EmptyState({ onCreate, filter }: { onCreate: () => void; filter: FeeFilter }) {
  const msg =
    filter === "mine"
      ? "У вас нет открытых столов"
      : "Пока нет доступных столов";
  const sub =
    filter === "mine"
      ? "Создайте стол и ждите соперника"
      : "Будьте первым — создайте стол!";

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div style={{ filter: "drop-shadow(0 0 16px rgba(212,175,55,0.4))" }}>
        <svg viewBox="0 0 80 52" width="64" height="42">
          <defs>
            <linearGradient id="emGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="100%" stopColor="#B8860B" />
            </linearGradient>
          </defs>
          <path
            d="M8 44 L14 16 L26 32 L40 4 L54 32 L66 16 L72 44 Z"
            fill="url(#emGrad)"
            stroke="#FFE066"
            strokeWidth="1"
          />
          <rect x="8" y="40" width="64" height="10" rx="3" fill="url(#emGrad)" />
          <circle cx="40" cy="6" r="4" fill="#DC143C" stroke="#FFD700" strokeWidth="0.8" />
        </svg>
      </div>
      <p
        className="text-base font-bold"
        style={{ color: "rgba(212,175,55,0.7)", fontFamily: "Cinzel, serif" }}
      >
        {msg}
      </p>
      <p className="text-sm" style={{ color: "rgba(200,150,50,0.4)" }}>
        {sub}
      </p>
      <button
        onClick={onCreate}
        className="mt-2 px-8 py-4 text-sm font-bold cursor-pointer active:scale-95 transition-all"
        style={{
          borderRadius: "12px",
          background: "linear-gradient(135deg, #b8860b, #ffd700)",
          color: "#1a0800",
          fontFamily: "Cinzel, serif",
          border: "1px solid #D4AF37",
          boxShadow: "0 4px 20px rgba(180,140,0,0.35)",
        }}
      >
        ♛ Создать первый стол
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-20 rounded-2xl animate-pulse"
          style={{ background: "rgba(255,255,255,0.04)" }}
        />
      ))}
    </div>
  );
}

function NoSupabase() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
      <p className="text-4xl">⚙️</p>
      <p className="text-sm font-semibold" style={{ color: "rgba(200,150,50,0.7)" }}>
        Supabase не настроен
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(200,150,50,0.4)" }}>
        Добавьте{" "}
        <code className="bg-black/30 px-1 rounded">VITE_SUPABASE_URL</code> и{" "}
        <code className="bg-black/30 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> в Secrets
      </p>
    </div>
  );
}
