'use strict';

// Firmar textos con la CLAVE_FIRMA del .env, para saber si alguien los cambió.

const crypto = require('node:crypto');

/** Firma de `texto` para un `proposito` (así una firma de un uso no sirve para otro). */
function firmar(proposito, texto, clave) {
  return crypto.createHmac('sha256', clave).update(`${proposito}:${texto}`).digest('base64url');
}

/** Compara dos textos sin dar pistas por lo que tarda (evita adivinar letra por letra). */
function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { firmar, iguales };
