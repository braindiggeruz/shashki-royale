import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { getWallet } from "../services/stakes";
import { usePlayerId } from "../hooks/usePlayerId";
import type { Wallet } from "../services/stakes";

function Coin({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id="wd-coin" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FFE566" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#B8860B" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#wd-coin)" stroke="#D4AF37" strokeWidth="0.8" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#7a5200" fontFamily="serif">₡</text>
    </svg>
  );
}

export function WalletDisplay() {
  const { playerId, isLoading: authLoading } = usePlayerId();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const loadWallet = async () => {
      try {
        const walletData = await getWallet(playerId);
        if (!cancelled) setWallet(walletData);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Error loading wallet:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAttempted(true);
        }
      }
    };

    void loadWallet();

    // Refresh every 20s so balance follows wins/losses without forcing reload.
    const interval = setInterval(loadWallet, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [playerId, authLoading]);

  // Wallet not loaded yet — show skeleton (NEVER show "0" before we know).
  if (loading && !attempted) {
    return (
      <div
        className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5"
        style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)" }}
      >
        <Coin size={14} />
        <span
          className="inline-block h-3 w-8 rounded animate-pulse"
          style={{ background: "rgba(212,175,55,0.25)" }}
          aria-label="loading balance"
        />
      </div>
    );
  }

  const balance = wallet?.crypto_balance ?? 0;
  const locked = wallet?.locked_balance ?? 0;

  return (
    <Link to="/wallet" aria-label="Coin wallet">
      <motion.div
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        className="px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
        style={{
          background: "rgba(212,175,55,0.12)",
          border: "1px solid rgba(212,175,55,0.3)",
        }}
      >
        <Coin size={14} />
        <span
          className="text-sm font-bold leading-none"
          style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
          data-testid="wallet-balance"
        >
          {balance.toLocaleString()}
        </span>
        {locked > 0 && (
          <span className="text-[10px]" style={{ color: "rgba(245,158,11,0.7)" }}>
            🔒{locked}
          </span>
        )}
      </motion.div>
    </Link>
  );
}
