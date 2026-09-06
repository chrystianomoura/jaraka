/* =========================================================
   JARAKA — MOUSE
   Estado visual e reação do rato à proximidade da cobra

   Responsabilidades:
   - calcular a distância entre rato e cabeça da Jaraka;
   - controlar as expressões visuais do rato;
   - reagir à aproximação da Jaraka.

   A posição lógica do rato é recebida como referência
   compartilhada com o foodController.
   ========================================================= */

const MOUSE_SCARED_DISTANCE = 3;

const EXPRESSION_CLASSES = ["is-normal", "is-angry", "is-scared", "is-happy"];

/* =========================================================
   CONTROLLER
   ========================================================= */

export function createMouseController({ element, position }) {
  /* =======================================================
     DISTÂNCIA
     ======================================================= */

  function getDistanceFrom(snakeHeadPosition) {
    const horizontalDistance = Math.abs(snakeHeadPosition.x - position.x);

    const verticalDistance = Math.abs(snakeHeadPosition.y - position.y);

    return horizontalDistance + verticalDistance;
  }

  /* =======================================================
     EXPRESSÃO
     ======================================================= */

  function setExpression(expression) {
    if (!element) {
      return;
    }

    element.classList.remove(...EXPRESSION_CLASSES);

    element.classList.add(`is-${expression}`);
  }

  /* =======================================================
     REAÇÃO À COBRA
     ======================================================= */

  function update(snakeHeadPosition) {
    const distance = getDistanceFrom(snakeHeadPosition);

    if (distance <= MOUSE_SCARED_DISTANCE) {
      setExpression("scared");

      return;
    }

    setExpression("angry");
  }

  return {
    update,
    setExpression,
  };
}