'use strict';

// Ayudante de pruebas: un hilo que gasta memoria sin parar. Sirve para comprobar que,
// si el hilo que abre el censo pasa su tope, se cae ese hilo y no el proceso
// (test/censo.test.js). Fuera de un hilo aparte no hace nada.

const { isMainThread } = require('node:worker_threads');

if (!isMainThread) {
  const basura = [];
  for (;;) basura.push(new Array(100000).fill({ relleno: Math.random() }));
}
