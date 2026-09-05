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

/* =========================================================
   CAUDA — RENDERER
   ========================================================= */

/*
 * A base usava:
 *
 * 32 segmentos para até 5.2 grids.
 *
 * Nesta versão podemos chegar a 40 segmentos, mas os
 * pontos compartilhados são reutilizados.
 *
 * Máximo:
 *
 * 41 fronteiras
 * 40 centros
 * =
 * 81 getPointAtLength()
 *
 * A base:
 *
 * 32 × 3 = 96
 */

const MAX_TAIL_SEGMENT_COUNT = 40;

const MIN_TAIL_SEGMENT_COUNT = 8;

const TARGET_TAIL_SEGMENT_LENGTH = 0.175;

const BODY_WIDTH = 0.92;

/* =========================================================
   DESENVOLVIMENTO MORFOLÓGICO
   ========================================================= */

/*
 * Número de crescimentos necessários para a morfologia
 * atingir aproximadamente o estado adulto.
 */

const MORPHOLOGY_GROWTH_TARGET = 7;

/*
 * No início praticamente não existe diferença entre
 * corpo e cauda.
 *
 * No estado adulto a ponta possui definição clara,
 * mas não chega ao aspecto de agulha.
 */

const YOUNG_END_WIDTH = BODY_WIDTH;

const ADULT_END_WIDTH = 0.34;

/*
 * Jovem:
 *
 * expoente alto -> a largura praticamente só muda
 * perto da extremidade.
 *
 * Adulta:
 *
 * expoente abaixo de 1 -> a perda de largura começa
 * muito antes.
 */

const YOUNG_TAPER_EXPONENT = 3.2;

const ADULT_TAPER_EXPONENT = 0.72;

/* =========================================================
   EXTENSÃO DA REGIÃO DA CAUDA
   ========================================================= */

/*
 * A cauda deixa de ser uma "peça final".
 *
 * Conforme a cobra cresce, uma parcela cada vez maior
 * do bodyPath participa do taper.
 */

const YOUNG_TAIL_BODY_RATIO = 0.16;

const ADULT_TAIL_BODY_RATIO = 0.68;

/*
 * Para manter a densidade geométrica próxima da base,
 * limitamos a região customizada.
 */

const MAX_TAIL_LENGTH = 7;

/* =========================================================
   ESTABILIDADE
   ========================================================= */

/*
 * Em progressos muito próximos de zero ainda usamos
 * exclusivamente o bodyPath original.
 *
 * Não é uma ativação morfológica perceptível:
 * a primeira forma customizada entra com praticamente
 * a mesma largura do corpo.
 */

