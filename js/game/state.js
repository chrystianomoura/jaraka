/* =========================================================
   JARAKA — GAME STATE
   Estado central da partida

   Responsabilidades:
   - manter a cobra lógica;
   - manter os estados visuais atual e anterior;
   - manter o estado de game over;
   - manter o motivo do encerramento da partida.

   Este módulo não contém regras de jogo.
   ========================================================= */

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function cloneSnake(source) {
  return source.map((segment) => ({
    ...segment,
  }));
}

/* =========================================================
   CONTROLLER
   ========================================================= */

export function createGameState({ initialSnake }) {
  const snake = cloneSnake(initialSnake);

  let renderSnake = cloneSnake(snake);

  let previousRenderSnake = cloneSnake(renderSnake);

  let gameOver = false;

  let gameOverReason = null;

  /* =======================================================
     COBRA LÓGICA
     ======================================================= */

  function getSnake() {
    return snake;
  }

  /* =======================================================
     ESTADO VISUAL
     ======================================================= */

  function getRenderSnake() {
    return renderSnake;
  }

  function getPreviousRenderSnake() {
    return previousRenderSnake;
  }

  function snapshotRenderSnake() {
    previousRenderSnake = cloneSnake(renderSnake);
  }

  function setRenderSnake(nextSnake) {
    renderSnake = nextSnake;
  }

  /* =======================================================
     GAME OVER
     ======================================================= */

  function isGameOver() {
    return gameOver;
  }

  function getGameOverReason() {
    return gameOverReason;
  }

  function endGame(reason) {
    if (gameOver) {
      return false;
    }

    gameOver = true;
    gameOverReason = reason;

    return true;
  }

  return {
    getSnake,

    getRenderSnake,
    getPreviousRenderSnake,
    snapshotRenderSnake,
    setRenderSnake,

    isGameOver,
    getGameOverReason,
    endGame,
  };
}