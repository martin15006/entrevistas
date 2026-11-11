'use strict';

// HU-01.6 y RNF-07: la sesión se cierra tras 8 horas sin uso.
// La "marca" es la hora de la última acción, firmada y atada a la cuenta (PYA tanda 3):
// si alguien le cambia la hora para quedarse dentro, o la usa con la sesión de otra
// persona, la firma deja de coincidir.

const { firmar, iguales } = require('./firma');

const LIMITE_INACTIVIDAD_MS = 8 * 60 * 60 * 1000;

function crearMarca(ahora, clave, usuarioId) {
  return `${ahora}.${firmar('actividad', `${usuarioId}:${ahora}`, clave)}`;
}

/** ¿La marca es auténtica, de ESTA cuenta, y su última acción fue hace menos de 8 horas? */
function sigueActiva(marca, ahora, clave, usuarioId) {
  if (typeof marca !== 'string' || typeof usuarioId !== 'string' || !usuarioId) return false;
  const [texto, firma, sobra] = marca.split('.');
  if (sobra !== undefined) return false;
  const momento = Number(texto);
  if (!Number.isSafeInteger(momento) || momento > ahora) return false; // una hora del futuro no vale
  if (!iguales(firma, firmar('actividad', `${usuarioId}:${texto}`, clave))) return false;
  return ahora - momento < LIMITE_INACTIVIDAD_MS;
}

module.exports = { crearMarca, sigueActiva, LIMITE_INACTIVIDAD_MS };
