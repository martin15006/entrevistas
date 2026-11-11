'use strict';

// CL-11: database/global.sql es la base completa en un solo archivo. Debe dejar la base
// EXACTAMENTE igual que aplicar los archivos numerados (01, 02…) en orden. Si alguien agrega
// un 03 y se olvida de actualizar global.sql, esta prueba falla.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { estadoDeLaBase } = require('./ayudantes/sql');

const CARPETA = path.join(__dirname, '..', 'database');
const leer = (nombre) => fs.readFileSync(path.join(CARPETA, nombre), 'utf8');
const numerados = () => fs.readdirSync(CARPETA).filter((nombre) => /^\d{2}-[\w-]+\.sql$/.test(nombre)).sort();

test('CL-11 · los archivos numerados van en orden, sin números repetidos ni saltos', () => {
  const archivos = numerados();
  assert.ok(archivos.length >= 2);
  archivos.forEach((nombre, indice) => {
    assert.equal(Number(nombre.slice(0, 2)), indice + 1, `${nombre} debería ser el número ${indice + 1}`);
  });
  // Solo hay archivos numerados y global.sql: nada suelto que nadie sepa cuándo correr.
  const otros = fs.readdirSync(CARPETA).filter((n) => n.endsWith('.sql') && n !== 'global.sql' && !archivos.includes(n));
  assert.deepEqual(otros, []);
});

test('CL-11 · global.sql deja la base igual que aplicar los archivos numerados en orden', () => {
  const porPasos = estadoDeLaBase(numerados().map(leer));
  const global = estadoDeLaBase([leer('global.sql')]);

  assert.deepEqual(Object.keys(global.tablas).sort(), Object.keys(porPasos.tablas).sort(), 'las mismas tablas');
  for (const tabla of Object.keys(porPasos.tablas)) {
    assert.deepEqual(global.tablas[tabla], porPasos.tablas[tabla], `las mismas columnas y reglas en ${tabla}`);
  }
  assert.deepEqual(global.rls, porPasos.rls, 'RLS en las mismas tablas');
  assert.deepEqual(global.indices, porPasos.indices, 'los mismos índices');
  assert.deepEqual(global.politicas, porPasos.politicas, 'las mismas políticas, con el mismo texto');
  assert.deepEqual(global.funciones, porPasos.funciones, 'las mismas funciones, en su ÚLTIMA versión');
  assert.deepEqual(global.guardias, porPasos.guardias, 'los mismos guardias (triggers)');
  assert.deepEqual(global.permisos, porPasos.permisos, 'los mismos permisos (grant / revoke)');
});

test('base · la prueba de CL-11 de verdad nota una diferencia', () => {
  const base = leer('global.sql');
  const sinUnaPolitica = base.replace(/create policy "se borra solo una entrevista no hecha"[\s\S]*?;/, '');
  // es_cuenta_activa sin la revisión de la sesión (como estaba en 01). Se reemplaza con una
  // función porque, en un texto de reemplazo, "$$" significa un solo "$".
  const conFuncionVieja = base.replace(/\n  and exists \(\n    select 1 from auth\.sessions[\s\S]*?\n  \)/, () => '');
  assert.notDeepEqual(estadoDeLaBase([sinUnaPolitica]).politicas, estadoDeLaBase([base]).politicas);
  assert.notDeepEqual(estadoDeLaBase([conFuncionVieja]).funciones, estadoDeLaBase([base]).funciones);
  assert.throws(() => estadoDeLaBase(['create view public.algo as select 1;']), /no sabe leer/);
});
