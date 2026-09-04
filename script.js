"use strict";

const GRID_SIZE = 24;
const MOVE_INTERVAL = 180;

const MOUSE_POSITION = {
  x: 17,
  y: 8,
};

const MOUSE_SCARED_DISTANCE = 4;

const snakeLayer =
  document.querySelector(".snake-layer");

const mouseFood =
  document.querySelector(".mouse-food");

let snake = [
  { x: 12, y: 12 },
  { x: 11, y: 12 },
  { x: 10, y: 12 },
  { x: 9, y: 12 },
  { x: 8, y: 12 },
  { x: 7, y: 12 },
];

let previousSnake =
  snake.map((segment) => ({
    ...segment,
  }));

let direction = {
  x: 1,
  y: 0,
};

let queuedDirection = {
  x: 1,
  y: 0,
};

let directionQueued = false;

let lastMoveTime =
  performance.now();

const snakeElements = [];

/* =========================================================
   DIREÇÃO
   ========================================================= */

function getDirectionName(value) {
  if (value.x === 1) {
    return "right";
  }

  if (value.x === -1) {
    return "left";
  }

  if (value.y === -1) {
    return "up";
  }

  return "down";
}

function isSameDirection(
  candidate,
  current
) {
  return (
    candidate.x === current.x &&
    candidate.y === current.y
  );
}

function isOppositeDirection(
  candidate,
  current
) {
  return (
    candidate.x === -current.x &&
    candidate.y === -current.y
  );
}

function getTurnSide(
  current,
  next
) {
  const cross =
    current.x * next.y -
    current.y * next.x;

  return cross > 0
    ? "right"
    : "left";
}

/* =========================================================
   ROSTO DA COBRA
   ========================================================= */

function createFace() {
  const face =
    document.createElement("div");

  face.className =
    "snake-face";

  const leftEye =
    document.createElement("span");

  leftEye.className =
    "snake-eye snake-eye--left";

  const rightEye =
    document.createElement("span");

  rightEye.className =
    "snake-eye snake-eye--right";

  const mouth =
    document.createElement("span");

  mouth.className =
    "snake-mouth";

  face.append(
    leftEye,
    rightEye,
    mouth
  );

  return face;
}

/* =========================================================
   CRIAÇÃO DA COBRA
   ========================================================= */

function createSnake() {
  snake.forEach(
    (segment, index) => {
      const isHead =
        index === 0;

      const element =
        document.createElement("div");

      element.className =
        isHead
          ? "snake-part snake-head"
          : "snake-part snake-segment";

      const core =
        document.createElement("div");

      core.className =
        "snake-core";

      if (isHead) {
        core.appendChild(
          createFace()
        );
      }

      element.appendChild(
        core
      );

      snakeLayer.appendChild(
        element
      );

      snakeElements.push({
        element,
        core,
      });
    }
  );

  updateSegmentShapes();

  updateHeadDirection(
    direction
  );

  updateMouseState();

  renderSnake(0);
}

/* =========================================================
   FORMATO DO CORPO
   ========================================================= */

function getSegmentShape(index) {
  if (index === 0) {
    return direction.x !== 0
      ? "horizontal"
      : "vertical";
  }

  const current =
    snake[index];

  const previous =
    snake[index - 1];

  if (
    index ===
    snake.length - 1
  ) {
    return (
      previous.x !== current.x
        ? "horizontal"
        : "vertical"
    );
  }

  const next =
    snake[index + 1];

  const previousHorizontal =
    previous.x !== current.x;

  const nextHorizontal =
    next.x !== current.x;

  if (
    previousHorizontal !==
    nextHorizontal
  ) {
    return "corner";
  }

  return previousHorizontal
    ? "horizontal"
    : "vertical";
}

function updateSegmentShapes() {
  snake.forEach(
    (segment, index) => {
      const { core } =
        snakeElements[index];

      core.classList.remove(
        "is-horizontal",
        "is-vertical",
        "is-corner"
      );

      const shape =
        getSegmentShape(index);

      core.classList.add(
        `is-${shape}`
      );
    }
  );
}

/* =========================================================
   RENDERIZAÇÃO CONTÍNUA
   ========================================================= */

function lerp(
  start,
  end,
  progress
) {
  return (
    start +
    (end - start) * progress
  );
}

function renderSnake(progress) {
  snake.forEach(
    (segment, index) => {
      const previous =
        previousSnake[index];

      const visualX =
        lerp(
          previous.x,
          segment.x,
          progress
        );

      const visualY =
        lerp(
          previous.y,
          segment.y,
          progress
        );

      const { element } =
        snakeElements[index];

      element.style.setProperty(
        "--visual-x",
        visualX
      );

      element.style.setProperty(
        "--visual-y",
        visualY
      );
    }
  );
}

