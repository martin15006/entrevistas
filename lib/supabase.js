'use strict';

// Los tres clientes de Supabase. Solo este archivo conoce las llaves (CL-04) y
// solo lib/datos.js los usa para leer o guardar datos.

const { createClient } = require('@supabase/supabase-js');
const { createServerClient, parseCookieHeader, serializeCookieHeader } = require('@supabase/ssr');

const SIN_GUARDAR_SESION = { autoRefreshToken: false, persistSession: false };

/**
 * Cómo se guardan las cookies de la sesión (RNF-06): el JavaScript de la página no las
 * puede leer (HttpOnly), no viajan desde otras páginas (SameSite=Lax) y, al publicar con
 * HTTPS, solo viajan cifradas (Secure).
 */
function opcionesCookie({ produccion }) {
  return { httpOnly: true, sameSite: 'lax', secure: produccion, path: '/' };
}

const OCHO_HORAS = 8 * 60 * 60; // en segundos (HU-01.6, RNF-07)

/**
 * Las opciones con que Supabase quiere guardar una cookie, con nuestras reglas encima.
 * Supabase las guarda por 400 días: aquí duran como máximo 8 horas (PYA tanda 2).
 * Un maxAge de 0 se respeta, porque así es como Supabase BORRA la cookie al cerrar sesión.
 */
function ajustarOpcionesCookie(opciones = {}, { produccion }) {
  const maxAge = opciones.maxAge === 0 ? 0 : Math.min(opciones.maxAge ?? OCHO_HORAS, OCHO_HORAS);
  return { ...opciones, ...opcionesCookie({ produccion }), maxAge };
}

function crearClientes({ url, llavePublicable, llaveSecreta }, { produccion = false } = {}) {
  let admin = null;

  return {
    /**
     * Cliente de cada visita: llave publicable + la sesión de la persona (en cookies).
     * La base aplica sus reglas (RLS) como si fuera esa persona.
     */
    porPeticion(req, res) {
      return createServerClient(url, llavePublicable, {
        // Con HTTPS, las cookies de la sesión también llevan el prefijo __Host- (PYA tanda 3):
        // otro subdominio no puede plantar una sesión falsa.
        ...(produccion ? { cookieOptions: { name: '__Host-sb-entrevistas' } } : {}),
        cookies: {
          getAll: () => parseCookieHeader(req.headers.cookie ?? ''),
          setAll(cookies, cabeceras) {
            for (const { name, value, options } of cookies) {
              res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, ajustarOpcionesCookie(options, { produccion })));
            }
            for (const [clave, valor] of Object.entries(cabeceras ?? {})) res.setHeader(clave, valor);
          },
        },
      });
    },

    /** Cliente de administración: llave secreta, se salta RLS. Solo para HU-02 y nunca para contraseñas. */
    admin() {
      admin ??= createClient(url, llaveSecreta, { auth: SIN_GUARDAR_SESION });
      return admin;
    },

    /**
     * Cliente de un solo uso para comprobar una contraseña. Usar el cliente compartido
     * lo "ensucia": desde ahí manda el token de esa persona y RLS devuelve 0 filas
     * (trampa de Supabase ya comprobada). Después de usarlo: signOut({ scope: 'local' }).
     */
    desechable() {
      return createClient(url, llavePublicable, { auth: SIN_GUARDAR_SESION });
    },
  };
}

module.exports = { crearClientes, opcionesCookie, ajustarOpcionesCookie, OCHO_HORAS };
