/* =========================================================
   JARAKA — SNAKE EATING
   Mordida, mastigação, deglutição e crescimento

   Responsabilidades:
   - estados visuais de alimentação da cabeça;
   - mordida;
   - mastigação;
   - onda de deglutição;
   - pulso de deglutição;
   - chegada do crescimento na cauda;
   - sequência completa de alimentação.

   Este módulo não controla:
   - movimentação;
   - geometria do path;
   - criação da cabeça;
   - lógica do jogo.
   ========================================================= */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/* =========================================================
   ESTADOS DO ROSTO
   ========================================================= */

function clearEatingFaceStates(headElement) {
  if (!headElement) {
    return;
  }

  headElement.classList.remove("is-biting", "is-bite-closing", "is-chewing");
}

/* =========================================================
   MORDIDA
   ========================================================= */

export function triggerBite(headElement) {
  if (!headElement) {
    return;
  }

  clearEatingFaceStates(headElement);

  void headElement.offsetWidth;

  headElement.classList.add("is-biting");
}

export function triggerBiteClose(headElement) {
  if (!headElement) {
    return;
  }

  headElement.classList.add("is-bite-closing");
}

/* =========================================================
   MASTIGAÇÃO
   ========================================================= */

export function triggerChew(headElement) {
  if (!headElement) {
    return;
  }

  headElement.classList.remove("is-biting", "is-bite-closing", "is-chewing");

  void headElement.offsetWidth;

  headElement.classList.add("is-chewing");
}

export function finishChew(headElement) {
  if (!headElement) {
    return;
  }

  headElement.classList.remove("is-chewing");
}

export function finishBite(headElement) {
  clearEatingFaceStates(headElement);
}

/* =========================================================
   POSIÇÃO SOBRE O CORPO
   ========================================================= */

function getBodyPointAtRatio(bodyPath, ratio) {
  if (!bodyPath) {
    return null;
  }

  let totalLength = 0;

  try {
    totalLength = bodyPath.getTotalLength();
  } catch {
    return null;
  }

  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    return null;
  }

  const safeRatio = Math.max(0, Math.min(ratio, 1));

  const point = bodyPath.getPointAtLength(totalLength * safeRatio);

  return {
    x: point.x,
    y: point.y,
  };
}

/* =========================================================
   ELEMENTO DE DEGLUTIÇÃO
   ========================================================= */

function createSwallowBulge(bodySvg) {
  if (!bodySvg) {
    return null;
  }

  const bulge = document.createElementNS(SVG_NAMESPACE, "circle");

  bulge.classList.add("snake-swallow-bulge");

  bulge.setAttribute("r", "0.55");

  bodySvg.appendChild(bulge);

  return bulge;
}

/* =========================================================
   DEGLUTIÇÃO — SEGMENTO
   ========================================================= */

export function triggerSwallowSegment({
  bodySvg,
  bodyPath,
  latestSnakeLength,
  index,
}) {
  const bodyCount = Math.max(1, latestSnakeLength - 1);

  const ratio = Math.max(0, Math.min(index / bodyCount, 1));

  const point = getBodyPointAtRatio(bodyPath, ratio);

  if (!point) {
    return;
  }

  const bulge = createSwallowBulge(bodySvg);

  if (!bulge) {
    return;
  }

  bulge.setAttribute("cx", point.x);

  bulge.setAttribute("cy", point.y);

  bulge.classList.add("is-pulsing");

  window.setTimeout(() => {
    bulge.remove();
  }, 260);
}

/* =========================================================
   DEGLUTIÇÃO — ONDA
   ========================================================= */

export function triggerSwallowWave({
  bodySvg,
  bodyPath,
  latestSnakeLength,
  segmentDelay = 92,
  onComplete,
} = {}) {
  const bodyCount = Math.max(1, latestSnakeLength - 1);

  const duration = Math.max(420, bodyCount * segmentDelay + 245);

  const bulge = createSwallowBulge(bodySvg);

  if (!bulge) {
    onComplete?.();

    return;
  }

  const startedAt = performance.now();

  function animate(timestamp) {
    if (!bulge.isConnected) {
      return;
    }

    const progress = Math.min((timestamp - startedAt) / duration, 1);

    const ratio = 0.04 + progress * 0.96;

    const point = getBodyPointAtRatio(bodyPath, ratio);

    if (point) {
      bulge.setAttribute("cx", point.x);

      bulge.setAttribute("cy", point.y);
    }

    if (progress < 1) {
      requestAnimationFrame(animate);

      return;
    }

    bulge.remove();

    onComplete?.();
  }

  requestAnimationFrame(animate);
}

/* =========================================================
   CRESCIMENTO
   ========================================================= */

export function triggerGrowthArrival({ bodySvg, bodyPath }) {
  if (!bodySvg) {
    return;
  }

  const point = getBodyPointAtRatio(bodyPath, 1);

  if (!point) {
    return;
  }

  const arrival = document.createElementNS(SVG_NAMESPACE, "circle");

  arrival.classList.add("snake-growth-arrival");

  arrival.setAttribute("cx", point.x);

  arrival.setAttribute("cy", point.y);

  arrival.setAttribute("r", "0.45");

  bodySvg.appendChild(arrival);

  window.setTimeout(() => {
    arrival.remove();
  }, 300);
}

/* =========================================================
   SEQUÊNCIA COMPLETA DE ALIMENTAÇÃO
   ========================================================= */

export function triggerEatingSequence({
  headElement,
  bodySvg,
  bodyPath,
  latestSnakeLength,
  onMouseEnter,
  onSwallowComplete,
} = {}) {
  /*
   * 0 ms
   * Abre a boca.
   */

  triggerBite(headElement);

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
    triggerBiteClose(headElement);
  }, 300);

  /*
   * 360 ms
   * O volume começa a percorrer o corpo.
   */

  window.setTimeout(() => {
    triggerSwallowWave({
      bodySvg,
      bodyPath,
      latestSnakeLength,
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
    triggerChew(headElement);
  }, 440);

  /*
   * 1340 ms
   * Expressão normal.
   */

  window.setTimeout(() => {
    finishChew(headElement);
  }, 1340);
}