'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ExcelJS = require('exceljs');
const { inventarFilas, escribirCenso, ENCABEZADOS } = require('../scripts/censo-de-prueba');
const { leerCenso } = require('../lib/censo');

test('base · el censo inventado tiene la estructura del censo real', async () => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await escribirCenso(inventarFilas({ cantidad: 5 }), { fecha: '2026-11-06' }));
  const hoja = libro.worksheets[0];
  assert.equal(hoja.getCell('A1').value, 'Censo Consolidado de Camas - Generado el: 06/11/2026');
  assert.deepEqual(hoja.getRow(3).values.slice(1), ENCABEZADOS);
  assert.equal(hoja.rowCount, 8); // título, fila vacía, encabezados y 5 pacientes
});

test('base · CL-01 · las cédulas inventadas empiezan por 99 y los apellidos son de prueba', () => {
  for (const f of inventarFilas({ cantidad: 30 })) {
    assert.match(f.cedula, /^99\d{8}$/);
  }
});

test('base · la misma semilla da el mismo censo, y otra semilla da otro', () => {
  assert.deepEqual(inventarFilas({ semilla: 7 }), inventarFilas({ semilla: 7 }));
  assert.notDeepEqual(inventarFilas({ semilla: 7 }), inventarFilas({ semilla: 8 }));
});

test('base · el censo inventado trae pacientes con día 0 o 1 en varios servicios', async () => {
  const censo = await leerCenso(await escribirCenso(inventarFilas({ cantidad: 47 })));
  assert.equal(censo.filas.length, 47);
  const candidatos = censo.filas.filter((f) => f.dias <= 1 && f.piso !== 'Quirofano');
  assert.ok(candidatos.length >= 5, `solo hay ${candidatos.length} candidatos`);
});

test('base · el script se corre desde la terminal y dice dónde dejó el archivo', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'entrevistas-prueba-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const salida = path.join(carpeta, 'censo.xlsx');
  const script = path.join(__dirname, '..', 'scripts', 'censo-de-prueba.js');
  const texto = execFileSync(process.execPath, [script, '--filas', '12', '--casos-borde', '--salida', salida]).toString();
  assert.match(texto, /Censo inventado con 21 filas en: /);
  assert.ok(texto.includes(salida));
  const censo = await leerCenso(fs.readFileSync(salida));
  assert.equal(censo.fecha, '2026-11-06');
});
