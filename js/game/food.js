/* =========================================================
   JARAKA — FOOD
   Gerenciamento do alimento durante a partida

   Responsabilidades:
   - manter a posição lógica do rato;
   - encontrar células livres;
   - respeitar margem visual segura;
   - escolher uma nova posição;
   - atualizar a posição visual;
   - controlar o primeiro spawn;
   - controlar consumo e respawn.

   O foodController e o mouseController compartilham
   exatamente o mesmo objeto de posição.
   ========================================================= */

import { GRID_COLUMNS, GRID_ROWS } from "./config.js";

import { isSamePosition } from "./collision.js";

/* =========================================================
   ÁREA SEGURA DO RATO
   ========================================================= */

/*
 * O rato é propositalmente maior que uma célula
 * e possui animações com:
 *
 * - salto;
 * - rotação;
 * - squash;
 * - stretch.
 *
 * Por isso ele não deve nascer diretamente
 * nas células periféricas da arena.
 *
 * Isso NÃO altera o tamanho do rato.
 * Apenas garante espaço para sua animação.
 */

const SAFE_MARGIN_LEFT = 1;
const SAFE_MARGIN_RIGHT = 1;

const SAFE_MARGIN_TOP = 1;
const SAFE_MARGIN_BOTTOM = 1;

/* =========================================================
   CONTROLLER
   ========================================================= */

export function createFoodController({
  element,
  actor,
  position,
  mouseController,
  getSnake,
  isGameOver,
}) {
  /* =======================================================
     POSIÇÃO
     ======================================================= */

  function getPosition() {
    return position;
  }

  function updatePosition() {
    if (!element) {
      return;
    }

    element.style.setProperty("--mouse-x", position.x);

    element.style.setProperty("--mouse-y", position.y);
  }

  /* =======================================================
     COBRA
     ======================================================= */

  function isSnakePosition(candidate) {
    const snake = getSnake();

    return snake.some((segment) => isSamePosition(segment, candidate));
  }

  /* =======================================================
     ÁREA SEGURA
     ======================================================= */

  function isSafeMouseCell(candidate) {
    const minimumX = SAFE_MARGIN_LEFT;

    const maximumX = GRID_COLUMNS - 1 - SAFE_MARGIN_RIGHT;

    const minimumY = SAFE_MARGIN_TOP;

    const maximumY = GRID_ROWS - 1 - SAFE_MARGIN_BOTTOM;

    return (
      candidate.x >= minimumX &&
      candidate.x <= maximumX &&
      candidate.y >= minimumY &&
      candidate.y <= maximumY
    );
  }

  /* =======================================================
     CÉLULAS LIVRES
     ======================================================= */

  function getFreeCells() {
    const freeCells = [];

    for (let y = 0; y < GRID_ROWS; y += 1) {
      for (let x = 0; x < GRID_COLUMNS; x += 1) {
        const candidate = {
          x,
          y,
        };

        if (!isSafeMouseCell(candidate)) {
          continue;
        }

        if (isSnakePosition(candidate)) {
          continue;
        }

        freeCells.push(candidate);
      }
    }

    return freeCells;
  }

  /* =======================================================
     POSIÇÃO ALEATÓRIA
     ======================================================= */

  function moveToRandomCell() {
    const freeCells = getFreeCells();

    if (freeCells.length === 0) {
      return false;
    }

    const randomIndex = Math.floor(Math.random() * freeCells.length);

    const nextPosition = freeCells[randomIndex];

    /*
     * Mantemos a mesma referência do objeto.
     */

    position.x = nextPosition.x;

    position.y = nextPosition.y;

    updatePosition();

    return true;
  }

  /* =======================================================
     PRIMEIRO SPAWN
     ======================================================= */

  function spawnInitial() {
    if (isGameOver()) {
      return false;
    }

    const spawned = moveToRandomCell();

    if (!spawned) {
      return false;
    }

    const snake = getSnake();

    mouseController.update(snake[0]);

    return true;
  }

  /* =======================================================
     RESET VISUAL
     ======================================================= */

  function resetActor() {
    if (!actor) {
      return;
    }

    actor
      .getAnimations()
      .filter(
        (animation) =>
          animation instanceof Animation &&
          animation.effect instanceof KeyframeEffect &&
          animation.effect.target === actor,
      )
      .forEach((animation) => {
        animation.cancel();
      });

    actor.style.opacity = "";

    actor.style.scale = "";

    actor.style.visibility = "";

    actor.style.transform = "";
  }

  /* =======================================================
     REINICIALIZAÇÃO DA ANIMAÇÃO
     ======================================================= */

  function restartActorAnimation() {
    if (!actor) {
      return;
    }

    actor.style.animation = "none";

    void actor.offsetWidth;

    actor.style.animation = "";
  }

  /* =======================================================
     RESPAWN
     ======================================================= */

  function respawnInstantly() {
    if (isGameOver()) {
      return;
    }

    const snake = getSnake();

    if (!actor) {
      const spawned = moveToRandomCell();

      if (!spawned) {
        return;
      }

      mouseController.update(snake[0]);

      return;
    }

    actor.style.visibility = "hidden";

    const spawned = moveToRandomCell();

    if (!spawned) {
      actor.style.visibility = "";

      return;
    }

    mouseController.update(snake[0]);

    resetActor();

    restartActorAnimation();

    actor.style.visibility = "visible";
  }

  /* =======================================================
     CONSUMO
     ======================================================= */

  function consumeVisually() {
    if (isGameOver()) {
      return;
    }

    if (!actor) {
      respawnInstantly();

      return;
    }

    const animation = actor.animate(
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
        if (isGameOver()) {
          return;
        }

        respawnInstantly();
      })
      .catch(() => {});
  }

  return {
    getPosition,
    spawnInitial,
    updatePosition,
    consumeVisually,
  };
}