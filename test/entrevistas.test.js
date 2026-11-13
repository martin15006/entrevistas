'use strict';

// HU-08 · La pantalla "Entrevistas" armada con lo que devuelve entrevistas_del_dia() (database/10).
// lib/entrevistas.js no habla con la base: aquí se le pasa lo que la base respondería.
// Enmienda 5: Entrevistados y Salieron son las que se hicieron ESE día, cada una con su censo.
// Un solo reloj: "hoy" y si un "En curso" sigue vigente los dice la base (test-vivo/ lo prueba allá).
// Todos los pacientes son inventados (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { armarEntrevistas } = require('../lib/entrevistas');

const HOY = '2026-11-12';

const pendiente = (id, piso, extra = {}) => ({
  id, piso, cama: `Cama ${id}`, cedula: `99000000${id}`, nombre: `PACIENTE ${id} PRUEBA`, censo_fecha: HOY,
  en_curso_por: null, ...extra,
});
const hecha = (id, piso, extra = {}) => ({
  id, piso, cama: `Cama ${id}`, cedula: `99000000${id}`, nombre: `PACIENTE ${id} PRUEBA`, censo_fecha: HOY,
  por: 'ANA PRUEBA', en: '2026-11-12T14:30:00Z', ...extra,
});
const resultado = (extra = {}) => ({
  hoy: HOY, dia: HOY, dias_censo: [HOY, '2026-11-11'], dias: [HOY],
  pendientes: [], entrevistados: [], salieron: [], ...extra,
});
const armar = (r, opciones = {}) => armarEntrevistas(r, { hoy: HOY, ...opciones });

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

test('HU-08.2 · las que vienen de un censo anterior al ÚLTIMO CENSO dicen "Desde el [fecha]"', () => {
  const v = armar(resultado({ pendientes: [pendiente(1, 'UCI', { censo_fecha: '2026-11-10' }), pendiente(2, 'UCI')] }));
  const [vieja, deHoy] = v.grupos[0].candidatos;
  assert.equal(vieja.desde, 'Desde el 10/11/2026');
  assert.equal(deHoy.desde, null);
  // Se compara con el censo más reciente, no con "hoy": si hoy no hay censo, la del último censo no dice nada.
  const sinCensoDeHoy = armar(resultado({ dias_censo: ['2026-11-11'], pendientes: [pendiente(1, 'UCI', { censo_fecha: '2026-11-11' })] }));
  assert.equal(sinCensoDeHoy.grupos[0].candidatos[0].desde, null);
});

test('HU-08.3 · enmienda 5 · Entrevistados y Salieron: las hechas ese día, cada una con su censo, quién y a qué hora', () => {
  const r = resultado({
    dias: [HOY, '2026-11-11'],
    entrevistados: [hecha(7, 'UCI'), hecha(9, 'UCI', { censo_fecha: '2026-11-11', en: '2026-11-12T13:05:00Z' })],
    salieron: [hecha(8, 'UCI', { por: 'BETO PRUEBA', en: '2026-11-12T16:00:00Z' })],
  });
  const entrevistados = armar(r, { pestana: 'entrevistados' });
  assert.deepEqual(entrevistados.dia, { fecha: HOY, fechaTexto: '12/11/2026' });
  assert.deepEqual(entrevistados.dias, [
    { valor: HOY, texto: '12/11/2026', elegido: true },
    { valor: '2026-11-11', texto: '11/11/2026', elegido: false },
  ]);
  assert.deepEqual(entrevistados.grupos[0].candidatos.map((c) => c.quien), [
    'Censo del 12/11/2026 · ANA PRUEBA · 09:30',
    'Censo del 11/11/2026 · ANA PRUEBA · 08:05', // hecha hoy, de un censo anterior: sale hoy y dice su censo
  ]);
  const salieron = armar(r, { pestana: 'salieron' });
  assert.equal(salieron.grupos[0].candidatos[0].quien, 'Censo del 12/11/2026 · BETO PRUEBA · 11:00');
  // Al elegir un día, las pestañas lo recuerdan.
  assert.equal(armar(r, { pestana: 'salieron', diaPedido: '2026-11-11' }).pestanas[1].href, '/entrevistas?pestana=entrevistados&dia=2026-11-11');
});

