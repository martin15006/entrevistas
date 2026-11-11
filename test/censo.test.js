'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { leerCenso, leerCensoParaPruebas, resumirCenso, TAMANO_MAXIMO, LIMITE_FILAS } = require('../lib/censo');
const { ENCABEZADOS } = require('../scripts/censo-de-prueba');
const { inventarFilas, escribirCenso } = require('../scripts/censo-de-prueba');

// Todos los censos de estas pruebas son inventados (CL-01).

const MENSAJE_NO_XLSX = 'El archivo debe ser el censo en Excel (.xlsx).';
const MENSAJE_GRANDE = 'El archivo pesa más de 5 MB. El censo normal pesa mucho menos: revisa que sea el archivo correcto.';
const MENSAJE_SIN_ENCABEZADOS = 'Este archivo no parece el censo consolidado: no encontré las columnas Piso, Cama Asignada, Identificación, Nombre, Fecha Ingreso y Días.';

function rechazaCon(codigo, mensaje) {
  return (error) => {
    assert.equal(error.name, 'ErrorCenso');
    assert.equal(error.codigo, codigo);
    assert.equal(error.message, mensaje);
    return true;
  };
}

function fila(datos) {
  return {
    piso: 'Observacion', cama: '1 (Hombre)', cedula: '9900000001', nombre: 'ANA PRUEBA EJEMPLO', edad: 30,
    fechaIngreso: '2026-11-06', admision: 1900001, dias: 0, entidad: 'SEGUROS FICTICIOS S.A.',
    medicos: 'MEDICO DE PRUEBA', siniestro: '900001', consumo: 123456, ...datos,
  };
}

test('HU-04.3 · un archivo que no es .xlsx se rechaza con el mensaje exacto', async () => {
  await assert.rejects(leerCenso(Buffer.from('hola, esto es un texto')), rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX));
  // Un .xls viejo empieza con otros bytes (D0 CF 11 E0).
  await assert.rejects(leerCenso(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX));
  // Empieza como .zip pero está roto.
  await assert.rejects(leerCenso(Buffer.from('PK\u0003\u0004 esto no es un zip de verdad')), rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX));
  await assert.rejects(leerCenso('no es un buffer'), rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX));
});

test('HU-04.4 · un .xlsx sin las columnas del censo se rechaza con el mensaje exacto', async () => {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Otra cosa');
  hoja.addRow(['Producto', 'Precio', 'Cantidad']);
  hoja.addRow(['Pizza', 20000, 2]);
  const archivo = Buffer.from(await libro.xlsx.writeBuffer());
  await assert.rejects(leerCenso(archivo), rechazaCon('SIN_ENCABEZADOS', MENSAJE_SIN_ENCABEZADOS));
});

test('HU-04.4 · los encabezados se encuentran hasta la fila 10, no en la 11', async () => {
  const filas = [fila({})];
  const enLa10 = await leerCenso(await escribirCenso(filas, { filaEncabezados: 10 }));
  assert.equal(enLa10.filas.length, 1);
  assert.equal(enLa10.filas[0].fila, 11);
  await assert.rejects(leerCenso(await escribirCenso(filas, { filaEncabezados: 11 })), rechazaCon('SIN_ENCABEZADOS', MENSAJE_SIN_ENCABEZADOS));
});

test('HU-04.5 · la fecha sale de "Generado el"; si no está, queda en null', async () => {
  const conFecha = await leerCenso(await escribirCenso([fila({})], { fecha: '2026-11-06' }));
  assert.equal(conFecha.fecha, '2026-11-06');
  const sinFecha = await leerCenso(await escribirCenso([fila({})], { sinFecha: true }));
  assert.equal(sinFecha.fecha, null);
});

