'use strict';

// Reglas del negocio y de los datos (SRS §3, "Reglas de datos" y "Reglas de negocio").
// Son funciones puras: no tocan la base de datos ni archivos, y por eso se prueban solas.

/**
 * Texto para comparar o buscar: sin tildes, sin diferencia entre ñ y n,
 * en minúsculas y con un solo espacio entre palabras.
 */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD') // separa cada letra de su tilde: "ó" → "o" + tilde
    .replace(/\p{M}/gu, '') // \p{M} = cualquier marca (tilde, virgulilla de la ñ…)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quita los espacios del principio y del final, y deja uno solo entre palabras. */
function limpiarTexto(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Recorta un texto a `maximo` caracteres, contados como los cuenta la base (por carácter, no
 * por "unidad" de JavaScript): así nunca se parte en dos un carácter especial (PYA tanda 4).
 */
function recortar(texto, maximo) {
  const caracteres = Array.from(String(texto ?? ''));
  return caracteres.length > maximo ? caracteres.slice(0, maximo).join('') : String(texto ?? '');
}

/** Nombre del paciente: en mayúsculas y sin espacios dobles (CB-08). */
function limpiarNombre(texto) {
  return limpiarTexto(texto).toLocaleUpperCase('es-CO');
}

/**
 * Cédula tal como viene del censo, sin espacios ni puntos (CB-08).
 * Puede traer letras (pasaportes), que quedan en mayúsculas.
 */
function limpiarCedula(valor) {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor > 0 ? String(valor) : '';
  }
  let texto = String(valor ?? '').trim();
  if (/^\d+\.0+$/.test(texto)) texto = texto.replace(/\.0+$/, ''); // "9900000001.0" → número entero
  return texto.replace(/[\s.,]/g, '').toUpperCase();
}

/**
 * La columna "Días" como número entero de 0 en adelante (CB-06).
 * Acepta 1, 1.0, "1" y "1.0". Devuelve null si está vacía, no es un número
 * entero o es negativa: en ese caso la fila se salta (CB-04).
 */
function leerDias(valor) {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor >= 0 ? valor : null;
  }
  const texto = String(valor ?? '').trim().replace(',', '.');
  if (!/^\d+(\.0+)?$/.test(texto)) return null;
  return Number.parseInt(texto, 10);
}

/** RN-01 · Candidato: día 0 o 1, en cualquier servicio menos Quirófano. */
function esCandidato({ piso, dias }) {
  return (dias === 0 || dias === 1) && normalizar(piso) !== 'quirofano';
}

/** RN-02 · Misma cédula y misma fecha de ingreso = misma estancia. */
function claveEstancia({ cedula, fechaIngreso }) {
  return `${cedula}|${fechaIngreso}`;
}

module.exports = {
  normalizar,
  limpiarTexto,
  limpiarNombre,
  limpiarCedula,
  leerDias,
  esCandidato,
  claveEstancia,
  recortar,
};
