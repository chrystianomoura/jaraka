"use strict";

import { createInputController } from "./input.js";
import { createMouseController } from "./mouse.js";
import { createSnakeRenderer } from "./snake.js";

import { isSamePosition, willHitSelf, willHitWall } from "./game/collision.js";

import { createDirectionController } from "./game/direction.js";

import { createFoodController } from "./game/food.js";

import { createGameOverController } from "./game/game-over.js";

import { createGrowthController } from "./game/growth.js";

import { createGameLoop } from "./game/loop.js";

import { getNextHeadPosition, moveSnakeSegments } from "./game/movement.js";

import { createGameState } from "./game/state.js";

/* =========================================================
   DOM
   ========================================================= */

const gameBoard = document.querySelector(".game-board");

const snakeLayer = document.querySelector(".snake-layer");

const mouseFood = document.querySelector(".mouse-food");

const mouseActor = mouseFood?.querySelector(".mouse-actor");

/* =========================================================
   CONFIGURAÇÃO INICIAL DA PARTIDA
   ========================================================= */

const initialSnake = [
  { x: 9, y: 11 },
  { x: 8, y: 11 },
  { x: 7, y: 11 },
  { x: 6, y: 11 },
  { x: 5, y: 11 },
  { x: 4, y: 11 },
];

/* =========================================================
   ESTADO
   ========================================================= */

const gameState = createGameState({
  initialSnake,
});

/* =========================================================
   POSIÇÃO COMPARTILHADA DO RATO
   ========================================================= */

/*
 * Este é o único objeto de posição do rato.
 *
 * Ele é compartilhado entre:
 * - mouseController;
 * - foodController.
 *
 * O foodController altera x e y,
 * enquanto o mouseController lê
 * esses mesmos valores.
 */

const mousePosition = {
  x: 0,
  y: 0,
};

/* =========================================================
   CONTROLLERS PRINCIPAIS
   ========================================================= */

const snakeRenderer = createSnakeRenderer({
  layer: snakeLayer,
});

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

  position: mousePosition,

  mouseController,

  getSnake: () => gameState.getSnake(),

  isGameOver: () => gameState.isGameOver(),
});

/* =========================================================
   REFERÊNCIAS TARDIAS
   ========================================================= */

/*
 * Input e loop são criados mais abaixo,
 * mas o controller de game over precisa
 * conseguir interromper ambos.
 *
 * Mantemos referências mutáveis apenas
 * para resolver essa dependência de ciclo
 * de vida sem acoplar os módulos.
 */

let inputController = null;

let gameLoop = null;

/* =========================================================
   GAME OVER
   ========================================================= */

const gameOverController = createGameOverController({
  gameBoard,

  gameState,

  getInputController: () => inputController,

  getGameLoop: () => gameLoop,
});

/* =========================================================
   ALIMENTAÇÃO
   ========================================================= */

function startEatingSequence() {
  if (gameState.isGameOver()) {
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
      if (gameState.isGameOver()) {
        return;
      }

      foodController.consumeVisually();
    },

    onSwallowComplete: () => {
      if (gameState.isGameOver()) {
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
  if (gameState.isGameOver()) {
    return;
  }

  const snake = gameState.getSnake();

  const direction = directionController.applyQueuedDirection();

  inputController?.unlock();

  const head = snake[0];

  const newHead = getNextHeadPosition(head, direction);

  /*
   * Detectamos a alimentação antes
   * de efetivar o movimento.
   */

  const willEatMouse = isSamePosition(newHead, foodController.getPosition());

  /* -------------------------------------------------------
     COLISÃO COM PAREDE
     ------------------------------------------------------- */

  if (willHitWall(newHead)) {
    gameOverController.end("wall");

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
    gameOverController.end("self");

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

  gameState.snapshotRenderSnake();

  /* -------------------------------------------------------
     MOVIMENTO DOS SEGMENTOS
     ------------------------------------------------------- */

  const tailBeforeMove = moveSnakeSegments(snake, newHead);

  /* -------------------------------------------------------
     CRESCIMENTO LÓGICO
     ------------------------------------------------------- */

  const didGrow = growthController.applyPendingGrowth(snake, tailBeforeMove);

  /* -------------------------------------------------------
     CRESCIMENTO VISUAL
     ------------------------------------------------------- */

  const renderSnake = growthController.updateVisualGrowth(snake, didGrow);

  gameState.setRenderSnake(renderSnake);

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
   RENDERIZAÇÃO
   ========================================================= */

function renderGame(progress) {
  snakeRenderer.render(
    gameState.getRenderSnake(),
    gameState.getPreviousRenderSnake(),
    progress,
  );
}

/* =========================================================
   FILA DE DIREÇÃO
   ========================================================= */

function queueDirection(candidate) {
  if (gameState.isGameOver()) {
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

  if (!accepted && !gameState.isGameOver()) {
    inputController?.unlock();
  }
}

inputController = createInputController({
  getDirection: () => directionController.getDirection(),

  onDirectionChange: handleDirectionChange,
});

/* =========================================================
   LOOP
   ========================================================= */

gameLoop = createGameLoop({
  onMove: moveSnake,

  onRender: renderGame,

  isGameOver: () => gameState.isGameOver(),
});

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

const initialDirection = directionController.getDirection();

snakeRenderer.create(gameState.getSnake(), initialDirection);

/*
 * O primeiro rato da partida nasce
 * em uma célula livre aleatória.
 */

foodController.spawnInitial();

snakeRenderer.render(
  gameState.getRenderSnake(),
  gameState.getPreviousRenderSnake(),
  0,
);

inputController.start();

gameLoop.start();