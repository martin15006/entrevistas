'use strict';

// HU-08 · Ver las entrevistas por estado. Es la pantalla de inicio (HU-01.2).
// GET /entrevistas                                 Pendientes (todas)
// GET /entrevistas?pestana=entrevistados&dia=…     Entrevistados o Salieron hechas ese día (HU-08.3)
// GET /entrevistas?guardada=1                      al volver de guardar una entrevista (HU-09.4)
// Las pestañas son enlaces normales: funcionan sin JavaScript.

const express = require('express');
const { esFechaIso, hoyBogota } = require('../lib/fechas');
const { armarEntrevistas, esPestana } = require('../lib/entrevistas');

function crearRutasDeEntrevistas({ reloj = Date.now } = {}) {
  const rutas = express.Router();

  rutas.get('/entrevistas', async (req, res) => {
    const pestana = esPestana(req.query.pestana) ? req.query.pestana : 'pendientes';
    const dia = typeof req.query.dia === 'string' && esFechaIso(req.query.dia) ? req.query.dia : null;
    // Las pendientes son de cualquier día; el día solo cambia Entrevistados y Salieron.
    const resultado = await req.datos.entrevistasDelDia(pestana === 'pendientes' ? null : dia);
    // "hoy" lo dice la base (un solo reloj); el del servidor queda solo por si no llegó.
    const vista = armarEntrevistas(resultado, {
      pestana,
      hoy: hoyBogota(new Date(reloj())),
      diaPedido: pestana === 'pendientes' ? null : dia,
      guardada: req.query.guardada === '1',
    });
    res.render('entrevistas', { titulo: 'Entrevistas', pagina: 'entrevistas', cuenta: req.cuenta, vista });
  });

  return rutas;
}

module.exports = { crearRutasDeEntrevistas };