test('HU-04.6 · 5 MB pasa el control de tamaño; 5 MB + 1 byte se rechaza con el mensaje exacto', async () => {
  // Justo 5 MB: pasa el tamaño y se rechaza por otra razón (no es un .xlsx).
  await assert.rejects(leerCenso(Buffer.alloc(TAMANO_MAXIMO)), rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX));
  await assert.rejects(leerCenso(Buffer.alloc(TAMANO_MAXIMO + 1)), rechazaCon('MUY_GRANDE', MENSAJE_GRANDE));
  assert.equal(TAMANO_MAXIMO, 5 * 1024 * 1024);
});

test('HU-04.1 · el resumen cuenta pacientes y candidatos para revisar', async () => {
  const archivo = await escribirCenso([
    fila({ cedula: '9900000001', piso: 'Observacion', dias: 0 }),
    fila({ cedula: '9900000002', piso: 'UCI', dias: 1 }),
    fila({ cedula: '9900000003', piso: 'Hospitalizacion A', dias: 2 }),
    fila({ cedula: '9900000004', piso: 'Quirofano', dias: 0 }),
    fila({ cedula: '9900000005', piso: 'Hospitalizacion D', dias: 1 }),
  ]);
  const censo = await leerCenso(archivo);
  assert.deepEqual(resumirCenso(censo), { pacientes: 5, paraRevisar: 3 });
});

test('RNF-04 · CL-02 · de cada fila solo salen servicio, cama, cédula, nombre, fecha de ingreso y días', async () => {
  const censo = await leerCenso(await escribirCenso(inventarFilas({ cantidad: 20 })));
  for (const f of censo.filas) {
    assert.deepEqual(Object.keys(f), ['fila', 'piso', 'cama', 'cedula', 'nombre', 'fechaIngreso', 'dias']);
  }
  const todo = JSON.stringify(censo);
  for (const ignorado of ['SEGUROS FICTICIOS', 'ASEGURADORA DE PRUEBA', 'EPS DE PRUEBA', 'MEDICO DE PRUEBA']) {
    assert.equal(todo.includes(ignorado), false, `"${ignorado}" no debería salir del censo`);
  }
});

// Casos borde: 3 filas normales (filas 4 a 6 del Excel) y después las filas raras (desde la 7).
async function censoConCasosBorde() {
  return leerCenso(await escribirCenso(inventarFilas({ cantidad: 3, casosBorde: true })));
}

test('CB-04 · se saltan las filas sin cédula, sin días o con días no válidos, y se dice cuáles', async () => {
  const censo = await censoConCasosBorde();
  assert.deepEqual(censo.saltadas, [
    { fila: 9, motivo: 'días vacío o no válido' },
    { fila: 10, motivo: 'sin cédula' },
    { fila: 12, motivo: 'días vacío o no válido' },
  ]);
});

test('CB-05 · si una cédula aparece dos veces, se toma la primera fila', async () => {
  const censo = await censoConCasosBorde();
  assert.deepEqual(censo.repetidas, [{ filaTomada: 4, filaIgnorada: 8 }]);
  assert.equal(censo.filas.filter((f) => f.cedula === '9900000001').length, 1);
  assert.equal(censo.filas.find((f) => f.cedula === '9900000001').fila, 4);
});

test('CB-06 · "1.0" como texto se lee como día 1, y un día negativo se salta', async () => {
  const censo = await censoConCasosBorde();
  assert.equal(censo.filas.find((f) => f.cedula === '9900000103').dias, 1);
  assert.equal(censo.filas.some((f) => f.cedula === '9900000104'), false);
});

test('CB-07 · Quirófano escrito de varias formas no queda para revisar', async () => {
  const censo = await censoConCasosBorde();
  const quirofano = censo.filas.filter((f) => ['9900000105', '9900000106'].includes(f.cedula));
  assert.equal(quirofano.length, 2);
  for (const f of quirofano) assert.equal(resumirCenso({ filas: [f] }).paraRevisar, 0);
});