const MIN_VISIBLE_DEVELOPMENT = 0.002;

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

  /*
   * Buffers fixos.
   *
   * Evitam criar arrays a cada frame.
   */

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

    /*
     * Todos os elementos são pré-criados.
     *
     * Nenhum SVG é criado ou destruído durante o jogo.
     */

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

    /*
     * Ordem original preservada.
     */

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

  function smoothstep(progress) {
    const normalized = clamp(progress, 0, 1);

    return normalized * normalized * (3 - 2 * normalized);
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

  function getDevelopment(visualGrowth) {
    const normalized = clamp(visualGrowth / MORPHOLOGY_GROWTH_TARGET, 0, 1);

    /*
     * smoothstep evita que cada novo crescimento altere
     * a anatomia de maneira linear e mecânica.
     */

    return smoothstep(normalized);
  }

  /* =======================================================
     REGIÃO MORFOLÓGICA
     ======================================================= */

  function getTailBodyRatio(development) {
    /*
     * Este é o comportamento pedido:
     *
     * a região de taper começa cada vez mais cedo
     * dentro do próprio corpo.
     */

    return lerp(YOUNG_TAIL_BODY_RATIO, ADULT_TAIL_BODY_RATIO, development);
  }

  function getTailLength(totalLength, development) {
    const ratio = getTailBodyRatio(development);

    const proportionalLength = totalLength * ratio;

    return Math.min(proportionalLength, MAX_TAIL_LENGTH);
  }

  /* =======================================================
     PERFIL
     ======================================================= */

  function getTailEndWidth(development) {
    /*
     * A ponta também amadurece progressivamente.
     */

    const shapedDevelopment = Math.pow(development, 0.82);

    return lerp(YOUNG_END_WIDTH, ADULT_END_WIDTH, shapedDevelopment);
  }

  function getTaperExponent(development) {
    /*
     * Jovem:
     * redução quase imperceptível.
     *
     * Adulta:
     * redução começa cedo.
     */

    return lerp(YOUNG_TAPER_EXPONENT, ADULT_TAPER_EXPONENT, development);
  }

  function getTailWidth(progress, development) {
    const normalized = clamp(progress, 0, 1);

    const exponent = getTaperExponent(development);

    const shapedProgress = Math.pow(normalized, exponent);

    /*
     * Não existe um ponto rígido onde o taper "liga".
     *
     * A derivação começa continuamente desde a raiz,
     * mas na cobra jovem ela é praticamente invisível.
     */

    const taperProgress = smoothstep(shapedProgress);

    return lerp(BODY_WIDTH, getTailEndWidth(development), taperProgress);
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

  function updateTailProfile(segmentCount, development) {
    /*
     * Fora dos frames de crescimento, development não muda.
     *
     * Portanto evitamos 40 writes de stroke-width a cada
     * frame normal de movimento.
     */

    const profileKey = `${segmentCount}:` + development.toFixed(4);

    if (profileKey === lastProfileKey) {
      return;
    }

    for (let index = 0; index < segmentCount; index += 1) {
      const progress = segmentCount > 1 ? index / (segmentCount - 1) : 1;

      const width = getTailWidth(progress, development);

      tailSegments[index].setAttribute("stroke-width", width);
    }

    lastProfileKey = profileKey;
  }

  /* =======================================================
     AMOSTRAGEM
     ======================================================= */

  function sampleTail(tailStart, tailLength, segmentCount) {
    /*
     * N + 1 fronteiras.
     */

    for (let index = 0; index <= segmentCount; index += 1) {
      const ratio = index / segmentCount;

      const sampleLength = tailStart + tailLength * ratio;

      boundaryPoints[index] = bodyPath.getPointAtLength(sampleLength);
    }

    /*
     * N centros.
     */

    for (let index = 0; index < segmentCount; index += 1) {
      const ratio = (index + 0.5) / segmentCount;

      const sampleLength = tailStart + tailLength * ratio;

      middlePoints[index] = bodyPath.getPointAtLength(sampleLength);
    }
  }

  /* =======================================================
     DESENHO
     ======================================================= */

  function drawTail(segmentCount) {
    /*
     * Técnica original:
     *
     * M start
     * L middle
     * L end
     *
     * Os round caps continuam sendo os mesmos do CSS.
     */

    for (let index = 0; index < segmentCount; index += 1) {
      const startPoint = boundaryPoints[index];

      const middlePoint = middlePoints[index];

      const endPoint = boundaryPoints[index + 1];

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

  function renderTail(snake, previousSnake, progress) {
    if (!bodyPath || !tailGroup || tailSegments.length === 0) {
      return;
    }

    /* -----------------------------------------------------
       DESENVOLVIMENTO
       ----------------------------------------------------- */

    const visualGrowth = getVisualGrowthAmount(snake, previousSnake, progress);

    const development = getDevelopment(visualGrowth);

    /*
     * No nascimento:
     *
     * bodyPath integral.
     * nenhuma cauda customizada.
     */

    if (development <= MIN_VISIBLE_DEVELOPMENT) {
      resetBodyDash();

      clearTail();

      return;
    }

    /* -----------------------------------------------------
       CENTERLINE
       ----------------------------------------------------- */

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

    /* -----------------------------------------------------
       REGIÃO DA CAUDA
       ----------------------------------------------------- */

    const tailLength = getTailLength(totalLength, development);

    if (!Number.isFinite(tailLength) || tailLength <= 0) {
      resetBodyDash();

      clearTail();

      return;
    }

    const tailStart = Math.max(0, totalLength - tailLength);

    /*
     * Este ponto se desloca continuamente para a frente
     * do corpo conforme development aumenta.
     */

    setBodyVisibleLength(tailStart, totalLength);

    /* -----------------------------------------------------
       RESOLUÇÃO
       ----------------------------------------------------- */

    const segmentCount = getTailSegmentCount(tailLength);

    updateTailProfile(segmentCount, development);

    /* -----------------------------------------------------
       RENDER
       ----------------------------------------------------- */

    sampleTail(tailStart, tailLength, segmentCount);

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

    const pathData = buildRoundedPathData(points);

    bodyDepthPath?.setAttribute("d", pathData);

    bodyPath.setAttribute("d", pathData);

    bodyHighlightPath?.setAttribute("d", pathData);

    renderTail(snake, previousSnake, progress);
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