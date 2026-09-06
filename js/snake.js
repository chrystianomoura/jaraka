/* =========================================================
   JARAKA — SNAKE

   Renderer híbrido:
   - corpo principal em SVG;
   - região de taper em Canvas;
   - matemática morfológica preservada;
   - superfície preenchida, sem strokes segmentados;
   - amostragem proporcional global REMOVIDA;
   - superfície ancorada na geometria real do path.
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
   MORFOLOGIA APROVADA
   ========================================================= */

const TAIL_LENGTH_PER_GROWTH = 1;

const TAIL_WIDTH_LOSS_PER_GROWTH = 0.08;

const MIN_TAIL_END_WIDTH = 0.28;

const MIN_VISIBLE_GROWTH = 0.002;

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

  let bodyDepthPath = null;

  let bodyPath = null;

  let bodyHighlightPath = null;

  let tailCanvas = null;

  let tailContext = null;

  let tailColor = "";

  let tailResizeObserver = null;

  let headElement = null;

  let headCore = null;

  let latestSnakeLength = 0;

  let initialSnakeLength = 0;

  let canvasReady = false;

  /*
   * Buffers reutilizados.
   *
   * Nesta versão eles não possuem tamanho fixo,
   * porque a quantidade de pontos passa a ser
   * determinada pela topologia real do path.
   *
   * O Array em si é reutilizado a cada frame.
   */

  const centerPoints = [];

  const boundaryWidths = [];

  const segmentDirections = [];

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

    const depthPath = createBodyPath("snake-body-depth");

    const mainPath = createBodyPath("snake-body-path");

    const highlightPath = createBodyPath("snake-body-highlight");

    svg.append(depthPath, mainPath, highlightPath);

    layer.appendChild(svg);

    bodySvg = svg;

    bodyDepthPath = depthPath;

    bodyPath = mainPath;

    bodyHighlightPath = highlightPath;
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

    createBodySvg();

    createTailCanvas();

    const head = createHead(layer);

    headElement = head.element;

    headCore = head.core;

    latestSnakeLength = snake.length;

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

  function normalizeVector(x, y) {
    const length = Math.hypot(x, y);

    if (length <= MIN_VECTOR_LENGTH) {
      return null;
    }

    return {
      x: x / length,

      y: y / length,
    };
  }

  function getNormal(direction) {
    return {
      x: -direction.y,

      y: direction.x,
    };
  }

  function getOffsetPoint(point, normal, distance) {
    return {
      x: point.x + normal.x * distance,

      y: point.y + normal.y * distance,
    };
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
     SVG — VISIBILIDADE
     ======================================================= */

  function resetBodyDash() {
    const paths = [bodyDepthPath, bodyPath, bodyHighlightPath];

    paths.forEach((path) => {
      if (!path) {
        return;
      }

      path.style.strokeDasharray = "none";

      path.style.strokeDashoffset = "0";
    });
  }

  function setBodyVisibleLength(visibleLength, totalLength) {
    const hiddenLength = totalLength + 2;

    const dash = `${visibleLength} ${hiddenLength}`;

    const paths = [bodyDepthPath, bodyPath, bodyHighlightPath];

    paths.forEach((path) => {
      if (!path) {
        return;
      }

      path.style.strokeDasharray = dash;

      path.style.strokeDashoffset = "0";
    });
  }

  /* =======================================================
     CRESCIMENTO VISUAL
     ======================================================= */

  function getGrowthAmount(snakeLength) {
    return Math.max(0, snakeLength - initialSnakeLength);
  }

  function getVisualGrowthAmount(snake, previousSnake, progress) {
    const previousGrowth = getGrowthAmount(previousSnake.length);

    const currentGrowth = getGrowthAmount(snake.length);

    return lerp(previousGrowth, currentGrowth, progress);
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

    const previous = centerPoints[centerPoints.length - 1];

    /*
     * Se dois trechos da geometria
     * compartilham exatamente o mesmo
     * ponto, mantemos apenas um nó.
     */

    if (previous && isSamePoint(previous, point)) {
      previous.distance = Math.max(previous.distance, distance);

      return;
    }

    centerPoints.push({
      x: point.x,
      y: point.y,
      distance,
    });
  }

  /* =======================================================
     AMOSTRAGEM ESTRUTURAL
     ======================================================= */

  function buildStructuralTailPoints(pathGeometry, tailStart) {
    centerPoints.length = 0;

    const segments = pathGeometry?.segments ?? [];

    if (segments.length === 0) {
      return 0;
    }

    /*
     * O primeiro ponto é o único ponto
     * realmente "cortado" pela posição
     * dinâmica de tailStart.
     *
     * Todo o restante passa a vir da
     * própria estrutura do path.
     */

    const startPoint = sampleRoundedPathAtLength(pathGeometry, tailStart);

    pushCenterPoint(startPoint, tailStart);

    for (
      let segmentIndex = 0;
      segmentIndex < segments.length;
      segmentIndex += 1
    ) {
      const segment = segments[segmentIndex];

      /*
       * Segmentos completamente antes
       * do início da cauda não interessam.
       */

      if (segment.endLength <= tailStart + DISTANCE_EPSILON) {
        continue;
      }

      /* ===================================================
         RETA
         =================================================== */

      if (segment.type === "line") {
        /*
         * Para uma reta não precisamos
         * criar subdivisões artificiais.
         *
         * O ponto final pertence à
         * geometria real da cobra.
         */

        pushCenterPoint(segment.end, segment.endLength);

        continue;
      }

      /* ===================================================
         CURVA QUADRÁTICA
         =================================================== */

      if (segment.type === "quadratic") {
        const samples = segment.samples ?? [];

        /*
         * Estes samples já são criados
         * pelo próprio path.js para
         * representar a curva.
         *
         * Não inventamos uma nova grade.
         */

        for (
          let sampleIndex = 1;
          sampleIndex < samples.length;
          sampleIndex += 1
        ) {
          const sample = samples[sampleIndex];

          const globalDistance = segment.startLength + sample.length;

          /*
           * Samples anteriores ao tailStart
           * ficam fora da região Canvas.
           */

          if (globalDistance <= tailStart + DISTANCE_EPSILON) {
            continue;
          }

          pushCenterPoint(sample.point, globalDistance);
        }

        /*
         * Fallback defensivo:
         * garante que o endpoint real
         * da curva esteja presente.
         */

        pushCenterPoint(segment.end, segment.endLength);
      }
    }

    return centerPoints.length;
  }

  /* =======================================================
     LARGURAS E DIREÇÕES
     ======================================================= */

  function prepareTailGeometry(tailStart, tailLength, visualGrowth) {
    const pointCount = centerPoints.length;

    boundaryWidths.length = pointCount;

    segmentDirections.length = Math.max(0, pointCount - 1);

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
       * Invariante morfológico:
       *
       * indo do corpo para a ponta,
       * a largura jamais aumenta.
       */

      width = Math.min(previousWidth, width);

      boundaryWidths[index] = width;

      previousWidth = width;
    }

    for (let index = 0; index < pointCount - 1; index += 1) {
      const start = centerPoints[index];

      const end = centerPoints[index + 1];

      segmentDirections[index] = normalizeVector(
        end.x - start.x,
        end.y - start.y,
      );
    }
  }

  /* =======================================================
     SUPERFÍCIE — SEGMENTOS
     ======================================================= */

  function buildSurfaceSegments() {
    const segmentCount = centerPoints.length - 1;

    if (segmentCount <= 0) {
      return;
    }

    tailContext.beginPath();

    for (let index = 0; index < segmentCount; index += 1) {
      const direction = segmentDirections[index];

      if (!direction) {
        continue;
      }

      const start = centerPoints[index];

      const end = centerPoints[index + 1];

      const normal = getNormal(direction);

      const startRadius = boundaryWidths[index] / 2;

      const endRadius = boundaryWidths[index + 1] / 2;

      const startLeft = getOffsetPoint(start, normal, startRadius);

      const startRight = getOffsetPoint(start, normal, -startRadius);

      const endLeft = getOffsetPoint(end, normal, endRadius);

      const endRight = getOffsetPoint(end, normal, -endRadius);

      tailContext.moveTo(startLeft.x, startLeft.y);

      tailContext.lineTo(endLeft.x, endLeft.y);

      tailContext.lineTo(endRight.x, endRight.y);

      tailContext.lineTo(startRight.x, startRight.y);

      tailContext.closePath();
    }

    tailContext.fill();
  }

  /* =======================================================
     SUPERFÍCIE — CURVAS
     ======================================================= */

  function fillCurveJoints() {
    const segmentCount = centerPoints.length - 1;

    if (segmentCount <= 1) {
      return;
    }

    tailContext.beginPath();

    let hasJoint = false;

    for (let index = 1; index < segmentCount; index += 1) {
      const previousDirection = segmentDirections[index - 1];

      const nextDirection = segmentDirections[index];

      if (!previousDirection || !nextDirection) {
        continue;
      }

      const cross =
        previousDirection.x * nextDirection.y -
        previousDirection.y * nextDirection.x;

      /*
       * Retas continuam retas.
       *
       * Só existe preenchimento extra
       * onde há mudança real de direção.
       */

      if (Math.abs(cross) <= CURVE_JOIN_THRESHOLD) {
        continue;
      }

      const point = centerPoints[index];

      const radius = boundaryWidths[index] / 2;

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
    const pointCount = centerPoints.length;

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

    tailContext.clearRect(0, 0, GRID_SIZE, GRID_SIZE);

    if (centerPoints.length < 2) {
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

  function renderTail(snake, previousSnake, progress, pathGeometry) {
    if (!bodyPath || !tailCanvas || !tailContext) {
      return;
    }

    const visualGrowth = getVisualGrowthAmount(snake, previousSnake, progress);

    if (visualGrowth <= MIN_VISIBLE_GROWTH) {
      resetBodyDash();

      clearTailCanvas();

      return;
    }

    const totalLength = pathGeometry?.totalLength ?? 0;

    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      resetBodyDash();

      clearTailCanvas();

      return;
    }

    const tailLength = getTailLength(totalLength, visualGrowth);

    if (!Number.isFinite(tailLength) || tailLength <= 0) {
      resetBodyDash();

      clearTailCanvas();

      return;
    }

    const tailStart = Math.max(0, totalLength - tailLength);

    /*
     * SVG continua responsável pela
     * região anterior ao taper.
     */

    setBodyVisibleLength(tailStart, totalLength);

    /*
     * Mudança principal desta rodada:
     *
     * não existe mais segmentCount,
     * TARGET_TAIL_SEGMENT_LENGTH
     * ou index / segmentCount.
     */

    const pointCount = buildStructuralTailPoints(pathGeometry, tailStart);

    if (pointCount < 2) {
      clearTailCanvas();

      return;
    }

    prepareTailGeometry(tailStart, tailLength, visualGrowth);

    drawTailSurface();
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

    const pathData = pathGeometry.pathData;

    bodyDepthPath?.setAttribute("d", pathData);

    bodyPath.setAttribute("d", pathData);

    bodyHighlightPath?.setAttribute("d", pathData);

    renderTail(snake, previousSnake, progress, pathGeometry);
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