/* =========================================================
   JARAKA — SNAKE
   Renderização e comportamento visual da cobra
   ========================================================= */

export function createSnakeRenderer({ layer }) {
  const elements = [];

  /* =======================================================
     DIREÇÃO
     ======================================================= */

  function getDirectionName(direction) {
    if (direction.x === 1) {
      return "right";
    }

    if (direction.x === -1) {
      return "left";
    }

    if (direction.y === -1) {
      return "up";
    }

    return "down";
  }

  /* =======================================================
     ROSTO
     ======================================================= */

  function createFace() {
    const face = document.createElement("div");

    face.className = "snake-face";

    const leftEye = document.createElement("span");

    leftEye.className = "snake-eye snake-eye--left";

    const rightEye = document.createElement("span");

    rightEye.className = "snake-eye snake-eye--right";

    const mouth = document.createElement("span");

    mouth.className = "snake-mouth";

    face.append(leftEye, rightEye, mouth);

    return face;
  }

  /* =======================================================
     SEGMENTOS
     ======================================================= */

  function createSegment(isHead = false) {
    const element = document.createElement("div");

    element.className = isHead
      ? "snake-part snake-head"
      : "snake-part snake-segment";

    const core = document.createElement("div");

    core.className = "snake-core";

    if (isHead) {
      core.appendChild(createFace());
    }

    element.appendChild(core);

    layer.appendChild(element);

    const entry = {
      element,
      core,
    };

    elements.push(entry);

    return entry;
  }

  function create(snake, direction) {
    snake.forEach((segment, index) => {
      createSegment(index === 0);
    });

    updateSegmentShapes(snake, direction);

    updateHeadDirection(direction);
  }

  function syncSegments(snake) {
    while (elements.length < snake.length) {
      createSegment(false);
    }
  }

  /* =======================================================
     FORMATO DOS SEGMENTOS
     ======================================================= */

  function getSegmentShape(snake, direction, index) {
    if (index === 0) {
      return direction.x !== 0 ? "horizontal" : "vertical";
    }

    const current = snake[index];

    const previous = snake[index - 1];

    if (index === snake.length - 1) {
      return previous.x !== current.x ? "horizontal" : "vertical";
    }

    const next = snake[index + 1];

    const previousHorizontal = previous.x !== current.x;

    const nextHorizontal = next.x !== current.x;

    if (previousHorizontal !== nextHorizontal) {
      return "corner";
    }

    return previousHorizontal ? "horizontal" : "vertical";
  }

  function updateSegmentShapes(snake, direction) {
    syncSegments(snake);

    snake.forEach((segment, index) => {
      const snakeElement = elements[index];

      if (!snakeElement) {
        return;
      }

      const { core } = snakeElement;

      core.classList.remove(
        "is-horizontal",
        "is-vertical",
        "is-corner",
        "corner-up-right",
        "corner-right-down",
        "corner-down-left",
        "corner-left-up",
      );

      const shape = getSegmentShape(snake, direction, index);

      core.classList.add(`is-${shape}`);
    });
  }

  /* =======================================================
     INTERPOLAÇÃO
     ======================================================= */

  function lerp(start, end, progress) {
    return start + (end - start) * progress;
  }

  /* =======================================================
     RENDERIZAÇÃO
     ======================================================= */

  function render(snake, previousSnake, progress) {
    syncSegments(snake);

    snake.forEach((segment, index) => {
      const previous = previousSnake[index] ?? segment;

      const snakeElement = elements[index];

      if (!previous || !snakeElement) {
        return;
      }

      const visualX = lerp(previous.x, segment.x, progress);

      const visualY = lerp(previous.y, segment.y, progress);

      /*
       * Garantia importante:
       *
       * Nenhuma escala ou deformação
       * é aplicada ao .snake-part.
       *
       * O elemento externo cuida
       * SOMENTE da posição.
       */

      snakeElement.element.style.removeProperty("scale");

      snakeElement.element.style.removeProperty("transform-origin");

      delete snakeElement.element.dataset.motionScale;

      snakeElement.element.style.setProperty("--visual-x", visualX);

      snakeElement.element.style.setProperty("--visual-y", visualY);
    });
  }

  /* =======================================================
     DIREÇÃO DA CABEÇA
     ======================================================= */

  function updateHeadDirection(direction) {
    const head = elements[0]?.element;

    if (!head) {
      return;
    }

    head.dataset.direction = getDirectionName(direction);
  }

  /* =======================================================
     CURVA DA CABEÇA
     ======================================================= */

  function triggerHeadTurn(turnSide) {
    const head = elements[0]?.element;

    const headCore = elements[0]?.core;

    if (!head || !headCore) {
      return;
    }

    head.dataset.turn = turnSide;

    headCore.classList.remove("is-turning");

    void headCore.offsetWidth;

    headCore.classList.add("is-turning");

    window.setTimeout(() => {
      headCore.classList.remove("is-turning");

      delete head.dataset.turn;
    }, 130);
  }

  /* =======================================================
     ESTADOS DO ROSTO
     ======================================================= */

  function clearEatingFaceStates() {
    const head = elements[0]?.element;

    if (!head) {
      return;
    }

    head.classList.remove("is-biting", "is-bite-closing", "is-chewing");
  }

  /* =======================================================
     MORDIDA
     ======================================================= */

  function triggerBite() {
    const head = elements[0]?.element;

    if (!head) {
      return;
    }

    clearEatingFaceStates();

    void head.offsetWidth;

    head.classList.add("is-biting");
  }

  function triggerBiteClose() {
    const head = elements[0]?.element;

    if (!head) {
      return;
    }

    head.classList.add("is-bite-closing");
  }

  /* =======================================================
     MASTIGAÇÃO
     ======================================================= */

  function triggerChew() {
    const head = elements[0]?.element;

    if (!head) {
      return;
    }

    head.classList.remove("is-biting", "is-bite-closing", "is-chewing");

    void head.offsetWidth;

    head.classList.add("is-chewing");
  }

  function finishChew() {
    const head = elements[0]?.element;

    if (!head) {
      return;
    }

    head.classList.remove("is-chewing");
  }

  function finishBite() {
    clearEatingFaceStates();
  }

  /* =======================================================
     DEGLUTIÇÃO — SEGMENTO
     ======================================================= */

  function triggerSwallowSegment(index) {
    const core = elements[index]?.core;

    if (!core) {
      return;
    }

    core.classList.remove("is-swallowing");

    void core.offsetWidth;

    core.classList.add("is-swallowing");

    window.setTimeout(() => {
      core.classList.remove("is-swallowing");
    }, 260);
  }

  /* =======================================================
     DEGLUTIÇÃO — ONDA
     ======================================================= */

  function triggerSwallowWave({ segmentDelay = 92, onComplete } = {}) {
    const bodyElements = elements.slice(1);

    if (bodyElements.length === 0) {
      onComplete?.();
      return;
    }

    bodyElements.forEach((entry, bodyIndex) => {
      window.setTimeout(() => {
        triggerSwallowSegment(bodyIndex + 1);

        const isLast = bodyIndex === bodyElements.length - 1;

        if (isLast) {
          window.setTimeout(() => {
            onComplete?.();
          }, 245);
        }
      }, bodyIndex * segmentDelay);
    });
  }

  /* =======================================================
     CRESCIMENTO
     ======================================================= */

  function triggerGrowthArrival() {
    const lastElement = elements[elements.length - 1];

    if (!lastElement) {
      return;
    }

    const { core } = lastElement;

    core.classList.remove("is-growth-arrival");

    void core.offsetWidth;

    core.classList.add("is-growth-arrival");

    window.setTimeout(() => {
      core.classList.remove("is-growth-arrival");
    }, 300);
  }

  /* =======================================================
     SEQUÊNCIA DE ALIMENTAÇÃO
     ======================================================= */

  function triggerEatingSequence({ onMouseEnter, onSwallowComplete } = {}) {
    /*
     * 0 ms
     * Abre a boca.
     */

    triggerBite();

    /*
     * 115 ms
     * Rato entra.
     */

    window.setTimeout(() => {
      onMouseEnter?.();
    }, 115);

    /*
     * 300 ms
     * Fecha a boca.
     */

    window.setTimeout(() => {
      triggerBiteClose();
    }, 300);

    /*
     * 360 ms
     * O alimento começa a percorrer
     * imediatamente o corpo.
     */

    window.setTimeout(() => {
      triggerSwallowWave({
        segmentDelay: 92,

        onComplete: () => {
          onSwallowComplete?.();
        },
      });
    }, 360);

    /*
     * 440 ms
     * Mastigação.
     */

    window.setTimeout(() => {
      triggerChew();
    }, 440);

    /*
     * 1340 ms
     * Volta à expressão normal.
     */

    window.setTimeout(() => {
      finishChew();
    }, 1340);
  }

  /* =======================================================
     API
     ======================================================= */

  return {
    create,
    render,
    updateSegmentShapes,
    updateHeadDirection,
    triggerHeadTurn,
    triggerBite,
    triggerBiteClose,
    triggerChew,
    finishChew,
    finishBite,
    triggerSwallowSegment,
    triggerSwallowWave,
    triggerGrowthArrival,
    triggerEatingSequence,
  };
}