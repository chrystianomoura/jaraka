/* =========================================================
   JARAKA — GROWTH
   Sistema lógico e visual de crescimento

   Responsabilidades:
   - manter a fila de crescimento;
   - aplicar crescimento lógico à cobra;
   - suavizar o crescimento visual da cauda;
   - construir a representação visual da cobra durante
     a absorção gradual do crescimento.

   O crescimento visual preserva o sistema aprovado
   de liberação progressiva em 7 ticks.
   ========================================================= */

import { EPSILON, VISUAL_GROWTH_RELEASE_STEP } from "./config.js";

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function cloneSnake(source) {
  return source.map((segment) => ({
    ...segment,
  }));
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

/* =========================================================
   CONTROLLER
   ========================================================= */

export function createGrowthController() {
  /*
   * Quantidade de células de crescimento lógico
   * aguardando aplicação.
   */

  let pendingGrowth = 0;

  /*
   * Distância, em células, que a cauda visual
   * está à frente da cauda lógica.
   *
   * Quando ocorre crescimento lógico,
   * a cauda deixa de avançar uma célula
   * naquele tick.
   *
   * Em vez de interromper visualmente
   * o movimento, essa diferença é absorvida
   * gradualmente.
   */

  let visualGrowthOffset = 0;

  /* =======================================================
     FILA
     ======================================================= */

  function queue() {
    pendingGrowth += 1;
  }

  function getPendingGrowth() {
    return pendingGrowth;
  }

  /* =======================================================
     CRESCIMENTO LÓGICO
     ======================================================= */

  function applyPendingGrowth(snake, tailBeforeMove) {
    if (pendingGrowth <= 0 || !tailBeforeMove) {
      return false;
    }

    snake.push({
      x: tailBeforeMove.x,
      y: tailBeforeMove.y,
    });

    pendingGrowth -= 1;

    return true;
  }

  /* =======================================================
     REPRESENTAÇÃO VISUAL DA CAUDA
     ======================================================= */

  /*
   * Constrói uma cópia visual da cobra
   * com a extremidade deslocada para frente
   * ao longo da própria trajetória do grid.
   *
   * O offset pode ser maior que 1.
   *
   * Isso permite que novos crescimentos sejam
   * acumulados antes que o crescimento visual
   * anterior tenha sido completamente absorvido.
   */

  function createVisualSnake(source, tailOffset) {
    const result = cloneSnake(source);

    if (result.length < 2 || tailOffset <= EPSILON) {
      return result;
    }

    let remainingOffset = Math.min(tailOffset, Math.max(0, result.length - 2));

    /*
     * Cada unidade inteira do offset remove
     * visualmente uma célula completa da
     * extremidade.
     *
     * A cobra lógica não é alterada.
     */

    while (remainingOffset >= 1 - EPSILON && result.length > 2) {
      result.pop();

      remainingOffset -= 1;
    }

    /*
     * A fração restante posiciona a ponta
     * entre a célula atual da cauda e a
     * célula imediatamente anterior.
     */

    if (remainingOffset > EPSILON && result.length >= 2) {
      const tailIndex = result.length - 1;

      const tail = result[tailIndex];

      const beforeTail = result[tailIndex - 1];

      result[tailIndex] = {
        x: lerp(tail.x, beforeTail.x, remainingOffset),

        y: lerp(tail.y, beforeTail.y, remainingOffset),
      };
    }

    return result;
  }

  /* =======================================================
     CRESCIMENTO VISUAL
     ======================================================= */

  function updateVisualGrowth(snake, didGrow) {
    /*
     * Quando ocorre crescimento lógico,
     * a cauda deixou de avançar uma célula.
     *
     * Essa célula entra no débito visual.
     */

    if (didGrow) {
      visualGrowthOffset += 1;
    }

    /*
     * No mesmo tick já liberamos uma fração.
     *
     * Isso impede que a extremidade tenha
     * um frame perceptível de velocidade zero.
     */

    if (visualGrowthOffset > EPSILON) {
      visualGrowthOffset = Math.max(
        0,
        visualGrowthOffset - VISUAL_GROWTH_RELEASE_STEP,
      );
    }

    return createVisualSnake(snake, visualGrowthOffset);
  }

  return {
    queue,
    getPendingGrowth,
    applyPendingGrowth,
    updateVisualGrowth,
  };
}