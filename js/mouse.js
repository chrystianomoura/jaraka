/* =========================================================
   JARAKA — MOUSE
   Estado visual e reação do rato à proximidade da cobra
   ========================================================= */

const MOUSE_SCARED_DISTANCE = 4;

const EXPRESSION_CLASSES = ["is-normal", "is-angry", "is-scared", "is-happy"];

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