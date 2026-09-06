/* =========================================================
   JARAKA — SNAKE

   Renderer híbrido:
   - corpo principal em SVG;
   - região de taper em Canvas;
   - padrão corporal em Canvas;
   - crescimento morfológico independente do tick;
   - superfície preenchida;
   - amostragem proporcional global REMOVIDA;
   - superfície ancorada na geometria estrutural do path;
   - curvas Canvas usam os samples estáveis do path.js.
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

const BODY_TAIL_OVERLAP = 0.22;

/* =========================================================
   CRESCIMENTO MORFOLÓGICO
   ========================================================= */

const MORPHOLOGY_SMOOTHING_MS = 360;

const MORPHOLOGY_FRAME_LIMIT_MS = 50;

const MORPHOLOGY_SNAP_EPSILON = 0.001;

/* =========================================================
   PADRÃO CORPORAL
   ========================================================= */

const BODY_PATTERN_COLOR = "#168a3b";

const BODY_PATTERN_START_DISTANCE = 1.7;

const BODY_PATTERN_SPACING = 1.65;

const BODY_PATTERN_GROWTH_INTERVAL = 1.35;

const BODY_PATTERN_MAX_MARKS = 8;

const BODY_PATTERN_TAIL_CLEARANCE = 0.5;

const BODY_PATTERN_TANGENT_SAMPLE = 0.04;

const BODY_PATTERN_SIDE_OFFSET = 0.17;

const BODY_PATTERN_MAJOR_RADIUS = 0.19;

const BODY_PATTERN_MINOR_RADIUS = 0.085;

const BODY_PATTERN_SECONDARY_SCALE = 0.72;

const BODY_PATTERN_MAX_ALPHA = 0.72;

/* =========================================================
   GEOMETRIA
   ========================================================= */

const MIN_VECTOR_LENGTH = 0.000001;

const CURVE_JOIN_THRESHOLD = 0.002;

const DISTANCE_EPSILON = 0.000001;

/* =========================================================
   RENDERER
   ========================================================= */

