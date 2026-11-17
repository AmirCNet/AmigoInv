'use strict';
const fs = require('fs');
const path = require('path');

/**
 * Almacenamiento clave/valor con dos implementaciones:
 *  - Upstash Redis (producción en Vercel), si existen las variables de entorno.
 *  - Archivo JSON local (desarrollo en tu PC).
 * Todas las funciones son async y los valores se guardan como JSON.
 */

function redisStorage(url, token) {
  const base = url.replace(/\/+$/, '');
  async function cmd(args) {
    const res = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(`Redis: ${json.error || res.status}`);
    return json.result;
  }
  const parse = (v) => (v === null || v === undefined ? null : JSON.parse(v));
  return {
    kind: 'redis',
    async get(key) {
      return parse(await cmd(['GET', key]));
    },
    async mget(keys) {
      if (!keys.length) return [];
      return (await cmd(['MGET', ...keys])).map(parse);
    },
    async set(key, value, { nx = false } = {}) {
      const args = ['SET', key, JSON.stringify(value)];
      if (nx) args.push('NX');
      return (await cmd(args)) === 'OK';
    },
    async del(...keys) {
      if (keys.length) await cmd(['DEL', ...keys]);
    },
  };
}

function fileStorage(file) {
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const write = (data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  return {
    kind: 'file',
    async get(key) {
      const d = read();
      return has(d, key) ? d[key] : null;
    },
    async mget(keys) {
      const d = read();
      return keys.map((k) => (has(d, k) ? d[k] : null));
    },
    async set(key, value, { nx = false } = {}) {
      const d = read();
      if (nx && has(d, key)) return false;
      d[key] = value;
      write(d);
      return true;
    },
    async del(...keys) {
      const d = read();
      for (const k of keys) delete d[k];
      write(d);
    },
  };
}

function createStorage() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return redisStorage(url, token);
  if (process.env.VERCEL) {
    throw new Error(
      'Falta conectar la base de datos (Upstash Redis) en Vercel. Mirá el README, paso "Storage".'
    );
  }
  const file = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'sorteo.json');
  return fileStorage(file);
}

module.exports = { createStorage };
