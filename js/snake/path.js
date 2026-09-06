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
   - geração do path SVG;
   - geometria amostrável sem consultas ao DOM.

   Este módulo não manipula DOM.
   ========================================================= */

import { EPSILON } from "../game/config.js";

const CORNER_RADIUS = 0.18;

const QUADRATIC_LENGTH_STEPS = 8;

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
  return Math.hypot(second.x - first.x, second.y - first.y);
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

function findTailCorner(snake, previousSnake, previousTail, currentTail) {
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

  const validCandidates = candidates.filter(
    (candidate) =>
      isOrthogonal(previousTail, candidate) &&
      isOrthogonal(candidate, currentTail),
  );

  if (validCandidates.length === 0) {
    return null;
  }

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

  if (isOrthogonal(previousTail, currentTail)) {
    return {
      point: interpolatePoint(previousTail, currentTail, progress),

      corner: null,

      beforeCorner: false,
    };
  }

  const corner = findTailCorner(
    snake,
    previousSnake,
    previousTail,
    currentTail,
  );

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

  const traveledDistance = totalLength * progress;

  if (traveledDistance <= firstLength && firstLength > EPSILON) {
    const localProgress = traveledDistance / firstLength;

    return {
      point: interpolatePoint(previousTail, corner, localProgress),

      corner,

      beforeCorner: true,
    };
  }

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

  for (let index = 1; index < snake.length; index += 1) {
    points.push(toCenter(snake[index]));
  }

  if (snake.length > 1) {
    const tailState = getVisualTailState(snake, previousSnake, progress);

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
   SEGMENTOS MATEMÁTICOS DA CENTERLINE
   ========================================================= */

function createLineSegment(start, end, startLength) {
  const length = getDistance(start, end);

  return {
    type: "line",

    start,

    end,

    length,

    startLength,

    endLength: startLength + length,
  };
}

function getQuadraticPoint(start, control, end, progress) {
  const inverse = 1 - progress;

  return {
    x:
      inverse * inverse * start.x +
      2 * inverse * progress * control.x +
      progress * progress * end.x,

    y:
      inverse * inverse * start.y +
      2 * inverse * progress * control.y +
      progress * progress * end.y,
  };
}

function createQuadraticSegment(start, control, end, startLength) {
  const samples = new Array(QUADRATIC_LENGTH_STEPS + 1);

  samples[0] = {
    t: 0,
    length: 0,
  };

  let previousPoint = start;

  let accumulatedLength = 0;

  for (let index = 1; index <= QUADRATIC_LENGTH_STEPS; index += 1) {
    const t = index / QUADRATIC_LENGTH_STEPS;

    const point = getQuadraticPoint(start, control, end, t);

    accumulatedLength += getDistance(previousPoint, point);

    samples[index] = {
      t,
      length: accumulatedLength,
    };

    previousPoint = point;
  }

  return {
    type: "quadratic",

    start,

    control,

    end,

    samples,

    length: accumulatedLength,

    startLength,

    endLength: startLength + accumulatedLength,
  };
}

/* =========================================================
   GEOMETRIA COMPLETA DO PATH
   ========================================================= */

export function buildRoundedPathGeometry(points) {
  if (points.length === 0) {
    return {
      pathData: "",
      segments: [],
      totalLength: 0,
    };
  }

  if (points.length === 1) {
    return {
      pathData: `M ${points[0].x} ` + `${points[0].y}`,

      segments: [],

      totalLength: 0,
    };
  }

  const segments = [];

  let totalLength = 0;

  let cursor = {
    x: points[0].x,
    y: points[0].y,
  };

  let pathData = `M ${cursor.x} ` + `${cursor.y}`;

  function appendLine(target) {
    if (!isSamePoint(cursor, target)) {
      const segment = createLineSegment(cursor, target, totalLength);

      segments.push(segment);

      totalLength = segment.endLength;
    }

    pathData += ` L ${target.x} ` + `${target.y}`;

    cursor = {
      x: target.x,
      y: target.y,
    };
  }

  function appendQuadratic(control, target) {
    const segment = createQuadraticSegment(
      cursor,
      control,
      target,
      totalLength,
    );

    if (segment.length > EPSILON) {
      segments.push(segment);

      totalLength = segment.endLength;
    }

    pathData +=
      ` Q ${control.x} ` + `${control.y}` + ` ${target.x} ` + `${target.y}`;

    cursor = {
      x: target.x,
      y: target.y,
    };
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];

    const current = points[index];

    const next = points[index + 1];

    const incomingHorizontal = Math.abs(previous.y - current.y) < EPSILON;

    const outgoingHorizontal = Math.abs(current.y - next.y) < EPSILON;

    if (incomingHorizontal === outgoingHorizontal) {
      appendLine(current);

      continue;
    }

    const geometry = getCornerGeometry(previous, current, next);

    if (!geometry) {
      appendLine(current);

      continue;
    }

    appendLine(geometry.entry);

    appendQuadratic(geometry.corner, geometry.exit);
  }

  appendLine(points[points.length - 1]);

  return {
    pathData,
    segments,
    totalLength,
  };
}

/* =========================================================
   AMOSTRAGEM MATEMÁTICA
   ========================================================= */

function sampleQuadraticSegmentAtLength(segment, localLength) {
  if (segment.length <= EPSILON) {
    return {
      x: segment.end.x,
      y: segment.end.y,
    };
  }

  const targetLength = Math.max(0, Math.min(localLength, segment.length));

  const samples = segment.samples;

  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index];

    if (targetLength > current.length) {
      continue;
    }

    const previous = samples[index - 1];

    const intervalLength = current.length - previous.length;

    const intervalProgress =
      intervalLength <= EPSILON
        ? 0
        : (targetLength - previous.length) / intervalLength;

    const t = lerp(previous.t, current.t, intervalProgress);

    return getQuadraticPoint(segment.start, segment.control, segment.end, t);
  }

  return {
    x: segment.end.x,
    y: segment.end.y,
  };
}

export function sampleRoundedPathAtLength(pathGeometry, distance) {
  const segments = pathGeometry?.segments ?? [];

  if (segments.length === 0) {
    return null;
  }

  const totalLength = pathGeometry.totalLength;

  const targetLength = Math.max(0, Math.min(distance, totalLength));

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (targetLength > segment.endLength && index < segments.length - 1) {
      continue;
    }

    const localLength = targetLength - segment.startLength;

    if (segment.type === "quadratic") {
      return sampleQuadraticSegmentAtLength(segment, localLength);
    }

    if (segment.length <= EPSILON) {
      return {
        x: segment.end.x,
        y: segment.end.y,
      };
    }

    const progress = Math.max(0, Math.min(localLength / segment.length, 1));

    return interpolatePoint(segment.start, segment.end, progress);
  }

  const lastSegment = segments[segments.length - 1];

  return {
    x: lastSegment.end.x,
    y: lastSegment.end.y,
  };
}

/* =========================================================
   CONSTRUÇÃO DO PATH SVG
   ========================================================= */

export function buildRoundedPathData(points) {
  return buildRoundedPathGeometry(points).pathData;
}