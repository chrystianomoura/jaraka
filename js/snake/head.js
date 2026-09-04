/* =========================================================
   JARAKA — SNAKE HEAD
   Cabeça, rosto, direção e animação de curva

   Responsabilidades:
   - criação da cabeça;
   - criação do rosto;
   - direção visual dos olhos;
   - formato horizontal/vertical;
   - animação visual durante curvas.

   Este módulo não controla:
   - geometria do corpo;
   - alimentação;
   - SVG do corpo.
   ========================================================= */

/* =========================================================
   DIREÇÃO
   ========================================================= */

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

/* =========================================================
   ROSTO
   ========================================================= */

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

/* =========================================================
   CRIAÇÃO DA CABEÇA
   ========================================================= */

export function createHead(layer) {
  const element = document.createElement("div");

  element.className = "snake-part snake-head";

  const core = document.createElement("div");

  core.className = "snake-core";

  core.appendChild(createFace());

  element.appendChild(core);

  layer.appendChild(element);

  return {
    element,
    core,
  };
}

/* =========================================================
   FORMATO
   ========================================================= */

export function updateHeadShape(headCore, direction) {
  if (!headCore) {
    return;
  }

  headCore.classList.remove(
    "is-horizontal",
    "is-vertical",
    "is-corner",
    "corner-up-right",
    "corner-right-down",
    "corner-down-left",
    "corner-left-up",
  );

  headCore.classList.add(direction.x !== 0 ? "is-horizontal" : "is-vertical");
}

/* =========================================================
   DIREÇÃO VISUAL
   ========================================================= */

export function updateHeadDirection(headElement, direction) {
  if (!headElement) {
    return;
  }

  headElement.dataset.direction = getDirectionName(direction);
}

/* =========================================================
   ANIMAÇÃO DE CURVA
   ========================================================= */

export function triggerHeadTurn(headElement, headCore, turnSide) {
  if (!headElement || !headCore) {
    return;
  }

  headElement.dataset.turn = turnSide;

  headCore.classList.remove("is-turning");

  void headCore.offsetWidth;

  headCore.classList.add("is-turning");

  window.setTimeout(() => {
    if (!headElement || !headCore) {
      return;
    }

    headCore.classList.remove("is-turning");

    delete headElement.dataset.turn;
  }, 130);
}