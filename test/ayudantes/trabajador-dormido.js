'use strict';

// Ayudante de pruebas: un hilo que recibe censos y nunca contesta. Sirve para comprobar,
// sin depender de la velocidad del PC, que leerCenso corta por tiempo (test/censo.test.js).

const { parentPort, isMainThread } = require('node:worker_threads');

if (!isMainThread) parentPort.on('message', () => {});