export function createSnakeRenderer({ layer }) {
  let bodySvg = null;

  let bodyPath = null;

  let tailCanvas = null;

  let tailContext = null;

  let tailColor = "";

  let tailResizeObserver = null;

  let headElement = null;

  let headCore = null;

  let latestSnakeLength = 0;

  let initialSnakeLength = 0;

  let canvasReady = false;

  /* =======================================================
     MORFOLOGIA — ESTADO
     ======================================================= */

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

  let bodyDashMode = null;

  /* =======================================================
     SVG — CORPO
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

    const mainPath = createBodyPath("snake-body-path");

    svg.appendChild(mainPath);

    layer.appendChild(svg);

    bodySvg = svg;

    bodyPath = mainPath;
  }

  /* =======================================================
     CANVAS — COR
     ======================================================= */

  function resolveTailColor() {
    const styles = getComputedStyle(layer);

    const color = styles.getPropertyValue("--color-verdyka").trim();

    tailColor = color || "#39ff6a";
  }

  /* =======================================================
     CANVAS — TAMANHO
     ======================================================= */

  function resizeTailCanvas() {
    if (!tailCanvas || !tailContext) {
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

    if (tailCanvas.width !== pixelWidth || tailCanvas.height !== pixelHeight) {
      tailCanvas.width = pixelWidth;

      tailCanvas.height = pixelHeight;
    }

    tailContext.setTransform(
      pixelWidth / GRID_SIZE,
      0,
      0,
      pixelHeight / GRID_SIZE,
      0,
      0,
    );

    canvasReady = true;
  }

  function createTailCanvas() {
    const canvas = document.createElement("canvas");

    canvas.classList.add("snake-tail-canvas");

    canvas.setAttribute("aria-hidden", "true");

    layer.appendChild(canvas);

    tailCanvas = canvas;

    tailContext = canvas.getContext("2d", {
      alpha: true,
    });

    resolveTailColor();

    resizeTailCanvas();

    if (typeof ResizeObserver !== "undefined") {
      tailResizeObserver = new ResizeObserver(() => {
        resizeTailCanvas();
      });

      tailResizeObserver.observe(layer);
    }
  }

  function clearTailCanvas() {
    if (!tailContext || !canvasReady) {
      return;
    }

    tailContext.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
  }

  /* =======================================================
     CRIAÇÃO
     ======================================================= */

  function create(snake, direction) {
    if (tailResizeObserver) {
      tailResizeObserver.disconnect();

      tailResizeObserver = null;
    }

    layer.replaceChildren();

    initialSnakeLength = snake.length;

    latestSnakeLength = snake.length;

    targetGrowth = 0;

    morphologyGrowth = 0;

    lastMorphologyTime = null;

    bodyDashMode = null;

    centerPointCount = 0;

    createBodySvg();

    createTailCanvas();

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

     Usa o mesmo parâmetro t que já é
     calculado e armazenado pelo path.js.

     Não existe nova distribuição global
     de samples.
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
     SVG — VISIBILIDADE
     ======================================================= */

  function resetBodyDash() {
    if (bodyDashMode === "none") {
      return;
    }

    bodyDashMode = "none";

    bodyPath.style.strokeDasharray = "none";

    bodyPath.style.strokeDashoffset = "0";
  }

  function setBodyVisibleLength(visibleLength, totalLength) {
    const overlappedVisibleLength = Math.min(
      totalLength,
      visibleLength + BODY_TAIL_OVERLAP,
    );

    const hiddenLength = totalLength + 2;

    bodyDashMode = "tail";

    bodyPath.style.strokeDasharray = `${overlappedVisibleLength} ${hiddenLength}`;
  }

  /* =======================================================
     CRESCIMENTO
     ======================================================= */

  function getGrowthAmount(snakeLength) {
    return Math.max(0, snakeLength - initialSnakeLength);
  }

  /* =======================================================
     CRESCIMENTO MORFOLÓGICO
     ======================================================= */

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

  function getTailEndWidth(visualGrowth) {
    return Math.max(
      MIN_TAIL_END_WIDTH,
      BODY_WIDTH - visualGrowth * TAIL_WIDTH_LOSS_PER_GROWTH,
    );
  }

  function getTailWidth(progress, visualGrowth) {
    const normalized = clamp(progress, 0, 1);

    const taperProgress = normalized * normalized * (2 - normalized);

    return lerp(BODY_WIDTH, getTailEndWidth(visualGrowth), taperProgress);
  }

  /* =======================================================
     BUFFER — PONTO ESTRUTURAL
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
     AMOSTRAGEM ESTRUTURAL
     ======================================================= */

  function buildStructuralTailPoints(pathGeometry, tailStart) {
    centerPointCount = 0;

    const segments = pathGeometry?.segments ?? [];

    if (segments.length === 0) {
      return 0;
    }

    /*
     * Único corte realmente dinâmico.
     */

    const startPoint = sampleRoundedPathAtLength(pathGeometry, tailStart);

    pushCenterPoint(startPoint, tailStart);

    for (
      let segmentIndex = 0;
      segmentIndex < segments.length;
      segmentIndex += 1
    ) {
      const segment = segments[segmentIndex];

      if (segment.endLength <= tailStart + DISTANCE_EPSILON) {
        continue;
      }

      /* ===================================================
         RETA
         =================================================== */

      if (segment.type === "line") {
        pushCenterPoint(segment.end, segment.endLength);

        continue;
      }

      /* ===================================================
         CURVA QUADRÁTICA
         =================================================== */

      if (segment.type === "quadratic") {
        const samples = segment.samples ?? [];

        /*
         * IMPORTANTE:
         *
         * path.js armazena t + comprimento.
         *
         * Ele NÃO armazena sample.point.
         *
         * Antes tentávamos acessar:
         *
         * sample.point
         *
         * Como era undefined, pushCenterPoint()
         * simplesmente ignorava o sample.
         *
         * Resultado:
         * a curva inteira era praticamente
         * reduzida ao endpoint.
         *
         * Agora calculamos o ponto real da
         * mesma Bézier usando o t estrutural
         * já fornecido pelo path.js.
         */

        for (
          let sampleIndex = 1;
          sampleIndex < samples.length;
          sampleIndex += 1
        ) {
          const sample = samples[sampleIndex];

          const globalDistance = segment.startLength + sample.length;

          if (globalDistance <= tailStart + DISTANCE_EPSILON) {
            continue;
          }

          const point = getQuadraticPoint(
            segment.start,
            segment.control,
            segment.end,
            sample.t,
          );

          pushCenterPoint(point, globalDistance);
        }

        /*
         * O último sample normalmente já
         * coincide com segment.end.
         *
         * pushCenterPoint remove a duplicata
         * sem gerar outro nó.
         */

        pushCenterPoint(segment.end, segment.endLength);
      }
    }

    return centerPointCount;
  }

  /* =======================================================
     LARGURAS E DIREÇÕES
     ======================================================= */

  function prepareTailGeometry(tailStart, tailLength, visualGrowth) {
    const pointCount = centerPointCount;

    const segmentCount = Math.max(0, pointCount - 1);

    boundaryWidths.length = pointCount;

    directionXs.length = segmentCount;

    directionYs.length = segmentCount;

    let previousWidth = BODY_WIDTH;

    for (let index = 0; index < pointCount; index += 1) {
      const point = centerPoints[index];

      const progress =
        tailLength <= DISTANCE_EPSILON
          ? 1
          : clamp((point.distance - tailStart) / tailLength, 0, 1);

      let width =
        index === 0 ? BODY_WIDTH : getTailWidth(progress, visualGrowth);

      /*
       * Invariante fundamental:
       *
       * depois que começa o taper,
       * a largura jamais aumenta.
       */

      width = Math.min(previousWidth, width);

      boundaryWidths[index] = width;

      previousWidth = width;
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

    tailContext.beginPath();

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

      tailContext.moveTo(start.x + startOffsetX, start.y + startOffsetY);

      tailContext.lineTo(end.x + endOffsetX, end.y + endOffsetY);

      tailContext.lineTo(end.x - endOffsetX, end.y - endOffsetY);

      tailContext.lineTo(start.x - startOffsetX, start.y - startOffsetY);

      tailContext.closePath();
    }

    tailContext.fill();
  }

  /* =======================================================
     SUPERFÍCIE — JUNÇÕES
     ======================================================= */

  function fillCurveJoints() {
    const segmentCount = centerPointCount - 1;

    if (segmentCount <= 1) {
      return;
    }

    tailContext.beginPath();

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

      tailContext.moveTo(point.x + radius, point.y);

      tailContext.arc(point.x, point.y, radius, 0, Math.PI * 2);

      hasJoint = true;
    }

    if (hasJoint) {
      tailContext.fill();
    }
  }

  /* =======================================================
     SUPERFÍCIE — PONTA
     ======================================================= */

  function fillTailTip() {
    const pointCount = centerPointCount;

    if (pointCount === 0) {
      return;
    }

    const tipIndex = pointCount - 1;

    const tip = centerPoints[tipIndex];

    const tipRadius = boundaryWidths[tipIndex] / 2;

    if (!tip || !Number.isFinite(tipRadius) || tipRadius <= 0) {
      return;
    }

    tailContext.beginPath();

    tailContext.arc(tip.x, tip.y, tipRadius, 0, Math.PI * 2);

    tailContext.fill();
  }

  /* =======================================================
     DESENHO DA CAUDA
     ======================================================= */

  function drawTailSurface() {
    if (!tailContext || !canvasReady) {
      return;
    }

    if (centerPointCount < 2) {
      return;
    }

    tailContext.fillStyle = tailColor;

    buildSurfaceSegments();

    fillCurveJoints();

    fillTailTip();
  }

  /* =======================================================
     CAUDA
     ======================================================= */

  function renderTail(visualGrowth, pathGeometry) {
    if (!bodyPath || !tailCanvas || !tailContext) {
      return;
    }

    if (visualGrowth <= MIN_VISIBLE_GROWTH) {
      resetBodyDash();

      return;
    }

    const totalLength = pathGeometry?.totalLength ?? 0;

    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      resetBodyDash();

      return;
    }

    const tailLength = getTailLength(totalLength, visualGrowth);

    if (!Number.isFinite(tailLength) || tailLength <= 0) {
      resetBodyDash();

      return;
    }

    const tailStart = Math.max(0, totalLength - tailLength);

    setBodyVisibleLength(tailStart, totalLength);

    const pointCount = buildStructuralTailPoints(pathGeometry, tailStart);

    if (pointCount < 2) {
      return;
    }

    prepareTailGeometry(tailStart, tailLength, visualGrowth);

    drawTailSurface();
  }

  /* =======================================================
     PADRÃO — OPACIDADE
     ======================================================= */

  function getPatternMarkOpacity(markIndex, visualGrowth) {
    const appearanceGrowth = (markIndex + 1) * BODY_PATTERN_GROWTH_INTERVAL;

    const progress = clamp(visualGrowth - appearanceGrowth + 1, 0, 1);

    const eased = progress * progress * (3 - 2 * progress);

    return eased * BODY_PATTERN_MAX_ALPHA;
  }

  /* =======================================================
     PADRÃO — MANCHA
     ======================================================= */

  function drawPatternEllipse(x, y, angle, radiusX, radiusY, alpha) {
    tailContext.save();

    tailContext.translate(x, y);

    tailContext.rotate(angle);

    tailContext.globalAlpha = alpha;

    tailContext.beginPath();

    tailContext.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);

    tailContext.fill();

    tailContext.restore();
  }

  /* =======================================================
     PADRÃO — CORPO
     ======================================================= */

  function renderBodyPattern(pathGeometry, visualGrowth) {
    if (!tailContext || !canvasReady || visualGrowth <= MIN_VISIBLE_GROWTH) {
      return;
    }

    const totalLength = pathGeometry?.totalLength ?? 0;

    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      return;
    }

    const tailLength = getTailLength(totalLength, visualGrowth);

    const tailStart = Math.max(0, totalLength - tailLength);

    const patternEnd = Math.max(0, tailStart - BODY_PATTERN_TAIL_CLEARANCE);

    if (patternEnd <= BODY_PATTERN_START_DISTANCE) {
      return;
    }

    const visibleMarkCount = Math.min(
      BODY_PATTERN_MAX_MARKS,
      Math.ceil(visualGrowth / BODY_PATTERN_GROWTH_INTERVAL),
    );

    if (visibleMarkCount <= 0) {
      return;
    }

    tailContext.fillStyle = BODY_PATTERN_COLOR;

    for (let markIndex = 0; markIndex < visibleMarkCount; markIndex += 1) {
      const distance =
        BODY_PATTERN_START_DISTANCE + markIndex * BODY_PATTERN_SPACING;

      if (distance >= patternEnd) {
        break;
      }

      const point = sampleRoundedPathAtLength(pathGeometry, distance);

      if (!point) {
        continue;
      }

      const tangentDistance = Math.min(
        patternEnd,
        distance + BODY_PATTERN_TANGENT_SAMPLE,
      );

      const tangentPoint = sampleRoundedPathAtLength(
        pathGeometry,
        tangentDistance,
      );

      if (!tangentPoint) {
        continue;
      }

      let directionX = tangentPoint.x - point.x;

      let directionY = tangentPoint.y - point.y;

      let directionLength = Math.hypot(directionX, directionY);

      if (directionLength <= MIN_VECTOR_LENGTH) {
        const previousDistance = Math.max(
          0,
          distance - BODY_PATTERN_TANGENT_SAMPLE,
        );

        const previousPoint = sampleRoundedPathAtLength(
          pathGeometry,
          previousDistance,
        );

        if (!previousPoint) {
          continue;
        }

        directionX = point.x - previousPoint.x;

        directionY = point.y - previousPoint.y;

        directionLength = Math.hypot(directionX, directionY);
      }

      if (directionLength <= MIN_VECTOR_LENGTH) {
        continue;
      }

      const inverseLength = 1 / directionLength;

      directionX *= inverseLength;

      directionY *= inverseLength;

      const normalX = -directionY;

      const normalY = directionX;

      const angle = Math.atan2(directionY, directionX);

      const side = markIndex % 2 === 0 ? 1 : -1;

      const alpha = getPatternMarkOpacity(markIndex, visualGrowth);

      if (alpha <= 0) {
        continue;
      }

      const primaryX = point.x + normalX * BODY_PATTERN_SIDE_OFFSET * side;

      const primaryY = point.y + normalY * BODY_PATTERN_SIDE_OFFSET * side;

      drawPatternEllipse(
        primaryX,
        primaryY,
        angle,
        BODY_PATTERN_MAJOR_RADIUS,
        BODY_PATTERN_MINOR_RADIUS,
        alpha,
      );

      const secondaryX =
        point.x - normalX * BODY_PATTERN_SIDE_OFFSET * 0.78 * side;

      const secondaryY =
        point.y - normalY * BODY_PATTERN_SIDE_OFFSET * 0.78 * side;

      drawPatternEllipse(
        secondaryX,
        secondaryY,
        angle,
        BODY_PATTERN_MAJOR_RADIUS * BODY_PATTERN_SECONDARY_SCALE,
        BODY_PATTERN_MINOR_RADIUS * BODY_PATTERN_SECONDARY_SCALE,
        alpha * 0.82,
      );
    }

    tailContext.globalAlpha = 1;
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

    bodyPath.setAttribute("d", pathGeometry.pathData);

    clearTailCanvas();

    const visualGrowth = updateMorphologyGrowth(snake.length);

    renderTail(visualGrowth, pathGeometry);

    renderBodyPattern(pathGeometry, visualGrowth);
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