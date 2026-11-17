'use strict';
const { createStorage } = require('../lib/storage');
const { hashSecret, verifySecret, safeEqual, encrypt, decrypt, randomId } = require('../lib/secure');
const { cleanName, nameKey, buildForbidden, drawCycle } = require('../lib/draw');

const P = 'ai:';
const META = `${P}meta`;
const MAX_PIN_FAILS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;
const MAX_ADMIN_FAILS = 10;
const ADMIN_LOCK_MS = 10 * 60 * 1000;
const MAX_PARTICIPANTS = 200;

const pinKey = (d, i) => `${P}pin:${d}:${i}`;
const seenKey = (d, i) => `${P}seen:${d}:${i}`;
const failKey = (d, i) => `${P}fail:${d}:${i}`;
const ADMIN_FAIL = `${P}adminfail`;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString() || '{}');
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString();
  return s ? JSON.parse(s) : {};
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function requireMeta(store) {
  const meta = await store.get(META);
  if (!meta) throw new HttpError(404, 'Todavía no hay ningún sorteo creado.');
  return meta;
}

function parseId(meta, raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 0 || id >= meta.names.length) {
    throw new HttpError(400, 'Participante inválido.');
  }
  return id;
}

const minutes = (ms) => Math.max(1, Math.ceil(ms / 60000));

/* ----------------------------- Acciones ----------------------------- */

async function publicState(store) {
  const meta = await store.get(META);
  if (!meta) return { exists: false };
  const pins = await store.mget(meta.names.map((_, i) => pinKey(meta.drawId, i)));
  return {
    exists: true,
    drawId: meta.drawId,
    title: meta.title,
    createdAt: meta.createdAt,
    participants: meta.names.map((name, i) => ({ id: i, name, hasPin: pins[i] !== null })),
  };
}

async function createDraw(store, body) {
  await requireAdminKey(store, body);
  if (await store.get(META)) {
    throw new HttpError(409, 'Ya existe un sorteo. Para hacer otro, el organizador tiene que borrarlo primero.');
  }

  const names = (Array.isArray(body.names) ? body.names : []).map(cleanName).filter(Boolean);
  if (names.length < 3) throw new HttpError(400, 'Se necesitan al menos 3 participantes.');
  if (names.length > MAX_PARTICIPANTS) throw new HttpError(400, `Máximo ${MAX_PARTICIPANTS} participantes.`);

  const index = new Map();
  const dups = new Set();
  names.forEach((n, i) => {
    const k = nameKey(n);
    if (index.has(k)) dups.add(n);
    else index.set(k, i);
  });
  if (dups.size) {
    throw new HttpError(400, `Hay nombres repetidos: ${[...dups].join(', ')}. Agregales apellido o apodo.`);
  }

  const unknown = new Set();
  const groups = [];
  for (const g of Array.isArray(body.exclusions) ? body.exclusions : []) {
    if (!Array.isArray(g)) continue;
    const idx = [];
    for (const raw of g) {
      const n = cleanName(raw);
      if (!n) continue;
      const i = index.get(nameKey(n));
      if (i === undefined) unknown.add(n);
      else idx.push(i);
    }
    if (idx.length >= 2) groups.push(idx);
  }
  if (unknown.size) {
    throw new HttpError(400, `En las exclusiones hay nombres que no están en la lista: ${[...unknown].join(', ')}.`);
  }

  let target;
  try {
    target = drawCycle(names.length, buildForbidden(names.length, groups));
  } catch (e) {
    throw new HttpError(400, e.message);
  }

  const drawId = randomId();
  const meta = {
    version: 1,
    drawId,
    title: cleanName(body.title).slice(0, 80) || 'Amigo Invisible',
    createdAt: new Date().toISOString(),
    names,
    assignments: target.map((t, i) => encrypt(String(t), drawId, i)),
  };
  if (!(await store.set(META, meta, { nx: true }))) {
    throw new HttpError(409, 'Alguien creó un sorteo al mismo tiempo. Recargá la página.');
  }
  return { ok: true, drawId, count: names.length };
}