/* =========================================================
   DIREÇÃO DA CABEÇA
   ========================================================= */

function updateHeadDirection(
  nextDirection
) {
  const head =
    snakeElements[0]?.element;

  if (!head) {
    return;
  }

  head.dataset.direction =
    getDirectionName(
      nextDirection
    );
}

/* =========================================================
   ANIMAÇÃO DA CABEÇA
   ========================================================= */

function triggerHeadTurn(
  turnSide
) {
  const head =
    snakeElements[0]?.element;

  const headCore =
    snakeElements[0]?.core;

  if (
    !head ||
    !headCore
  ) {
    return;
  }

  head.dataset.turn =
    turnSide;

  headCore.classList.remove(
    "is-turning"
  );

  void headCore.offsetWidth;

  headCore.classList.add(
    "is-turning"
  );

  window.setTimeout(
    () => {
      headCore.classList.remove(
        "is-turning"
      );

      delete head.dataset.turn;
    },
    130
  );
}

/* =========================================================
   DISTÂNCIA ENTRE COBRA E RATO
   ========================================================= */

function getMouseDistance() {
  const head =
    snake[0];

  const horizontalDistance =
    Math.abs(
      head.x -
      MOUSE_POSITION.x
    );

  const verticalDistance =
    Math.abs(
      head.y -
      MOUSE_POSITION.y
    );

  return (
    horizontalDistance +
    verticalDistance
  );
}

/* =========================================================
   EXPRESSÃO DO RATO
   ========================================================= */

function setMouseExpression(
  expression
) {
  if (!mouseFood) {
    return;
  }

  mouseFood.classList.remove(
    "is-normal",
    "is-angry",
    "is-scared",
    "is-happy"
  );

  mouseFood.classList.add(
    `is-${expression}`
  );
}

function updateMouseState() {
  const distance =
    getMouseDistance();

  if (
    distance <=
    MOUSE_SCARED_DISTANCE
  ) {
    setMouseExpression(
      "scared"
    );

    return;
  }

  setMouseExpression(
    "angry"
  );
}

/* =========================================================
   MOVIMENTO LÓGICO
   ========================================================= */

function moveSnake() {
  previousSnake =
    snake.map(
      (segment) => ({
        ...segment,
      })
    );

  direction =
    queuedDirection;

  directionQueued =
    false;

  const head =
    snake[0];

  const newHead = {
    x:
      head.x +
      direction.x,

    y:
      head.y +
      direction.y,
  };

  for (
    let index =
      snake.length - 1;
    index > 0;
    index -= 1
  ) {
    snake[index] = {
      x:
        snake[index - 1].x,

      y:
        snake[index - 1].y,
    };
  }

  snake[0] =
    newHead;

  updateSegmentShapes();

  updateHeadDirection(
    direction
  );

  updateMouseState();
}

/* =========================================================
   GAME LOOP
   ========================================================= */

function gameLoop(timestamp) {
  while (
    timestamp - lastMoveTime >=
    MOVE_INTERVAL
  ) {
    moveSnake();

    lastMoveTime +=
      MOVE_INTERVAL;
  }

  const progress =
    Math.min(
      (timestamp - lastMoveTime) /
        MOVE_INTERVAL,
      1
    );

  renderSnake(
    progress
  );

  requestAnimationFrame(
    gameLoop
  );
}

/* =========================================================
   FILA DE DIREÇÃO
   ========================================================= */

function queueDirection(
  candidate
) {
  if (directionQueued) {
    return;
  }

  if (
    isSameDirection(
      candidate,
      direction
    )
  ) {
    return;
  }

  if (
    isOppositeDirection(
      candidate,
      direction
    )
  ) {
    return;
  }

  const turnSide =
    getTurnSide(
      direction,
      candidate
    );

  queuedDirection =
    candidate;

  directionQueued =
    true;

  updateHeadDirection(
    candidate
  );

  triggerHeadTurn(
    turnSide
  );
}

/* =========================================================
   CONTROLES
   ========================================================= */

function handleKeyDown(
  event
) {
  const directions = {
    ArrowUp: {
      x: 0,
      y: -1,
    },

    ArrowDown: {
      x: 0,
      y: 1,
    },

    ArrowLeft: {
      x: -1,
      y: 0,
    },

    ArrowRight: {
      x: 1,
      y: 0,
    },
  };

  const candidate =
    directions[event.key];

  if (!candidate) {
    return;
  }

  event.preventDefault();

  queueDirection(
    candidate
  );
}

document.addEventListener(
  "keydown",
  handleKeyDown
);

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

createSnake();

requestAnimationFrame(
  gameLoop
);