test('CB-08 · se limpian los espacios dobles del nombre, los puntos de la cédula y el espacio de la cama', async () => {
  const censo = await censoConCasosBorde();
  const limpia = censo.filas.find((f) => f.fila === 7);
  assert.equal(limpia.nombre, 'CAROLINA PRUEBA GÓMEZ');
  assert.equal(limpia.cedula, '9900000101');
  assert.equal(limpia.cama, 'CAMA 13');
});

test('CB-04 · una cédula de más de 20 caracteres se salta (20 entra, 21 no); los textos largos se recortan', async () => {
  const archivo = await escribirCenso([
    fila({ cedula: '9'.repeat(20), nombre: `ANA ${'X'.repeat(300)}`, cama: 'C'.repeat(100), piso: 'Observacion' }),
    fila({ cedula: '9'.repeat(21) }),
  ]);
  const censo = await leerCenso(archivo);
  assert.equal(censo.filas.length, 1);
  assert.equal(censo.filas[0].cedula.length, 20);
  assert.equal(censo.filas[0].nombre.length, 200);
  assert.equal(censo.filas[0].cama.length, 80);
  assert.deepEqual(censo.saltadas, [{ fila: 5, motivo: 'cédula no válida' }]);
});

test('base · la fecha de ingreso guardada como fecha de Excel también se lee', async () => {
  const censo = await censoConCasosBorde();
  assert.equal(censo.filas.find((f) => f.cedula === '9900000107').fechaIngreso, '2026-11-06');
});

test('base · las filas vacías del final se ignoran sin avisar', async () => {
  const vacia = {
    piso: '', cama: '', cedula: '', nombre: '', edad: '', fechaIngreso: '', admision: '', dias: '',
    entidad: '', medicos: '', siniestro: '', consumo: '',
  };
  const censo = await leerCenso(await escribirCenso([fila({}), vacia, vacia, vacia]));
  assert.equal(censo.filas.length, 1);
  assert.deepEqual(censo.saltadas, []);
});

// --- Protecciones que pidió la revisión PYA de la tanda 1 (CL-06) ---

/** Un censo mínimo con encabezados en la fila 3 y un paciente en la fila que se pida. */
async function censoConPacienteEnLaFila(numero, { celdaRara } = {}) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Censo Consolidado');
  hoja.getCell('A1').value = 'Censo Consolidado de Camas - Generado el: 06/11/2026';
  if (celdaRara) {
    // Un número enorme con formato de fecha: ExcelJS lo convierte en una fecha imposible.
    hoja.getCell('B1').value = 1e12;
    hoja.getCell('B1').numFmt = 'yyyy-mm-dd';
  }
  hoja.getRow(3).values = ENCABEZADOS;
  hoja.getRow(numero).values = ['Observacion', '1 (Hombre)', '9900000001', 'ANA PRUEBA', 30, '2026-11-06', 1900001, 0];
  return Buffer.from(await libro.xlsx.writeBuffer());
}

test('base · CL-06 · un archivo que dice tener más de 10.000 filas se rechaza; con 10.000 se lee', async () => {
  assert.equal(LIMITE_FILAS, 10000);
  const conDiezMil = await leerCenso(await censoConPacienteEnLaFila(10000));
  assert.equal(conDiezMil.filas.length, 1);
  assert.equal(conDiezMil.filas[0].fila, 10000);
  await assert.rejects(leerCenso(await censoConPacienteEnLaFila(10001)), rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX));
});

test('base · CL-06 · si abrir el archivo tarda demasiado, se corta y se rechaza', async () => {
  const archivo = await escribirCenso([fila({})]);
  // Un hilo "dormido" que nunca contesta: el corte por tiempo tiene que llegar sí o sí.
  const dormido = path.join(__dirname, 'ayudantes', 'trabajador-dormido.js');
  const inicio = performance.now();
  await assert.rejects(leerCensoParaPruebas(archivo, { trabajadorParaPruebas: dormido, tiempoMaximoMs: 100 }), rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX));
  assert.ok(performance.now() - inicio < 5000, 'se cortó cerca del tope, sin quedarse esperando');
});

