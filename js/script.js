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

const mouseActor = mouseFood?.querySelector(".mouse-actor");

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
   POSIÇÕES
   ========================================================= */

function isSamePosition(first, second) {
  return first.x === second.x && first.y === second.y;
}

function isSnakePosition(position) {
  return snake.some((segment) => isSamePosition(segment, position));
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

  mouseFood.style.setProperty("--mouse-x", MOUSE_POSITION.x);

  mouseFood.style.setProperty("--mouse-y", MOUSE_POSITION.y);
}

/* =========================================================
   RATO — RESET DO ATOR
   ========================================================= */

function resetMouseActor() {
  if (!mouseActor) {
    return;
  }

  /*
   * Cancela somente animações
   * temporárias aplicadas via JS.
   *
   * O container .mouse-food nunca
   * recebe transform ou scale aqui.
   */

  mouseActor.getAnimations().forEach((animation) => {
    animation.cancel();
  });

  mouseActor.style.opacity = "";

  mouseActor.style.scale = "";

  mouseActor.style.visibility = "";

  mouseActor.style.transform = "";
}

/* =========================================================
   RATO — RESPAWN
   ========================================================= */

function respawnMouseInstantly() {
  if (!mouseActor) {
    moveMouseToRandomCell();

    mouseController.update(snake[0]);

    return;
  }

  /*
   * O desenho do rato fica oculto.
   *
   * O .mouse-food continua existindo,
   * mas não existe rato visível nele
   * durante a troca de coordenada.
   */

  mouseActor.style.visibility = "hidden";

  /*
   * Muda a posição do CONTAINER.
   *
   * Não existe animação no container.
   */

  moveMouseToRandomCell();

  mouseController.update(snake[0]);

  /*
   * Força a nova posição a ser
   * calculada enquanto o ator ainda
   * está invisível.
   */

  void mouseFood.offsetWidth;

  /*
   * Resetamos a animação da mordida.
   */

  resetMouseActor();

  /*
   * O rato já nasce completamente
   * formado na nova célula.
   *
   * Sem fade.
   * Sem scale.
   * Sem trajetória.
   */

  mouseActor.style.visibility = "visible";
}

/* =========================================================
   RATO — ENTRADA NA BOCA
   ========================================================= */

function consumeMouseVisually() {
  if (!mouseActor) {
    respawnMouseInstantly();
    return;
  }

  /*
   * Importante:
   *
   * somente .mouse-actor é animado.
   *
   * .mouse-food continua imóvel
   * na célula lógica durante toda
   * a mordida.
   */

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
   CRESCIMENTO
   ========================================================= */

function growSnake() {
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
  /*
   * Mordida e digestão acontecem
   * paralelamente ao gameplay.
   */

  snakeRenderer.triggerEatingSequence({
    onMouseEnter: () => {
      consumeMouseVisually();
    },

    onSwallowComplete: () => {
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

  handleMouseCollision();
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