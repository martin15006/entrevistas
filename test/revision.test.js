'use strict';

// HU-05 · La pantalla de revisión armada con lo que devuelve revision_del_censo() (database/06).
// lib/revision.js no habla con la base: aquí se le pasa lo que la base respondería.
// Todos los pacientes son inventados (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { armarRevision, cuando } = require('../lib/revision');

const CENSO = { id: 7, fecha: '2026-11-10' };

/** Un candidato como lo devuelve la base. */
const fila = (orden, piso, extra = {}) => ({
  id: orden * 10, piso, cama: `Cama ${orden}`, dias: orden % 2, orden,
  cedula: `99000000${orden}`, nombre: `PACIENTE ${orden} PRUEBA`,
  por_revisar: true, decision: null, decidido_por: null, decidido_en: null,
  entrevista_hecha: false, otra: null, ...extra,
});

const resultado = (candidatos, extra = {}) => ({
  dias: ['2026-11-10', '2026-11-09'], censo: CENSO, candidatos, pendientes: [], ...extra,
});

test('HU-05.2 · RN-09 · agrupa por servicio en el orden del censo, con conteo, y por fila adentro', () => {
  // Las filas llegan desordenadas: el orden lo pone la fila del censo, no la llegada.
  const r = armarRevision(resultado([
    fila(9, 'UCI'), fila(3, 'Observacion'), fila(14, 'Observacion'), fila(5, 'Hospitalizacion B'), fila(2, 'Observacion'),
  ]));
  assert.deepEqual(r.porRevisar.map((g) => g.titulo), ['Observacion · 3', 'Hospitalizacion B · 1', 'UCI · 1']);
  assert.deepEqual(r.porRevisar[0].candidatos.map((c) => c.cama), ['Cama 2', 'Cama 3', 'Cama 14']);
  assert.deepEqual(r.porRevisar.map((g) => g.conteo), [3, 1, 1]);
});

test('RN-09 · un servicio no cambia de lugar cuando se decide al primero de su grupo (visto en la ventana)', () => {
  const decidido = { por_revisar: false, decision: 'entrevistar', decidido_por: 'ANA PRUEBA', decidido_en: '2026-11-10T15:00:00Z' };
  const r = armarRevision(resultado([
    fila(2, 'Observacion', decidido), fila(3, 'UCI'), fila(4, 'Hospitalizacion A'), fila(8, 'Observacion'),
    fila(5, 'UCI', decidido), fila(6, 'Hospitalizacion A', decidido),
  ]));
  assert.deepEqual(r.porRevisar.map((g) => g.titulo), ['Observacion · 1', 'UCI · 1', 'Hospitalizacion A · 1']);
  assert.deepEqual(r.revisados.grupos.map((g) => g.titulo), ['Observacion · 1', 'UCI · 1', 'Hospitalizacion A · 1']);
});

test('HU-05.2 · cada candidato muestra cama, nombre, cédula y "Día 0" o "Día 1"', () => {
  const r = armarRevision(resultado([fila(2, 'UCI'), fila(3, 'UCI')]));
  const [dia0, dia1] = r.porRevisar[0].candidatos;
  assert.deepEqual([dia0.cama, dia0.nombre, dia0.cedula, dia0.dia], ['Cama 2', 'PACIENTE 2 PRUEBA', '990000002', 'Día 0']);
  assert.equal(dia1.dia, 'Día 1');
});

test('HU-05.3 · los decididos van a "Ya revisados" con 🟢 o 🔴, quién decidió y a qué hora', () => {
  const r = armarRevision(resultado([
    fila(2, 'UCI'),
    fila(3, 'UCI', { por_revisar: false, decision: 'entrevistar', decidido_por: 'ANA PRUEBA', decidido_en: '2026-11-10T15:42:00Z' }),
    fila(4, 'Observacion', { por_revisar: false, decision: 'no_entrevistar', decidido_por: 'BETO PRUEBA', decidido_en: '2026-11-10T13:05:00Z' }),
  ]));
  assert.equal(r.revisados.total, 2);
  assert.deepEqual(r.porRevisar.map((g) => g.titulo), ['UCI · 1']);
  const [verde] = r.revisados.grupos[0].candidatos;
  const [rojo] = r.revisados.grupos[1].candidatos;
  assert.deepEqual([verde.icono, verde.etiqueta, verde.quien], ['🟢', 'Entrevistar', 'ANA PRUEBA · 10:42']); // hora de Colombia
  assert.deepEqual([rojo.icono, rojo.etiqueta, rojo.quien], ['🔴', 'No entrevistar', 'BETO PRUEBA · 08:05']);
  assert.equal(verde.puedeCambiar, true);
  assert.deepEqual([verde.cambiarA, verde.cambiarEtiqueta, verde.desde], ['no_entrevistar', 'No entrevistar', 'entrevistar']);
  assert.deepEqual([rojo.cambiarA, rojo.cambiarEtiqueta, rojo.desde], ['entrevistar', 'Entrevistar', 'no_entrevistar']);
});

test('HU-05.3 · si se decidió otro día distinto al del censo, la hora lleva la fecha', () => {
  assert.equal(cuando('2026-11-10T15:42:00Z', '2026-11-10'), '10:42');
  assert.equal(cuando('2026-11-11T13:00:00Z', '2026-11-10'), '11/11/2026 08:00');
  assert.equal(cuando('2026-11-11T04:30:00Z', '2026-11-10'), '23:30', 'a las 23:30 de Colombia todavía es el día 10');
  assert.equal(cuando(null, '2026-11-10'), '');
});