async function reveal(store, body) {
  const meta = await requireMeta(store);
  const id = parseId(meta, body.id);
  const pin = String(body.pin || '');
  if (!/^\d{4}$/.test(pin)) throw new HttpError(400, 'El PIN tiene que ser de 4 números.');

  const d = meta.drawId;
  const now = Date.now();
  const fail = (await store.get(failKey(d, id))) || { count: 0, lockUntil: 0 };
  if (fail.lockUntil > now) {
    throw new HttpError(429, `Demasiados intentos fallidos. Probá de nuevo en ${minutes(fail.lockUntil - now)} min.`);
  }

  let stored = await store.get(pinKey(d, id));
  let created = false;
  if (stored === null) {
    const h = hashSecret(pin);
    if (await store.set(pinKey(d, id), h, { nx: true })) {
      created = true;
      stored = h;
    } else {
      stored = await store.get(pinKey(d, id)); // otro lo creó justo al mismo tiempo
    }
  }

  if (!created && !verifySecret(pin, stored)) {
    const count = fail.count + 1;
    if (count >= MAX_PIN_FAILS) {
      await store.set(failKey(d, id), { count: 0, lockUntil: now + PIN_LOCK_MS });
      throw new HttpError(429, `PIN incorrecto. Por seguridad se bloqueó por ${minutes(PIN_LOCK_MS)} min.`);
    }
    await store.set(failKey(d, id), { count, lockUntil: 0 });
    const left = MAX_PIN_FAILS - count;
    throw new HttpError(401, `PIN incorrecto. Te quedan ${left} intento${left === 1 ? '' : 's'}.`);
  }

  if (fail.count || fail.lockUntil) await store.del(failKey(d, id));
  await store.set(seenKey(d, id), now);

  const t = Number(decrypt(meta.assignments[id], d, id));
  return { name: meta.names[id], target: meta.names[t], created };
}

async function requireAdminKey(store, body) {
  const masterKey = process.env.ADMIN_KEY || (process.env.VERCEL ? '' : 'admin');
  if (!masterKey) {
    throw new HttpError(
      503,
      'Falta configurar la variable ADMIN_KEY en Vercel (Settings → Environment Variables).'
    );
  }
  const now = Date.now();
  const fail = (await store.get(ADMIN_FAIL)) || { count: 0, lockUntil: 0 };
  if (fail.lockUntil > now) {
    throw new HttpError(429, `Demasiados intentos. Probá de nuevo en ${minutes(fail.lockUntil - now)} min.`);
  }
  const provided = String(body.adminPassword || '');
  if (!provided || !safeEqual(provided, masterKey)) {
    const count = fail.count + 1;
    await store.set(
      ADMIN_FAIL,
      count >= MAX_ADMIN_FAILS ? { count: 0, lockUntil: now + ADMIN_LOCK_MS } : { count, lockUntil: 0 }
    );
    throw new HttpError(401, 'Clave maestra de organizador incorrecta.');
  }
  if (fail.count || fail.lockUntil) await store.del(ADMIN_FAIL);
}

async function requireAdmin(store, body) {
  await requireAdminKey(store, body);
  return requireMeta(store);
}

async function adminStatus(store, body) {
  await requireAdminKey(store, body);
  const meta = await store.get(META);
  if (!meta) return { exists: false };
  const d = meta.drawId;
  const ids = meta.names.map((_, i) => i);
  const [pins, seen, fails] = await Promise.all([
    store.mget(ids.map((i) => pinKey(d, i))),
    store.mget(ids.map((i) => seenKey(d, i))),
    store.mget(ids.map((i) => failKey(d, i))),
  ]);
  const now = Date.now();
  // Importante: acá NUNCA se devuelven las asignaciones.
  return {
    exists: true,
    title: meta.title,
    createdAt: meta.createdAt,
    participants: meta.names.map((name, i) => ({
      id: i,
      name,
      hasPin: pins[i] !== null,
      lastSeen: seen[i] || null,
      locked: !!(fails[i] && fails[i].lockUntil > now),
    })),
  };
}

async function resetPin(store, body) {
  const meta = await requireAdmin(store, body);
  const id = parseId(meta, body.id);
  await store.del(pinKey(meta.drawId, id), failKey(meta.drawId, id));
  return { ok: true };
}

async function resetAll(store, body) {
  const meta = await requireAdmin(store, body);
  const d = meta.drawId;
  const keys = [META];
  meta.names.forEach((_, i) => keys.push(pinKey(d, i), seenKey(d, i), failKey(d, i)));
  await store.del(...keys);
  return { ok: true };
}

const ACTIONS = {
  create_draw: createDraw,
  reveal,
  admin_status: adminStatus,
  reset_pin: resetPin,
  reset_all: resetAll,
};

module.exports = async function handler(req, res) {
  try {
    const store = createStorage();
    if (req.method === 'GET') return send(res, 200, await publicState(store));
    if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' });

    let body;
    try {
      body = (await readBody(req)) || {};
    } catch {
      return send(res, 400, { error: 'Pedido inválido.' });
    }
    const fn = ACTIONS[body.action];
    if (!fn) return send(res, 400, { error: 'Acción desconocida.' });
    return send(res, 200, await fn(store, body));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: e.message || 'Error interno.' });
  }
};
