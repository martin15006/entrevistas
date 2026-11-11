'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { revisarZip, MAX_DESCOMPRIMIDO } = require('../lib/zip-seguro');
const { leerCenso } = require('../lib/censo');
const { inventarFilas, escribirCenso } = require('../scripts/censo-de-prueba');
const { crearZip, leerEntradas } = require('./ayudantes/zip');

test('base · CL-06 · un censo .xlsx normal pasa la revisión del zip', async () => {
  assert.equal(revisarZip(await escribirCenso(inventarFilas({ cantidad: 300 }))), true);
});

test('base · CL-06 · el tope de descompresión: justo el tope pasa, un byte menos no', () => {
  const mil = Buffer.alloc(1000, 'a');
  for (const comprimir of [true, false]) {
    const zip = crearZip([{ nombre: 'parte.xml', datos: mil, comprimir }]);
    assert.equal(revisarZip(zip, { maxDescomprimido: 1000 }), true, `comprimir=${comprimir}, tope 1000`);
    assert.equal(revisarZip(zip, { maxDescomprimido: 999 }), false, `comprimir=${comprimir}, tope 999`);
  }
  assert.equal(MAX_DESCOMPRIMIDO, 50 * 1024 * 1024);
});

test('base · CL-06 · el tope cuenta todas las partes juntas', () => {
  const zip = crearZip([
    { nombre: 'a.xml', datos: Buffer.alloc(600, 'a') },
    { nombre: 'b.xml', datos: Buffer.alloc(600, 'b') },
  ]);
  assert.equal(revisarZip(zip, { maxDescomprimido: 1200 }), true);
  assert.equal(revisarZip(zip, { maxDescomprimido: 1199 }), false);
});

test('base · CL-06 · una bomba zip (60 MB de ceros en unos KB) se rechaza sin tumbar nada', async () => {
  const bomba = crearZip([{ nombre: 'xl/sharedStrings.xml', datos: Buffer.alloc(60 * 1024 * 1024) }]);
  assert.ok(bomba.length < 200 * 1024, `la bomba pesa ${bomba.length} bytes`);
  assert.equal(revisarZip(bomba), false);
  await assert.rejects(leerCenso(bomba), (error) => {
    assert.equal(error.codigo, 'NO_ES_XLSX');
    assert.equal(error.message, 'El archivo debe ser el censo en Excel (.xlsx).');
    return true;
  });
});

test('base · CL-06 · un censo válido con 60 MB escondidos se rechaza (la revisión del zip está conectada)', async () => {
  const censo = await escribirCenso(inventarFilas({ cantidad: 5 }));
  const partes = leerEntradas(censo);
  // El mismo censo, armado otra vez a mano, se sigue leyendo bien…
  assert.equal((await leerCenso(crearZip(partes))).filas.length, 5);
  // …pero con una "imagen" de 60 MB de ceros escondida, se rechaza. ExcelJS solo lo
  // aceptaría: lo que lo frena es lib/zip-seguro.js dentro del hilo.
  const conRelleno = crearZip([...partes, { nombre: 'xl/media/relleno.bin', datos: Buffer.alloc(60 * 1024 * 1024) }]);
  await assert.rejects(leerCenso(conRelleno), (error) => error.codigo === 'NO_ES_XLSX');
});

test('base · CL-06 · demasiadas partes o un zip dañado se rechazan', async () => {
  const tres = crearZip(['a', 'b', 'c'].map((nombre) => ({ nombre, datos: Buffer.from(nombre) })));
  assert.equal(revisarZip(tres, { maxEntradas: 3 }), true);
  assert.equal(revisarZip(tres, { maxEntradas: 2 }), false);

  const censo = await escribirCenso(inventarFilas({ cantidad: 5 }));
  assert.equal(revisarZip(censo.subarray(0, censo.length - 30)), false); // recortado
  assert.equal(revisarZip(Buffer.from('PK\u0003\u0004 nada más')), false);
  assert.equal(revisarZip(Buffer.alloc(0)), false);
});
