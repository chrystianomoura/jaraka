/* =========================================================
   JARAKA — SNAKE PATH
   Geometria e interpolação da movimentação contínua

   Responsabilidades:
   - interpolação entre ticks;
   - posição visual da cabeça;
   - posição visual da cauda;
   - travessia ortogonal da cauda em curvas;
   - construção dos pontos do corpo;
   - simplificação de retas;
   - arredondamento das curvas;
   - geração do path SVG.

   Este módulo não manipula DOM.
   ========================================================= */

import { EPSILON } from "../game/config.js";

const CORNER_RADIUS = 0.18;

/* =========================================================
   INTERPOLAÇÃO
   ========================================================= */

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function interpolatePoint(start, end, progress) {
  return {
    x: lerp(start.x, end.x, progress),

    y: lerp(start.y, end.y, progress),
  };
}

/* =========================================================
   UTILITÁRIOS DE GEOMETRIA
   ========================================================= */

function isSamePoint(first, second) {
  return (
    Math.abs(first.x - second.x) < EPSILON &&
    Math.abs(first.y - second.y) < EPSILON
  );
}

function isHorizontal(first, second) {
  return Math.abs(first.y - second.y) < EPSILON;
}

function isVertical(first, second) {
  return Math.abs(first.x - second.x) < EPSILON;
}

function isOrthogonal(first, second) {
  return isHorizontal(first, second) || isVertical(first, second);
}

function toCenter(position) {
  return {
    x: position.x + 0.5,

    y: position.y + 0.5,
  };
}

function getDistance(first, second) {
  return Math.hypot(
    second.x - first.x,

    second.y - first.y,
  );
}

function getManhattanDistance(first, second) {
  return Math.abs(second.x - first.x) + Math.abs(second.y - first.y);
}

/* =========================================================
   CABEÇA
   ========================================================= */

export function getVisualHead(snake, previousSnake, progress) {
  const currentHead = snake[0];

  const previousHead = previousSnake[0] ?? currentHead;

  return {
    x: lerp(previousHead.x, currentHead.x, progress),

    y: lerp(previousHead.y, currentHead.y, progress),
  };
}

/* =========================================================
   CAUDA — DETECÇÃO DE CURVA
   ========================================================= */

/*
 * Durante crescimento visual gradual,
 * a extremidade pode atravessar uma curva
 * entre dois ticks.
 *
 * Exemplo:
 *
 * previousTail ---- corner
 *                       |
 *                       |
 *                  currentTail
 *
 * previousTail e currentTail possuem
 * X e Y diferentes.
 *
 * A interpolação linear comum produziria
 * uma diagonal.
 *
 * Precisamos descobrir o vértice real
 * por onde a cauda deve passar.
 */

function findTailCorner(snake, previousSnake, previousTail, currentTail) {
  /*
   * Se continuam no mesmo eixo,
   * não existe curva para atravessar.
   */

  if (isOrthogonal(previousTail, currentTail)) {
    return null;
  }

  const candidates = [];

  const previousBeforeTail = previousSnake[previousSnake.length - 2];

  const currentBeforeTail = snake[snake.length - 2];

  if (previousBeforeTail) {
    candidates.push(previousBeforeTail);
  }

  if (currentBeforeTail) {
    candidates.push(currentBeforeTail);
  }

  /*
   * Procuramos um ponto que esteja
   * ortogonalmente conectado tanto
   * à posição anterior quanto à atual.
   */

  const validCandidates = candidates.filter(
    (candidate) =>
      isOrthogonal(previousTail, candidate) &&
      isOrthogonal(candidate, currentTail),
  );

  if (validCandidates.length === 0) {
    return null;
  }

  /*
   * Em caso de mais de um candidato,
   * usamos a rota Manhattan mais curta.
   */

  let bestCandidate = validCandidates[0];

  let bestDistance =
    getManhattanDistance(previousTail, bestCandidate) +
    getManhattanDistance(bestCandidate, currentTail);

  for (let index = 1; index < validCandidates.length; index += 1) {
    const candidate = validCandidates[index];

    const distance =
      getManhattanDistance(previousTail, candidate) +
      getManhattanDistance(candidate, currentTail);

    if (distance < bestDistance) {
      bestDistance = distance;

      bestCandidate = candidate;
    }
  }

  return {
    x: bestCandidate.x,

    y: bestCandidate.y,
  };
}