test('HU-08.3 · enmienda 5 · el día elegido sale en el selector aunque ese día no se haya hecho nada', () => {
  const v = armar(resultado({ dia: '2026-11-01', dias: [HOY] }), { pestana: 'entrevistados', diaPedido: '2026-11-01' });
  assert.deepEqual(v.dias.map((d) => [d.valor, d.elegido]), [[HOY, false], ['2026-11-01', true]]);
  assert.equal(v.mensaje, 'Todavía no hay entrevistas hechas este día.');
});

test('HU-08.4 · si falta el censo de hoy (en Colombia) se avisa con el texto exacto; si está, no', () => {
  assert.equal(armar(resultado({ dias_censo: ['2026-11-11'] })).avisoCensoDeHoy, 'Todavía no se ha subido el censo de hoy.');
  assert.equal(armar(resultado()).avisoCensoDeHoy, null);
  assert.equal(armar({ hoy: HOY, dias_censo: [] }).avisoCensoDeHoy, 'Todavía no se ha subido el censo de hoy.');
});

test('base · un solo reloj: "hoy" es el de la base aunque el servidor diga otro día', () => {
  // A las 23:59 en el servidor, la base ya pasó al otro día (o al revés): manda la base.
  const v = armarEntrevistas(resultado({ hoy: '2026-11-13', dias_censo: [HOY] }), { hoy: HOY });
  assert.equal(v.avisoCensoDeHoy, 'Todavía no se ha subido el censo de hoy.');
  // Si la base no lo dijo (una respuesta vieja), se usa el del servidor.
  assert.equal(armarEntrevistas({ dias_censo: [HOY] }, { hoy: HOY }).avisoCensoDeHoy, null);
});

test('HU-08.5 · cada pendiente lleva a su formulario', () => {
  const v = armar(resultado({ pendientes: [pendiente(41, 'UCI')] }));
  assert.equal(v.grupos[0].candidatos[0].href, '/entrevistas/41');
});

test('HU-08.6 · RN-13 · "En curso · [nombre]" cuando la base dice que otra persona la está haciendo', () => {
  const enCurso = (fila) => armar(resultado({ pendientes: [fila] })).grupos[0].candidatos[0].enCurso;
  assert.equal(enCurso(pendiente(1, 'UCI', { en_curso_por: 'BETO PRUEBA' })), 'En curso · BETO PRUEBA');
  // La base no lo manda si fui yo o si pasaron 15 minutos (CB-27): entonces no hay aviso.
  assert.equal(enCurso(pendiente(1, 'UCI')), null);
  assert.equal(enCurso(pendiente(1, 'UCI', { en_curso_por: '' })), null);
});

test('HU-09.4 · al volver de guardar, "Entrevista guardada."', () => {
  assert.equal(armar(resultado(), { guardada: true }).guardada, 'Entrevista guardada.');
  assert.equal(armar(resultado()).guardada, null);
});

test('base · lo vacío tiene su aviso: sin pendientes, sin hechas y sin salidas ese día', () => {
  assert.equal(armar(resultado()).mensaje, 'No hay entrevistas pendientes.');
  assert.equal(armar(resultado(), { pestana: 'entrevistados' }).mensaje, 'Todavía no hay entrevistas hechas este día.');
  assert.equal(armar(resultado(), { pestana: 'salieron' }).mensaje, 'Ningún paciente salió este día.');
  // Sin respuesta de la base (por ejemplo, un Supabase de prueba vacío), no se rompe.
  assert.equal(armar(null).mensaje, 'No hay entrevistas pendientes.');
  assert.equal(armar(null, { pestana: 'salieron' }).dia.fecha, HOY, 'el día es hoy');
});
