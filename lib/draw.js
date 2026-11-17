'use strict';

/** Limpia espacios extra de un nombre. */
function cleanName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

/** Clave de comparación: sin mayúsculas, sin tildes, sin espacios extra. */
function nameKey(name) {
  return cleanName(name)
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Arma la matriz de prohibiciones: forbidden[i] = Set de índices a los que i NO puede regalar.
 * Cada grupo es una lista de índices que no pueden regalarse entre sí (en ninguna dirección).
 */
function buildForbidden(n, groups) {
  const forbidden = Array.from({ length: n }, (_, i) => new Set([i]));
  for (const group of groups || []) {
    for (const a of group) {
      for (const b of group) {
        if (a !== b) forbidden[a].add(b);
      }
    }
  }
  return forbidden;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Sortea un único gran ciclo (1 → 2 → 3 → ... → n → 1, en orden aleatorio) que respeta las
 * prohibiciones. Como es un solo ciclo de largo >= 3, nadie se regala a sí mismo, no hay
 * regalos recíprocos (A↔B) y no quedan subgrupos cerrados.
 *
 * Devuelve target[], donde target[i] = índice de la persona a la que i le regala.
 */
function drawCycle(n, forbidden, rng = Math.random, { restarts = 60, stepsPerRestart = 200000 } = {}) {
  if (n < 3) throw new Error('Se necesitan al menos 3 participantes.');

  const allowed = (a, b) => !forbidden[a].has(b);

  // Chequeo rápido: alguien sin ninguna opción posible.
  for (let i = 0; i < n; i++) {
    let options = 0;
    for (let j = 0; j < n; j++) if (allowed(i, j)) options++;
    if (options < 1) {
      throw new Error('Las restricciones hacen imposible el sorteo (alguien se quedó sin opciones).');
    }
  }

  for (let attempt = 0; attempt < restarts; attempt++) {
    const start = Math.floor(rng() * n);
    const path = [start];
    const visited = new Array(n).fill(false);
    visited[start] = true;
    let steps = 0;

    const dfs = () => {
      if (++steps > stepsPerRestart) return null; // presupuesto agotado → reintentar
      const last = path[path.length - 1];
      if (path.length === n) return allowed(last, start);
      const candidates = [];
      for (let j = 0; j < n; j++) if (!visited[j] && allowed(last, j)) candidates.push(j);
      shuffle(candidates, rng);
      for (const c of candidates) {
        visited[c] = true;
        path.push(c);
        const r = dfs();
        if (r) return true;
        path.pop();
        visited[c] = false;
        if (r === null) return null;
      }
      return false;
    };

    const result = dfs();
    if (result) {
      const target = new Array(n);
      for (let k = 0; k < n; k++) target[path[k]] = path[(k + 1) % n];
      return target;
    }
    if (result === false) break; // búsqueda completa sin solución → imposible
  }

  throw new Error(
    'No se pudo armar el sorteo con esas restricciones. Probá sacando alguna exclusión.'
  );
}

module.exports = { cleanName, nameKey, buildForbidden, drawCycle };
