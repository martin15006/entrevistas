'use strict';

// HU-05 · Revisión del censo. PROVISIONAL hasta la tanda de HU-05: por ahora solo confirma
// que el censo quedó guardado y cuántos pacientes tiene para revisar (adonde llega HU-04.2).

const express = require('express');
const { esFechaIso, fechaCorta } = require('../lib/fechas');

function crearRutasDeRevision() {
  const rutas = express.Router();

  rutas.get('/revision', async (req, res) => {
    const dia = typeof req.query.dia === 'string' && esFechaIso(req.query.dia) ? req.query.dia : null;
    const censo = dia ? await req.datos.resumenDelCenso(dia) : null;
    const resumen = censo && {
      fechaTexto: fechaCorta(censo.fecha),
      texto: censo.candidatos === 1
        ? 'Tiene 1 paciente con día 0 o 1 para revisar.'
        : `Tiene ${censo.candidatos} pacientes con día 0 o 1 para revisar.`,
    };
    res.render('revision', { titulo: 'Revisión', pagina: 'revision', cuenta: req.cuenta, resumen });
  });

  return rutas;
}

module.exports = { crearRutasDeRevision };
