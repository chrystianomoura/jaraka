"use strict";

import { createInputController } from "./input.js";
import { createMouseController } from "./mouse.js";
import { createSnakeRenderer } from "./snake.js";

import { MOVE_INTERVAL } from "./game/config.js";

import { isSamePosition, willHitSelf, willHitWall } from "./game/collision.js";

import { createDirectionController } from "./game/direction.js";

import { createGrowthController } from "./game/growth.js";

import { createFoodController } from "./game/food.js";

/* =========================================================
   DOM
   ========================================================= */

const gameBoard = document.querySelector(".game-board");

const snakeLayer = document.querySelector(".snake-layer");

const mouseFood = document.querySelector(".mouse-food");

const mouseActor = mouseFood?.querySelector(".mouse-actor");

/* =========================================================
   COBRA — ESTADO LÓGICO
   ========================================================= */

let snake = [
  { x: 9, y: 8 },
  { x: 8, y: 8 },
  { x: 7, y: 8 },
  { x: 6, y: 8 },
  { x: 5, y: 8 },
  { x: 4, y: 8 },
];

/* =========================================================
   COBRA — ESTADO VISUAL
   ========================================================= */

function cloneSnake(source) {
  return source.map((segment) => ({
    ...segment,
  }));
}

let renderSnake = cloneSnake(snake);

let previousRenderSnake = cloneSnake(renderSnake);

/* =========================================================
   LOOP
   ========================================================= */

let lastMoveTime = performance.now();

let isGameOver = false;

let gameOverReason = null;

/* =========================================================
   CONTROLLERS
   ========================================================= */

const snakeRenderer = createSnakeRenderer({
  layer: snakeLayer,
});

const mousePosition = {
  x: 12,
  y: 7,
};

const mouseController = createMouseController({
  element: mouseFood,
  position: mousePosition,
});

const growthController = createGrowthController();

const directionController = createDirectionController({
  x: 1,
  y: 0,
});

const foodController = createFoodController({
  element: mouseFood,

  actor: mouseActor,

  mouseController,

  getSnake: () => snake,

  isGameOver: () => isGameOver,

  initialPosition: mousePosition,
});

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

  console.info(`JARAKA — Game Over: ${gameOverReason}`);
}

/* =========================================================
   ALIMENTAÇÃO
   ========================================================= */

function startEatingSequence() {
  if (isGameOver) {
    return;
  }

  /*
   * Aqui ficam somente os efeitos visuais
   * coordenados pelo renderer.
   *
   * O crescimento lógico já foi tratado
   * dentro do movimento.
   */

  snakeRenderer.triggerEatingSequence({
    onMouseEnter: () => {
      if (isGameOver) {
        return;
      }

      foodController.consumeVisually();
    },

    onSwallowComplete: () => {
      if (isGameOver) {
        return;
      }

      /*
       * Final exclusivamente visual.
       */
    },
  });
}

/* =========================================================
   MOVIMENTO LÓGICO
   ========================================================= */

function moveSnake() {
  if (isGameOver) {
    return;
  }

  const direction = directionController.applyQueuedDirection();

  inputController.unlock();

  const head = snake[0];

  const newHead = {
    x: head.x + direction.x,

    y: head.y + direction.y,
  };

  /*
   * Detectamos a alimentação antes
   * de efetivar o movimento.
   */

  const willEatMouse = isSamePosition(newHead, foodController.getPosition());

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

  if (
    willHitSelf({
      position: newHead,

      snake,

      pendingGrowth: growthController.getPendingGrowth(),

      willGrow: willEatMouse,
    })
  ) {
    endGame("self");

    return;
  }

  /* -------------------------------------------------------
     CRESCIMENTO — MESMO TICK
     ------------------------------------------------------- */

  if (willEatMouse) {
    growthController.queue();
  }

  /* -------------------------------------------------------
     SNAPSHOT VISUAL
     ------------------------------------------------------- */

  previousRenderSnake = cloneSnake(renderSnake);

  /* -------------------------------------------------------
     CAUDA ANTES DO MOVIMENTO
     ------------------------------------------------------- */

  const tailBeforeMove = {
    ...snake[snake.length - 1],
  };

  /* -------------------------------------------------------
     MOVIMENTO DOS SEGMENTOS
     ------------------------------------------------------- */

  for (let index = snake.length - 1; index > 0; index -= 1) {
    snake[index] = {
      x: snake[index - 1].x,

      y: snake[index - 1].y,
    };
  }

  snake[0] = newHead;

  /* -------------------------------------------------------
     CRESCIMENTO LÓGICO
     ------------------------------------------------------- */

  const didGrow = growthController.applyPendingGrowth(snake, tailBeforeMove);

  /* -------------------------------------------------------
     CRESCIMENTO VISUAL
     ------------------------------------------------------- */

  renderSnake = growthController.updateVisualGrowth(snake, didGrow);

  /* -------------------------------------------------------
     RENDERER
     ------------------------------------------------------- */

  snakeRenderer.updateSegmentShapes(snake, direction);

  snakeRenderer.updateHeadDirection(direction);

  mouseController.update(snake[0]);

  /* -------------------------------------------------------
     ALIMENTAÇÃO VISUAL
     ------------------------------------------------------- */

  if (willEatMouse) {
    startEatingSequence();
  }
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

  snakeRenderer.render(renderSnake, previousRenderSnake, progress);

  requestAnimationFrame(gameLoop);
}

/* =========================================================
   FILA DE DIREÇÃO
   ========================================================= */

function queueDirection(candidate) {
  if (isGameOver) {
    return false;
  }

  const result = directionController.queue(candidate);

  if (!result.accepted) {
    return false;
  }

  snakeRenderer.updateHeadDirection(candidate);

  snakeRenderer.triggerHeadTurn(result.turnSide);

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
  getDirection: () => directionController.getDirection(),

  onDirectionChange: handleDirectionChange,
});

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

foodController.updatePosition();

const initialDirection = directionController.getDirection();

snakeRenderer.create(snake, initialDirection);

mouseController.update(snake[0]);

snakeRenderer.render(renderSnake, previousRenderSnake, 0);

inputController.start();

requestAnimationFrame(gameLoop);