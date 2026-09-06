/* =========================================================
   JARAKA — COLLISION
   Regras de colisão e comparação de posições

   Responsabilidades:
   - comparar posições do grid;
   - detectar colisão com os limites do tabuleiro;
   - detectar colisão da cobra com o próprio corpo.

   Este módulo não altera estado do jogo.
   ========================================================= */

import { GRID_COLUMNS, GRID_ROWS } from "./config.js";

/* =========================================================
   POSIÇÕES
   ========================================================= */

export function isSamePosition(first, second) {
  return first.x === second.x && first.y === second.y;
}

/* =========================================================
   COLISÃO — PAREDES
   ========================================================= */

export function willHitWall(position) {
  return (
    position.x < 0 ||
    position.x >= GRID_COLUMNS ||
    position.y < 0 ||
    position.y >= GRID_ROWS
  );
}

/* =========================================================
   COLISÃO — PRÓPRIO CORPO
   ========================================================= */

export function willHitSelf({
  position,
  snake,
  pendingGrowth = 0,
  willGrow = false,
}) {
  const body =
    pendingGrowth > 0 || willGrow ? snake.slice(1) : snake.slice(1, -1);

  return body.some((segment) => isSamePosition(segment, position));
}