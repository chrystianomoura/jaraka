"use strict";

import { createInputController } from "./input.js";
import { createMouseController } from "./mouse.js";
import { createSnakeRenderer } from "./snake.js";

import {
  EPSILON,
  GRID_SIZE,
  MOVE_INTERVAL,
  VISUAL_GROWTH_RELEASE_STEP,
} from "./game/config.js";

const MOUSE_POSITION = {
  x: 12,
  y: 7,
};

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

/*
 * Distância, em células, que a cauda
 * visual está à frente da cauda lógica.
 *
 * Quando ocorre crescimento lógico,
 * a cauda lógica deixa de avançar uma
 * célula naquele tick.
 *
 * Em vez de deixar a cauda visual parar,
 * registramos essa diferença aqui e a
 * absorvemos aos poucos.
 */

let visualGrowthOffset = 0;

/* =========================================================
   DIREÇÃO
   ========================================================= */

let direction = {
  x: 1,
  y: 0,
};

let queuedDirection = {
  x: 1,
  y: 0,
};

/* =========================================================
   LOOP
   ========================================================= */

let lastMoveTime = performance.now();

let isGameOver = false;

let gameOverReason = null;

/* =========================================================
   CRESCIMENTO LÓGICO
   ========================================================= */

let pendingGrowth = 0;

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
   INTERPOLAÇÃO
   ========================================================= */

function lerp(start, end, progress) {
  return start + (end - start) * progress;
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

function willHitSelf(position, willGrow = false) {
  const body =
    pendingGrowth > 0 || willGrow ? snake.slice(1) : snake.slice(1, -1);

  return body.some((segment) => isSamePosition(segment, position));
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

  console.info(`JARAKA — Game Over: ${gameOverReason}`);
}

/* =========================================================
   CRESCIMENTO — FILA
   ========================================================= */

function queueGrowth() {
  if (isGameOver) {
    return;
  }

  pendingGrowth += 1;
}

/* =========================================================
   CRESCIMENTO — APLICAÇÃO LÓGICA
   ========================================================= */

function applyPendingGrowth(tailBeforeMove) {
  if (pendingGrowth <= 0 || !tailBeforeMove) {
    return false;
  }

  snake.push({
    x: tailBeforeMove.x,
    y: tailBeforeMove.y,
  });

  pendingGrowth -= 1;

  return true;
}

/* =========================================================
   CRESCIMENTO — CAUDA VISUAL
   ========================================================= */

/*
 * Constrói uma cópia visual da cobra
 * com a extremidade deslocada para frente
 * ao longo da própria trajetória do grid.
 *
 * O offset pode ser maior que 1.
 *
 * Isso é importante porque um segundo rato
 * pode ser consumido antes que o crescimento
 * visual anterior tenha sido completamente
 * absorvido.
 */

function createVisualSnake(source, tailOffset) {
  const result = cloneSnake(source);

  if (result.length < 2 || tailOffset <= EPSILON) {
    return result;
  }

  let remainingOffset = Math.min(tailOffset, Math.max(0, result.length - 2));

  /*
   * Cada unidade inteira do offset
   * remove visualmente uma célula completa
   * da extremidade.
   *
   * A cobra lógica não é alterada.
   */

  while (remainingOffset >= 1 - EPSILON && result.length > 2) {
    result.pop();

    remainingOffset -= 1;
  }

  /*
   * A fração restante posiciona a ponta
   * entre a célula atual da cauda e a
   * célula imediatamente anterior.
   */

  if (remainingOffset > EPSILON && result.length >= 2) {
    const tailIndex = result.length - 1;

    const tail = result[tailIndex];

    const beforeTail = result[tailIndex - 1];

    result[tailIndex] = {
      x: lerp(tail.x, beforeTail.x, remainingOffset),

      y: lerp(tail.y, beforeTail.y, remainingOffset),
    };
  }

  return result;
}

/* =========================================================
   CRESCIMENTO — ATUALIZAÇÃO VISUAL
   ========================================================= */

function updateVisualGrowth(didGrow) {
  /*
   * Quando a cobra cresce logicamente,
   * a cauda deixou de avançar uma célula.
   *
   * Adicionamos essa célula ao débito
   * visual.
   */

  if (didGrow) {
    visualGrowthOffset += 1;
  }

  /*
   * No MESMO tick já liberamos uma fração.
   *
   * Portanto a cauda nunca experimenta
   * um frame de velocidade zero.
   */

  if (visualGrowthOffset > EPSILON) {
    visualGrowthOffset = Math.max(
      0,
      visualGrowthOffset - VISUAL_GROWTH_RELEASE_STEP,
    );
  }

  renderSnake = createVisualSnake(snake, visualGrowthOffset);
}

/* =========================================================
   ALIMENTAÇÃO
   ========================================================= */

function startEatingSequence() {
  if (isGameOver) {
    return;
  }

  /*
   * Aqui ficam somente os efeitos
   * visuais da alimentação.
   *
   * O crescimento lógico já foi
   * tratado dentro do movimento.
   */

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

  direction = queuedDirection;

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

  const willEatMouse = isSamePosition(newHead, MOUSE_POSITION);

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

  if (willHitSelf(newHead, willEatMouse)) {
    endGame("self");

    return;
  }

  /* -------------------------------------------------------
     CRESCIMENTO — MESMO TICK
     ------------------------------------------------------- */

  if (willEatMouse) {
    queueGrowth();
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

  const didGrow = applyPendingGrowth(tailBeforeMove);

  /* -------------------------------------------------------
     CRESCIMENTO VISUAL
     ------------------------------------------------------- */

  updateVisualGrowth(didGrow);

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

snakeRenderer.render(renderSnake, previousRenderSnake, 0);

inputController.start();

requestAnimationFrame(gameLoop);