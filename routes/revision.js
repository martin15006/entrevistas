'use strict';

// HU-05 · Ver los candidatos por servicio. HU-06 · Decidir en verde o rojo.
// GET  /revision?dia=AAAA-MM-DD   la revisión de ese día (sin día: el censo más reciente)
// POST /revision/decidir          verde, rojo o "Cambiar decisión"
// Los botones son formularios de verdad: sin JavaScript funcionan recargando la página, y
// con JavaScript (public/js/revision.js) deciden sin recargar (HU-06.2 y 06.3).
// La base decide quién gana si dos personas tocan a la vez (CB-16) y rechaza cambiar una
// entrevista hecha (CB-11), también si alguien envía el formulario a mano.

const express = require('express');
const { esFechaIso } = require('../lib/fechas');
const { armarRevision } = require('../lib/revision');
const { MENSAJES } = require('../lib/mensajes');
const { quiereJson, responderError } = require('../middleware/seguridad');

const DECISIONES = new Set(['entrevistar', 'no_entrevistar']);
const ID = /^[1-9]\d{0,14}$/; // un número entero positivo (los id de la base)
// La hora de una decisión tal como la da la base: 2026-11-11T15:33:12.123456+00:00 (o con Z).
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

function crearRutasDeRevision() {
  const rutas = express.Router();

  /** Arma y muestra la página. aviso: un mensaje arriba de la lista (cuando no hay JavaScript). */
  async function mostrar(req, res, { dia, aviso = null, estado = 200 }) {
    const revision = armarRevision(await req.datos.revisionDelCenso(dia), { diaPedido: dia });
    res.status(estado).render('revision', {
      titulo: 'Revisión',
      pagina: 'revision',
      cuenta: req.cuenta,
      revision,
      aviso,
      mensajes: { listo: MENSAJES.pasoARevisados, conexion: MENSAJES.sinConexion },
    });
  }

  // HU-05.1 · Sin día (o con uno que no es una fecha): el censo más reciente.
  rutas.get('/revision', async (req, res) => {
    const dia = typeof req.query.dia === 'string' && esFechaIso(req.query.dia) ? req.query.dia : null;
    await mostrar(req, res, { dia });
  });

  rutas.post('/revision/decidir', async (req, res) => {
    const { candidato, decision, desde = '', desde_en: desdeEn = '', dia = '' } = req.body ?? {};
    const valido = typeof candidato === 'string' && ID.test(candidato)
      && DECISIONES.has(decision)
      && (desde === '' || DECISIONES.has(desde))
      && (desdeEn === '' || (typeof desdeEn === 'string' && INSTANTE.test(desdeEn)))
      && (dia === '' || esFechaIso(dia));
    if (!valido) return responderError(req, res, 400, MENSAJES.solicitudMala);

    const respuesta = await req.datos.decidirCandidato(Number(candidato), decision, desde || null, desdeEn || null);
    const resultado = respuesta?.resultado;
    const volver = dia ? `/revision?dia=${dia}` : '/revision';

    if (resultado === 'ok') {
      return quiereJson(req) ? res.json({ ok: true }) : res.redirect(303, volver);
    }
    if (resultado === 'no_existe') return responderError(req, res, 400, MENSAJES.solicitudMala);

    // HU-06.4 y 06.5: no cambia nada, y la persona ve por qué.
    let error;
    if (resultado === 'ya_revisado') error = MENSAJES.yaRevisado(respuesta.por);
    else if (resultado === 'ya_entrevistado') error = MENSAJES.entrevistaHecha;
    else throw new Error('decidir_candidato respondió algo inesperado');

    if (quiereJson(req)) return res.status(409).json({ error, codigo: resultado });
    return mostrar(req, res, { dia: dia || null, aviso: error, estado: 409 });
  });

  return rutas;
}

module.exports = { crearRutasDeRevision };
