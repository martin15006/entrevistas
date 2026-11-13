'use strict';

// HU-08 · La pantalla "Entrevistas" armada con lo que devuelve entrevistas_del_dia() (database/09).
// lib/entrevistas.js no habla con la base: aquí se le pasa lo que la base respondería.
// Todos los pacientes son inventados (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { armarEntrevistas, EN_CURSO_MS } = require('../lib/entrevistas');

// 12/11/2026 a las 10:00 en Colombia.
const AHORA = Date.parse('2026-11-12T15:00:00Z');
const HOY = '2026-11-12';

const pendiente = (id, piso, extra = {}) => ({
  id, piso, cama: `Cama ${id}`, cedula: `99000000${id}`, nombre: `PACIENTE ${id} PRUEBA`, censo_fecha: HOY,
  en_curso_por: null, en_curso_desde: null, en_curso_mio: false, ...extra,
});
const hecha = (id, piso, extra = {}) => ({
  id, piso, cama: `Cama ${id}`, cedula: `99000000${id}`, nombre: `PACIENTE ${id} PRUEBA`, por: 'ANA PRUEBA', en: '2026-11-12T14:30:00Z', ...extra,
});
const resultado = (extra = {}) => ({
  dias: [HOY, '2026-11-11'], censo: { id: 2, fecha: HOY }, pendientes: [], entrevistados: [], salieron: [], ...extra,
});
const armar = (r, opciones = {}) => armarEntrevistas(r, { hoy: HOY, ahora: AHORA, ...opciones });

test('HU-08.1 · las pestañas "Pendientes (N)", "Entrevistados" y "Salieron", con "Pendientes" abierta', () => {
  const v = armar(resultado({ pendientes: [pendiente(1, 'UCI'), pendiente(2, 'UCI')] }));
  assert.deepEqual(v.pestanas.map((p) => [p.texto, p.href, p.activa]), [
    ['Pendientes (2)', '/entrevistas', true],
    ['Entrevistados', '/entrevistas?pestana=entrevistados', false],
    ['Salieron', '/entrevistas?pestana=salieron', false],
  ]);
  assert.equal(armar(resultado(), { pestana: 'no-existe' }).pestana, 'pendientes');
  assert.equal(armar(resultado()).pestanas[0].texto, 'Pendientes (0)');
});

test('HU-08.2 · RN-09 · las pendientes van por servicio, con cama, nombre y cédula', () => {
  // La base las manda en orden (las más viejas primero, y por fila del censo).
  const v = armar(resultado({ pendientes: [pendiente(3, 'Observacion'), pendiente(4, 'UCI'), pendiente(5, 'Observacion')] }));
  assert.deepEqual(v.grupos.map((g) => g.titulo), ['Observacion · 2', 'UCI · 1']);
  const [primera] = v.grupos[0].candidatos;
  assert.deepEqual([primera.cama, primera.nombre, primera.cedula], ['Cama 3', 'PACIENTE 3 PRUEBA', '990000003']);
  assert.deepEqual(v.grupos[0].candidatos.map((c) => c.cama), ['Cama 3', 'Cama 5']);
});

test('HU-08.2 · las que vienen de un censo anterior al último dicen "Desde el [fecha]"', () => {
  const v = armar(resultado({ pendientes: [pendiente(1, 'UCI', { censo_fecha: '2026-11-10' }), pendiente(2, 'UCI')] }));
  const [vieja, deHoy] = v.grupos[0].candidatos;
  assert.equal(vieja.desde, 'Desde el 10/11/2026');
  assert.equal(deHoy.desde, null);
});