test('HU-05.4 · un censo sin candidatos dice el texto exacto', () => {
  const r = armarRevision(resultado([]));
  assert.equal(r.sinCandidatos, 'Este censo no tiene pacientes con día 0 o 1 para revisar.');
  assert.deepEqual(r.porRevisar, []);
  assert.equal(r.todosRevisados, null);
});

test('HU-05.5 · aviso de cada censo anterior con pendientes, con su enlace (1 y N)', () => {
  const r = armarRevision(resultado([fila(2, 'UCI')], {
    pendientes: [{ fecha: '2026-11-09', pendientes: 3 }, { fecha: '2026-11-08', pendientes: 1 }, { fecha: '2026-11-07', pendientes: 0 }],
  }));
  assert.deepEqual(r.avisos, [
    { texto: 'El censo del 09/11/2026 tiene 3 pacientes sin revisar.', href: '/revision?dia=2026-11-09' },
    { texto: 'El censo del 08/11/2026 tiene 1 paciente sin revisar.', href: '/revision?dia=2026-11-08' },
  ]);
});

test('HU-05.1 · el selector trae los días del más nuevo al más viejo, con el que se ve elegido', () => {
  const r = armarRevision({ ...resultado([]), dias: ['2026-11-08', '2026-11-10', 'no-es-fecha', '2026-11-09'] });
  assert.deepEqual(r.dias, [
    { valor: '2026-11-10', texto: '10/11/2026', elegido: true },
    { valor: '2026-11-09', texto: '09/11/2026', elegido: false },
    { valor: '2026-11-08', texto: '08/11/2026', elegido: false },
  ]);
  // Un censo viejo que ya no está entre los últimos días igual aparece en el selector.
  const viejo = armarRevision({ ...resultado([]), censo: { id: 1, fecha: '2025-01-02' } });
  assert.deepEqual(viejo.dias.at(-1), { valor: '2025-01-02', texto: '02/01/2025', elegido: true });
});

test('base · todos revisados, sin censos y un día sin censo tienen su aviso', () => {
  const todos = armarRevision(resultado([fila(2, 'UCI', { por_revisar: false, decision: 'entrevistar', decidido_por: 'ANA PRUEBA', decidido_en: '2026-11-10T15:00:00Z' })]));
  assert.equal(todos.todosRevisados, 'Ya se revisaron todos los pacientes de este censo.');

  const nada = armarRevision({ dias: [], censo: null, candidatos: [], pendientes: [] });
  assert.equal(nada.censo, null);
  assert.equal(nada.mensaje, 'Todavía no hay censos. Sube el primero desde «Censo».');

  const otroDia = armarRevision({ dias: ['2026-11-10'], censo: null, candidatos: [], pendientes: [] }, { diaPedido: '2026-01-01' });
  assert.equal(otroDia.mensaje, 'No hay censo del 01/01/2026. Elige otro día o súbelo desde «Censo».');
  assert.deepEqual(otroDia.dias.map((d) => d.elegido), [false]);
});

test('RN-03 · aclaración 2026-11-11 · decidido en otro censo: se muestra esa decisión y se cambia allá', () => {
  const r = armarRevision(resultado([
    // Sin decidir aquí, pero con un rojo en un censo posterior (Ana, el 11/11).
    fila(2, 'UCI', { por_revisar: false, otra: { decision: 'no_entrevistar', por: 'ANA PRUEBA', en: '2026-11-11T14:00:00Z', fecha: '2026-11-11' } }),
    // Rojo aquí, y después verde en otro censo (su entrevista ya existe).
    fila(3, 'UCI', {
      por_revisar: false, decision: 'no_entrevistar', decidido_por: 'BETO PRUEBA', decidido_en: '2026-11-10T14:00:00Z',
      otra: { decision: 'entrevistar', por: 'CECI PRUEBA', en: '2026-11-11T15:00:00Z', fecha: '2026-11-11' },
    }),
  ]));
  const [despues, cambiado] = r.revisados.grupos[0].candidatos;
  assert.deepEqual([despues.icono, despues.quien], ['🔴', 'ANA PRUEBA · 11/11/2026 09:00']);
  assert.deepEqual(despues.otroCenso, { texto: 'Se decidió en el censo del 11/11/2026.', href: '/revision?dia=2026-11-11' });
  assert.equal(despues.puedeCambiar, false, 'se cambia en el censo donde se decidió');
  // La decisión propia se sigue viendo (es la historia de ese día), pero se cambia allá.
  assert.deepEqual([cambiado.icono, cambiado.quien], ['🔴', 'BETO PRUEBA · 09:00']);
  assert.equal(cambiado.otroCenso.texto, 'Se decidió en el censo del 11/11/2026.');
  assert.equal(cambiado.puedeCambiar, false);
});

test('HU-06.4 · con la entrevista hecha, "Cambiar decisión" muestra el texto exacto', () => {
  const r = armarRevision(resultado([
    fila(2, 'UCI', { por_revisar: false, decision: 'entrevistar', decidido_por: 'ANA PRUEBA', decidido_en: '2026-11-10T15:00:00Z', entrevista_hecha: true }),
  ]));
  assert.equal(r.revisados.grupos[0].candidatos[0].entrevistaHecha, true);
  assert.equal(r.textos.entrevistaHecha, 'Este paciente ya tiene la entrevista hecha.');
});

test('base · lo que no es una decisión conocida no se muestra como verde ni rojo', () => {
  const r = armarRevision(resultado([fila(2, 'UCI', { por_revisar: false, decision: 'quizas', otra: { decision: 'otra-cosa', fecha: 'x' } })]));
  const [c] = r.revisados.grupos[0].candidatos;
  assert.deepEqual([c.icono, c.etiqueta, c.puedeCambiar, c.otroCenso], ['', '', false, null]);
});
