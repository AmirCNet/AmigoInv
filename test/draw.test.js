'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildForbidden, drawCycle, nameKey } = require('../lib/draw');

function randomGroups(n, rng) {
  // 10 parejas + 2 familias de 4, sin repetir personas
  const ids = Array.from({ length: n }, (_, i) => i).sort(() => rng() - 0.5);
  const groups = [];
  let k = 0;
  for (let p = 0; p < 10; p++) groups.push([ids[k++], ids[k++]]);
  for (let f = 0; f < 2; f++) groups.push([ids[k++], ids[k++], ids[k++], ids[k++]]);
  return groups;
}

function checkCycle(target, forbidden) {
  const n = target.length;
  // biyección: todos regalan 1 y reciben 1
  assert.strictEqual(new Set(target).size, n);
  for (let i = 0; i < n; i++) {
    assert.notStrictEqual(target[i], i, 'nadie se regala a sí mismo');
    assert.ok(!forbidden[i].has(target[i]), 'respeta exclusiones');
    assert.notStrictEqual(target[target[i]], i, 'sin regalos recíprocos A↔B');
  }
  // un único ciclo que pasa por todos
  let cur = 0;
  let len = 0;
  do {
    cur = target[cur];
    len++;
  } while (cur !== 0 && len <= n);
  assert.strictEqual(len, n, 'un solo gran ciclo');
}

test('1000 sorteos de 50 personas con exclusiones son siempre válidos', () => {
  for (let run = 0; run < 1000; run++) {
    const groups = randomGroups(50, Math.random);
    const forbidden = buildForbidden(50, groups);
    checkCycle(drawCycle(50, forbidden), forbidden);
  }
});

test('sorteos sin exclusiones para tamaños chicos (3 a 10)', () => {
  for (let n = 3; n <= 10; n++) {
    for (let run = 0; run < 50; run++) {
      const forbidden = buildForbidden(n, []);
      checkCycle(drawCycle(n, forbidden), forbidden);
    }
  }
});

test('detecta restricciones imposibles', () => {
  assert.throws(() => drawCycle(3, buildForbidden(3, [[0, 1]])), /restricciones/);
  assert.throws(() => drawCycle(4, buildForbidden(4, [[0, 1, 2]])), /restricciones/);
  assert.throws(() => drawCycle(2, buildForbidden(2, [])), /al menos 3/);
});

test('nameKey ignora mayúsculas, tildes y espacios', () => {
  assert.strictEqual(nameKey('  María   López '), nameKey('maria lopez'));
});
