/* =========================================================
   JARAKA — SNAKE EATING
   Mordida, mastigação, deglutição e crescimento

   Responsabilidades:
   - estados visuais de alimentação da cabeça;
   - mordida;
   - mastigação;
   - onda de deglutição;
   - adaptação da deglutição à cauda afinada;
   - sequência completa de alimentação.

   Este módulo não controla:
   - movimentação;
   - geometria do path;
   - criação da cabeça;
   - lógica do jogo.
   ========================================================= */

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/* =========================================================
   DEGLUTIÇÃO — CONFIGURAÇÃO
   ========================================================= */

const TAIL_START_RATIO = 0.62;

const SWALLOW_END_RATIO = 0.94;

const BODY_SWALLOW_RADIUS = 0.55;

const TAIL_SWALLOW_RADIUS = 0.16;

/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function smoothstep(progress) {
  const safeProgress = clamp(progress, 0, 1);

  return safeProgress * safeProgress * (3 - 2 * safeProgress);
}

/* =========================================================
   ESTADOS DA CABEÇA
   ========================================================= */

function clearEatingFaceStates(headElement) {
  if (!headElement) {
    return;
  }

  headElement.classList.remove("is-biting", "is-bite-closing", "is-chewing");
}

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
   GEOMETRIA DO BODY PATH
   ========================================================= */

function getBodyLength({ bodyPath, getCachedLength }) {
  if (!bodyPath) {
    return 0;
  }

  /*
   * Primeira opção:
   * comprimento produzido pelo renderer
   * no frame mais recente.
   */

  const cachedLength = getCachedLength?.();

  if (Number.isFinite(cachedLength) && cachedLength > 0) {
    return cachedLength;
  }

  /*
   * Fallback apenas para situações
   * em que ainda não houve render válido.
   */

  try {
    const measuredLength = bodyPath.getTotalLength();

    if (Number.isFinite(measuredLength) && measuredLength > 0) {
      return measuredLength;
    }
  } catch {
    return 0;
  }

  return 0;
}

function getBodyPointAtRatio({ bodyPath, ratio, totalLength }) {
  if (!bodyPath || !Number.isFinite(totalLength) || totalLength <= 0) {
    return null;
  }

  const safeRatio = clamp(ratio, 0, 1);

  let point = null;

  try {
    point = bodyPath.getPointAtLength(totalLength * safeRatio);
  } catch {
    return null;
  }

  return {
    x: point.x,
    y: point.y,
  };
}

/* =========================================================
   RAIO DA DEGLUTIÇÃO
   ========================================================= */

function getSwallowRadius(ratio) {
  if (ratio <= TAIL_START_RATIO) {
    return BODY_SWALLOW_RADIUS;
  }

  const tailProgress =
    (ratio - TAIL_START_RATIO) / (SWALLOW_END_RATIO - TAIL_START_RATIO);

  const easedProgress = smoothstep(tailProgress);

  return lerp(BODY_SWALLOW_RADIUS, TAIL_SWALLOW_RADIUS, easedProgress);
}

/* =========================================================
   OPACIDADE FINAL
   ========================================================= */

function getSwallowOpacity(progress) {
  const fadeStart = 0.82;

  if (progress <= fadeStart) {
    return 1;
  }

  const fadeProgress = (progress - fadeStart) / (1 - fadeStart);

  return lerp(1, 0, smoothstep(fadeProgress));
}

/* =========================================================
   VOLUME SVG
   ========================================================= */

function createSwallowBulge(bodySvg) {
  if (!bodySvg) {
    return null;
  }

  const bulge = document.createElementNS(SVG_NAMESPACE, "circle");

  bulge.classList.add("snake-swallow-bulge");

  bulge.setAttribute("r", BODY_SWALLOW_RADIUS);

  bodySvg.appendChild(bulge);

  return bulge;
}

/* =========================================================
   PULSO POR SEGMENTO
   ========================================================= */

export function triggerSwallowSegment({
  bodySvg,
  bodyPath,
  latestSnakeLength,
  index,
  getBodyLength: getCachedLength,
}) {
  const bodyCount = Math.max(1, latestSnakeLength - 1);

  const rawRatio = clamp(index / bodyCount, 0, 1);

  const ratio = Math.min(rawRatio, SWALLOW_END_RATIO);

  const totalLength = getBodyLength({
    bodyPath,
    getCachedLength,
  });

  const point = getBodyPointAtRatio({
    bodyPath,
    ratio,
    totalLength,
  });

  if (!point) {
    return;
  }

  const bulge = createSwallowBulge(bodySvg);

  if (!bulge) {
    return;
  }

  bulge.setAttribute("cx", point.x);

  bulge.setAttribute("cy", point.y);

  bulge.setAttribute("r", getSwallowRadius(ratio));

  bulge.classList.add("is-pulsing");

  window.setTimeout(() => {
    bulge.remove();
  }, 260);
}

/* =========================================================
   ONDA CONTÍNUA
   ========================================================= */

export function triggerSwallowWave({
  bodySvg,
  bodyPath,
  latestSnakeLength,
  segmentDelay = 92,
  getBodyLength: getCachedLength,
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

    const progress = clamp((timestamp - startedAt) / duration, 0, 1);

    const ratio = 0.04 + progress * (SWALLOW_END_RATIO - 0.04);

    /*
     * O renderer já calculou
     * getTotalLength() neste frame.
     *
     * Aqui apenas reutilizamos
     * esse número.
     */

    const totalLength = getBodyLength({
      bodyPath,
      getCachedLength,
    });

    const point = getBodyPointAtRatio({
      bodyPath,
      ratio,
      totalLength,
    });

    if (point) {
      bulge.setAttribute("cx", point.x);

      bulge.setAttribute("cy", point.y);

      bulge.setAttribute("r", getSwallowRadius(ratio));

      bulge.style.opacity = getSwallowOpacity(progress);
    }

    if (progress < 1) {
      requestAnimationFrame(animate);

      return;
    }

    bulge.remove();

    requestAnimationFrame(() => {
      onComplete?.();
    });
  }

  requestAnimationFrame(animate);
}

/* =========================================================
   CRESCIMENTO NA CAUDA
   ========================================================= */

export function triggerGrowthArrival() {
  /*
   * Sem elemento visual adicional.
   *
   * A própria atualização do corpo
   * representa o crescimento.
   */
}

/* =========================================================
   SEQUÊNCIA COMPLETA
   ========================================================= */

export function triggerEatingSequence({
  headElement,
  bodySvg,
  bodyPath,
  latestSnakeLength,
  getBodyLength: getCachedLength,
  onMouseEnter,
  onSwallowComplete,
} = {}) {
  triggerBite(headElement);

  window.setTimeout(() => {
    onMouseEnter?.();
  }, 115);

  window.setTimeout(() => {
    triggerBiteClose(headElement);
  }, 300);

  window.setTimeout(() => {
    triggerSwallowWave({
      bodySvg,
      bodyPath,
      latestSnakeLength,

      segmentDelay: 92,

      getBodyLength: getCachedLength,

      onComplete: () => {
        onSwallowComplete?.();
      },
    });
  }, 360);

  window.setTimeout(() => {
    triggerChew(headElement);
  }, 440);

  window.setTimeout(() => {
    finishChew(headElement);
  }, 1340);
}
