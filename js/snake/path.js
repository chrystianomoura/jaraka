/* =========================================================
   JARAKA — SNAKE PATH
   Geometria e interpolação da movimentação contínua

   Responsabilidades:
   - interpolação entre ticks;
   - posição visual da cabeça;
   - posição visual da cauda;
   - construção dos pontos do corpo;
   - simplificação de retas;
   - arredondamento das curvas;
   - geração do path SVG.

   Este módulo não manipula DOM.
   ========================================================= */

const CORNER_RADIUS = 0.18;

const EPSILON = 0.0001;

/* =========================================================
   INTERPOLAÇÃO
   ========================================================= */

function lerp(start, end, progress) {
  return start + (end - start) * progress;
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

function toCenter(position) {
  return {
    x: position.x + 0.5,
    y: position.y + 0.5,
  };
}

function getDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
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
   CAUDA
   ========================================================= */

function getVisualTail(snake, previousSnake, progress) {
  const currentTail = snake[snake.length - 1];

  const previousTail = previousSnake[previousSnake.length - 1] ?? currentTail;

  return {
    x: lerp(previousTail.x, currentTail.x, progress),

    y: lerp(previousTail.y, currentTail.y, progress),
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

  /*
   * A trajetória começa exatamente
   * no centro visual da cabeça.
   */

  const visualHead = getVisualHead(snake, previousSnake, progress);

  points.push(toCenter(visualHead));

  /*
   * Os pontos intermediários permanecem
   * exatamente nas posições lógicas do grid.
   *
   * Isso garante que JARAKA continue sendo
   * um Snake estritamente baseado em grid.
   */

  for (let index = 1; index < snake.length; index += 1) {
    points.push(toCenter(snake[index]));
  }

  /*
   * A extremidade da cauda também
   * interpola entre os ticks.
   *
   * Isso impede alterações bruscas no
   * comprimento visual do corpo.
   */

  if (snake.length > 1) {
    const visualTail = getVisualTail(snake, previousSnake, progress);

    points.push(toCenter(visualTail));
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

    /*
     * Pontos intermediários de uma reta
     * não precisam permanecer no SVG.
     *
     * Mantemos apenas:
     * - início;
     * - mudanças de direção;
     * - fim.
     */

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

    /*
     * Se não houve mudança de eixo,
     * seguimos normalmente em linha reta.
     */

    if (incomingHorizontal === outgoingHorizontal) {
      pathData += ` L ${current.x}` + ` ${current.y}`;

      continue;
    }

    /*
     * Houve mudança horizontal ↔ vertical.
     *
     * Criamos uma pequena curva quadrática,
     * mantendo a trajetória visual suave
     * sem transformar o movimento em
     * deslocamento livre.
     */

    const geometry = getCornerGeometry(previous, current, next);

    if (!geometry) {
      pathData += ` L ${current.x}` + ` ${current.y}`;

      continue;
    }

    pathData += ` L ${geometry.entry.x}` + ` ${geometry.entry.y}`;

    pathData +=
      ` Q ${geometry.corner.x}` +
      ` ${geometry.corner.y}` +
      ` ${geometry.exit.x}` +
      ` ${geometry.exit.y}`;
  }

  const lastPoint = points[points.length - 1];

  pathData += ` L ${lastPoint.x}` + ` ${lastPoint.y}`;

  return pathData;
}