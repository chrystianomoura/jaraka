/* =========================================================
   JARAKA — SNAKE

   Renderer do corpo:
   - corpo inteiro em Canvas;
   - taper integrado à mesma superfície;
   - SVG invisível usado apenas como path geométrico para
     compatibilidade com as animações de alimentação;
   - crescimento morfológico independente do tick;
   - amostragem proporcional global removida;
   - curvas usam os samples estruturais estáveis do path.js.
   ========================================================= */

import { GRID_SIZE } from "./game/config.js";

import {
  getVisualHead,
  buildBodyPoints,
  simplifyOrthogonalPoints,
  buildRoundedPathGeometry,
  sampleRoundedPathAtLength,
} from "./snake/path.js";

import {
  createHead,
  updateHeadShape,
  updateHeadDirection as updateHeadDirectionModule,
  triggerHeadTurn as triggerHeadTurnModule,
} from "./snake/head.js";

import {
  triggerBite as triggerBiteModule,
  triggerBiteClose as triggerBiteCloseModule,
  triggerChew as triggerChewModule,
  finishChew as finishChewModule,
  finishBite as finishBiteModule,
  triggerSwallowSegment as triggerSwallowSegmentModule,
  triggerSwallowWave as triggerSwallowWaveModule,
  triggerGrowthArrival as triggerGrowthArrivalModule,
  triggerEatingSequence as triggerEatingSequenceModule,
} from "./snake/eating.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/* =========================================================
   CORPO
   ========================================================= */

const BODY_WIDTH = 0.92;

/* =========================================================
   MORFOLOGIA
   ========================================================= */

const TAIL_LENGTH_PER_GROWTH = 1;

const TAIL_WIDTH_LOSS_PER_GROWTH = 0.08;

const MIN_TAIL_END_WIDTH = 0.28;

const MIN_VISIBLE_GROWTH = 0.002;

/* =========================================================
   CRESCIMENTO MORFOLÓGICO
   ========================================================= */

const MORPHOLOGY_SMOOTHING_MS = 360;

const MORPHOLOGY_FRAME_LIMIT_MS = 50;

const MORPHOLOGY_SNAP_EPSILON = 0.001;

/* =========================================================
   GEOMETRIA
   ========================================================= */

const MIN_VECTOR_LENGTH = 0.000001;

const CURVE_JOIN_THRESHOLD = 0.002;

const DISTANCE_EPSILON = 0.000001;

/*
 * Retas pertencentes à região de taper recebem samples
 * fixos ancorados na própria geometria estrutural.
 *
 * Isso mantém a transição de largura suave sem voltar
 * à antiga redistribuição proporcional da cauda inteira.
 */

const TAIL_LINE_SAMPLE_SPACING = 0.22;

/* =========================================================
   RENDERER
   ========================================================= */

