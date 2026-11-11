'use strict';

// HU-04 · Lo que ve la persona antes de guardar el censo (el resumen) y lo que se guarda.
// Funciones puras: no tocan la base ni el disco, y por eso se prueban solas.

const { esCandidato, normalizar, recortar } = require('./reglas');

const LARGO_MAXIMO_BUSQUEDA = 200; // estancias.nombre_busqueda (database/01-esquema.sql)
const { fechaCorta } = require('./fechas');

const MAXIMO_FILAS_LISTADAS = 10;

/** "9", "9 y 10", "9, 10 y 12" (y si son muchas, las primeras 10 "y N más"). */
function listarFilas(numeros) {
  if (numeros.length > MAXIMO_FILAS_LISTADAS) {
    const primeras = numeros.slice(0, MAXIMO_FILAS_LISTADAS);
    return `${primeras.join(', ')} y ${numeros.length - MAXIMO_FILAS_LISTADAS} más`;
  }
  if (numeros.length === 1) return String(numeros[0]);
  return `${numeros.slice(0, -1).join(', ')} y ${numeros.at(-1)}`;
}

const plural = (cantidad, singular, varios) => `${cantidad} ${cantidad === 1 ? singular : varios}`;

/** HU-04.7 */
function avisoYaExiste(fecha) {
  return `Ya hay un censo del ${fechaCorta(fecha)}. Se agregarán solo los pacientes nuevos; lo que ya se revisó se conserva.`;
}

/** CB-04: "3 filas no se pudieron leer (filas 9, 10 y 12)." */
function avisoSaltadas(saltadas) {
  const numeros = saltadas.map((s) => s.fila);
  if (numeros.length === 1) return `1 fila no se pudo leer (fila ${numeros[0]}).`;
  return `${numeros.length} filas no se pudieron leer (filas ${listarFilas(numeros)}).`;
}

/** CB-05: "Una cédula aparece 2 veces; se tomó la fila 4." (uno por cada cédula repetida) */
function avisosRepetidas(repetidas) {
  const porFila = new Map();
  for (const { filaTomada } of repetidas) porFila.set(filaTomada, (porFila.get(filaTomada) ?? 1) + 1);
  return [...porFila].map(([fila, veces]) => `Una cédula aparece ${veces} veces; se tomó la fila ${fila}.`);
}

/**
 * El resumen de HU-04.1, a partir de lo que devolvió leerCenso.
 * @param fecha     la fecha del censo: la del archivo o, si no tiene, la que eligió la persona
 * @param yaExiste  si ya hay un censo guardado de esa fecha (HU-04.7)
 * @param avisosExtra avisos de la ruta (por ejemplo, una fecha elegida que no sirve)
 */
function armarResumen(censo, { fecha = censo.fecha, yaExiste = false, avisosExtra = [] } = {}) {
  const pacientes = censo.filas.length;
  const paraRevisar = censo.filas.filter(esCandidato).length;
  const cifras = `${plural(pacientes, 'paciente', 'pacientes')} · ${paraRevisar} para revisar`;

  const avisos = [];
  if (fecha && yaExiste) avisos.push(avisoYaExiste(fecha));
  avisos.push(...avisosExtra);
  if (censo.saltadas.length > 0) avisos.push(avisoSaltadas(censo.saltadas));
  avisos.push(...avisosRepetidas(censo.repetidas));

  return {
    fecha: fecha ?? null,
    sinFecha: !censo.fecha, // HU-04.5: el archivo no trae "Generado el"
    linea: fecha ? `Censo del ${fechaCorta(fecha)} · ${cifras}` : `Censo · ${cifras}`,
    avisos,
    pacientes,
    paraRevisar,
  };
}

/**
 * Lo que se guarda (CL-02 y RN-01): solo los candidatos (día 0 o 1, sin Quirófano), y de
 * cada uno solo servicio, cama, cédula, nombre, fecha de ingreso y días, más el orden de su
 * fila (RN-09) y el nombre sin tildes para buscar (HU-13).
 */
function candidatosParaGuardar(filas) {
  return filas.filter(esCandidato).map((f) => ({
    cedula: f.cedula,
    fecha_ingreso: f.fechaIngreso,
    nombre: f.nombre,
    // Se recorta DESPUÉS de quitar las tildes: algunos caracteres se convierten en varios
    // y el nombre podía pasarse del largo de la base (PYA tanda 4).
    nombre_busqueda: recortar(normalizar(f.nombre), LARGO_MAXIMO_BUSQUEDA),
    piso: f.piso,
    cama: f.cama,
    dias: f.dias,
    orden: f.fila,
  }));
}

module.exports = { armarResumen, candidatosParaGuardar, avisoYaExiste, listarFilas };
