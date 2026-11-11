'use strict';

// La puerta de las páginas con datos (HU-01, RNF-03): sin sesión, sin actividad en 8 horas
// o con la cuenta desactivada, no se pasa. Y la de las páginas de administrador (HU-02.11).

const { parseCookieHeader, serializeCookieHeader } = require('@supabase/ssr');
const { crearDatos } = require('../lib/datos');
const { crearMarca, sigueActiva } = require('../lib/inactividad');
const { MENSAJES } = require('../lib/mensajes');
const { registrarError } = require('../lib/registro');
const { leerCookie, ponerCookie, borrarCookie, nombreSeguro, quiereJson, responderError } = require('./seguridad');

const COOKIE_ACTIVIDAD = 'entrevistas_actividad';

/**
 * Cierra la sesión SOLO en este equipo. signOut() a secas la cierra en todos los equipos
 * de esa persona (trampa de Supabase ya comprobada).
 * Si Supabase falla al cerrarla (PYA tanda 3), el servidor la cierra con su llave
 * (cerrar_sesiones) y borra igual las cookies de la sesión: nunca queda viva a escondidas.
 */
async function cerrarSesionLocal(supabase, { clientes, usuarioId, req, res } = {}) {
  let fallo = false;
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    fallo = Boolean(error);
  } catch {
    fallo = true;
  }
  if (!fallo) return;

  if (clientes && usuarioId) {
    try {
      await clientes.admin().rpc('cerrar_sesiones', { p_usuario: usuarioId });
    } catch (error) {
      registrarError('cerrar sesiones de respaldo', error);
    }
  }
  if (req && res) {
    for (const { name } of parseCookieHeader(req.headers.cookie ?? '')) {
      if (name.startsWith('sb-') || name.startsWith('__Host-sb-')) {
        res.appendHeader('Set-Cookie', serializeCookieHeader(name, '', { path: '/', maxAge: 0 }));
      }
    }
  }
}

/**
 * @param clientes  los clientes de Supabase (lib/supabase.js)
 * @param reloj     función que da la hora en milisegundos (las pruebas la cambian)
 * @param fabricaDeDatos (cliente) => la puerta a la base (las pruebas pasan una falsa)
 */
function crearSesion({ clientes, claveFirma, produccion, reloj = Date.now, fabricaDeDatos = crearDatos }) {
  const cookieActividad = nombreSeguro(COOKIE_ACTIVIDAD, produccion);

  const marcarActividad = (res, usuarioId) => {
    ponerCookie(res, cookieActividad, crearMarca(reloj(), claveFirma, usuarioId), { produccion });
  };
  const olvidarActividad = (res) => borrarCookie(res, cookieActividad, { produccion });

  /** Fuera: al login (con el aviso que toque) o, si la pantalla pidió JSON, un 401 (CB-02). */
  function sacar(req, res, motivo) {
    if (quiereJson(req)) return res.status(401).json({ error: MENSAJES.sesionVencida, codigo: 'sesion' });
    return res.redirect(303, motivo ? `/login?motivo=${motivo}` : '/login');
  }

  async function requiereSesion(req, res, next) {
    res.set('Cache-Control', 'no-store'); // HU-01.5: el botón "atrás" no muestra datos
    const supabase = clientes.porPeticion(req, res);

    // getUser() le pregunta a Supabase si la sesión sigue existiendo (PYA tanda 2):
    // getSession() solo leería la cookie, sin comprobar nada.
    const { data, error } = await supabase.auth.getUser();
    const usuario = error ? null : data?.user ?? null;
    if (!usuario) return sacar(req, res);

    const cerrar = () => cerrarSesionLocal(supabase, { clientes, usuarioId: usuario.id, req, res });

    // La marca tiene que ser de ESTA cuenta y de hace menos de 8 horas.
    if (!sigueActiva(leerCookie(req, cookieActividad), reloj(), claveFirma, usuario.id)) {
      await cerrar();
      olvidarActividad(res);
      return sacar(req, res, 'inactividad'); // HU-01.6
    }

    const datos = fabricaDeDatos(supabase);
    let perfil;
    try {
      perfil = await datos.perfilDe(usuario.id);
    } catch (errorPerfil) {
      return next(errorPerfil);
    }
    if (!perfil || !perfil.activo) {
      await cerrar();
      olvidarActividad(res);
      return sacar(req, res, 'desactivada'); // HU-01.4 y HU-02.6
    }

    marcarActividad(res, usuario.id);
    req.cuenta = { id: perfil.id, nombre: perfil.nombre, rol: perfil.rol };
    res.locals.cuenta = req.cuenta; // para el menú según el rol
    req.supabase = supabase;
    req.datos = datos;
    return next();
  }

  return { requiereSesion, marcarActividad, olvidarActividad };
}

/**
 * HU-02.11 y CL-03: solo pasa el rol indicado. El rol sale de la tabla perfiles (ya leída
 * por requiereSesion), nunca de algo que la persona pueda cambiar. Va DESPUÉS de requiereSesion.
 */
function requiereRol(rol) {
  return (req, res, next) => {
    if (req.cuenta?.rol === rol) return next();
    return responderError(req, res, 403, MENSAJES.sinPermiso);
  };
}

module.exports = { crearSesion, requiereRol, cerrarSesionLocal, COOKIE_ACTIVIDAD };
