import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronLeft, TrendingUp, TrendingDown, Gift, Lock, Unlock, Coins } from "lucide-react";
import { getWallet, getWalletTransactions } from "../services/stakes";
import { usePlayerId } from "../hooks/usePlayerId";
import { toast } from "sonner";
import type { Wallet, WalletTransaction } from "../services/stakes";

const TRANSACTION_ICONS: Record<string, React.ReactNode> = {
  deposit: <Gift className="w-5 h-5" style={{ color: "#4ade80" }} />,
  withdrawal: <TrendingDown className="w-5 h-5" style={{ color: "#ef4444" }} />,
  fee_lock: <Lock className="w-5 h-5" style={{ color: "#f59e0b" }} />,
  fee_refund: <Unlock className="w-5 h-5" style={{ color: "#3b82f6" }} />,
  prize_payout: <TrendingUp className="w-5 h-5" style={{ color: "#fbbf24" }} />,
  starting_bonus: <Gift className="w-5 h-5" style={{ color: "#a78bfa" }} />,
  loss: <TrendingDown className="w-5 h-5" style={{ color: "#ef4444" }} />,
};

const TRANSACTION_LABELS: Record<string, string> = {
  deposit: "Бонус",
  withdrawal: "Расход",
  fee_lock: "Ставка в турнире",
  fee_refund: "Возврат ставки",
  prize_payout: "Выигрыш турнира",
  starting_bonus: "Стартовый бонус",
  loss: "Проигрыш",
};

export default function WalletPage() {
  const navigate = useNavigate();
  const { playerId, isLoading: authLoading } = usePlayerId();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    const loadWallet = async () => {
      try {
        const [walletData, transactionsData] = await Promise.all([
          getWallet(playerId),
          getWalletTransactions(playerId, 100),
        ]);
        setWallet(walletData);
        setTransactions(transactionsData);
      } catch (err) {
        console.error("Error loading wallet:", err);
        toast.error("Ошибка загрузки баланса");
      } finally {
        setLoading(false);
      }
    };
    loadWallet();
  }, [playerId, authLoading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-full border-4 border-t-4 animate-spin mx-auto mb-4"
            style={{ borderColor: "rgba(212,175,55,0.2)", borderTopColor: "#D4AF37" }}
          />
          <p style={{ color: "rgba(212,175,55,0.6)" }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-20"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(120,50,0,0.35) 0%, transparent 60%), linear-gradient(180deg, #0d0400 0%, #1a0800 50%, #0d0400 100%)",
      }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-sm" style={{ borderBottom: "1px solid rgba(212,175,55,0.2)" }}>
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/")}
            className="p-2 rounded-lg transition-colors"
            style={{ background: "rgba(212,175,55,0.1)" }}
          >
            <ChevronLeft className="w-6 h-6" style={{ color: "#D4AF37" }} />
          </motion.button>
          <div className="flex items-center gap-2">
            <Coins className="w-6 h-6" style={{ color: "#FFD700" }} />
            <h1
              className="text-2xl font-bold"
              style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
            >
              Монеты
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Available Balance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-2xl backdrop-blur-sm"
            style={{
              background: "rgba(26, 8, 0, 0.8)",
              border: "1px solid rgba(212,175,55,0.25)",
            }}
          >
            <p className="text-sm font-semibold mb-3" style={{ color: "rgba(212,175,55,0.6)" }}>
              Доступные монеты
            </p>
            <div className="flex items-baseline gap-2">
              <span
                className="text-4xl font-bold"
                style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
              >
                {wallet?.crypto_balance.toFixed(0) ?? "0"}
              </span>
              <span style={{ color: "rgba(212,175,55,0.5)" }}>🪙</span>
            </div>
            <p className="text-xs mt-3" style={{ color: "rgba(212,175,55,0.4)" }}>
              Доступны для турниров
            </p>
          </motion.div>

          {/* Locked Balance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 rounded-2xl backdrop-blur-sm"
            style={{
              background: "rgba(26, 8, 0, 0.8)",
              border: "1px solid rgba(212,175,55,0.25)",
            }}
          >
            <p className="text-sm font-semibold mb-3" style={{ color: "rgba(212,175,55,0.6)" }}>
              В активных играх
            </p>
            <div className="flex items-baseline gap-2">
              <span
                className="text-4xl font-bold"
                style={{ color: "#f59e0b", fontFamily: "Cinzel, serif" }}
              >
                {wallet?.locked_balance.toFixed(0) ?? "0"}
              </span>
              <span style={{ color: "rgba(245,158,11,0.5)" }}>🔒</span>
            </div>
            <p className="text-xs mt-3" style={{ color: "rgba(212,175,55,0.4)" }}>
              Заблокированы до конца партии
            </p>
          </motion.div>
        </div>

        {/* Total Balance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-6 rounded-2xl backdrop-blur-sm text-center"
          style={{
            background: "linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(255,215,0,0.1) 100%)",
            border: "1px solid rgba(212,175,55,0.3)",
          }}
        >
          <p className="text-sm font-semibold mb-2" style={{ color: "rgba(212,175,55,0.6)" }}>
            Всего монет
          </p>
          <p className="text-5xl font-bold" style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}>
            {((wallet?.crypto_balance ?? 0) + (wallet?.locked_balance ?? 0)).toFixed(0)}
          </p>
          <p className="text-xs mt-3" style={{ color: "rgba(212,175,55,0.35)" }}>
            Все монеты виртуальные и не имеют реальной ценности
          </p>
        </motion.div>

        {/* Transactions */}
        <div>
          <h2
            className="text-xl font-bold mb-4"
            style={{ color: "#D4AF37", fontFamily: "Cinzel, serif" }}
          >
            История
          </h2>

          {transactions.length === 0 ? (
            <div
              className="p-8 rounded-2xl text-center backdrop-blur-sm"
              style={{
                background: "rgba(26, 8, 0, 0.6)",
                border: "1px solid rgba(212,175,55,0.2)",
              }}
            >
              <p style={{ color: "rgba(212,175,55,0.5)" }}>Нет операций</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx, idx) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="p-4 rounded-lg backdrop-blur-sm flex items-center justify-between"
                  style={{
                    background: "rgba(26, 8, 0, 0.6)",
                    border: "1px solid rgba(212,175,55,0.15)",
                  }}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: "rgba(212,175,55,0.1)" }}
                    >
                      {TRANSACTION_ICONS[tx.type] || <Gift className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" style={{ color: "#D4AF37" }}>
                        {TRANSACTION_LABELS[tx.type] || tx.type}
                      </p>
                      <p className="text-xs truncate" style={{ color: "rgba(212,175,55,0.4)" }}>
                        {new Date(tx.created_at).toLocaleString("ru-RU")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className="font-bold"
                      style={{
                        color:
                          tx.type === "withdrawal" || tx.type === "fee_lock" || tx.type === "loss"
                            ? "#ef4444"
                            : "#4ade80",
                      }}
                    >
                      {tx.type === "withdrawal" || tx.type === "fee_lock" || tx.type === "loss" ? "-" : "+"}
                      {tx.amount.toFixed(0)} 🪙
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
