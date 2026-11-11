'use strict';

// HU-04 · Subir el censo del día.
// 1. POST /censo/leer: el servidor lee el archivo EN MEMORIA y responde el resumen. No guarda nada.
// 2. POST /censo/guardar: la pantalla vuelve a mandar el MISMO archivo y recién ahí se guarda.
// El archivo nunca se escribe en el disco ni en la base (CL-02): así el servidor no tiene que
// guardar nada mientras la persona mira el resumen.

const express = require('express');
const { leerCenso, ErrorCenso, MENSAJES: MENSAJES_CENSO, TAMANO_MAXIMO } = require('../lib/censo');
const { armarResumen, candidatosParaGuardar } = require('../lib/resumen-censo');
const { esFechaIso, hoyBogota, fechaCorta } = require('../lib/fechas');
const { MENSAJES } = require('../lib/mensajes');

function crearRutasDeCenso({ reloj = Date.now } = {}) {
  const rutas = express.Router();
  const hoy = () => hoyBogota(new Date(reloj()));

  // El archivo llega crudo (no hace falta otra librería). Se corta en 5 MB AL RECIBIRLO, sin
  // esperar a tenerlo entero en memoria (PYA tanda 1), y no se aceptan cuerpos comprimidos.
  const recibirArchivo = express.raw({ type: () => true, limit: TAMANO_MAXIMO, inflate: false });

  rutas.get('/censo', (req, res) => {
    res.render('censo', {
      titulo: 'Subir censo',
      pagina: 'censo',
      cuenta: req.cuenta,
      hoy: hoy(),
      tamanoMaximo: TAMANO_MAXIMO,
      mensajes: {
        grande: MENSAJES_CENSO.MUY_GRANDE,
        sinArchivo: MENSAJES.censoSinArchivo,
        conexion: MENSAJES.sinConexion,
      },
    });
  });

  /** Lee el archivo de la petición. Si no sirve, responde el mensaje de HU-04 y devuelve null. */
  async function leerDeLaPeticion(req, res) {
    let censo;
    try {
      censo = await leerCenso(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    } catch (error) {
      if (!(error instanceof ErrorCenso)) throw error;
      res.status(400).json({ error: error.message, codigo: error.codigo });
      return null;
    }
    // La fecha del archivo tampoco puede ser posterior a hoy, igual que la elegida a mano
    // (PYA tanda 4: si no, alguien podría crear antes el censo de un día que no ha llegado).
    if (censo.fecha && censo.fecha > hoy()) {
      res.status(400).json({ error: MENSAJES.censoFechaFutura(fechaCorta(censo.fecha)), codigo: 'FECHA_FUTURA' });
      return null;
    }
    return censo;
  }

  /**
   * La fecha del censo: la de "Generado el" o, si el archivo no la trae (HU-04.5), la que
   * eligió la persona. Una fecha elegida que no existe o es posterior a hoy no sirve.
   */
  function resolverFecha(req, censo) {
    if (censo.fecha) return { fecha: censo.fecha, elegidaNoSirve: false };
    const elegida = typeof req.query.fecha === 'string' ? req.query.fecha : '';
    if (!elegida) return { fecha: null, elegidaNoSirve: false };
    const sirve = esFechaIso(elegida) && elegida <= hoy();
    return { fecha: sirve ? elegida : null, elegidaNoSirve: !sirve };
  }

  // HU-04.1, 04.3 a 04.7 · El resumen. NO guarda nada (HU-04.2: "Cancelar" no deja rastro).
  rutas.post('/censo/leer', recibirArchivo, async (req, res) => {
    const censo = await leerDeLaPeticion(req, res);
    if (!censo) return undefined;
    const { fecha, elegidaNoSirve } = resolverFecha(req, censo);
    const yaExiste = fecha ? Boolean(await req.datos.censoDelDia(fecha)) : false;
    const avisosExtra = elegidaNoSirve ? [MENSAJES.censoFechaNoValida] : [];
    return res.json(armarResumen(censo, { fecha, yaExiste, avisosExtra }));
  });

  // HU-04.2 · Guardar: el mismo archivo, leído otra vez, y solo los candidatos con CL-02.
  rutas.post('/censo/guardar', recibirArchivo, async (req, res) => {
    const censo = await leerDeLaPeticion(req, res);
    if (!censo) return undefined;
    const { fecha } = resolverFecha(req, censo);
    if (!fecha) return res.status(400).json({ error: MENSAJES.censoFechaNoValida, codigo: 'SIN_FECHA' });

    const resultado = await req.datos.guardarCenso(fecha, candidatosParaGuardar(censo.filas));
    return res.json({ ok: true, redirigir: `/revision?dia=${fecha}`, agregados: resultado?.agregados ?? 0 });
  });

  // HU-04.6 · Más de 5 MB: se corta al recibirlo y se responde el mensaje del SRS.
  rutas.use((error, req, res, next) => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: MENSAJES_CENSO.MUY_GRANDE, codigo: 'MUY_GRANDE' });
    }
    return next(error);
  });

  return rutas;
}

module.exports = { crearRutasDeCenso };
