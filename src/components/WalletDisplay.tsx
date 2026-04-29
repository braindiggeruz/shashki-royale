import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Wallet as WalletIcon } from "lucide-react";
import { getWallet } from "../services/stakes";
import { usePlayerId } from "../hooks/usePlayerId";
import type { Wallet } from "../services/stakes";

export function WalletDisplay() {
  const { playerId, isLoading: authLoading } = usePlayerId();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const loadWallet = async () => {
      try {
        const walletData = await getWallet(playerId);
        setWallet(walletData);
      } catch (err) {
        console.error("Error loading wallet:", err);
      } finally {
        setLoading(false);
      }
    };

    loadWallet();

    // Обновлять каждые 30 секунд (чтобы не нагружать сервер)
    const interval = setInterval(loadWallet, 30000);
    return () => clearInterval(interval);
  }, [playerId, authLoading]);

  if (loading) {
    return (
      <div
        className="px-3 py-2 rounded-lg"
        style={{ background: "rgba(212,175,55,0.1)" }}
      >
        <div className="w-20 h-6 rounded animate-pulse" style={{ background: "rgba(212,175,55,0.2)" }} />
      </div>
    );
  }

  const balance = wallet?.crypto_balance ?? 0;
  const locked = wallet?.locked_balance ?? 0;

  return (
    <Link to="/wallet">
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="px-4 py-2 rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
        style={{
          background: "rgba(212,175,55,0.15)",
          border: "1px solid rgba(212,175,55,0.3)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(212,175,55,0.25)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(212,175,55,0.15)";
        }}
      >
        <WalletIcon className="w-4 h-4" style={{ color: "#D4AF37" }} />
        <div className="flex flex-col">
          <span
            className="text-sm font-bold"
            style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
          >
            {balance.toFixed(0)}
          </span>
          {locked > 0 && (
            <span className="text-xs" style={{ color: "rgba(245,158,11,0.6)" }}>
              🔒 {locked.toFixed(0)}
            </span>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
