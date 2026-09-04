/* =========================================================
   JARAKA — FOOD
   Gerenciamento do alimento durante a partida

   Responsabilidades:
   - manter a posição lógica do rato;
   - encontrar células livres;
   - escolher uma nova posição;
   - atualizar a posição visual;
   - controlar consumo e respawn.

   O comportamento e as expressões do rato continuam
   pertencendo ao mouseController.

   O objeto de posição é compartilhado entre este módulo
   e o mouseController para manter lógica e comportamento
   perfeitamente sincronizados.
   ========================================================= */

import { GRID_SIZE } from "./config.js";
import { isSamePosition } from "./collision.js";

/* =========================================================
   CONTROLLER
   ========================================================= */

export function createFoodController({
  element,
  actor,
  mouseController,
  getSnake,
  isGameOver,
  initialPosition,
}) {
  /*
   * O foodController e o mouseController compartilham
   * exatamente o mesmo objeto de posição.
   */

  const position = initialPosition;

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

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
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
     NOVA POSIÇÃO
     ======================================================= */

  function moveToRandomCell() {
    const freeCells = getFreeCells();

    if (freeCells.length === 0) {
      return;
    }

    const randomIndex = Math.floor(Math.random() * freeCells.length);

    const nextPosition = freeCells[randomIndex];

    position.x = nextPosition.x;

    position.y = nextPosition.y;

    updatePosition();
  }

  /* =======================================================
     RESET VISUAL
     ======================================================= */

  function resetActor() {
    if (!actor) {
      return;
    }

    /*
     * Cancela somente animações criadas pela
     * Web Animations API.
     *
     * Animações CSS como mouse-provoke e
     * mouse-scared pertencem ao stylesheet
     * e não devem ser canceladas aqui.
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

    /*
     * Retiramos temporariamente a animação CSS.
     * O reflow separa os dois estados e faz o
     * navegador iniciar novamente a animação
     * correspondente à expressão atual.
     */

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
      moveToRandomCell();

      mouseController.update(snake[0]);

      return;
    }

    actor.style.visibility = "hidden";

    moveToRandomCell();

    /*
     * Como a posição é compartilhada,
     * o mouseController calcula a expressão
     * usando imediatamente a nova célula.
     */

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
    updatePosition,
    consumeVisually,
  };
}