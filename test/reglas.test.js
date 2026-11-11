'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizar, limpiarNombre, limpiarCedula, leerDias, esCandidato, claveEstancia, recortar,
} = require('../lib/reglas');
const { candidatosParaGuardar } = require('../lib/resumen-censo');

test('base · recortar cuenta caracteres como la base y nunca parte uno en dos', () => {
  assert.equal(recortar('ABCDE', 3), 'ABC');
  assert.equal(recortar('ABC', 3), 'ABC');
  assert.equal(recortar('', 3), '');
  // "𝔸" ocupa 2 "unidades" de JavaScript: .slice(0, 3) lo habría partido.
  const raro = '𝔸𝔸𝔸𝔸';
  assert.equal(recortar(raro, 3), '𝔸𝔸𝔸');
  assert.equal(Array.from(recortar(raro, 3)).length, 3);
});

test('base · el nombre para buscar nunca pasa de 200, aunque al quitar tildes crezca (PYA tanda 4)', () => {
  // Cada sílaba coreana se separa en 2 o 3 letras al quitarle las "marcas": 200 sílabas → ~600 letras.
  const nombre = '한'.repeat(200);
  assert.ok(Array.from(normalizar(nombre)).length > 200, 'sin recortar se pasaría');
  const [candidato] = candidatosParaGuardar([{
    fila: 4, piso: 'Observacion', cama: '1', cedula: '9900000001', nombre, fechaIngreso: '2026-11-06', dias: 0,
  }]);
  assert.equal(Array.from(candidato.nombre_busqueda).length, 200);
});

test('RN-01 · candidato: día 0 y día 1 sí, día 2 no', () => {
  assert.equal(esCandidato({ piso: 'Observacion', dias: 0 }), true);
  assert.equal(esCandidato({ piso: 'Observacion', dias: 1 }), true);
  assert.equal(esCandidato({ piso: 'Observacion', dias: 2 }), false);
  assert.equal(esCandidato({ piso: 'UCI', dias: 1 }), true);
  assert.equal(esCandidato({ piso: 'Hospitalizacion D', dias: 0 }), true);
});

test('RN-01 · CB-07 · Quirófano queda fuera, como sea que venga escrito', () => {
  for (const piso of ['Quirofano', 'QUIROFANO', 'QUIRÓFANO', 'Quirófano', '  quirofano ', 'quirófano']) {
    assert.equal(esCandidato({ piso, dias: 0 }), false, `"${piso}" debería quedar fuera`);
  }
});

test('RN-02 · misma cédula y misma fecha de ingreso = misma estancia; otra fecha = otra estancia', () => {
  const ayer = claveEstancia({ cedula: '9900000001', fechaIngreso: '2026-11-05' });
  assert.equal(ayer, claveEstancia({ cedula: '9900000001', fechaIngreso: '2026-11-05' }));
  assert.notEqual(ayer, claveEstancia({ cedula: '9900000001', fechaIngreso: '2026-12-01' }));
  assert.notEqual(ayer, claveEstancia({ cedula: '9900000002', fechaIngreso: '2026-11-05' }));
});

test('CB-06 · "Días" se lee como entero de 0 en adelante', () => {
  assert.equal(leerDias(0), 0);
  assert.equal(leerDias(1), 1);
  assert.equal(leerDias(1.0), 1);
  assert.equal(leerDias('1'), 1);
  assert.equal(leerDias('1.0'), 1);
  assert.equal(leerDias(' 2 '), 2);
  assert.equal(leerDias(''), null);
  assert.equal(leerDias(null), null);
  assert.equal(leerDias('abc'), null);
  assert.equal(leerDias(-1), null);
  assert.equal(leerDias('-1'), null);
  assert.equal(leerDias(1.5), null);
});

test('CB-08 · el nombre queda en mayúsculas y sin espacios dobles', () => {
  assert.equal(limpiarNombre('carolina  prueba   gómez '), 'CAROLINA PRUEBA GÓMEZ');
  assert.equal(limpiarNombre('  ANA\tMUÑOZ  '), 'ANA MUÑOZ');
});

test('CB-08 · la cédula queda sin espacios ni puntos', () => {
  assert.equal(limpiarCedula('99.000.001.01'), '9900000101');
  assert.equal(limpiarCedula(' 9900 000 001 '), '9900000001');
  assert.equal(limpiarCedula(9900000001), '9900000001');
  assert.equal(limpiarCedula('9900000001.0'), '9900000001');
  assert.equal(limpiarCedula('ab123'), 'AB123');
  assert.equal(limpiarCedula(''), '');
  assert.equal(limpiarCedula(null), '');
});

test('base · normalizar quita tildes, la ñ y las mayúsculas para comparar', () => {
  assert.equal(normalizar('  NÚÑEZ   Gómez '), 'nunez gomez');
  assert.equal(normalizar('Identificación'), 'identificacion');
});
