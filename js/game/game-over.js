/* =========================================================
   JARAKA — GAME OVER
   Encerramento da partida

   Responsabilidades:
   - registrar o estado de game over;
   - interromper input e loop;
   - refletir o encerramento no DOM;
   - registrar o motivo no console.

   Este módulo não decide quando uma colisão aconteceu.
   Ele apenas executa o encerramento solicitado.
   ========================================================= */

export function createGameOverController({
  gameBoard,
  gameState,
  getInputController,
  getGameLoop,
}) {
  function end(reason) {
    const didEnd = gameState.endGame(reason);

    if (!didEnd) {
      return false;
    }

    const inputController = getInputController();

    const gameLoop = getGameLoop();

    inputController?.stop();

    gameLoop?.stop();

    gameBoard?.setAttribute("data-game-state", "game-over");

    gameBoard?.setAttribute("data-game-over-reason", reason);

    console.info(`JARAKA — Game Over: ${gameState.getGameOverReason()}`);

    return true;
  }

  return {
    end,
  };
}