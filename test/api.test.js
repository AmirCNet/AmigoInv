'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amigo-'));
process.env.DATA_FILE = path.join(tmp, 'sorteo.json');
const PW = 'clave-maestra-uap-2026';
process.env.ADMIN_KEY = PW;

const handler = require('../api/state');

function call(method, body) {
  return new Promise((resolve) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    req.method = method;
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(s) {
        resolve({ status: this.statusCode, body: JSON.parse(s) });
      },
    };
    handler(req, res);
  });
}

const post = (action, data) => call('POST', { action, ...data });
const NAMES = Array.from({ length: 50 }, (_, i) => `Persona ${i + 1}`);

test('flujo completo: blindaje con ADMIN_KEY, crear, revelar, PIN incorrecto, admin, reset', async () => {
  let r = await call('GET');
  assert.deepStrictEqual(r.body, { exists: false });

  // Nadie sin ADMIN_KEY puede crear el sorteo ni ver admin_status
  r = await post('create_draw', { names: NAMES });
  assert.strictEqual(r.status, 401);
  r = await post('create_draw', { names: NAMES, adminPassword: 'intruso' });
  assert.strictEqual(r.status, 401);
  r = await post('admin_status', { adminPassword: 'intruso' });
  assert.strictEqual(r.status, 401);

  // Con ADMIN_KEY cuando todavía no hay sorteo, admin_status devuelve exists: false
  r = await post('admin_status', { adminPassword: PW });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body, { exists: false });

  // Validaciones de creación (con clave maestra válida)
  r = await post('create_draw', { names: ['A', 'B'], adminPassword: PW });
  assert.strictEqual(r.status, 400);
  r = await post('create_draw', { names: ['Ana', 'ana ', 'Beto', 'Caro'], adminPassword: PW });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /repetidos/);
  r = await post('create_draw', { names: NAMES, exclusions: [['Persona 1', 'Fantasma']], adminPassword: PW });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error, /Fantasma/);

  // Crear OK con exclusiones
  const exclusions = [['Persona 1', 'Persona 2'], ['Persona 3', 'Persona 4', 'Persona 5']];
  r = await post('create_draw', { title: 'Concierto UAP', names: NAMES, exclusions, adminPassword: PW });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));

  // No se puede pisar un sorteo existente
  r = await post('create_draw', { names: NAMES, adminPassword: PW });
  assert.strictEqual(r.status, 409);

  // El estado público NO contiene asignaciones
  r = await call('GET');
  assert.strictEqual(r.body.participants.length, 50);
  const raw = JSON.stringify(r.body);
  assert.ok(!raw.includes('assign') && !raw.includes('target') && !raw.includes('adminHash'));

  // Todos revelan y el resultado es un ciclo válido
  const target = {};
  for (let i = 0; i < 50; i++) {
    r = await post('reveal', { id: i, pin: String(1000 + i) });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.created, true);
    assert.notStrictEqual(r.body.target, NAMES[i]);
    target[NAMES[i]] = r.body.target;
  }
  assert.strictEqual(new Set(Object.values(target)).size, 50);
  assert.notStrictEqual(target['Persona 1'], 'Persona 2');
  assert.notStrictEqual(target['Persona 2'], 'Persona 1');
  for (const a of ['Persona 3', 'Persona 4', 'Persona 5']) {
    assert.ok(!['Persona 3', 'Persona 4', 'Persona 5'].includes(target[a]));
  }

  // Volver a entrar con el mismo PIN muestra lo mismo
  r = await post('reveal', { id: 0, pin: '1000' });
  assert.strictEqual(r.body.target, target['Persona 1']);
  assert.strictEqual(r.body.created, false);

  // PIN inválido / incorrecto y bloqueo
  r = await post('reveal', { id: 0, pin: '12' });
  assert.strictEqual(r.status, 400);
  for (let k = 0; k < 4; k++) {
    r = await post('reveal', { id: 0, pin: '9999' });
    assert.strictEqual(r.status, 401);
  }
  r = await post('reveal', { id: 0, pin: '9999' });
  assert.strictEqual(r.status, 429);
  r = await post('reveal', { id: 0, pin: '1000' });
  assert.strictEqual(r.status, 429);

  // Admin: estado sin asignaciones
  r = await post('admin_status', { adminPassword: PW });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.exists, true);
  assert.ok(r.body.participants[0].locked);
  assert.ok(!/target|assign|adminHash/.test(JSON.stringify(r.body)));

  // Nadie sin clave maestra puede resetear PIN ni borrar el sorteo
  r = await post('reset_pin', { adminPassword: 'mal', id: 0 });
  assert.strictEqual(r.status, 401);
  r = await post('reset_all', { adminPassword: 'mal' });
  assert.strictEqual(r.status, 401);

  // Admin resetea PIN → la persona crea uno nuevo y ve el MISMO amigo
  r = await post('reset_pin', { adminPassword: PW, id: 0 });
  assert.strictEqual(r.status, 200);
  r = await post('reveal', { id: 0, pin: '4321' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.created, true);
  assert.strictEqual(r.body.target, target['Persona 1']);

  // Borrar todo
  r = await post('reset_all', { adminPassword: PW });
  assert.strictEqual(r.status, 200);
  r = await call('GET');
  assert.deepStrictEqual(r.body, { exists: false });
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
