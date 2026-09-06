/* =========================================================
   JARAKA — SNAKE
   Orquestrador do renderer da cobra

   Responsabilidades:
   - criação do SVG do corpo;
   - coordenação da renderização;
   - integração entre path, cabeça e alimentação;
   - desenvolvimento progressivo da cauda;
   - manutenção da API pública do renderer.

   Módulos:
   - ./snake/path.js
   - ./snake/head.js
   - ./snake/eating.js
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
   CAUDA — RENDERER
   ========================================================= */

const MAX_TAIL_SEGMENT_COUNT = 40;

const MIN_TAIL_SEGMENT_COUNT = 8;

const TARGET_TAIL_SEGMENT_LENGTH = 0.175;

const BODY_WIDTH = 0.92;

/* =========================================================
   MORFOLOGIA DA CAUDA
   ========================================================= */

const TAIL_LENGTH_PER_GROWTH = 1;

const TAIL_WIDTH_LOSS_PER_GROWTH = 0.08;

const MIN_TAIL_END_WIDTH = 0.28;

const MIN_VISIBLE_GROWTH = 0.002;

export function createSnakeRenderer({ layer }) {
  let bodySvg = null;

  let bodyDepthPath = null;

  let bodyPath = null;

  let bodyHighlightPath = null;

  let tailGroup = null;

  let tailSegments = [];

  let headElement = null;

  let headCore = null;

  let latestSnakeLength = 0;

  let initialSnakeLength = 0;

  let activeTailSegmentCount = 0;

  let lastProfileKey = "";

  const boundaryPoints = new Array(MAX_TAIL_SEGMENT_COUNT + 1);

  const middlePoints = new Array(MAX_TAIL_SEGMENT_COUNT);

  /* =======================================================
     PATH SVG
     ======================================================= */

  function createBodyPath(className) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");

    path.classList.add(className);

    path.setAttribute("fill", "none");

    return path;
  }

  /* =======================================================
     CAUDA — ESTRUTURA
     ======================================================= */

  function createTail() {
    const group = document.createElementNS(SVG_NAMESPACE, "g");

    group.classList.add("snake-tail");

    const segments = [];

    for (let index = 0; index < MAX_TAIL_SEGMENT_COUNT; index += 1) {
      const path = createBodyPath("snake-tail-segment");

      group.appendChild(path);

      segments.push(path);
    }

    return {
      group,
      segments,
    };
  }

  /* =======================================================
     CORPO SVG
     ======================================================= */

  function createBodySvg() {
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");

    svg.classList.add("snake-body-svg");

    svg.setAttribute("viewBox", `0 0 ${GRID_SIZE} ${GRID_SIZE}`);

    svg.setAttribute("preserveAspectRatio", "none");

    svg.setAttribute("aria-hidden", "true");

    const depthPath = createBodyPath("snake-body-depth");

    const mainPath = createBodyPath("snake-body-path");

    const highlightPath = createBodyPath("snake-body-highlight");

    const tail = createTail();

    svg.append(depthPath, mainPath, highlightPath, tail.group);

    layer.appendChild(svg);

    bodySvg = svg;

    bodyDepthPath = depthPath;

    bodyPath = mainPath;

    bodyHighlightPath = highlightPath;

    tailGroup = tail.group;

    tailSegments = tail.segments;

    activeTailSegmentCount = 0;

    lastProfileKey = "";
  }

  /* =======================================================
     CRIAÇÃO
     ======================================================= */

  function create(snake, direction) {
    layer.replaceChildren();

    initialSnakeLength = snake.length;

    createBodySvg();

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

  function clearTail() {
    for (let index = 0; index < activeTailSegmentCount; index += 1) {
      tailSegments[index]?.setAttribute("d", "");
    }

    activeTailSegmentCount = 0;

    lastProfileKey = "";
  }

  function clearUnusedTailSegments(fromIndex) {
    for (let index = fromIndex; index < activeTailSegmentCount; index += 1) {
      tailSegments[index]?.setAttribute("d", "");
    }
  }

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

    const dash = `${visibleLength} ` + `${hiddenLength}`;

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
     COMPRIMENTO DA REGIÃO DA CAUDA
     ======================================================= */

  function getTailLength(totalLength, visualGrowth) {
    return Math.min(totalLength, visualGrowth * TAIL_LENGTH_PER_GROWTH);
  }

  /* =======================================================
     LARGURA FINAL
     ======================================================= */

  function getTailEndWidth(visualGrowth) {
    return Math.max(
      MIN_TAIL_END_WIDTH,
      BODY_WIDTH - visualGrowth * TAIL_WIDTH_LOSS_PER_GROWTH,
    );
  }

  /* =======================================================
     PERFIL DE LARGURA
     ======================================================= */

  function getTailWidth(progress, visualGrowth) {
    const normalized = clamp(progress, 0, 1);

    const taperProgress = normalized * normalized * (2 - normalized);

    return lerp(BODY_WIDTH, getTailEndWidth(visualGrowth), taperProgress);
  }

  /* =======================================================
     RESOLUÇÃO
     ======================================================= */

  function getTailSegmentCount(tailLength) {
    const proportionalCount = Math.ceil(
      tailLength / TARGET_TAIL_SEGMENT_LENGTH,
    );

    return clamp(
      proportionalCount,
      MIN_TAIL_SEGMENT_COUNT,
      MAX_TAIL_SEGMENT_COUNT,
    );
  }

  /* =======================================================
     PERFIL DOS SEGMENTOS
     ======================================================= */

  function updateTailProfile(segmentCount, visualGrowth) {
    const profileKey = `${segmentCount}:` + visualGrowth.toFixed(4);

    if (profileKey === lastProfileKey) {
      return;
    }

    let previousWidth = BODY_WIDTH;

    for (let index = 0; index < segmentCount; index += 1) {
      const progress = segmentCount > 1 ? index / (segmentCount - 1) : 1;

      const calculatedWidth = getTailWidth(progress, visualGrowth);

      const width = Math.min(previousWidth, calculatedWidth);

      tailSegments[index].setAttribute("stroke-width", width);

      previousWidth = width;
    }

    lastProfileKey = profileKey;
  }

  /* =======================================================
     AMOSTRAGEM
     ======================================================= */

  function sampleTail(pathGeometry, tailStart, tailLength, segmentCount) {
    /*
     * Nenhuma consulta ao SVG.
     *
     * Tudo vem da centerline matemática
     * construída em path.js.
     */

    for (let index = 0; index <= segmentCount; index += 1) {
      const ratio = index / segmentCount;

      const sampleLength = tailStart + tailLength * ratio;

      boundaryPoints[index] = sampleRoundedPathAtLength(
        pathGeometry,
        sampleLength,
      );
    }

    for (let index = 0; index < segmentCount; index += 1) {
      const ratio = (index + 0.5) / segmentCount;

      const sampleLength = tailStart + tailLength * ratio;

      middlePoints[index] = sampleRoundedPathAtLength(
        pathGeometry,
        sampleLength,
      );
    }
  }

  /* =======================================================
     DESENHO
     ======================================================= */

  function drawTail(segmentCount) {
    for (let index = 0; index < segmentCount; index += 1) {
      const startPoint = boundaryPoints[index];

      const middlePoint = middlePoints[index];

      const endPoint = boundaryPoints[index + 1];

      if (!startPoint || !middlePoint || !endPoint) {
        tailSegments[index].setAttribute("d", "");

        continue;
      }

      tailSegments[index].setAttribute(
        "d",
        `M ${startPoint.x} ${startPoint.y} ` +
          `L ${middlePoint.x} ${middlePoint.y} ` +
          `L ${endPoint.x} ${endPoint.y}`,
      );
    }

    if (segmentCount < activeTailSegmentCount) {
      clearUnusedTailSegments(segmentCount);
    }

    activeTailSegmentCount = segmentCount;
  }

  /* =======================================================
     CAUDA
     ======================================================= */

  function renderTail(snake, previousSnake, progress, pathGeometry) {
    if (!bodyPath || !tailGroup || tailSegments.length === 0) {
      return;
    }

    const visualGrowth = getVisualGrowthAmount(snake, previousSnake, progress);

    if (visualGrowth <= MIN_VISIBLE_GROWTH) {
      resetBodyDash();

      clearTail();

      return;
    }

    const totalLength = pathGeometry?.totalLength ?? 0;

    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      resetBodyDash();

      clearTail();

      return;
    }

    const tailLength = getTailLength(totalLength, visualGrowth);

    if (!Number.isFinite(tailLength) || tailLength <= 0) {
      resetBodyDash();

      clearTail();

      return;
    }

    const tailStart = Math.max(0, totalLength - tailLength);

    setBodyVisibleLength(tailStart, totalLength);

    const segmentCount = getTailSegmentCount(tailLength);

    updateTailProfile(segmentCount, visualGrowth);

    sampleTail(pathGeometry, tailStart, tailLength, segmentCount);

    drawTail(segmentCount);
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