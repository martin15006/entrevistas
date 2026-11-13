'use strict';

// Reglas del negocio y de los datos (SRS §3, "Reglas de datos" y "Reglas de negocio").
// Son funciones puras: no tocan la base de datos ni archivos, y por eso se prueban solas.

const { esFechaIso } = require('./fechas');

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

// --- HU-09 · La entrevista ---

/** HU-09.2 · Los tipos de declaración, en el orden de los botones (D3: esos 7). */
const TIPOS_DE_DECLARACION = Object.freeze([
  { valor: 'C/M', texto: 'C/M' }, { valor: 'P/M', texto: 'P/M' }, { valor: 'C/A', texto: 'C/A' },
  { valor: 'P/A', texto: 'P/A' }, { valor: 'PEATON', texto: 'Peatón' }, { valor: 'CICLISTA', texto: 'Ciclista' },
  { valor: 'OTRO', texto: 'Otro' },
]);
const ES_TIPO = new Set(TIPOS_DE_DECLARACION.map((t) => t.valor));

/** HU-09.2 · Los campos en el orden del formulario: así se baja al PRIMERO que falta (HU-09.5). */
const CAMPOS_DE_LA_ENTREVISTA = Object.freeze([
  'edad', 'fecha_accidente', 'hora_accidente', 'lugar', 'direccion', 'telefono', 'tipo_declaracion', 'relato', 'placa',
]);

const MAXIMOS = Object.freeze({ lugar: 200, direccion: 200, relato: 500 }); // las mismas reglas de la tabla
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** CB-13 · En Edad y Teléfono se quedan solo los números (también si se pegó texto). */
const soloNumeros = (texto) => String(texto ?? '').replace(/\D/g, '');

/** HU-09.7 · "abc 12d" → "ABC12D": en mayúsculas y sin espacios ni guiones. */
const limpiarPlaca = (texto) => String(texto ?? '').toUpperCase().replace(/[\s-]/g, '');

const largo = (texto) => Array.from(texto).length; // como la base: por carácter

// Lo que no se ve (controles, ancho cero, marcas de dirección y BOM): se quita (PYA tanda 9).
const INVISIBLES = /[\x01-\x08\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
// Los espacios de cualquier tipo, menos el salto de línea (para el relato).
const ESPACIOS_SIN_SALTO = /[\t \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g;

/**
 * Lugar, dirección y relato tal como se guardan (la base hace lo mismo: texto_limpio, database/10):
 * los saltos \r\n como uno, sin invisibles, los espacios juntos como uno y nada en los bordes.
 * Con variasLineas (el relato) se respetan los saltos de línea.
 */
function limpiarEscrito(texto, { variasLineas = false } = {}) {
  const sinInvisibles = String(texto ?? '').replace(/\r\n/g, '\n').replace(INVISIBLES, '');
  return sinInvisibles.replace(variasLineas ? ESPACIOS_SIN_SALTO : /\s+/g, ' ').replace(/^\s+|\s+$/g, '');
}

/**
 * HU-09.4 a 09.7 · RN-10 · Revisa lo que se escribió en el formulario.
 * @param campos lo que llegó (textos), con los nombres de CAMPOS_DE_LA_ENTREVISTA y placa_no_sabe
 * @param hoy    'AAAA-MM-DD' en Colombia (la fecha del accidente no puede ser posterior)
 * @returns { malo: true } si llegó algo que el formulario no puede mandar (otro tipo, más largo que
 *          el campo, una hora que no es hora): eso no lo escribió una persona.
 *          Si no, { datos, errores, primero }: errores por campo con el texto exacto del SRS, y datos
 *          listos para guardar_entrevista (solo si no hay errores).
 */
function validarEntrevista(campos, hoy) {
  const leidos = {};
  for (const nombre of [...CAMPOS_DE_LA_ENTREVISTA, 'placa_no_sabe']) {
    const valor = campos?.[nombre];
    if (valor !== undefined && typeof valor !== 'string') return { malo: true };
    leidos[nombre] = valor ?? '';
  }

  const edad = soloNumeros(leidos.edad);
  const fecha = leidos.fecha_accidente.trim();
  const hora = leidos.hora_accidente.trim();
  const lugar = limpiarEscrito(leidos.lugar);
  const direccion = limpiarEscrito(leidos.direccion);
  const telefono = soloNumeros(leidos.telefono);
  const tipo = leidos.tipo_declaracion;
  // El navegador manda los saltos de línea como \r\n: se cuentan como uno, igual que en la pantalla (CB-12).
  const relato = limpiarEscrito(leidos.relato, { variasLineas: true });
  const noSabe = leidos.placa_no_sabe === 'si';
  const placa = noSabe ? '' : limpiarPlaca(leidos.placa);

  if ((hora && !HORA.test(hora)) || (tipo && !ES_TIPO.has(tipo))
      || largo(lugar) > MAXIMOS.lugar || largo(direccion) > MAXIMOS.direccion || largo(relato) > MAXIMOS.relato) {
    return { malo: true };
  }

  const errores = {};
  // HU-09.5 · RN-10 · Los 5 obligatorios.
  if (!edad) errores.edad = 'faltaDato';
  else if (Number(edad) > 120) errores.edad = 'edadFuera'; // HU-09.6 (con solo números, nunca es negativa)
  if (!fecha || !esFechaIso(fecha)) errores.fecha_accidente = 'faltaDato';
  else if (fecha > hoy) errores.fecha_accidente = 'fechaAccidenteFutura';
  if (!lugar) errores.lugar = 'faltaDato';
  if (telefono && (telefono.length < 7 || telefono.length > 10)) errores.telefono = 'telefonoFuera';
  if (!tipo) errores.tipo_declaracion = 'faltaDato';
  if (!relato) errores.relato = 'faltaDato';
  if (placa && !/^[A-Z0-9]{1,7}$/.test(placa)) errores.placa = 'placaFuera';

  const primero = CAMPOS_DE_LA_ENTREVISTA.find((nombre) => errores[nombre]) ?? null;
  if (primero) return { datos: null, errores, primero };

  return {
    errores: {},
    primero: null,
    datos: {
      edad: Number(edad),
      fecha_accidente: fecha,
      hora_accidente: hora || null,
      lugar,
      direccion: direccion || null,
      telefono: telefono || null,
      tipo_declaracion: tipo,
      relato,
      placa: placa || null,
      placa_no_sabe: noSabe,
    },
  };
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
  TIPOS_DE_DECLARACION,
  CAMPOS_DE_LA_ENTREVISTA,
  MAXIMOS,
  soloNumeros,
  limpiarPlaca,
  limpiarEscrito,
  validarEntrevista,
};
