'use strict';

// El "cuarto aparte" donde se abren los censos (ver lib/censo.js). Corre en su propio hilo,
// con tope de memoria: si un archivo está trucado, se cae este hilo y no el servidor.
// Se queda esperando censos: así ExcelJS se carga una sola vez.

const { parentPort } = require('node:worker_threads');
const { analizarCenso } = require('./censo');
const { revisarZip } = require('./zip-seguro');

parentPort.on('message', async ({ id, archivo }) => {
  // El archivo llega copiado como bytes; se vuelve a envolver como Buffer.
  const buffer = Buffer.from(archivo.buffer, archivo.byteOffset, archivo.byteLength);
  // Solo viaja el código del error, nunca su texto ni datos del archivo.
  const fallar = (codigo) => parentPort.postMessage({ id, ok: false, codigo });

  if (!revisarZip(buffer)) {
    fallar('NO_ES_XLSX'); // zip dañado o "bomba zip"
    return;
  }
  try {
    parentPort.postMessage({ id, ok: true, censo: await analizarCenso(buffer) });
  } catch (error) {
    fallar(error && error.name === 'ErrorCenso' ? error.codigo : 'NO_ES_XLSX');
  }
});
