/* =========================================================
   JARAKA — FOOD
   Gerenciamento do alimento durante a partida

   Responsabilidades:
   - manter a posição lógica do rato;
   - encontrar células livres;
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
     CÉLULAS LIVRES
     ======================================================= */

  function isSnakePosition(candidate) {
    const snake = getSnake();

    return snake.some((segment) => isSamePosition(segment, candidate));
  }

  function getFreeCells() {
    const freeCells = [];

    for (let y = 0; y < GRID_ROWS; y += 1) {
      for (let x = 0; x < GRID_COLUMNS; x += 1) {
        const candidate = {
          x,
          y,
        };

        if (!isSnakePosition(candidate)) {
          freeCells.push(candidate);
        }
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
     * Não substituímos o objeto.
     *
     * Alteramos suas propriedades para
     * preservar a mesma referência usada
     * pelo mouseController.
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

    /*
     * Cancela somente animações criadas
     * pela Web Animations API.
     *
     * As animações CSS do rato continuam
     * pertencendo ao stylesheet.
     */

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
     REINICIALIZAÇÃO DA ANIMAÇÃO CSS
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