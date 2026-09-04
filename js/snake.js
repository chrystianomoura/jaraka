/* =========================================================
   JARAKA — SNAKE
   Renderização e comportamento visual da cobra
   ========================================================= */

export function createSnakeRenderer({ layer }) {
  const elements = [];

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
     CRIAÇÃO DOS ELEMENTOS
     ======================================================= */

  function create(snake, direction) {
    snake.forEach((segment, index) => {
      const isHead = index === 0;

      const element = document.createElement("div");

      element.className = isHead
        ? "snake-part snake-head"
        : "snake-part snake-segment";

      const core = document.createElement("div");

      core.className = "snake-core";

      if (isHead) {
        core.appendChild(createFace());
      }

      element.appendChild(core);

      layer.appendChild(element);

      elements.push({
        element,
        core,
      });
    });

    updateSegmentShapes(snake, direction);

    updateHeadDirection(direction);
  }

  /* =======================================================
     FORMATO DOS SEGMENTOS
     ======================================================= */

  function getSegmentShape(snake, direction, index) {
    if (index === 0) {
      return direction.x !== 0 ? "horizontal" : "vertical";
    }

    const current = snake[index];

    const previous = snake[index - 1];

    if (index === snake.length - 1) {
      return previous.x !== current.x ? "horizontal" : "vertical";
    }

    const next = snake[index + 1];

    const previousHorizontal = previous.x !== current.x;

    const nextHorizontal = next.x !== current.x;

    if (previousHorizontal !== nextHorizontal) {
      return "corner";
    }

    return previousHorizontal ? "horizontal" : "vertical";
  }

  function updateSegmentShapes(snake, direction) {
    snake.forEach((segment, index) => {
      const snakeElement = elements[index];

      if (!snakeElement) {
        return;
      }

      const { core } = snakeElement;

      core.classList.remove("is-horizontal", "is-vertical", "is-corner");

      const shape = getSegmentShape(snake, direction, index);

      core.classList.add(`is-${shape}`);
    });
  }

  /* =======================================================
     INTERPOLAÇÃO
     ======================================================= */

  function lerp(start, end, progress) {
    return start + (end - start) * progress;
  }

  /* =======================================================
     RENDERIZAÇÃO CONTÍNUA
     ======================================================= */

  function render(snake, previousSnake, progress) {
    snake.forEach((segment, index) => {
      const previous = previousSnake[index];

      const snakeElement = elements[index];

      if (!previous || !snakeElement) {
        return;
      }

      const visualX = lerp(previous.x, segment.x, progress);

      const visualY = lerp(previous.y, segment.y, progress);

      snakeElement.element.style.setProperty("--visual-x", visualX);

      snakeElement.element.style.setProperty("--visual-y", visualY);
    });
  }

  /* =======================================================
     DIREÇÃO DA CABEÇA
     ======================================================= */

  function updateHeadDirection(direction) {
    const head = elements[0]?.element;

    if (!head) {
      return;
    }

    head.dataset.direction = getDirectionName(direction);
  }

  /* =======================================================
     ANIMAÇÃO DE CURVA
     ======================================================= */

  function triggerHeadTurn(turnSide) {
    const head = elements[0]?.element;

    const headCore = elements[0]?.core;

    if (!head || !headCore) {
      return;
    }

    head.dataset.turn = turnSide;

    headCore.classList.remove("is-turning");

    void headCore.offsetWidth;

    headCore.classList.add("is-turning");

    window.setTimeout(() => {
      headCore.classList.remove("is-turning");

      delete head.dataset.turn;
    }, 130);
  }

  return {
    create,
    render,
    updateSegmentShapes,
    updateHeadDirection,
    triggerHeadTurn,
  };
}