/* =========================================================
   CAUDA — INTERPOLAÇÃO ORTOGONAL
   ========================================================= */

function getVisualTailState(snake, previousSnake, progress) {
  const currentTail = snake[snake.length - 1];

  const previousTail = previousSnake[previousSnake.length - 1] ?? currentTail;

  /*
   * Movimento comum.
   */

  if (isOrthogonal(previousTail, currentTail)) {
    return {
      point: interpolatePoint(previousTail, currentTail, progress),

      corner: null,

      beforeCorner: false,
    };
  }

  /*
   * Movimento em que a ponta atravessa
   * uma curva do corpo.
   */

  const corner = findTailCorner(
    snake,
    previousSnake,
    previousTail,
    currentTail,
  );

  /*
   * Fallback defensivo.
   *
   * Se por algum estado inesperado
   * não encontrarmos a curva, mantemos
   * o comportamento tradicional.
   */

  if (!corner) {
    return {
      point: interpolatePoint(previousTail, currentTail, progress),

      corner: null,

      beforeCorner: false,
    };
  }

  const firstLength = getManhattanDistance(previousTail, corner);

  const secondLength = getManhattanDistance(corner, currentTail);

  const totalLength = firstLength + secondLength;

  if (totalLength <= EPSILON) {
    return {
      point: {
        ...currentTail,
      },

      corner: null,

      beforeCorner: false,
    };
  }

  /*
   * Em vez de interpolar X e Y
   * simultaneamente, transformamos
   * progress em distância percorrida
   * sobre a rota ortogonal.
   */

  const traveledDistance = totalLength * progress;

  /*
   * PRIMEIRA PERNA:
   *
   * previousTail → corner
   */

  if (traveledDistance <= firstLength && firstLength > EPSILON) {
    const localProgress = traveledDistance / firstLength;

    return {
      point: interpolatePoint(previousTail, corner, localProgress),

      corner,

      /*
       * Enquanto a ponta ainda não
       * chegou ao vértice, buildBodyPoints
       * precisa manter esse vértice
       * explicitamente no path.
       */

      beforeCorner: true,
    };
  }

  /*
   * SEGUNDA PERNA:
   *
   * corner → currentTail
   */

  if (secondLength <= EPSILON) {
    return {
      point: {
        ...currentTail,
      },

      corner: null,

      beforeCorner: false,
    };
  }

  const secondDistance = Math.max(0, traveledDistance - firstLength);

  const localProgress = Math.min(secondDistance / secondLength, 1);

  return {
    point: interpolatePoint(corner, currentTail, localProgress),

    corner,

    beforeCorner: false,
  };
}

/* =========================================================
   REMOÇÃO DE PONTOS DUPLICADOS
   ========================================================= */

function removeDuplicatePoints(points) {
  const result = [];

  points.forEach((point) => {
    const lastPoint = result[result.length - 1];

    if (!lastPoint || !isSamePoint(lastPoint, point)) {
      result.push(point);
    }
  });

  return result;
}

/* =========================================================
   CONSTRUÇÃO DOS PONTOS DO CORPO
   ========================================================= */