test('HU-08.3 · Entrevistados y Salieron: las del censo elegido, con el selector de días y quién y a qué hora', () => {
  const r = resultado({ entrevistados: [hecha(7, 'UCI')], salieron: [hecha(8, 'UCI', { por: 'BETO PRUEBA', en: '2026-11-13T13:00:00Z' })] });
  const entrevistados = armar(r, { pestana: 'entrevistados' });
  assert.equal(entrevistados.censo.fechaTexto, '12/11/2026');
  assert.deepEqual(entrevistados.dias, [
    { valor: HOY, texto: '12/11/2026', elegido: true },
    { valor: '2026-11-11', texto: '11/11/2026', elegido: false },
  ]);
  assert.equal(entrevistados.grupos[0].candidatos[0].quien, 'ANA PRUEBA · 09:30');
  const salieron = armar(r, { pestana: 'salieron' });
  assert.equal(salieron.grupos[0].candidatos[0].quien, 'BETO PRUEBA · 13/11/2026 08:00', 'otro día distinto al del censo: con la fecha');
  // Al elegir un día, las pestañas lo recuerdan.
  assert.equal(armar(r, { pestana: 'salieron', diaPedido: '2026-11-11' }).pestanas[1].href, '/entrevistas?pestana=entrevistados&dia=2026-11-11');
});

test('HU-08.4 · si falta el censo de hoy (en Colombia) se avisa con el texto exacto; si está, no', () => {
  assert.equal(armar(resultado({ dias: ['2026-11-11'] })).avisoCensoDeHoy, 'Todavía no se ha subido el censo de hoy.');
  assert.equal(armar(resultado()).avisoCensoDeHoy, null);
  assert.equal(armar({ dias: [] }).avisoCensoDeHoy, 'Todavía no se ha subido el censo de hoy.');
});

test('HU-08.5 · cada pendiente lleva a su formulario', () => {
  const v = armar(resultado({ pendientes: [pendiente(41, 'UCI')] }));
  assert.equal(v.grupos[0].candidatos[0].href, '/entrevistas/41');
});

test('HU-08.6 · CB-27 · "En curso · [nombre]" si OTRA persona la abrió hace menos de 15 minutos', () => {
  const abierta = (antes, extra = {}) => pendiente(1, 'UCI', { en_curso_por: 'BETO PRUEBA', en_curso_desde: new Date(AHORA - antes).toISOString(), ...extra });
  const enCurso = (fila) => armar(resultado({ pendientes: [fila] })).grupos[0].candidatos[0].enCurso;
  assert.equal(enCurso(abierta(5 * 60 * 1000)), 'En curso · BETO PRUEBA');
  assert.equal(enCurso(abierta(EN_CURSO_MS - 1000)), 'En curso · BETO PRUEBA', 'a los 14:59 todavía');
  assert.equal(enCurso(abierta(EN_CURSO_MS)), null, 'a los 15:00 ya no (CB-27)');
  assert.equal(enCurso(abierta(60 * 1000, { en_curso_mio: true })), null, 'si la abrí yo, no me lo avisa');
  assert.equal(enCurso(pendiente(1, 'UCI')), null);
});

test('base · lo vacío tiene su aviso: sin pendientes, sin hechas, sin salidas, sin censos y un día sin censo', () => {
  assert.equal(armar(resultado()).mensaje, 'No hay entrevistas pendientes.');
  assert.equal(armar(resultado(), { pestana: 'entrevistados' }).mensaje, 'Todavía no hay entrevistas hechas de este censo.');
  assert.equal(armar(resultado(), { pestana: 'salieron' }).mensaje, 'Ningún paciente de este censo salió.');
  assert.equal(armar({ dias: [], censo: null }, { pestana: 'entrevistados' }).mensaje, 'Todavía no hay censos. Sube el primero desde «Censo».');
  assert.equal(armar({ dias: [HOY], censo: null }, { pestana: 'salieron', diaPedido: '2026-01-01' }).mensaje,
    'No hay censo del 01/01/2026. Elige otro día o súbelo desde «Censo».');
  // Sin respuesta de la base (por ejemplo, un Supabase de prueba vacío), no se rompe.
  assert.equal(armar(null).mensaje, 'No hay entrevistas pendientes.');
});
