import { useCallback } from "react";
import { processStakeGameResult, getGameStake } from "../services/stakes";
import type { GameResult } from "../components/GameResultModal";

export function useGameResult() {
  const handleFinishGame = useCallback(
    async (
      gameId: string,
      winner: "white" | "black" | "draw",
      finishReason: string,
      playerId: string,
    ): Promise<{ result: GameResult | null; error: string | null }> => {
      try {
        // Получить информацию о ставке
        const stake = await getGameStake(gameId);

        // Если ставки нет — это обычная игра, возвращаем null
        if (!stake) {
          return { result: null, error: null };
        }

        // Проверить, что ставка ещё не обработана
        if (stake.escrow_status === "paid" || stake.escrow_status === "refunded") {
          return { result: null, error: "Ставка уже обработана" };
        }

        // Вычислить выплату
        const commission = stake.pot_amount * 0.05;
        const payout = stake.pot_amount - commission;

        // Обработать результат — передаём ЦВЕТ победителя, а не player_id!
        // RPC функция сама определит winner_profile_id по цвету
        const winnerColor = winner === "draw" ? null : winner;

        const { success, error } = await processStakeGameResult(
          gameId,
          winnerColor,
          finishReason,
          playerId,
        );

        if (!success) {
          return { result: null, error: error || "Ошибка обработки результата" };
        }

        // Создать объект результата
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
