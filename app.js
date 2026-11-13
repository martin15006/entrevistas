'use strict';

// Arma la aplicación Express con su seguridad común. No escucha ningún puerto (eso lo
// hace server.js), así las pruebas pueden crearla con una configuración de mentira.

const path = require('node:path');
const express = require('express');
const { ponerCabeceras, protegerFormularios, responderError } = require('./middleware/seguridad');
const { crearSesion, requiereRol } = require('./middleware/sesion');
const { crearRutasDeAcceso } = require('./routes/acceso');
const { crearRutasDeCenso } = require('./routes/censo');
const { crearRutasDeRevision } = require('./routes/revision');
const { crearRutasDeEntrevistas } = require('./routes/entrevistas');
const { crearClientes } = require('./lib/supabase');
const { crearDatos } = require('./lib/datos');
const { registrarError } = require('./lib/registro');
const { MENSAJES } = require('./lib/mensajes');

/**
 * @param config      lo que devuelve leerConfiguracion()
 * @param montarRutas función (app, { requiereSesion }) que agrega rutas (las pruebas la usan).
 *                    Se monta antes de las respuestas de "no encontrada" y de error.
 * @param clientes    clientes de Supabase; las pruebas pasan unos de mentira
 * @param reloj       hora en milisegundos; las pruebas la adelantan (HU-01.6)
 * @param fabricaDeDatos (clienteDeSupabase) => la puerta a la base; las pruebas pasan una falsa
 */
function crearApp(config, {
  montarRutas,
  clientes = crearClientes(config.supabase, { produccion: config.produccion }),
  reloj = Date.now,
  fabricaDeDatos = crearDatos,
} = {}) {
  const app = express();
  app.disable('x-powered-by'); // no anunciar qué servidor usamos
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  const { claveFirma, produccion } = config;

  // Detrás de un proxy (el hosting), req.ip debe ser el del equipo y no el del proxy (CB-28).
  app.set('trust proxy', config.proxies ?? 0);

  app.use(ponerCabeceras({ produccion }));
  app.use(express.static(path.join(__dirname, 'public'), { index: false, dotfiles: 'ignore' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(express.json({ limit: '20kb' }));
  app.use(protegerFormularios({ claveFirma, produccion }));

  const sesion = crearSesion({ clientes, claveFirma, produccion, reloj, fabricaDeDatos });
  const { requiereSesion } = sesion;

  // --- Lo único público: entrar y salir (HU-01) ---
  app.use(crearRutasDeAcceso({ clientes, claveFirma, produccion, sesion, reloj }));

  // Rutas que agregan las pruebas para probar la seguridad común (nunca en el servidor real).
  if (montarRutas) montarRutas(app, { requiereSesion, requiereRol });

  // --- De aquí en adelante TODO pide sesión (PYA tanda 3): una página nueva queda cerrada
  // aunque alguien se olvide de pedirla. Sin sesión, ni siquiera se sabe qué páginas existen. ---
  app.use(requiereSesion);

  // "/" lleva a Entrevistas (HU-01.1 y HU-01.2).
  app.get('/', (req, res) => res.redirect(303, '/entrevistas'));

  // HU-08: la pantalla adonde se llega al entrar (HU-01.2). HU-04: subir el censo.
  // HU-05 a HU-07: la revisión.
  app.use(crearRutasDeEntrevistas({ reloj }));
  app.use(crearRutasDeCenso({ reloj }));
  app.use(crearRutasDeRevision());

  // Ninguna ruta respondió.
  app.use((req, res) => responderError(req, res, 404, MENSAJES.noEncontrada));

  // Un error en cualquier ruta: se anota solo su código (RNF-08) y la persona ve un
  // mensaje general, nunca el detalle ni la pila del error.
  app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
    const pedidoMalo = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500;
    if (!pedidoMalo) registrarError(`${req.method} ${req.route?.path ?? 'ruta'}`, error);
    responderError(req, res, pedidoMalo ? 400 : 500, pedidoMalo ? MENSAJES.solicitudMala : MENSAJES.inesperado);
  });

  return app;
}

module.exports = { crearApp };
