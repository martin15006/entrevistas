'use strict';

// HU-04 · El resumen que se ve antes de guardar y lo que se guarda (funciones puras).

const test = require('node:test');
const assert = require('node:assert/strict');
const { armarResumen, candidatosParaGuardar, listarFilas } = require('../lib/resumen-censo');

/** Un paciente leído del censo (como lo devuelve leerCenso). Datos inventados (CL-01). */
const fila = (datos) => ({
  fila: 4, piso: 'Observacion', cama: '1 (Hombre)', cedula: '9900000001', nombre: 'ANA PRUEBA ÑÚÑEZ',
  fechaIngreso: '2026-11-06', dias: 0, ...datos,
});

/** Un censo leído con N pacientes, de los que los primeros `candidatos` tienen día 0. */
function censo({ pacientes = 47, candidatos = 12, fecha = '2026-11-06', saltadas = [], repetidas = [] } = {}) {
  const filas = Array.from({ length: pacientes }, (_, i) => fila({
    fila: 4 + i, cedula: String(9900000001 + i), dias: i < candidatos ? 0 : 5,
  }));
  return { fecha, filas, saltadas, repetidas };
}

test('HU-04.1 · la línea del resumen dice la fecha, los pacientes y cuántos hay para revisar', () => {
  const resumen = armarResumen(censo());
  assert.equal(resumen.linea, 'Censo del 06/11/2026 · 47 pacientes · 12 para revisar');
  assert.equal(resumen.pacientes, 47);
  assert.equal(resumen.paraRevisar, 12);
  assert.equal(resumen.fecha, '2026-11-06');
  assert.equal(resumen.sinFecha, false);
  assert.deepEqual(resumen.avisos, []);
  assert.equal(armarResumen(censo({ pacientes: 1, candidatos: 1 })).linea, 'Censo del 06/11/2026 · 1 paciente · 1 para revisar');
  assert.equal(armarResumen(censo({ pacientes: 3, candidatos: 0 })).linea, 'Censo del 06/11/2026 · 3 pacientes · 0 para revisar');
});

test('HU-04.1 · RN-01 · Quirófano no cuenta para revisar, aunque tenga día 0', () => {
  const leido = censo({ pacientes: 2, candidatos: 2 });
  leido.filas[1].piso = 'Quirofano';
  assert.equal(armarResumen(leido).paraRevisar, 1);
});

test('HU-04.5 · sin "Generado el", el resumen pide la fecha; con la elegida, la muestra', () => {
  const sinFecha = censo({ fecha: null });
  const nada = armarResumen(sinFecha);
  assert.equal(nada.sinFecha, true);
  assert.equal(nada.fecha, null);
  assert.equal(nada.linea, 'Censo · 47 pacientes · 12 para revisar');

  const elegida = armarResumen(sinFecha, { fecha: '2026-11-05' });
  assert.equal(elegida.sinFecha, true, 'el selector sigue a la vista para poder cambiarla');
  assert.equal(elegida.fecha, '2026-11-05');
  assert.equal(elegida.linea, 'Censo del 05/11/2026 · 47 pacientes · 12 para revisar');
});

test('HU-04.7 · si ya hay un censo de ese día, el resumen lo avisa con el texto exacto', () => {
  const resumen = armarResumen(censo(), { yaExiste: true });
  assert.deepEqual(resumen.avisos, [
    'Ya hay un censo del 06/11/2026. Se agregarán solo los pacientes nuevos; lo que ya se revisó se conserva.',
  ]);
});

test('CB-04 · el resumen dice cuántas filas no se pudieron leer y cuáles', () => {
  const tres = armarResumen(censo({ saltadas: [{ fila: 9 }, { fila: 10 }, { fila: 12 }] }));
  assert.deepEqual(tres.avisos, ['3 filas no se pudieron leer (filas 9, 10 y 12).']);
  const dos = armarResumen(censo({ saltadas: [{ fila: 14 }, { fila: 30 }] }));
  assert.deepEqual(dos.avisos, ['2 filas no se pudieron leer (filas 14 y 30).']);
  const una = armarResumen(censo({ saltadas: [{ fila: 14 }] }));
  assert.deepEqual(una.avisos, ['1 fila no se pudo leer (fila 14).']);
});

test('CB-04 · con muchas filas saltadas, se listan las primeras 10 (10 se listan todas, 11 no)', () => {
  const numeros = (n) => Array.from({ length: n }, (_, i) => i + 1);
  assert.equal(listarFilas(numeros(10)), '1, 2, 3, 4, 5, 6, 7, 8, 9 y 10');
  assert.equal(listarFilas(numeros(11)), '1, 2, 3, 4, 5, 6, 7, 8, 9, 10 y 1 más');
  assert.equal(listarFilas(numeros(40)), '1, 2, 3, 4, 5, 6, 7, 8, 9, 10 y 30 más');
});

test('CB-05 · el resumen avisa cada cédula repetida y qué fila se tomó', () => {
  const resumen = armarResumen(censo({
    repetidas: [{ filaTomada: 4, filaIgnorada: 8 }, { filaTomada: 6, filaIgnorada: 20 }, { filaTomada: 6, filaIgnorada: 21 }],
  }));
  assert.deepEqual(resumen.avisos, [
    'Una cédula aparece 2 veces; se tomó la fila 4.',
    'Una cédula aparece 3 veces; se tomó la fila 6.',
  ]);
});

test('base · el orden de los avisos: primero "ya hay un censo", después los de la ruta y los del archivo', () => {
  const resumen = armarResumen(censo({ saltadas: [{ fila: 9 }], repetidas: [{ filaTomada: 4, filaIgnorada: 8 }] }), {
    yaExiste: true, avisosExtra: ['AVISO DE LA RUTA'],
  });
  assert.equal(resumen.avisos.length, 4);
  assert.match(resumen.avisos[0], /^Ya hay un censo/);
  assert.equal(resumen.avisos[1], 'AVISO DE LA RUTA');
  assert.match(resumen.avisos[2], /no se pudo leer/);
  assert.match(resumen.avisos[3], /^Una cédula aparece/);
});

test('RNF-04 · CL-02 · RN-01 · se guardan solo los candidatos, y de cada uno solo lo permitido', () => {
  const leido = censo({ pacientes: 5, candidatos: 3 });
  leido.filas[2].piso = 'QUIRÓFANO'; // día 0, pero de Quirófano
  leido.filas[1].dias = 1;
  const guardar = candidatosParaGuardar(leido.filas);
  assert.equal(guardar.length, 2, 'filas 1 y 2 (días 0 y 1); ni Quirófano ni los de día 5');
  for (const candidato of guardar) {
    assert.deepEqual(Object.keys(candidato).sort(), ['cama', 'cedula', 'dias', 'fecha_ingreso', 'nombre', 'nombre_busqueda', 'orden', 'piso']);
  }
  assert.deepEqual(guardar[0], {
    cedula: '9900000001', fecha_ingreso: '2026-11-06', nombre: 'ANA PRUEBA ÑÚÑEZ', nombre_busqueda: 'ana prueba nunez',
    piso: 'Observacion', cama: '1 (Hombre)', dias: 0, orden: 4,
  });
  assert.equal(guardar[1].dias, 1);
  assert.equal(guardar[1].orden, 5, 'RN-09: el orden es la fila del censo');
});
