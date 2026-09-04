/* =========================================================
   JARAKA — INPUT
   Controle de entrada do jogador
   ========================================================= */

export function createInputController({ getDirection, onDirectionChange }) {
  let directionQueued = false;

  const directions = {
    ArrowUp: {
      x: 0,
      y: -1,
      name: "up",
    },

    ArrowDown: {
      x: 0,
      y: 1,
      name: "down",
    },

    ArrowLeft: {
      x: -1,
      y: 0,
      name: "left",
    },

    ArrowRight: {
      x: 1,
      y: 0,
      name: "right",
    },
  };

  function isOppositeDirection(currentDirection, nextDirection) {
    return (
      currentDirection.x + nextDirection.x === 0 &&
      currentDirection.y + nextDirection.y === 0
    );
  }

  function handleKeyDown(event) {
    const nextDirection = directions[event.key];

    if (!nextDirection) {
      return;
    }

    event.preventDefault();

    if (directionQueued) {
      return;
    }

    const currentDirection = getDirection();

    if (isOppositeDirection(currentDirection, nextDirection)) {
      return;
    }

    directionQueued = true;

    onDirectionChange(nextDirection);
  }

  function unlock() {
    directionQueued = false;
  }

  function start() {
    window.addEventListener("keydown", handleKeyDown);
  }

  function stop() {
    window.removeEventListener("keydown", handleKeyDown);
  }

  return {
    start,
    stop,
    unlock,
  };
}