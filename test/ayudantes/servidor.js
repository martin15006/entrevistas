'use strict';

// Ayudante de pruebas: levanta la app en un puerto libre de este PC, hace la prueba y la
// apaga siempre (aunque la prueba falle), cerrando también las conexiones abiertas.

/** Configuración de mentira: ninguna llave es real. */
const CONFIG = Object.freeze({
  supabase: Object.freeze({
    url: 'https://prueba.supabase.co',
    llavePublicable: 'llave-publicable-de-prueba',
    llaveSecreta: 'llave-secreta-de-prueba',
  }),
  claveFirma: 'clave-de-firma-solo-para-pruebas-0123456789',
  produccion: false,
  puerto: 0,
  host: '127.0.0.1',
});

async function conServidor(app, prueba) {
  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, '127.0.0.1', () => resolver(s));
  });
  try {
    return await prueba(`http://127.0.0.1:${servidor.address().port}`);
  } finally {
    servidor.closeAllConnections();
    await new Promise((resolver) => servidor.close(resolver));
  }
}

module.exports = { CONFIG, conServidor };
