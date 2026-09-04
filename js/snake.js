/* =========================================================
   JARAKA — SNAKE
   Movimento contínuo sobre grid
   ========================================================= */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const GRID_SIZE = 24;

const CORNER_RADIUS = 0.18;

export function createSnakeRenderer({ layer }) {
  let bodySvg = null;

  let bodyPath = null;

  let headElement = null;

  let headCore = null;

  let latestSnakeLength = 0;

  /* =======================================================
     DIREÇÃO
     ======================================================= */

  function getDirectionName(direction) {
    if (direction.x === 1) {
      return "right";
    }

    if (direction.x === -1) {
      return "left";
    }

    if (direction.y === -1) {
      return "up";
    }

    return "down";
  }

  /* =======================================================
     UTILITÁRIOS
     ======================================================= */

  function lerp(start, end, progress) {
    return start + (end - start) * progress;
  }

  function isSamePoint(first, second) {
    return (
      Math.abs(first.x - second.x) < 0.0001 &&
      Math.abs(first.y - second.y) < 0.0001
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

  /* =======================================================
     ROSTO
     ======================================================= */

  function createFace() {
    const face = document.createElement("div");

    face.className = "snake-face";

    const leftEye = document.createElement("span");

    leftEye.className = "snake-eye snake-eye--left";

    const rightEye = document.createElement("span");

    rightEye.className = "snake-eye snake-eye--right";

    const mouth = document.createElement("span");

    mouth.className = "snake-mouth";

    face.append(leftEye, rightEye, mouth);

    return face;
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

    const path = document.createElementNS(SVG_NAMESPACE, "path");

    path.classList.add("snake-body-path");

    svg.appendChild(path);

    layer.appendChild(svg);

    bodySvg = svg;

    bodyPath = path;
  }

  /* =======================================================
     CABEÇA
     ======================================================= */

  function createHead() {
    const element = document.createElement("div");

    element.className = "snake-part snake-head";

    const core = document.createElement("div");

    core.className = "snake-core";

    core.appendChild(createFace());

    element.appendChild(core);

    layer.appendChild(element);

    headElement = element;

    headCore = core;
  }

  /* =======================================================
     CRIAÇÃO
     ======================================================= */

  function create(snake, direction) {
    layer.replaceChildren();

    createBodySvg();

    createHead();

    latestSnakeLength = snake.length;

    updateSegmentShapes(snake, direction);

    updateHeadDirection(direction);
  }

  /* =======================================================
     POSIÇÃO VISUAL DA CABEÇA
     ======================================================= */

  function getVisualHead(snake, previousSnake, progress) {
    const currentHead = snake[0];

    const previousHead = previousSnake[0] ?? currentHead;

    return {
      x: lerp(previousHead.x, currentHead.x, progress),
      y: lerp(previousHead.y, currentHead.y, progress),
    };
  }

  /* =======================================================
     POSIÇÃO VISUAL DA CAUDA
     ======================================================= */

  function getVisualTail(snake, previousSnake, progress) {
    const currentTail = snake[snake.length - 1];

    const previousTail =
      previousSnake[previousSnake.length - 1] ?? currentTail;

    return {
      x: lerp(previousTail.x, currentTail.x, progress),
      y: lerp(previousTail.y, currentTail.y, progress),
    };
  }

  /* =======================================================
     PONTOS DO CORPO
     ======================================================= */

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

  function buildBodyPoints(snake, previousSnake, progress) {
    if (snake.length === 0) {
      return [];
    }

    const points = [];

    /*
     * A trajetória começa exatamente no centro
     * visual da cabeça.
     */

    const visualHead = getVisualHead(
      snake,
      previousSnake,
      progress,
    );

    points.push(toCenter(visualHead));

    /*
     * Os segmentos intermediários continuam
     * exatamente nas posições lógicas do grid.
     */

    for (let index = 1; index < snake.length; index += 1) {
      points.push(toCenter(snake[index]));
    }

    /*
     * A extremidade da cauda também é interpolada.
     *
     * Isso mantém o comprimento visual contínuo
     * durante todo o intervalo entre dois ticks.
     */

    if (snake.length > 1) {
      const visualTail = getVisualTail(
        snake,
        previousSnake,
        progress,
      );

      points.push(toCenter(visualTail));
    }

    return removeDuplicatePoints(points);
  }

  /* =======================================================
     SIMPLIFICAÇÃO DA TRAJETÓRIA
     ======================================================= */

  function simplifyOrthogonalPoints(points) {
    if (points.length <= 2) {
      return points;
    }

    const simplified = [points[0]];

    for (
      let index = 1;
      index < points.length - 1;
      index += 1
    ) {
      const previous =
        simplified[simplified.length - 1];

      const current = points[index];

      const next = points[index + 1];

      const sameHorizontal =
        Math.abs(previous.y - current.y) < 0.0001 &&
        Math.abs(current.y - next.y) < 0.0001;

      const sameVertical =
        Math.abs(previous.x - current.x) < 0.0001 &&
        Math.abs(current.x - next.x) < 0.0001;

      /*
       * Pontos intermediários de uma reta não
       * precisam existir no path.
       *
       * Mantemos somente mudanças reais de direção.
       */

      if (!sameHorizontal && !sameVertical) {
        simplified.push(current);
      }
    }

    simplified.push(points[points.length - 1]);

    return simplified;
  }

  /* =======================================================
     GEOMETRIA DAS CURVAS
     ======================================================= */

  function getCornerGeometry(previous, current, next) {
    const incomingLength = getDistance(
      previous,
      current,
    );

    const outgoingLength = getDistance(
      current,
      next,
    );

    const radius = Math.min(
      CORNER_RADIUS,
      incomingLength * 0.32,
      outgoingLength * 0.32,
    );

    const incomingX = current.x - previous.x;

    const incomingY = current.y - previous.y;

    const outgoingX = next.x - current.x;

    const outgoingY = next.y - current.y;

    const incomingMagnitude = Math.hypot(
      incomingX,
      incomingY,
    );

    const outgoingMagnitude = Math.hypot(
      outgoingX,
      outgoingY,
    );

    if (
      incomingMagnitude === 0 ||
      outgoingMagnitude === 0
    ) {
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

      corner: current,

      exit: {
        x: current.x + outgoingUnit.x * radius,
        y: current.y + outgoingUnit.y * radius,
      },
    };
  }

  /* =======================================================
     CONSTRUÇÃO DO PATH
     ======================================================= */

  function buildRoundedPathData(points) {
    if (points.length === 0) {
      return "";
    }

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    let data = `M ${points[0].x} ${points[0].y}`;

    for (
      let index = 1;
      index < points.length - 1;
      index += 1
    ) {
      const previous = points[index - 1];

      const current = points[index];

      const next = points[index + 1];

      const incomingHorizontal =
        Math.abs(previous.y - current.y) < 0.0001;

      const outgoingHorizontal =
        Math.abs(current.y - next.y) < 0.0001;

      /*
       * Se a direção não mudou,
       * seguimos em linha reta.
       */

      if (
        incomingHorizontal === outgoingHorizontal
      ) {
        data += ` L ${current.x} ${current.y}`;

        continue;
      }

      /*
       * Mudança real de eixo:
       * arredondamos discretamente a curva.
       */

      const geometry = getCornerGeometry(
        previous,
        current,
        next,
      );

      if (!geometry) {
        data += ` L ${current.x} ${current.y}`;

        continue;
      }

      data +=
        ` L ${geometry.entry.x}` +
        ` ${geometry.entry.y}`;

      data +=
        ` Q ${geometry.corner.x}` +
        ` ${geometry.corner.y}` +
        ` ${geometry.exit.x}` +
        ` ${geometry.exit.y}`;
    }

    const lastPoint = points[points.length - 1];

    data += ` L ${lastPoint.x} ${lastPoint.y}`;

    return data;
  }

  /* =======================================================
     FORMATO DA CABEÇA
     ======================================================= */

  function updateSegmentShapes(snake, direction) {
    latestSnakeLength = snake.length;

    if (!headCore) {
      return;
    }

    headCore.classList.remove(
      "is-horizontal",
      "is-vertical",
      "is-corner",
      "corner-up-right",
      "corner-right-down",
      "corner-down-left",
      "corner-left-up",
    );

    headCore.classList.add(
      direction.x !== 0
        ? "is-horizontal"
        : "is-vertical",
    );
  }

  /* =======================================================
     RENDERIZAÇÃO
     ======================================================= */

  function render(
    snake,
    previousSnake,
    progress,
  ) {
    if (!headElement || !bodyPath) {
      return;
    }

    latestSnakeLength = snake.length;

    /*
     * Cabeça:
     * continua interpolando suavemente entre
     * a posição anterior e a posição atual.
     */

    const visualHead = getVisualHead(
      snake,
      previousSnake,
      progress,
    );

    headElement.style.setProperty(
      "--visual-x",
      visualHead.x,
    );

    headElement.style.setProperty(
      "--visual-y",
      visualHead.y,
    );

    /*
     * Corpo:
     * agora é uma única trajetória contínua.
     */

    const rawPoints = buildBodyPoints(
      snake,
      previousSnake,
      progress,
    );

    const points =
      simplifyOrthogonalPoints(rawPoints);

    const pathData =
      buildRoundedPathData(points);

    bodyPath.setAttribute("d", pathData);
  }

  /* =======================================================
     DIREÇÃO DA CABEÇA
     ======================================================= */

  function updateHeadDirection(direction) {
    if (!headElement) {
      return;
    }

    headElement.dataset.direction =
      getDirectionName(direction);
  }

  /* =======================================================
     CURVA DA CABEÇA
     ======================================================= */

  function triggerHeadTurn(turnSide) {
    if (!headElement || !headCore) {
      return;
    }

    headElement.dataset.turn = turnSide;

    headCore.classList.remove("is-turning");

    void headCore.offsetWidth;

    headCore.classList.add("is-turning");

    window.setTimeout(() => {
      if (!headCore || !headElement) {
        return;
      }

      headCore.classList.remove("is-turning");

      delete headElement.dataset.turn;
    }, 130);
  }

  /* =======================================================
     ESTADOS DO ROSTO
     ======================================================= */

  function clearEatingFaceStates() {
    if (!headElement) {
      return;
    }

    headElement.classList.remove(
      "is-biting",
      "is-bite-closing",
      "is-chewing",
    );
  }

  /* =======================================================
     MORDIDA
     ======================================================= */

  function triggerBite() {
    if (!headElement) {
      return;
    }

    clearEatingFaceStates();

    void headElement.offsetWidth;

    headElement.classList.add("is-biting");
  }

  function triggerBiteClose() {
    if (!headElement) {
      return;
    }

    headElement.classList.add(
      "is-bite-closing",
    );
  }

  /* =======================================================
     MASTIGAÇÃO
     ======================================================= */

  function triggerChew() {
    if (!headElement) {
      return;
    }

    headElement.classList.remove(
      "is-biting",
      "is-bite-closing",
      "is-chewing",
    );

    void headElement.offsetWidth;

    headElement.classList.add("is-chewing");
  }

  function finishChew() {
    if (!headElement) {
      return;
    }

    headElement.classList.remove("is-chewing");
  }

  function finishBite() {
    clearEatingFaceStates();
  }

  /* =======================================================
     POSIÇÃO SOBRE O CORPO
     ======================================================= */

  function getBodyPointAtRatio(ratio) {
    if (!bodyPath) {
      return null;
    }

    let totalLength = 0;

    try {
      totalLength = bodyPath.getTotalLength();
    } catch {
      return null;
    }

    if (
      !Number.isFinite(totalLength) ||
      totalLength <= 0
    ) {
      return null;
    }

    const safeRatio = Math.max(
      0,
      Math.min(ratio, 1),
    );

    const point = bodyPath.getPointAtLength(
      totalLength * safeRatio,
    );

    return {
      x: point.x,
      y: point.y,
    };
  }

  /* =======================================================
     DEGLUTIÇÃO — ELEMENTO
     ======================================================= */

  function createSwallowBulge() {
    if (!bodySvg) {
      return null;
    }

    const bulge = document.createElementNS(
      SVG_NAMESPACE,
      "circle",
    );

    bulge.classList.add(
      "snake-swallow-bulge",
    );

    bulge.setAttribute("r", "0.55");

    bodySvg.appendChild(bulge);

    return bulge;
  }

  /* =======================================================
     DEGLUTIÇÃO — SEGMENTO
     ======================================================= */

  function triggerSwallowSegment(index) {
    const bodyCount = Math.max(
      1,
      latestSnakeLength - 1,
    );

    const ratio = Math.max(
      0,
      Math.min(index / bodyCount, 1),
    );

    const point =
      getBodyPointAtRatio(ratio);

    if (!point) {
      return;
    }

    const bulge = createSwallowBulge();

    if (!bulge) {
      return;
    }

    bulge.setAttribute("cx", point.x);

    bulge.setAttribute("cy", point.y);

    bulge.classList.add("is-pulsing");

    window.setTimeout(() => {
      bulge.remove();
    }, 260);
  }

  /* =======================================================
     DEGLUTIÇÃO — ONDA
     ======================================================= */

  function triggerSwallowWave({
    segmentDelay = 92,
    onComplete,
  } = {}) {
    const bodyCount = Math.max(
      1,
      latestSnakeLength - 1,
    );

    const duration = Math.max(
      420,
      bodyCount * segmentDelay + 245,
    );

    const bulge = createSwallowBulge();

    if (!bulge) {
      onComplete?.();

      return;
    }

    const startedAt = performance.now();

    function animate(timestamp) {
      if (!bulge.isConnected) {
        return;
      }

      const progress = Math.min(
        (timestamp - startedAt) / duration,
        1,
      );

      const ratio =
        0.04 + progress * 0.96;

      const point =
        getBodyPointAtRatio(ratio);

      if (point) {
        bulge.setAttribute("cx", point.x);

        bulge.setAttribute("cy", point.y);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);

        return;
      }

      bulge.remove();

      onComplete?.();
    }

    requestAnimationFrame(animate);
  }

  /* =======================================================
     CRESCIMENTO
     ======================================================= */

  function triggerGrowthArrival() {
    if (!bodySvg) {
      return;
    }

    const point = getBodyPointAtRatio(1);

    if (!point) {
      return;
    }

    const arrival = document.createElementNS(
      SVG_NAMESPACE,
      "circle",
    );

    arrival.classList.add(
      "snake-growth-arrival",
    );

    arrival.setAttribute("cx", point.x);

    arrival.setAttribute("cy", point.y);

    arrival.setAttribute("r", "0.45");

    bodySvg.appendChild(arrival);

    window.setTimeout(() => {
      arrival.remove();
    }, 300);
  }

  /* =======================================================
     SEQUÊNCIA DE ALIMENTAÇÃO
     ======================================================= */

  function triggerEatingSequence({
    onMouseEnter,
    onSwallowComplete,
  } = {}) {
    /*
     * 0 ms
     * Abre a boca.
     */

    triggerBite();

    /*
     * 115 ms
     * Rato entra.
     */

    window.setTimeout(() => {
      onMouseEnter?.();
    }, 115);

    /*
     * 300 ms
     * Fecha a boca.
     */

    window.setTimeout(() => {
      triggerBiteClose();
    }, 300);

    /*
     * 360 ms
     * O volume começa a percorrer o path.
     */

    window.setTimeout(() => {
      triggerSwallowWave({
        segmentDelay: 92,

        onComplete: () => {
          onSwallowComplete?.();
        },
      });
    }, 360);

    /*
     * 440 ms
     * Mastigação.
     */

    window.setTimeout(() => {
      triggerChew();
    }, 440);

    /*
     * 1340 ms
     * Expressão normal.
     */

    window.setTimeout(() => {
      finishChew();
    }, 1340);
  }

  /* =======================================================
     API
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