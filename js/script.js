"use strict";

import { createInputController } from "./input.js";
import { createMouseController } from "./mouse.js";
import { createSnakeRenderer } from "./snake.js";

const GRID_SIZE = 24;
const MOVE_INTERVAL = 180;

const MOUSE_POSITION = {
  x: 17,
  y: 8,
};

const snakeLayer = document.querySelector(".snake-layer");

const mouseFood = document.querySelector(".mouse-food");

let snake = [
  { x: 12, y: 12 },
  { x: 11, y: 12 },
  { x: 10, y: 12 },
  { x: 9, y: 12 },
  { x: 8, y: 12 },
  { x: 7, y: 12 },
];

let previousSnake = snake.map((segment) => ({
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

let lastMoveTime = performance.now();

/* =========================================================
   CONTROLLERS
   ========================================================= */

const snakeRenderer = createSnakeRenderer({
  layer: snakeLayer,
});

const mouseController = createMouseController({
  element: mouseFood,
  position: MOUSE_POSITION,
});

/* =========================================================
   DIREÇÃO
   ========================================================= */

function isSameDirection(candidate, current) {
  return candidate.x === current.x && candidate.y === current.y;
}

function isOppositeDirection(candidate, current) {
  return candidate.x === -current.x && candidate.y === -current.y;
}

function getTurnSide(current, next) {
  const cross = current.x * next.y - current.y * next.x;

  return cross > 0 ? "right" : "left";
}

/* =========================================================
   MOVIMENTO LÓGICO
   ========================================================= */

function moveSnake() {
  previousSnake = snake.map((segment) => ({
    ...segment,
  }));

  direction = queuedDirection;

  inputController.unlock();

  const head = snake[0];

  const newHead = {
    x: head.x + direction.x,

    y: head.y + direction.y,
  };

  for (let index = snake.length - 1; index > 0; index -= 1) {
    snake[index] = {
      x: snake[index - 1].x,

      y: snake[index - 1].y,
    };
  }

  snake[0] = newHead;

  snakeRenderer.updateSegmentShapes(snake, direction);

  snakeRenderer.updateHeadDirection(direction);

  mouseController.update(snake[0]);
}

/* =========================================================
   GAME LOOP
   ========================================================= */

function gameLoop(timestamp) {
  while (timestamp - lastMoveTime >= MOVE_INTERVAL) {
    moveSnake();

    lastMoveTime += MOVE_INTERVAL;
  }

  const progress = Math.min((timestamp - lastMoveTime) / MOVE_INTERVAL, 1);

  snakeRenderer.render(snake, previousSnake, progress);

  requestAnimationFrame(gameLoop);
}

/* =========================================================
   FILA DE DIREÇÃO
   ========================================================= */

function queueDirection(candidate) {
  if (isSameDirection(candidate, direction)) {
    return false;
  }

  if (isOppositeDirection(candidate, direction)) {
    return false;
  }

  const turnSide = getTurnSide(direction, candidate);

  queuedDirection = candidate;

  snakeRenderer.updateHeadDirection(candidate);

  snakeRenderer.triggerHeadTurn(turnSide);

  return true;
}

/* =========================================================
   INPUT
   ========================================================= */

function handleDirectionChange(candidate) {
  const accepted = queueDirection(candidate);

  if (!accepted) {
    inputController.unlock();
  }
}

const inputController = createInputController({
  getDirection: () => direction,

  onDirectionChange: handleDirectionChange,
});

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

snakeRenderer.create(snake, direction);

mouseController.update(snake[0]);

snakeRenderer.render(snake, previousSnake, 0);

inputController.start();

requestAnimationFrame(gameLoop);