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
   * Os objetos de centerPoints também são
   * reaproveitados entre frames para reduzir
   * alocações temporárias e pressão sobre o GC.
   */

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

    bodyDashMode = null;

    centerPointCount = 0;

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
    if (bodyDashMode === "none") {
      return;
    }

    bodyDashMode = "none";

    bodyPath.style.strokeDasharray = "none";

    bodyPath.style.strokeDashoffset = "0";
  }

  function setBodyVisibleLength(visibleLength, totalLength) {
    const hiddenLength = totalLength + 2;

    bodyDashMode = "tail";

    bodyPath.style.strokeDasharray = `${visibleLength} ${hiddenLength}`;
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

    const previous =
      centerPointCount > 0 ? centerPoints[centerPointCount - 1] : null;

    /*
     * Se dois trechos da geometria
     * compartilham exatamente o mesmo
     * ponto, mantemos apenas um nó.
     */

    if (previous && isSamePoint(previous, point)) {
      previous.distance = Math.max(previous.distance, distance);

      return;
    }

    let target = centerPoints[centerPointCount];

    /*
     * O objeto é criado apenas quando
     * o buffer precisa crescer.
     *
     * Nos frames seguintes ele é
     * simplesmente sobrescrito.
     */

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
     * O primeiro ponto continua sendo
     * o único ponto realmente cortado
     * pela posição dinâmica do taper.
     *
     * Todo o restante permanece preso
     * à topologia estrutural do path.
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

          pushCenterPoint(sample.point, globalDistance);
        }

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
       * Invariante morfológico:
       *
       * indo do corpo para a ponta,
       * a largura jamais aumenta.
       */

      width = Math.min(previousWidth, width);

      boundaryWidths[index] = width;

      previousWidth = width;
    }

    /*
     * As direções deixam de ser objetos
     * { x, y }.
     *
     * X e Y ficam em buffers numéricos
     * independentes, evitando uma nova
     * alocação para cada segmento.
     */

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

      /*
       * Normal calculada diretamente.
       *
       * Não existe mais criação de
       * { x, y } para normal ou offsets.
       */

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
     SUPERFÍCIE — CURVAS
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

    tailContext.clearRect(0, 0, GRID_SIZE, GRID_SIZE);

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
     * SVG continua responsável
     * pela região anterior ao taper.
     */

    setBodyVisibleLength(tailStart, totalLength);

    /*
     * A estabilidade continua vindo
     * da amostragem estrutural.
     *
     * Não voltamos a distribuir
     * pontos proporcionalmente pelo
     * comprimento da cauda.
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

    /*
     * Somente o path realmente visível
     * recebe atualização de "d".
     *
     * depth/highlight permanecem criados
     * por compatibilidade estrutural com
     * eating.js e CSS, mas têm stroke:none.
     */

    bodyPath.setAttribute("d", pathGeometry.pathData);

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
