/* =========================================================
   JARAKA — LOOP
   Controle temporal do jogo

   Responsabilidades:
   - executar ticks lógicos em intervalo fixo;
   - calcular o progresso visual entre ticks;
   - coordenar requestAnimationFrame.

   Este módulo não conhece:
   - cobra;
   - colisão;
   - alimentação;
   - crescimento;
   - renderer específico;
   - input.
   ========================================================= */

import { MOVE_INTERVAL } from "./config.js";

export function createGameLoop({ onMove, onRender, isGameOver }) {
  let lastMoveTime = performance.now();

  let animationFrameId = null;

  /* =======================================================
     FRAME
     ======================================================= */

  function frame(timestamp) {
    if (isGameOver()) {
      return;
    }

    while (timestamp - lastMoveTime >= MOVE_INTERVAL) {
      onMove();

      if (isGameOver()) {
        return;
      }

      lastMoveTime += MOVE_INTERVAL;
    }

    const progress = Math.min((timestamp - lastMoveTime) / MOVE_INTERVAL, 1);

    onRender(progress);

    animationFrameId = requestAnimationFrame(frame);
  }

  /* =======================================================
     CONTROLE
     ======================================================= */

  function start() {
    if (animationFrameId !== null) {
      return;
    }

    animationFrameId = requestAnimationFrame(frame);
  }

  function stop() {
    if (animationFrameId === null) {
      return;
    }

    cancelAnimationFrame(animationFrameId);

    animationFrameId = null;
  }

  return {
    start,
    stop,
  };
}