test('base · CL-06 · la lectura normal no acepta opciones, y la de pruebas solo hilos de test/ayudantes/', async () => {
  const archivo = await escribirCenso([fila({})]);
  // leerCenso ignora cualquier cosa que no sea el archivo (nada de la petición cambia sus topes).
  const normal = await leerCenso(archivo, { trabajadorParaPruebas: path.join(__dirname, '..', 'server.js'), tiempoMaximoMs: 1 });
  assert.equal(normal.filas.length, 1);
  // La de pruebas rechaza un script que no sea un ayudante de prueba.
  await assert.rejects(
    leerCensoParaPruebas(archivo, { trabajadorParaPruebas: path.join(__dirname, '..', 'server.js') }),
    /Solo se aceptan hilos de prueba de test\/ayudantes\//,
  );
});

test('base · CL-06 · si el hilo que abre el archivo se queda sin memoria, se rechaza y el servidor sigue', async () => {
  const archivo = await escribirCenso([fila({})]);
  // Un hilo "glotón" que gasta memoria sin parar, con un tope de 32 MB.
  // (Con topes de 2 MB V8 ni siquiera puede crear el hilo y tumba todo el proceso.)
  const gloton = path.join(__dirname, 'ayudantes', 'trabajador-gloton.js');
  await assert.rejects(
    leerCensoParaPruebas(archivo, { trabajadorParaPruebas: gloton, limiteMemoriaMb: 32 }),
    rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX),
  );
  // Este proceso (el "servidor") sigue vivo y lee el siguiente archivo normalmente.
  assert.equal((await leerCenso(archivo)).filas.length, 1);
});

test('base · CL-06 · una celda con una fecha imposible no rompe la lectura', async () => {
  const censo = await leerCenso(await censoConPacienteEnLaFila(4, { celdaRara: true }));
  assert.equal(censo.filas.length, 1);
  assert.equal(censo.fecha, '2026-11-06');
});

test('RNF-01 · el hilo se reutiliza: con ExcelJS ya cargado, un censo de 300 filas tarda menos de 1 s', async () => {
  const archivo = await escribirCenso(inventarFilas({ cantidad: 300 }));
  await leerCenso(archivo); // la primera vez puede abrir el hilo y cargar ExcelJS
  const inicio = performance.now();
  const censo = await leerCenso(archivo);
  const milisegundos = performance.now() - inicio;
  assert.equal(censo.filas.length, 300);
  assert.ok(milisegundos < 1000, `tardó ${Math.round(milisegundos)} ms`);
});

test('base · CL-06 · si un archivo tumba el hilo compartido, el siguiente censo igual se lee', async () => {
  const archivo = await escribirCenso([fila({})]);
  // Un censo de 2.000 filas tarda bastante más de 1 ms en leerse: con ese tope se corta
  // seguro y se cierra el hilo compartido…
  const grande = await escribirCenso(inventarFilas({ cantidad: 2000 }));
  await assert.rejects(leerCensoParaPruebas(grande, { tiempoMaximoMs: 1 }), rechazaCon('NO_ES_XLSX', MENSAJE_NO_XLSX));
  // …y el siguiente censo abre uno nuevo, sin quedar trabado.
  assert.equal((await leerCenso(archivo)).filas.length, 1);
  // Varios a la vez se atienden de a uno, sin mezclarse.
  const [a, b, c] = await Promise.all([1, 2, 3].map((n) => leerCenso(archivo).then((r) => r.filas.length + n)));
  assert.deepEqual([a, b, c], [2, 3, 4]);
});

test('RNF-01 · un censo de 300 filas se lee en menos de 3 segundos', async () => {
  const archivo = await escribirCenso(inventarFilas({ cantidad: 300 }));
  const inicio = performance.now();
  const censo = await leerCenso(archivo);
  const milisegundos = performance.now() - inicio;
  assert.equal(censo.filas.length, 300);
  assert.ok(milisegundos < 3000, `tardó ${Math.round(milisegundos)} ms`);
});
