'use strict';

// Arranca el servidor: lee el .env, arma la aplicación y escucha.
// Si falta algo en el .env, no arranca y dice qué falta (sin mostrar valores).

const { leerConfiguracion } = require('./lib/configuracion');
const { crearApp } = require('./app');
const { precalentarLector } = require('./lib/censo');

let config;
try {
  config = leerConfiguracion();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const app = crearApp(config);

app.listen(config.puerto, config.host, () => {
  console.log(`Entrevistas en http://localhost:${config.puerto}`);
  precalentarLector(); // carga ExcelJS en su hilo ahora, y no cuando llegue el primer censo
});
