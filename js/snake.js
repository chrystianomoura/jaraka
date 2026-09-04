/* =========================================================
   JARAKA — SNAKE
   Orquestrador do renderer da cobra

   Responsabilidades:
   - criação do SVG do corpo;
   - coordenação da renderização;
   - integração entre path, cabeça e alimentação;
   - cauda visual proporcional;
   - manutenção da API pública do renderer.

   Módulos:
   - ./snake/path.js
   - ./snake/head.js
   - ./snake/eating.js
   ========================================================= */

import {
  getVisualHead,
  buildBodyPoints,
  simplifyOrthogonalPoints,
  buildRoundedPathData,
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

const GRID_SIZE = 16;

/* =========================================================
   CAUDA
   ========================================================= */

const TAIL_LENGTH_RATIO = 0.38;

const MIN_TAIL_LENGTH = 1.8;

const MAX_TAIL_LENGTH = 5.2;

const TAIL_SEGMENT_COUNT = 32;

const BODY_WIDTH = 0.92;

const TAIL_END_WIDTH = 0.28;

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

    for (let index = 0; index < TAIL_SEGMENT_COUNT; index += 1) {
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
  }

  /* =======================================================
     CRIAÇÃO
     ======================================================= */

  function create(snake, direction) {
    layer.replaceChildren();

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
    tailSegments.forEach((segment) => {
      segment.setAttribute("d", "");
    });
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
     COMPRIMENTO DA CAUDA
     ======================================================= */

  function getTailLength(totalLength) {
    const proportionalLength = totalLength * TAIL_LENGTH_RATIO;

    const maximumAllowed = Math.min(MAX_TAIL_LENGTH, totalLength * 0.55);

    const minimumAllowed = Math.min(MIN_TAIL_LENGTH, maximumAllowed);

    return clamp(proportionalLength, minimumAllowed, maximumAllowed);
  }

  /* =======================================================
     CAUDA AFUNILADA
     ======================================================= */

  function renderTail() {
    if (!bodyPath || !tailGroup || tailSegments.length === 0) {
      return;
    }

    let totalLength = 0;

    try {
      totalLength = bodyPath.getTotalLength();
    } catch {
      resetBodyDash();

      clearTail();

      return;
    }

    if (!Number.isFinite(totalLength) || totalLength <= 0) {
      resetBodyDash();

      clearTail();

      return;
    }

    const tailLength = getTailLength(totalLength);

    if (!Number.isFinite(tailLength) || tailLength <= 0) {
      resetBodyDash();

      clearTail();

      return;
    }

    const tailStart = Math.max(0, totalLength - tailLength);

    setBodyVisibleLength(tailStart, totalLength);

    for (let index = 0; index < tailSegments.length; index += 1) {
      const segment = tailSegments[index];

      const startRatio = index / tailSegments.length;

      const endRatio = (index + 1) / tailSegments.length;

      const middleRatio = (startRatio + endRatio) / 2;

      const startLength = tailStart + tailLength * startRatio;

      const middleLength = tailStart + tailLength * middleRatio;

      const endLength = tailStart + tailLength * endRatio;

      const startPoint = bodyPath.getPointAtLength(startLength);

      const middlePoint = bodyPath.getPointAtLength(middleLength);

      const endPoint = bodyPath.getPointAtLength(endLength);

      segment.setAttribute(
        "d",
        `M ${startPoint.x} ${startPoint.y} ` +
          `L ${middlePoint.x} ${middlePoint.y} ` +
          `L ${endPoint.x} ${endPoint.y}`,
      );

      const progress = (index + 0.5) / tailSegments.length;

      const taperProgress = Math.pow(progress, 1.55);

      const width = lerp(BODY_WIDTH, TAIL_END_WIDTH, taperProgress);

      segment.setAttribute("stroke-width", width);
    }
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

    const pathData = buildRoundedPathData(points);

    bodyDepthPath?.setAttribute("d", pathData);

    bodyPath.setAttribute("d", pathData);

    bodyHighlightPath?.setAttribute("d", pathData);

    renderTail();
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