export function createSnakeRenderer({ layer }) {
  /* =======================================================
     SVG AUXILIAR — SOMENTE GEOMETRIA / EATING
     ======================================================= */

  let bodySvg = null;

  let bodyPath = null;

  /* =======================================================
     CANVAS — CORPO VISUAL
     ======================================================= */

  let bodyCanvas = null;

  let bodyContext = null;

  let bodyColor = "";

  let bodyResizeObserver = null;

  let canvasReady = false;

  /* =======================================================
     CABEÇA
     ======================================================= */

  let headElement = null;

  let headCore = null;

  /* =======================================================
     ESTADO
     ======================================================= */

  let latestSnakeLength = 0;

  let initialSnakeLength = 0;

  let targetGrowth = 0;

  let morphologyGrowth = 0;

  let lastMorphologyTime = null;

  /* =======================================================
     BUFFERS
     ======================================================= */

  const centerPoints = [];

  let centerPointCount = 0;

  const boundaryWidths = [];

  const directionXs = [];

  const directionYs = [];

  /* =======================================================
     SVG AUXILIAR
     ======================================================= */

  function createBodyPath(className) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");

    path.classList.add(className);

    path.setAttribute("fill", "none");

    return path;
  }

  function createBodySvg() {
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");

    svg.classList.add("snake-body-svg");

    svg.setAttribute("viewBox", `0 0 ${GRID_SIZE} ${GRID_SIZE}`);

    svg.setAttribute("preserveAspectRatio", "none");

    svg.setAttribute("aria-hidden", "true");

    const geometryPath = createBodyPath("snake-body-path");

    /*
     * O path continua existindo somente para eating.js.
     *
     * O corpo visível é desenhado exclusivamente no Canvas.
     */

    geometryPath.style.opacity = "0";

    geometryPath.style.pointerEvents = "none";

    svg.appendChild(geometryPath);

    layer.appendChild(svg);

    bodySvg = svg;

    bodyPath = geometryPath;
  }

  /* =======================================================
     CANVAS — COR
     ======================================================= */

  function resolveBodyColor() {
    const styles = getComputedStyle(layer);

    const color = styles.getPropertyValue("--color-verdyka").trim();

    bodyColor = color || "#39ff6a";
  }

  /* =======================================================
     CANVAS — TAMANHO
     ======================================================= */

  function resizeBodyCanvas() {
    if (!bodyCanvas || !bodyContext) {
      return;
    }

    const rect = layer.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      canvasReady = false;

      return;
    }

    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);

    const pixelWidth = Math.max(1, Math.round(rect.width * pixelRatio));

    const pixelHeight = Math.max(1, Math.round(rect.height * pixelRatio));

    if (bodyCanvas.width !== pixelWidth || bodyCanvas.height !== pixelHeight) {
      bodyCanvas.width = pixelWidth;

      bodyCanvas.height = pixelHeight;
    }

    bodyContext.setTransform(
      pixelWidth / GRID_SIZE,
      0,
      0,
      pixelHeight / GRID_SIZE,
      0,
      0,
    );

    canvasReady = true;
  }

  function createBodyCanvas() {
    const canvas = document.createElement("canvas");

    canvas.classList.add("snake-body-canvas");

    canvas.setAttribute("aria-hidden", "true");

    layer.appendChild(canvas);

    bodyCanvas = canvas;

    bodyContext = canvas.getContext("2d", {
      alpha: true,
    });

    resolveBodyColor();

    resizeBodyCanvas();

    if (typeof ResizeObserver !== "undefined") {
      bodyResizeObserver = new ResizeObserver(() => {
        resizeBodyCanvas();
      });

      bodyResizeObserver.observe(layer);
    }
  }

  function clearBodyCanvas() {
    if (!bodyContext || !canvasReady) {
      return;
    }

    bodyContext.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
  }

  /* =======================================================
     CRIAÇÃO
     ======================================================= */

  function create(snake, direction) {
    if (bodyResizeObserver) {
      bodyResizeObserver.disconnect();

      bodyResizeObserver = null;
    }

    layer.replaceChildren();

    initialSnakeLength = snake.length;

    latestSnakeLength = snake.length;

    targetGrowth = 0;

    morphologyGrowth = 0;

    lastMorphologyTime = null;

    centerPointCount = 0;

    createBodyCanvas();

    createBodySvg();

    const head = createHead(layer);

    headElement = head.element;

    headCore = head.core;

    updateSegmentShapes(snake, direction);

    updateHeadDirection(direction);
  }

  /* =======================================================
     FORMATO
     ======================================================= */

  function updateSegmentShapes(snake, direction) {
    latestSnakeLength = snake.length;

    updateHeadShape(headCore, direction);
  }

  /* =======================================================
     UTILITÁRIOS
     ======================================================= */

  function lerp(start, end, progress) {
    return start + (end - start) * progress;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(value, maximum));
  }

  function isSamePoint(first, second) {
    if (!first || !second) {
      return false;
    }

    return (
      Math.abs(first.x - second.x) <= DISTANCE_EPSILON &&
      Math.abs(first.y - second.y) <= DISTANCE_EPSILON
    );
  }

  /* =======================================================
     BÉZIER QUADRÁTICA
     ======================================================= */

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

  /* =======================================================
     CRESCIMENTO
     ======================================================= */

  function getGrowthAmount(snakeLength) {
    return Math.max(0, snakeLength - initialSnakeLength);
  }

  function updateMorphologyGrowth(snakeLength) {
    targetGrowth = getGrowthAmount(snakeLength);

    const now = performance.now();

    if (lastMorphologyTime === null) {
      lastMorphologyTime = now;

      morphologyGrowth = targetGrowth;

      return morphologyGrowth;
    }

    let deltaTime = now - lastMorphologyTime;

    lastMorphologyTime = now;

    deltaTime = Math.min(Math.max(deltaTime, 0), MORPHOLOGY_FRAME_LIMIT_MS);

    const difference = targetGrowth - morphologyGrowth;

    if (Math.abs(difference) <= MORPHOLOGY_SNAP_EPSILON) {
      morphologyGrowth = targetGrowth;

      return morphologyGrowth;
    }

    const smoothing = 1 - Math.exp(-deltaTime / MORPHOLOGY_SMOOTHING_MS);

    morphologyGrowth += difference * smoothing;

    return morphologyGrowth;
  }

  /* =======================================================
     MORFOLOGIA
     ======================================================= */

  function getTailLength(totalLength, visualGrowth) {
    return Math.min(totalLength, visualGrowth * TAIL_LENGTH_PER_GROWTH);
  }

  function getTailWidthGrowth(visualGrowth) {
    if (visualGrowth <= 0) {
      return 0;
    }

    return (visualGrowth * visualGrowth) / (visualGrowth + 2);
  }

  function getTailEndWidth(visualGrowth) {
    const widthGrowth = getTailWidthGrowth(visualGrowth);

    return Math.max(
      MIN_TAIL_END_WIDTH,
      BODY_WIDTH - widthGrowth * TAIL_WIDTH_LOSS_PER_GROWTH,
    );
  }

  function getTailWidth(progress, visualGrowth) {
    const normalized = clamp(progress, 0, 1);

    const taperProgress = normalized * normalized * (2 - normalized);

    return lerp(BODY_WIDTH, getTailEndWidth(visualGrowth), taperProgress);
  }

  /* =======================================================
     BUFFER — PONTO CENTRAL
     ======================================================= */

  function pushCenterPoint(point, distance) {
    if (!point) {
      return;
    }

    const previous =
      centerPointCount > 0 ? centerPoints[centerPointCount - 1] : null;

    if (previous && isSamePoint(previous, point)) {
      previous.distance = Math.max(previous.distance, distance);

      return;
    }

    let target = centerPoints[centerPointCount];

    if (!target) {
      target = {
        x: 0,
        y: 0,
        distance: 0,
      };

      centerPoints.push(target);
    }

    target.x = point.x;

    target.y = point.y;

    target.distance = distance;

    centerPointCount += 1;
  }

  /* =======================================================
     RETA — SAMPLES ESTÁVEIS DO TAPER
     ======================================================= */

  function pushLineTailSamples(segment, tailStart) {
    const startLength = segment.startLength;

    const endLength = segment.endLength;

    if (endLength <= tailStart + DISTANCE_EPSILON) {
      return;
    }

    const firstRelevantDistance = Math.max(tailStart, startLength);

    const firstSampleIndex = Math.max(
      1,
      Math.floor(
        (firstRelevantDistance - startLength) / TAIL_LINE_SAMPLE_SPACING,
      ) + 1,
    );

    const segmentLength = endLength - startLength;

    if (segmentLength <= DISTANCE_EPSILON) {
      return;
    }

    for (let sampleIndex = firstSampleIndex; ; sampleIndex += 1) {
      const localDistance = sampleIndex * TAIL_LINE_SAMPLE_SPACING;

      if (localDistance >= segmentLength - DISTANCE_EPSILON) {
        break;
      }

      const globalDistance = startLength + localDistance;

      if (globalDistance <= tailStart + DISTANCE_EPSILON) {
        continue;
      }

      const progress = localDistance / segmentLength;

      pushCenterPoint(
        {
          x: lerp(segment.start.x, segment.end.x, progress),

          y: lerp(segment.start.y, segment.end.y, progress),
        },
        globalDistance,
      );
    }
  }

  /* =======================================================
     AMOSTRAGEM ESTRUTURAL — CORPO INTEIRO
     ======================================================= */

  function buildStructuralBodyPoints(pathGeometry, tailStart) {
    centerPointCount = 0;

    const segments = pathGeometry?.segments ?? [];

    if (segments.length === 0) {
      return 0;
    }

    const firstSegment = segments[0];

    pushCenterPoint(firstSegment.start, firstSegment.startLength);

    let tailStartInserted = tailStart <= DISTANCE_EPSILON;

    function insertTailStartBefore(distance) {
      if (tailStartInserted) {
        return;
      }

      if (distance <= tailStart + DISTANCE_EPSILON) {
        return;
      }

      const tailStartPoint = sampleRoundedPathAtLength(pathGeometry, tailStart);

      pushCenterPoint(tailStartPoint, tailStart);

      tailStartInserted = true;
    }

    for (
      let segmentIndex = 0;
      segmentIndex < segments.length;
      segmentIndex += 1
    ) {
      const segment = segments[segmentIndex];

      /* ===================================================
         RETA
         =================================================== */

      if (segment.type === "line") {
        if (
          !tailStartInserted &&
          tailStart > segment.startLength + DISTANCE_EPSILON &&
          tailStart < segment.endLength - DISTANCE_EPSILON
        ) {
          const tailStartPoint = sampleRoundedPathAtLength(
            pathGeometry,
            tailStart,
          );

          pushCenterPoint(tailStartPoint, tailStart);

          tailStartInserted = true;
        }

        pushLineTailSamples(segment, tailStart);

        insertTailStartBefore(segment.endLength);

        pushCenterPoint(segment.end, segment.endLength);

        continue;
      }

      /* ===================================================
         CURVA QUADRÁTICA
         =================================================== */

      if (segment.type === "quadratic") {
        const samples = segment.samples ?? [];

        for (
          let sampleIndex = 1;
          sampleIndex < samples.length;
          sampleIndex += 1
        ) {
          const sample = samples[sampleIndex];

          const globalDistance = segment.startLength + sample.length;

          insertTailStartBefore(globalDistance);

          const point = getQuadraticPoint(
            segment.start,
            segment.control,
            segment.end,
            sample.t,
          );

          pushCenterPoint(point, globalDistance);
        }

        insertTailStartBefore(segment.endLength);

        pushCenterPoint(segment.end, segment.endLength);
      }
    }

    if (!tailStartInserted) {
      const totalLength = pathGeometry?.totalLength ?? 0;

      if (tailStart < totalLength - DISTANCE_EPSILON) {
        const tailStartPoint = sampleRoundedPathAtLength(
          pathGeometry,
          tailStart,
        );

        pushCenterPoint(tailStartPoint, tailStart);
      }
    }

    return centerPointCount;
  }

  /* =======================================================
     LARGURAS E DIREÇÕES
     ======================================================= */

  function prepareBodyGeometry(tailStart, tailLength, visualGrowth) {
    const pointCount = centerPointCount;

    const segmentCount = Math.max(0, pointCount - 1);

    boundaryWidths.length = pointCount;

    directionXs.length = segmentCount;

    directionYs.length = segmentCount;

    let taperPreviousWidth = BODY_WIDTH;

    for (let index = 0; index < pointCount; index += 1) {
      const point = centerPoints[index];

      let width = BODY_WIDTH;

      if (
        visualGrowth > MIN_VISIBLE_GROWTH &&
        tailLength > DISTANCE_EPSILON &&
        point.distance > tailStart + DISTANCE_EPSILON
      ) {
        const progress = clamp((point.distance - tailStart) / tailLength, 0, 1);

        width = getTailWidth(progress, visualGrowth);

        /*
         * Invariante fundamental:
         *
         * depois que o taper começa,
         * a largura nunca aumenta.
         */

        width = Math.min(taperPreviousWidth, width);
      }

      boundaryWidths[index] = width;

      if (point.distance >= tailStart - DISTANCE_EPSILON) {
        taperPreviousWidth = width;
      }
    }

    for (let index = 0; index < segmentCount; index += 1) {
      const start = centerPoints[index];

      const end = centerPoints[index + 1];

      const dx = end.x - start.x;

      const dy = end.y - start.y;

      const length = Math.hypot(dx, dy);

      if (length <= MIN_VECTOR_LENGTH) {
        directionXs[index] = 0;

        directionYs[index] = 0;

        continue;
      }

      const inverseLength = 1 / length;

      directionXs[index] = dx * inverseLength;

      directionYs[index] = dy * inverseLength;
    }
  }

  /* =======================================================
     SUPERFÍCIE — SEGMENTOS
     ======================================================= */

  function buildSurfaceSegments() {
    const segmentCount = centerPointCount - 1;

    if (segmentCount <= 0) {
      return;
    }

    bodyContext.beginPath();

    for (let index = 0; index < segmentCount; index += 1) {
      const directionX = directionXs[index];

      const directionY = directionYs[index];

      if (directionX === 0 && directionY === 0) {
        continue;
      }

      const start = centerPoints[index];

      const end = centerPoints[index + 1];

      const normalX = -directionY;

      const normalY = directionX;

      const startRadius = boundaryWidths[index] * 0.5;

      const endRadius = boundaryWidths[index + 1] * 0.5;

      const startOffsetX = normalX * startRadius;

      const startOffsetY = normalY * startRadius;

      const endOffsetX = normalX * endRadius;

      const endOffsetY = normalY * endRadius;

      bodyContext.moveTo(start.x + startOffsetX, start.y + startOffsetY);

      bodyContext.lineTo(end.x + endOffsetX, end.y + endOffsetY);

      bodyContext.lineTo(end.x - endOffsetX, end.y - endOffsetY);

      bodyContext.lineTo(start.x - startOffsetX, start.y - startOffsetY);

      bodyContext.closePath();
    }

    bodyContext.fill();
  }

  /* =======================================================
     SUPERFÍCIE — JUNÇÕES
     ======================================================= */

  function fillCurveJoints() {
    const segmentCount = centerPointCount - 1;

    if (segmentCount <= 1) {
      return;
    }

    bodyContext.beginPath();

    let hasJoint = false;

    for (let index = 1; index < segmentCount; index += 1) {
      const previousDirectionX = directionXs[index - 1];

      const previousDirectionY = directionYs[index - 1];

      const nextDirectionX = directionXs[index];

      const nextDirectionY = directionYs[index];

      if (
        (previousDirectionX === 0 && previousDirectionY === 0) ||
        (nextDirectionX === 0 && nextDirectionY === 0)
      ) {
        continue;
      }

      const cross =
        previousDirectionX * nextDirectionY -
        previousDirectionY * nextDirectionX;

      if (Math.abs(cross) <= CURVE_JOIN_THRESHOLD) {
        continue;
      }

      const point = centerPoints[index];

      const radius = boundaryWidths[index] * 0.5;

      bodyContext.moveTo(point.x + radius, point.y);

      bodyContext.arc(point.x, point.y, radius, 0, Math.PI * 2);

      hasJoint = true;
    }

    if (hasJoint) {
      bodyContext.fill();
    }
  }

  /* =======================================================
     SUPERFÍCIE — EXTREMIDADES
     ======================================================= */

  function fillBodyCaps() {
    if (centerPointCount === 0) {
      return;
    }

    const start = centerPoints[0];

    const startRadius = boundaryWidths[0] * 0.5;

    const tipIndex = centerPointCount - 1;

    const tip = centerPoints[tipIndex];

    const tipRadius = boundaryWidths[tipIndex] * 0.5;

    bodyContext.beginPath();

    if (start && Number.isFinite(startRadius) && startRadius > 0) {
      bodyContext.moveTo(start.x + startRadius, start.y);

      bodyContext.arc(start.x, start.y, startRadius, 0, Math.PI * 2);
    }

    if (tip && Number.isFinite(tipRadius) && tipRadius > 0) {
      bodyContext.moveTo(tip.x + tipRadius, tip.y);

      bodyContext.arc(tip.x, tip.y, tipRadius, 0, Math.PI * 2);
    }

    bodyContext.fill();
  }

  /* =======================================================
     DESENHO DO CORPO INTEIRO
     ======================================================= */

  function renderBodySurface(visualGrowth, pathGeometry) {
    if (!bodyContext || !canvasReady) {
      return;
    }

    const totalLength = pathGeometry?.totalLength ?? 0;

    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      return;
    }

    const tailLength =
      visualGrowth > MIN_VISIBLE_GROWTH
        ? getTailLength(totalLength, visualGrowth)
        : 0;

    const tailStart = Math.max(0, totalLength - tailLength);

    const pointCount = buildStructuralBodyPoints(pathGeometry, tailStart);

    if (pointCount < 2) {
      return;
    }

    prepareBodyGeometry(tailStart, tailLength, visualGrowth);

    bodyContext.fillStyle = bodyColor;

    buildSurfaceSegments();

    fillCurveJoints();

    fillBodyCaps();
  }

  /* =======================================================
     RENDERIZAÇÃO
     ======================================================= */

  function render(snake, previousSnake, progress) {
    if (!headElement || !bodyPath) {
      return;
    }

    latestSnakeLength = snake.length;

    const visualHead = getVisualHead(snake, previousSnake, progress);

    headElement.style.setProperty("--visual-x", visualHead.x);

    headElement.style.setProperty("--visual-y", visualHead.y);

    const rawPoints = buildBodyPoints(snake, previousSnake, progress);

    const points = simplifyOrthogonalPoints(rawPoints);

    const pathGeometry = buildRoundedPathGeometry(points);

    /*
     * O SVG não desenha o corpo.
     *
     * Apenas acompanha a geometria para eating.js.
     */

    bodyPath.setAttribute("d", pathGeometry.pathData);

    clearBodyCanvas();

    const visualGrowth = updateMorphologyGrowth(snake.length);

    renderBodySurface(visualGrowth, pathGeometry);
  }

  /* =======================================================
     CABEÇA
     ======================================================= */

  function updateHeadDirection(direction) {
    updateHeadDirectionModule(headElement, direction);
  }

  function triggerHeadTurn(turnSide) {
    triggerHeadTurnModule(headElement, headCore, turnSide);
  }

  /* =======================================================
     ALIMENTAÇÃO — CABEÇA
     ======================================================= */

  function triggerBite() {
    triggerBiteModule(headElement);
  }

  function triggerBiteClose() {
    triggerBiteCloseModule(headElement);
  }

  function triggerChew() {
    triggerChewModule(headElement);
  }

  function finishChew() {
    finishChewModule(headElement);
  }

  function finishBite() {
    finishBiteModule(headElement);
  }

  /* =======================================================
     ALIMENTAÇÃO — CORPO
     ======================================================= */

  function triggerSwallowSegment(index) {
    triggerSwallowSegmentModule({
      bodySvg,
      bodyPath,
      latestSnakeLength,
      index,
    });
  }

  function triggerSwallowWave({ segmentDelay = 92, onComplete } = {}) {
    triggerSwallowWaveModule({
      bodySvg,
      bodyPath,
      latestSnakeLength,
      segmentDelay,
      onComplete,
    });
  }

  /* =======================================================
     CRESCIMENTO
     ======================================================= */

  function triggerGrowthArrival() {
    triggerGrowthArrivalModule({
      bodySvg,
      bodyPath,
    });
  }

  /* =======================================================
     SEQUÊNCIA DE ALIMENTAÇÃO
     ======================================================= */

  function triggerEatingSequence({ onMouseEnter, onSwallowComplete } = {}) {
    triggerEatingSequenceModule({
      headElement,
      bodySvg,
      bodyPath,
      latestSnakeLength,
      onMouseEnter,
      onSwallowComplete,
    });
  }

  /* =======================================================
     API PÚBLICA
     ======================================================= */

  return {
    create,
    render,
    updateSegmentShapes,
    updateHeadDirection,
    triggerHeadTurn,
    triggerBite,
    triggerBiteClose,
    triggerChew,
    finishChew,
    finishBite,
    triggerSwallowSegment,
    triggerSwallowWave,
    triggerGrowthArrival,
    triggerEatingSequence,
  };
}