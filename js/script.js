"use strict";

import { createInputController } from "./input.js";
import { createMouseController } from "./mouse.js";
import { createSnakeRenderer } from "./snake.js";

const GRID_SIZE = 16;
const MOVE_INTERVAL = 180;

const MOUSE_POSITION = {
  x: 12,
  y: 7,
};

const gameBoard = document.querySelector(".game-board");

const snakeLayer = document.querySelector(".snake-layer");

const mouseFood = document.querySelector(".mouse-food");

const mouseActor = mouseFood?.querySelector(".mouse-actor");

let snake = [
  { x: 9, y: 8 },
  { x: 8, y: 8 },
  { x: 7, y: 8 },
  { x: 6, y: 8 },
  { x: 5, y: 8 },
  { x: 4, y: 8 },
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

let isGameOver = false;

let gameOverReason = null;

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
   POSIÇÕES
   ========================================================= */

function isSamePosition(first, second) {
  return first.x === second.x && first.y === second.y;
}

function isSnakePosition(position) {
  return snake.some((segment) => isSamePosition(segment, position));
}

/* =========================================================
   RATO — POSIÇÃO VISUAL
   ========================================================= */

function updateMousePosition() {
  if (!mouseFood) {
    return;
  }

  mouseFood.style.setProperty("--mouse-x", MOUSE_POSITION.x);

  mouseFood.style.setProperty("--mouse-y", MOUSE_POSITION.y);
}

/* =========================================================
   RATO — CÉLULAS LIVRES
   ========================================================= */

function getFreeCells() {
  const freeCells = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const position = {
        x,
        y,
      };

      if (!isSnakePosition(position)) {
        freeCells.push(position);
      }
    }
  }

  return freeCells;
}

/* =========================================================
   RATO — NOVA POSIÇÃO
   ========================================================= */

function moveMouseToRandomCell() {
  const freeCells = getFreeCells();

  if (freeCells.length === 0) {
    return;
  }

  const randomIndex = Math.floor(Math.random() * freeCells.length);

  const nextPosition = freeCells[randomIndex];

  MOUSE_POSITION.x = nextPosition.x;

  MOUSE_POSITION.y = nextPosition.y;

  updateMousePosition();
}

/* =========================================================
   RATO — RESET VISUAL
   ========================================================= */

function resetMouseActor() {
  if (!mouseActor) {
    return;
  }

  mouseActor.getAnimations().forEach((animation) => {
    animation.cancel();
  });

  mouseActor.style.opacity = "";

  mouseActor.style.scale = "";

  mouseActor.style.visibility = "";

  mouseActor.style.transform = "";
}

/* =========================================================
   RATO — RESPAWN INSTANTÂNEO
   ========================================================= */

function respawnMouseInstantly() {
  if (isGameOver) {
    return;
  }

  if (!mouseActor) {
    moveMouseToRandomCell();

    mouseController.update(snake[0]);

    return;
  }

  mouseActor.style.visibility = "hidden";

  moveMouseToRandomCell();

  mouseController.update(snake[0]);

  void mouseFood.offsetWidth;

  resetMouseActor();

  mouseActor.style.visibility = "visible";
}

/* =========================================================
   RATO — ENTRADA NA BOCA
   ========================================================= */

function consumeMouseVisually() {
  if (isGameOver) {
    return;
  }

  if (!mouseActor) {
    respawnMouseInstantly();
    return;
  }

  const animation = mouseActor.animate(
    [
      {
        opacity: 1,
        scale: "1",
        offset: 0,
      },

      {
        opacity: 1,
        scale: "0.86",
        offset: 0.32,
      },

      {
        opacity: 0.82,
        scale: "0.52",
        offset: 0.7,
      },

      {
        opacity: 0,
        scale: "0.12",
        offset: 1,
      },
    ],
    {
      duration: 150,

      easing: "cubic-bezier(0.4, 0, 0.2, 1)",

      fill: "forwards",
    },
  );

  animation.finished
    .then(() => {
      if (isGameOver) {
        return;
      }

      respawnMouseInstantly();
    })
    .catch(() => {});
}

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
   COLISÃO — PAREDES
   ========================================================= */

