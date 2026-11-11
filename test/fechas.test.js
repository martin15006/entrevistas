'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  hoyBogota, horaBogota, esFechaIso, desdeFechaCorta, fechaCorta, diaEnLetras, fechaIsoDesdeCelda,
} = require('../lib/fechas');

// 03:30 en UTC del 7 de noviembre = 22:30 del 6 de noviembre en Colombia (UTC-5).
const INSTANTE = new Date('2026-11-07T03:30:00Z');

test('RNF-15 · "hoy" y la hora son los de Colombia aunque en UTC ya sea otro día', () => {
  assert.equal(hoyBogota(INSTANTE), '2026-11-06');
  assert.equal(horaBogota(INSTANTE), '22:30');
});

test('RNF-15 · da lo mismo aunque el servidor esté en otra zona horaria (Tokio)', () => {
  const ruta = JSON.stringify(path.join(__dirname, '..', 'lib', 'fechas.js'));
  const codigo = `const f = require(${ruta}); const d = new Date('2026-11-07T03:30:00Z');`
    + 'process.stdout.write([f.hoyBogota(d), f.horaBogota(d), d.getHours()].join(" "));';
  const salida = execFileSync(process.execPath, ['-e', codigo], { env: { ...process.env, TZ: 'Asia/Tokyo' } });
  // getHours() = 12 demuestra que el proceso de verdad estaba en la hora de Tokio.
  assert.equal(salida.toString(), '2026-11-06 22:30 12');
});

test('RNF-15 · la medianoche de Colombia ya es el día siguiente', () => {
  assert.equal(hoyBogota(new Date('2026-11-07T04:59:00Z')), '2026-11-06');
  assert.equal(hoyBogota(new Date('2026-11-07T05:00:00Z')), '2026-11-07');
  assert.equal(horaBogota(new Date('2026-11-07T05:00:00Z')), '00:00');
});

test('base · día en letras para la hoja descargada (HU-15.3)', () => {
  assert.equal(diaEnLetras('2026-11-06'), 'VIERNES 6 DE NOVIEMBRE DEL 2026');
  assert.equal(diaEnLetras('2026-08-31'), 'LUNES 31 DE AGOSTO DEL 2026');
  assert.equal(diaEnLetras('2026-11-11'), 'MIÉRCOLES 11 DE NOVIEMBRE DEL 2026');
  assert.equal(diaEnLetras('2026-11-14'), 'SÁBADO 14 DE NOVIEMBRE DEL 2026');
  assert.equal(diaEnLetras('no es fecha'), '');
});

test('base · solo se aceptan fechas que existen', () => {
  assert.equal(esFechaIso('2026-02-28'), true);
  assert.equal(esFechaIso('2026-02-29'), false);
  assert.equal(esFechaIso('2028-02-29'), true);
  assert.equal(esFechaIso('2026-13-01'), false);
  assert.equal(esFechaIso('06/11/2026'), false);
});

test('base · DD/MM/AAAA ida y vuelta', () => {
  assert.equal(desdeFechaCorta('06/11/2026'), '2026-11-06');
  assert.equal(desdeFechaCorta('6/11/2026'), '2026-11-06');
  assert.equal(desdeFechaCorta('31/02/2026'), null);
  assert.equal(desdeFechaCorta(''), null);
  assert.equal(fechaCorta('2026-11-06'), '06/11/2026');
});

test('base · la fecha de ingreso se lee venga como texto o como fecha de Excel', () => {
  assert.equal(fechaIsoDesdeCelda('2026-10-20'), '2026-10-20');
  assert.equal(fechaIsoDesdeCelda(' 2026-10-20 '), '2026-10-20');
  assert.equal(fechaIsoDesdeCelda('20/10/2026'), '2026-10-20');
  assert.equal(fechaIsoDesdeCelda(new Date('2026-10-20T00:00:00Z')), '2026-10-20');
  assert.equal(fechaIsoDesdeCelda('2026-10-'), null);
  assert.equal(fechaIsoDesdeCelda(''), null);
  assert.equal(fechaIsoDesdeCelda(new Date('no')), null);
});
