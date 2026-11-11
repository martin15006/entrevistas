'use strict';

// Lo que el servidor escribe en su registro (la terminal o los logs del hosting).
// RNF-08: nunca nombres, cédulas ni datos de las entrevistas. Por eso de un error se
// anota SOLO su código (ej. "23505", "PGRST116") y nunca su texto: el mensaje de un
// error de la base puede traer datos ("ya existe la cédula 123…").

const CODIGO_SEGURO = /^[A-Za-z0-9_.-]{1,40}$/;

function codigoDe(error) {
  const candidato = error?.code ?? error?.codigo ?? error?.name;
  return typeof candidato === 'string' && CODIGO_SEGURO.test(candidato) ? candidato : 'sin-codigo';
}

/**
 * Anota un error. `contexto` lo escribimos nosotros (ej. "leer perfil"), nunca viene
 * de la persona ni del archivo.
 */
function registrarError(contexto, error) {
  const estado = Number.isInteger(error?.status) ? ` (${error.status})` : '';
  console.error(`[${new Date().toISOString()}] ${contexto}: ${codigoDe(error)}${estado}`);
}

module.exports = { registrarError, codigoDe };
