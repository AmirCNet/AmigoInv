'use strict';
const crypto = require('crypto');

function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Hashea un secreto (PIN o clave de admin) con scrypt + salt. Formato: "salt:hash". */
function hashSecret(secret) {
  const salt = randomId(16);
  const hash = crypto.scryptSync(String(secret), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifySecret(secret, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(secret), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function deriveKey(drawId) {
  const secret = process.env.APP_SECRET || 'amigo-invisible-sin-secreto';
  return crypto.createHash('sha256').update(`${secret}|${drawId}`).digest();
}

/**
 * Cifra la asignación de un participante (AES-256-GCM). Así, aunque alguien mire la base de datos,
 * no ve los nombres de quién le regala a quién a simple vista.
 */
function encrypt(text, drawId, index) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(drawId), iv);
  cipher.setAAD(Buffer.from(`${drawId}:${index}`));
  const ct = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString('base64')).join('.');
}

function decrypt(payload, drawId, index) {
  const [iv, tag, ct] = String(payload).split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(drawId), iv);
  decipher.setAAD(Buffer.from(`${drawId}:${index}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a).length === String(b).length;
}

module.exports = { randomId, hashSecret, verifySecret, safeEqual, encrypt, decrypt };
