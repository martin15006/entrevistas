'use strict';

// Seguridad común a todas las páginas (OB-06): cabeceras, token anti-falsificación,
// cookies propias, páginas sin caché y respuestas de error sin pistas.

const { parseCookieHeader, serializeCookieHeader } = require('@supabase/ssr');
const { crearToken, leerToken, tokenValido } = require('../lib/csrf');
const { MENSAJES } = require('../lib/mensajes');

const COOKIE_CSRF = 'entrevistas_csrf';
const METODOS_QUE_CAMBIAN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cabeceras que le dicen al navegador qué puede hacer la página. La más importante es la
 * CSP: solo se ejecuta JavaScript y CSS de nuestros propios archivos, nunca código metido
 * dentro de la página. Por eso las vistas no llevan <script> ni style="" en línea (CL-05).
 */
function cabecerasSeguras({ produccion }) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const cabeceras = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  // Con HTTPS, el navegador recuerda que este sitio solo se abre cifrado.
  if (produccion) cabeceras['Strict-Transport-Security'] = 'max-age=31536000';
  return cabeceras;
}

function ponerCabeceras(opciones) {
  const cabeceras = cabecerasSeguras(opciones);
  return (req, res, next) => {
    res.set(cabeceras);
    next();
  };
}

/** Las páginas con datos de pacientes no se guardan en el navegador (HU-01.5). */
function sinCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

// --- Cookies propias ---

/**
 * Con HTTPS, el prefijo __Host- obliga al navegador a aceptar la cookie solo si es Secure,
 * de este mismo sitio y para todo el sitio: otro subdominio no puede plantar una falsa.
 */
function nombreSeguro(nombre, produccion) {
  return produccion ? `__Host-${nombre}` : nombre;
}

function opcionesPropias(produccion) {
  return { httpOnly: true, sameSite: 'lax', secure: produccion, path: '/' };
}

function leerCookie(req, nombre) {
  return parseCookieHeader(req.headers.cookie ?? '').find((cookie) => cookie.name === nombre)?.value;
}

function ponerCookie(res, nombre, valor, { produccion }) {
  res.appendHeader('Set-Cookie', serializeCookieHeader(nombre, valor, opcionesPropias(produccion)));
}

function borrarCookie(res, nombre, { produccion }) {
  res.appendHeader('Set-Cookie', serializeCookieHeader(nombre, '', { ...opcionesPropias(produccion), maxAge: 0 }));
}

// --- Respuestas de error ---

/** Las pantallas que guardan con fetch (verde/rojo, la entrevista) piden JSON. */
function quiereJson(req) {
  return (req.get('accept') ?? '').includes('application/json');
}

/** Responde un error con un mensaje para la persona, como página o como JSON. */
function responderError(req, res, estado, mensaje) {
  res.status(estado);
  res.set('Cache-Control', 'no-store'); // la página de aviso también lleva el token (PYA tanda 2)
  if (quiereJson(req)) return res.json({ error: mensaje });
  return res.render('error', {
    titulo: 'Aviso',
    mensaje,
    cuenta: res.locals.cuenta ?? null,
    csrf: res.locals.csrf ?? '',
  });
}

// --- Token anti-falsificación (RNF-06) ---

/** Crea un token nuevo, lo guarda en su cookie firmada y lo deja listo para la página. */
function ponerToken(res, { claveFirma, produccion }) {
  const nuevo = crearToken(claveFirma);
  ponerCookie(res, nombreSeguro(COOKIE_CSRF, produccion), nuevo.cookie, { produccion });
  res.locals.csrf = nuevo.valor;
  return nuevo.valor;
}

/**
 * Cambia el token al entrar y al salir (PYA tanda 2): un token que alguien haya dejado
 * plantado antes del login deja de servir.
 */
function renovarToken(res, opciones) {
  return ponerToken(res, opciones);
}

/**
 * Cada visita recibe una cookie firmada y la página recibe el mismo valor (res.locals.csrf).
 * Lo que cambia datos debe traer ese valor en el campo _csrf del formulario o en la
 * cabecera X-CSRF-Token (para fetch).
 */
function protegerFormularios({ claveFirma, produccion }) {
  const nombreCookie = nombreSeguro(COOKIE_CSRF, produccion);
  return (req, res, next) => {
    const cookie = leerCookie(req, nombreCookie);
    const valor = leerToken(cookie, claveFirma);
    if (valor) res.locals.csrf = valor;
    else ponerToken(res, { claveFirma, produccion });

    if (METODOS_QUE_CAMBIAN.has(req.method)) {
      const enviado = req.get('x-csrf-token') ?? req.body?._csrf;
      if (!tokenValido(enviado, cookie, claveFirma)) {
        return responderError(req, res, 403, MENSAJES.formularioVencido);
      }
    }
    return next();
  };
}

module.exports = {
  cabecerasSeguras,
  ponerCabeceras,
  sinCache,
  protegerFormularios,
  renovarToken,
  responderError,
  quiereJson,
  nombreSeguro,
  leerCookie,
  ponerCookie,
  borrarCookie,
  COOKIE_CSRF,
};
