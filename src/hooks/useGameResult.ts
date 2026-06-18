import { useCallback } from "react";
import { getGameStake } from "../services/stakes";
import { processGameResult } from "../services/profiles";
import { fetchGame } from "../services/gameRooms";
import type { GameResult } from "../components/GameResultModal";

/**
 * Финализирует онлайн-партию (со ставкой или без) через защищённый RPC
 * `process_game_result`. RPC сам:
 *   • проверяет, что caller — участник игры;
 *   • проверяет, что заявленный winner — участник;
 *   • выставляет games.status='finished';
 *   • выплачивает приз / возвращает при ничьей;
 *   • обновляет рейтинг.
 *
 * Возвращает GameResult для модалки только если это была игра со ставкой;
 * иначе result=null (UI покажет обычный GameOverModal).
 */
export function useGameResult() {
  const handleFinishGame = useCallback(
    async (
      gameId: string,
      winner: "white" | "black" | "draw",
      finishReason: string,
      callerPlayerId: string,
    ): Promise<{ result: GameResult | null; error: string | null }> => {
      try {
        // 1) Определяем player_id победителя по color, читая game row.
        const game = await fetchGame(gameId);
        if (!game) return { result: null, error: "Партия не найдена" };

        let winnerPlayerId: string | null = null;
        if (winner === "white") winnerPlayerId = game.white_player_id;
        else if (winner === "black") winnerPlayerId = game.black_player_id;

        // 2) Идемпотентная финализация на стороне сервера.
        await processGameResult(
          gameId,
          winnerPlayerId,
          finishReason,
          callerPlayerId,
        );

        // 3) Только если у партии была ставка — собираем результат для модалки.
        const stake = await getGameStake(gameId);
        if (!stake) return { result: null, error: null };

        const commission = stake.pot_amount * 0.05;
        const payout = stake.pot_amount - commission;

        const result: GameResult = {
          winner,
          whitePlayer: "Белые",
          blackPlayer: "Чёрные",
          entryFee: stake.entry_fee,
          pot: stake.pot_amount,
          payout: winner === "draw" ? stake.entry_fee : payout,
          commission,
        };
        return { result, error: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Неизвестная ошибка";
        return { result: null, error: message };
      }
    },
    [],
  );

  return { handleFinishGame };
}
