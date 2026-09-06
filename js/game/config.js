/* =========================================================
   JARAKA — GAME CONFIG
   Configurações globais do jogo

   Responsabilidades:
   - dimensões lógicas do tabuleiro;
   - intervalo de movimento;
   - parâmetros do crescimento visual;
   - tolerância para cálculos numéricos.
   ========================================================= */

export const GRID_COLUMNS = 10;

export const GRID_ROWS = 22;

export const MOVE_INTERVAL = 180;

export const VISUAL_GROWTH_RELEASE_TICKS = 7;

export const VISUAL_GROWTH_RELEASE_STEP =
  1 / VISUAL_GROWTH_RELEASE_TICKS;

export const EPSILON = 0.0001;