'use strict';

// HU-09 · Llenar la entrevista.
// GET  /entrevistas/:id           el formulario (o el aviso de HU-09.9 si otra persona lo tiene abierto)
// GET  /entrevistas/:id?igual=1   "Abrir igual" (HU-09.9)
// POST /entrevistas/:id           "Guardar entrevista" (HU-09.4 a 09.7, CB-17)
// POST /entrevistas/:id/abrir     RN-13 · lo marca "En curso" (lo llama public/js/entrevista.js al abrir;
//                                 con igual=1 después de "Abrir igual"). Devuelve la hora de la apertura.
// POST /entrevistas/:id/soltar    RN-13 · lo suelta al salir del formulario (con esa hora: desde)
// GET  /token                     CB-02 · el token anti-falsificación nuevo, después de volver a entrar
// Guardar es un formulario de verdad: sin JavaScript funciona recargando la página; con JavaScript
// guarda con fetch y, si algo falla, todo lo escrito sigue en la pantalla (CB-01, CB-02).
// La base decide quién gana si dos personas guardan a la vez (CB-17).

const express = require('express');
const { hoyBogota, esInstante } = require('../lib/fechas');
const { validarEntrevista } = require('../lib/reglas');
const { armarFormulario } = require('../lib/formulario');
const { MENSAJES } = require('../lib/mensajes');
const { quiereJson, responderError } = require('../middleware/seguridad');

const ID = /^[1-9]\d{0,14}$/; // un número entero positivo (los id de la base)
const VOLVER_GUARDADA = '/entrevistas?guardada=1'; // HU-09.4: "Entrevista guardada." y a Pendientes

function crearRutasDeFormulario({ reloj = Date.now } = {}) {
  const rutas = express.Router();

  /** El id de la ruta como número, o null si no es un id (y entonces esa ruta no es esta). */
  const idDe = (req) => (ID.test(req.params.id) ? Number(req.params.id) : null);

  async function mostrar(req, res, entrevista, opciones = {}, estado = 200) {
    const vista = armarFormulario(entrevista, opciones);
    res.status(estado).render('entrevista', { titulo: 'Entrevista', pagina: 'entrevista', cuenta: req.cuenta, vista });
  }

  // CB-02 · Después de entrar otra vez (en otra pestaña), el token cambió: la pantalla pide el nuevo.
  rutas.get('/token', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ token: res.locals.csrf });
  });

  rutas.get('/entrevistas/:id', async (req, res, next) => {
    const id = idDe(req);
    if (id === null) return next();
    const entrevista = await req.datos.verEntrevista(id);
    if (!entrevista) return responderError(req, res, 404, MENSAJES.entrevistaNoExiste); // CB-20
    return mostrar(req, res, entrevista, { igual: req.query.igual === '1' });
  });

  // RN-13 · HU-09.9 · La base decide en el mismo momento si otra persona la tiene (PYA tanda 9):
  // sin "Abrir igual" no se le quita. Devuelve la hora de esta apertura (para soltarla después).
  rutas.post('/entrevistas/:id/abrir', async (req, res, next) => {
    const id = idDe(req);
    if (id === null) return next();
    const respuesta = (await req.datos.abrirEntrevista(id, req.body?.igual === '1')) ?? {};
    if (respuesta.resultado === 'ok') return res.json({ ok: true, desde: respuesta.desde });
    if (respuesta.resultado === 'no_existe') return responderError(req, res, 404, MENSAJES.entrevistaNoExiste);
    if (respuesta.resultado === 'en_curso') {
      return res.status(409).json({ error: MENSAJES.haciendoEntrevista(respuesta.por), codigo: 'en_curso' });
    }
    return res.status(409).json({ error: MENSAJES.noPendiente, codigo: 'no_pendiente' });
  });

  // RN-13 · Se suelta solo la apertura de esta pantalla (desde): recargar u otra pestaña no la sueltan.
  rutas.post('/entrevistas/:id/soltar', async (req, res, next) => {
    const id = idDe(req);
    if (id === null) return next();
    if (!esInstante(req.body?.desde)) return responderError(req, res, 400, MENSAJES.solicitudMala);
    await req.datos.soltarEntrevista(id, req.body.desde);
    return res.status(204).end();
  });

  rutas.post('/entrevistas/:id', async (req, res, next) => {
    const id = idDe(req);
    if (id === null) return next();

    const revision = validarEntrevista(req.body, hoyBogota(new Date(reloj())));
    if (revision.malo) return responderError(req, res, 400, MENSAJES.solicitudMala);

    let respuesta;
    if (!revision.primero) {
      try {
        respuesta = await req.datos.guardarEntrevista(id, revision.datos);
      } catch (error) {
        // Justo a medianoche, el reloj de la base ya puede ir en el día siguiente (o el del servidor):
        // si la base dice que la fecha es posterior a hoy, se avisa en el campo (PYA tanda 9).
        if (error?.code !== '22023') throw error;
        revision.errores = { fecha_accidente: 'fechaAccidenteFutura' };
        revision.primero = 'fecha_accidente';
      }
    }

    // HU-09.5 · HU-09.6 · Falta algo o algo está fuera de las reglas: no se guarda nada.
    if (revision.primero) {
      if (quiereJson(req)) {
        const errores = Object.fromEntries(Object.entries(revision.errores).map(([campo, clave]) => [campo, MENSAJES[clave]]));
        return res.status(422).json({ errores, primero: revision.primero });
      }
      const entrevista = await req.datos.verEntrevista(id);
      if (!entrevista) return responderError(req, res, 404, MENSAJES.entrevistaNoExiste);
      return mostrar(req, res, entrevista, { igual: true, enviados: req.body, errores: revision.errores }, 422);
    }

    const resultado = respuesta?.resultado;
    if (resultado === 'ok') {
      return quiereJson(req) ? res.json({ ok: true, ir: VOLVER_GUARDADA }) : res.redirect(303, VOLVER_GUARDADA);
    }

    // CB-17 y los otros cambios de un momento antes: no se pisa nada, y la persona ve por qué.
    let error;
    if (resultado === 'ya_entrevistado') error = MENSAJES.guardadaPorOtro(respuesta.por);
    else if (resultado === 'salio') error = MENSAJES.salioPorOtro(respuesta.por);
    else if (resultado === 'no_existe') error = MENSAJES.entrevistaBorrada;
    else throw new Error('guardar_entrevista respondió algo inesperado');

    if (quiereJson(req)) return res.status(409).json({ error, codigo: resultado });
    const entrevista = await req.datos.verEntrevista(id);
    if (!entrevista) return responderError(req, res, 409, error);
    return mostrar(req, res, { ...entrevista, estado: 'pendiente' }, { igual: true, enviados: req.body, aviso: error }, 409);
  });

  return rutas;
}

module.exports = { crearRutasDeFormulario };
