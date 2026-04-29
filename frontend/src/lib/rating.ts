/** Rating tier system for Шашки Ройял */

export type Tier = "bronze" | "silver" | "gold" | "diamond" | "legend";

export type TierInfo = {
  tier: Tier;
  label: string;
  labelUz: string;
  color: string;
  glow: string;
  icon: string;
  minRating: number;
  maxRating: number | null;
};

export const TIERS: TierInfo[] = [
  {
    tier: "bronze",
    label: "Бронза",
    labelUz: "Bronza",
    color: "#cd7f32",
    glow: "rgba(205,127,50,0.3)",
    icon: "🥉",
    minRating: 0,
    maxRating: 999,
  },
  {
    tier: "silver",
    label: "Серебро",
    labelUz: "Kumush",
    color: "#c0c0c0",
    glow: "rgba(192,192,192,0.3)",
    icon: "🥈",
    minRating: 1000,
    maxRating: 1199,
  },
  {
    tier: "gold",
    label: "Золото",
    labelUz: "Oltin",
    color: "#ffd700",
    glow: "rgba(255,215,0,0.35)",
    icon: "🥇",
    minRating: 1200,
    maxRating: 1499,
  },
  {
    tier: "diamond",
    label: "Алмаз",
    labelUz: "Olmos",
    color: "#7df9ff",
    glow: "rgba(125,249,255,0.3)",
    icon: "💎",
    minRating: 1500,
    maxRating: 1799,
  },
  {
    tier: "legend",
    label: "Легенда",
    labelUz: "Afsona",
    color: "#ff6b35",
    glow: "rgba(255,107,53,0.4)",
    icon: "👑",
    minRating: 1800,
    maxRating: null,
  },
];

export function getTierInfo(rating: number): TierInfo {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (rating >= TIERS[i].minRating) return TIERS[i];
  }
  return TIERS[0];
}

export function getTierProgress(rating: number): number {
  const tier = getTierInfo(rating);
  if (!tier.maxRating) return 100;
  const range = tier.maxRating - tier.minRating + 1;
  const progress = rating - tier.minRating;
  return Math.min(100, Math.round((progress / range) * 100));
}

export function getWinRate(wins: number, totalGames: number): number {
  if (totalGames === 0) return 0;
  return Math.round((wins / totalGames) * 100);
}
