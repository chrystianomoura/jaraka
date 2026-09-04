/* =========================================================
   JARAKA — DIRECTION
   Controle da direção lógica da cobra

   Responsabilidades:
   - manter a direção atual;
   - manter a próxima direção aceita;
   - impedir repetição da direção atual;
   - impedir inversões de 180 graus;
   - identificar o lado visual da curva.

   Este módulo não conhece input, renderer ou estado
   de game over.
   ========================================================= */

/* =========================================================
   COMPARAÇÕES
   ========================================================= */

function isSameDirection(candidate, current) {
  return candidate.x === current.x && candidate.y === current.y;
}

function isOppositeDirection(candidate, current) {
  return candidate.x === -current.x && candidate.y === -current.y;
}

/* =========================================================
   CURVA
   ========================================================= */

function getTurnSide(current, next) {
  const cross = current.x * next.y - current.y * next.x;

  return cross > 0 ? "right" : "left";
}

/* =========================================================
   CONTROLLER
   ========================================================= */

export function createDirectionController(initialDirection) {
  let direction = {
    x: initialDirection.x,
    y: initialDirection.y,
  };

  let queuedDirection = {
    x: initialDirection.x,
    y: initialDirection.y,
  };

  /* =======================================================
     LEITURA
     ======================================================= */

  function getDirection() {
    return direction;
  }

  function getQueuedDirection() {
    return queuedDirection;
  }

  /* =======================================================
     APLICAÇÃO
     ======================================================= */

  function applyQueuedDirection() {
    direction = queuedDirection;

    return direction;
  }

  /* =======================================================
     FILA
     ======================================================= */

  function queue(candidate) {
    /*
     * Preserva a regra original:
     *
     * a nova direção é comparada com a direção
     * atualmente ativa, não com qualquer direção
     * futura ainda não aplicada.
     */

    if (isSameDirection(candidate, direction)) {
      return {
        accepted: false,
        turnSide: null,
      };
    }

    if (isOppositeDirection(candidate, direction)) {
      return {
        accepted: false,
        turnSide: null,
      };
    }

    const turnSide = getTurnSide(direction, candidate);

    queuedDirection = candidate;

    return {
      accepted: true,
      turnSide,
    };
  }

  return {
    getDirection,
    getQueuedDirection,
    applyQueuedDirection,
    queue,
  };
}