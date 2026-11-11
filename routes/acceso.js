'use strict';

// HU-01 · Iniciar y cerrar sesión. CB-28 · freno de intentos (enmienda 1).

const express = require('express');
const { MENSAJES } = require('../lib/mensajes');
const { registrarError } = require('../lib/registro');
const { crearDatos } = require('../lib/datos');
const { crearFreno } = require('../lib/intentos');
const { renovarToken } = require('../middleware/seguridad');
const { cerrarSesionLocal } = require('../middleware/sesion');

const LARGO_MAXIMO_CORREO = 254;
const LARGO_MAXIMO_CONTRASENA = 200;

// Los avisos que puede mostrar el login según por qué se llegó a él.
const AVISOS = { inactividad: MENSAJES.inactividad, desactivada: MENSAJES.cuentaDesactivada };

function crearRutasDeAcceso({ clientes, claveFirma, produccion, sesion, reloj = Date.now }) {
  const rutas = express.Router();
  const freno = crearFreno({ reloj });

  function pintarLogin(res, estado, { mensaje = null, correo = '' } = {}) {
    res.set('Cache-Control', 'no-store');
    res.status(estado).render('login', { titulo: 'Iniciar sesión', mensaje, correo, cuenta: null, pagina: 'login' });
  }

  rutas.get('/login', async (req, res) => {
    // Si ya tiene sesión, a Entrevistas: allá la puerta decide si de verdad puede pasar.
    const { data } = await clientes.porPeticion(req, res).auth.getUser();
    if (data?.user) return res.redirect(303, '/entrevistas');

    const motivo = typeof req.query.motivo === 'string' ? req.query.motivo : '';
    return pintarLogin(res, 200, { mensaje: Object.hasOwn(AVISOS, motivo) ? AVISOS[motivo] : null });
  });

  rutas.post('/login', async (req, res) => {
    const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
    const contrasena = typeof req.body?.contrasena === 'string' ? req.body.contrasena : '';
    const correoParaMostrar = correo.slice(0, LARGO_MAXIMO_CORREO);

    // HU-01.3: el mismo mensaje si falta algo, si sobra o si está mal (no se dan pistas).
    const incorrecto = () => pintarLogin(res, 401, { mensaje: MENSAJES.credencialesIncorrectas, correo: correoParaMostrar });
    const falla = () => pintarLogin(res, 503, { mensaje: MENSAJES.inesperado, correo: correoParaMostrar });
    if (!correo || !contrasena || correo.length > LARGO_MAXIMO_CORREO || contrasena.length > LARGO_MAXIMO_CONTRASENA) {
      return incorrecto();
    }

    // CB-28: cuenta o equipo frenados → ni se le pregunta a Supabase.
    const datosDelIntento = { correo, equipo: req.ip };
    if (freno.estaFrenado(datosDelIntento)) {
      return pintarLogin(res, 429, { mensaje: MENSAJES.demasiadosIntentos, correo: correoParaMostrar });
    }
    const terminarIntento = freno.anotarIntento(datosDelIntento);

    // El cliente de esta visita (nunca el de administración: trampa de Supabase).
    const supabase = clientes.porPeticion(req, res);
    let respuesta;
    try {
      respuesta = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
    } catch (error) {
      terminarIntento({ bien: true }); // una falla de Supabase no cuenta como intento
      registrarError('iniciar sesión', error);
      return falla();
    }
    if (respuesta.error) {
      if (respuesta.error.code === 'invalid_credentials') return incorrecto(); // queda contado
      terminarIntento({ bien: true });
      registrarError('iniciar sesión', respuesta.error);
      return falla();
    }
    terminarIntento({ bien: true }); // la contraseña era correcta
    const usuarioId = respuesta.data.user.id;

    let perfil;
    try {
      perfil = await crearDatos(supabase).perfilDe(usuarioId);
    } catch (error) {
      registrarError('leer perfil al entrar', error);
      await cerrarSesionLocal(supabase, { clientes, usuarioId, req, res });
      return falla();
    }
    // HU-01.4: una cuenta desactivada (o sin perfil) no entra, y no le queda sesión abierta.
    if (!perfil || !perfil.activo) {
      await cerrarSesionLocal(supabase, { clientes, usuarioId, req, res });
      return pintarLogin(res, 403, { mensaje: MENSAJES.cuentaDesactivada, correo: correoParaMostrar });
    }

    sesion.marcarActividad(res, usuarioId);
    renovarToken(res, { claveFirma, produccion });
    return res.redirect(303, '/entrevistas'); // HU-01.2
  });

  // HU-01.5: cerrar sesión, solo en este equipo, y volver al login.
  rutas.post('/salir', async (req, res) => {
    const supabase = clientes.porPeticion(req, res);
    const { data } = await supabase.auth.getUser(); // para el respaldo, si Supabase falla al cerrar
    await cerrarSesionLocal(supabase, { clientes, usuarioId: data?.user?.id, req, res });
    sesion.olvidarActividad(res);
    renovarToken(res, { claveFirma, produccion });
    res.set('Cache-Control', 'no-store');
    return res.redirect(303, '/login');
  });

  return rutas;
}

module.exports = { crearRutasDeAcceso, LARGO_MAXIMO_CORREO, LARGO_MAXIMO_CONTRASENA };
