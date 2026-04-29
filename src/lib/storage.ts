import type { PlayerColor } from "../game/types.ts";

const PLAYER_ID_KEY = "damka_player_id";
const ACTIVE_GAME_KEY = "damka_active_game";

export function getOrCreatePlayerId(): string {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export function resetPlayerId(): void {
  localStorage.removeItem(PLAYER_ID_KEY);
}

export type ActiveGame = {
  gameId: string;
  roomCode: string;
  playerId: string;
  playerColor: PlayerColor;
  savedAt: number;
};

export function saveActiveGame(game: ActiveGame): void {
  localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(game));
}

export function loadActiveGame(): ActiveGame | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveGame;
    // Expire sessions older than 24 hours
    if (Date.now() - parsed.savedAt > 86_400_000) {
      clearActiveGame();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveGame(): void {
  localStorage.removeItem(ACTIVE_GAME_KEY);
}