export function buildBodyPoints(snake, previousSnake, progress) {
  if (snake.length === 0) {
    return [];
  }

  const points = [];

  const visualHead = getVisualHead(snake, previousSnake, progress);

  points.push(toCenter(visualHead));

  /*
   * Mantemos todos os pontos atuais
   * do corpo exatamente como antes.
   */

  for (let index = 1; index < snake.length; index += 1) {
    points.push(toCenter(snake[index]));
  }

  if (snake.length > 1) {
    const tailState = getVisualTailState(snake, previousSnake, progress);

    /*
     * Se a ponta ainda está na primeira
     * metade de uma curva, o vértice
     * precisa existir explicitamente.
     *
     * Isso impede o último trecho do SVG
     * de cortar a curva diagonalmente.
     */

    if (tailState.corner && tailState.beforeCorner) {
      points.push(toCenter(tailState.corner));
    }

    points.push(toCenter(tailState.point));
  }

  return removeDuplicatePoints(points);
}

/* =========================================================
   SIMPLIFICAÇÃO ORTOGONAL
   ========================================================= */

export function simplifyOrthogonalPoints(points) {
  if (points.length <= 2) {
    return points;
  }

  const simplified = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];

    const current = points[index];

    const next = points[index + 1];

    const sameHorizontal =
      Math.abs(previous.y - current.y) < EPSILON &&
      Math.abs(current.y - next.y) < EPSILON;

    const sameVertical =
      Math.abs(previous.x - current.x) < EPSILON &&
      Math.abs(current.x - next.x) < EPSILON;

    if (!sameHorizontal && !sameVertical) {
      simplified.push(current);
    }
  }

  simplified.push(points[points.length - 1]);

  return simplified;
}

/* =========================================================
   GEOMETRIA DA CURVA
   ========================================================= */

function getCornerGeometry(previous, current, next) {
  const incomingLength = getDistance(previous, current);

  const outgoingLength = getDistance(current, next);

  const radius = Math.min(
    CORNER_RADIUS,
    incomingLength * 0.32,
    outgoingLength * 0.32,
  );

  const incomingX = current.x - previous.x;

  const incomingY = current.y - previous.y;

  const outgoingX = next.x - current.x;

  const outgoingY = next.y - current.y;

  const incomingMagnitude = Math.hypot(incomingX, incomingY);

  const outgoingMagnitude = Math.hypot(outgoingX, outgoingY);

  if (incomingMagnitude === 0 || outgoingMagnitude === 0) {
    return null;
  }

  const incomingUnit = {
    x: incomingX / incomingMagnitude,

    y: incomingY / incomingMagnitude,
  };

  const outgoingUnit = {
    x: outgoingX / outgoingMagnitude,

    y: outgoingY / outgoingMagnitude,
  };

  return {
    entry: {
      x: current.x - incomingUnit.x * radius,

      y: current.y - incomingUnit.y * radius,
    },

    corner: {
      x: current.x,

      y: current.y,
    },

    exit: {
      x: current.x + outgoingUnit.x * radius,

      y: current.y + outgoingUnit.y * radius,
    },
  };
}

/* =========================================================
   CONSTRUÇÃO DO PATH SVG
   ========================================================= */

export function buildRoundedPathData(points) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ` + `${points[0].y}`;
  }

  let pathData = `M ${points[0].x} ` + `${points[0].y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];

    const current = points[index];

    const next = points[index + 1];

    const incomingHorizontal = Math.abs(previous.y - current.y) < EPSILON;

    const outgoingHorizontal = Math.abs(current.y - next.y) < EPSILON;

    if (incomingHorizontal === outgoingHorizontal) {
      pathData += ` L ${current.x} ` + `${current.y}`;

      continue;
    }

    const geometry = getCornerGeometry(previous, current, next);

    if (!geometry) {
      pathData += ` L ${current.x} ` + `${current.y}`;

      continue;
    }

    pathData += ` L ${geometry.entry.x} ` + `${geometry.entry.y}`;

    pathData +=
      ` Q ${geometry.corner.x} ` +
      `${geometry.corner.y}` +
      ` ${geometry.exit.x} ` +
      `${geometry.exit.y}`;
  }

  const lastPoint = points[points.length - 1];

  pathData += ` L ${lastPoint.x} ` + `${lastPoint.y}`;

  return pathData;
}