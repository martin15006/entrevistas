'use strict';

// Token anti-falsificación (RNF-06, CL-04). El servidor guarda en una cookie un valor al
// azar con su firma, y pone ese valor en cada página. Un formulario solo se acepta si
// trae el mismo valor: otra página web no lo conoce, así que no puede enviar nada a
// nombre de la persona.

const crypto = require('node:crypto');
const { firmar, iguales } = require('./firma');

function crearToken(clave) {
  const valor = crypto.randomBytes(32).toString('base64url');
  return { valor, cookie: `${valor}.${firmar('csrf', valor, clave)}` };
}

/** El valor guardado en la cookie, si su firma es buena; null si no. */
function leerToken(cookie, clave) {
  if (typeof cookie !== 'string') return null;
  const [valor, firma, sobra] = cookie.split('.');
  if (!valor || !firma || sobra !== undefined) return null;
  return iguales(firma, firmar('csrf', valor, clave)) ? valor : null;
}

/** ¿El token enviado coincide con el de la cookie firmada? */
function tokenValido(enviado, cookie, clave) {
  const valor = leerToken(cookie, clave);
  return valor !== null && iguales(enviado, valor);
}

module.exports = { crearToken, leerToken, tokenValido };