function willHitWall(position) {
  return (
    position.x < 0 ||
    position.x >= GRID_SIZE ||
    position.y < 0 ||
    position.y >= GRID_SIZE
  );
}

/* =========================================================
   COLISÃO — PRÓPRIO CORPO
   ========================================================= */

function willHitSelf(position) {
  /*
   * A última posição da cauda
   * será abandonada neste mesmo
   * movimento.
   *
   * Por isso ela não deve contar
   * como colisão.
   */

  const bodyWithoutTail = snake.slice(1, -1);

  return bodyWithoutTail.some((segment) => isSamePosition(segment, position));
}

/* =========================================================
   GAME OVER
   ========================================================= */

function endGame(reason) {
  if (isGameOver) {
    return;
  }

  isGameOver = true;

  gameOverReason = reason;

  inputController.stop();

  gameBoard?.setAttribute("data-game-state", "game-over");

  gameBoard?.setAttribute("data-game-over-reason", reason);

  /*
   * Por enquanto a morte apenas
   * interrompe o jogo.
   *
   * Mais tarde esses estados servirão
   * para animação e tela de Game Over.
   */

  console.info(`JARAKA — Game Over: ${gameOverReason}`);
}

/* =========================================================
   CRESCIMENTO
   ========================================================= */

function growSnake() {
  if (isGameOver) {
    return;
  }

  const previousTail = previousSnake[previousSnake.length - 1];

  const currentTail = snake[snake.length - 1];

  const tailPosition = previousTail ?? currentTail;

  snake.push({
    x: tailPosition.x,
    y: tailPosition.y,
  });

  snakeRenderer.updateSegmentShapes(snake, direction);

  snakeRenderer.triggerGrowthArrival();
}

/* =========================================================
   COLISÃO COM O RATO
   ========================================================= */

function didEatMouse() {
  return isSamePosition(snake[0], MOUSE_POSITION);
}

/* =========================================================
   EVENTO DE ALIMENTAÇÃO
   ========================================================= */

function startEatingSequence() {
  if (isGameOver) {
    return;
  }

  snakeRenderer.triggerEatingSequence({
    onMouseEnter: () => {
      if (isGameOver) {
        return;
      }

      consumeMouseVisually();
    },

    onSwallowComplete: () => {
      if (isGameOver) {
        return;
      }

      growSnake();
    },
  });
}

function handleMouseCollision() {
  if (!didEatMouse()) {
    return;
  }

  startEatingSequence();
}

/* =========================================================
   MOVIMENTO LÓGICO
   ========================================================= */

function moveSnake() {
  if (isGameOver) {
    return;
  }

  direction = queuedDirection;

  inputController.unlock();

  const head = snake[0];

  const newHead = {
    x: head.x + direction.x,

    y: head.y + direction.y,
  };

  /* -------------------------------------------------------
     COLISÃO COM PAREDE
     ------------------------------------------------------- */

  if (willHitWall(newHead)) {
    endGame("wall");

    return;
  }

  /* -------------------------------------------------------
     COLISÃO COM O PRÓPRIO CORPO
     ------------------------------------------------------- */

  if (willHitSelf(newHead)) {
    endGame("self");

    return;
  }

  /* -------------------------------------------------------
     MOVIMENTO VÁLIDO
     ------------------------------------------------------- */

  previousSnake = snake.map((segment) => ({
    ...segment,
  }));

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

  handleMouseCollision();
}

/* =========================================================
   GAME LOOP
   ========================================================= */

function gameLoop(timestamp) {
  if (isGameOver) {
    return;
  }

  while (timestamp - lastMoveTime >= MOVE_INTERVAL) {
    moveSnake();

    if (isGameOver) {
      return;
    }

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
  if (isGameOver) {
    return false;
  }

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

  if (!accepted && !isGameOver) {
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

updateMousePosition();

snakeRenderer.create(snake, direction);

mouseController.update(snake[0]);

snakeRenderer.render(snake, previousSnake, 0);

inputController.start();

requestAnimationFrame(gameLoop);