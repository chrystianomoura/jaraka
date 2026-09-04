/* =========================================================
   JARAKA — MOVEMENT
   Movimento lógico da cobra no grid

   Responsabilidades:
   - calcular a próxima posição da cabeça;
   - registrar a posição da cauda antes do movimento;
   - deslocar os segmentos pelo grid;
   - aplicar a nova posição da cabeça.

   Este módulo não conhece:
   - colisões;
   - alimentação;
   - crescimento;
   - renderer;
   - input;
   - game over.
   ========================================================= */

/* =========================================================
   PRÓXIMA CABEÇA
   ========================================================= */

export function getNextHeadPosition(head, direction) {
  return {
    x: head.x + direction.x,

    y: head.y + direction.y,
  };
}

/* =========================================================
   DESLOCAMENTO DOS SEGMENTOS
   ========================================================= */

export function moveSnakeSegments(snake, newHead) {
  /*
   * Guardamos a posição anterior da cauda.
   *
   * O sistema de crescimento utiliza essa posição
   * caso uma nova célula precise ser adicionada
   * no mesmo tick.
   */

  const tailBeforeMove = {
    ...snake[snake.length - 1],
  };

  /*
   * Cada segmento assume a posição ocupada
   * pelo segmento imediatamente anterior.
   */

  for (let index = snake.length - 1; index > 0; index -= 1) {
    snake[index] = {
      x: snake[index - 1].x,

      y: snake[index - 1].y,
    };
  }

  /*
   * A cabeça recebe a nova célula calculada
   * anteriormente.
   */

  snake[0] = {
    x: newHead.x,
    y: newHead.y,
  };

  return tailBeforeMove;
}