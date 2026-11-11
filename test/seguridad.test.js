'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearApp } = require('../app');
const { CONFIG, conServidor } = require('./ayudantes/servidor');
const { crearSupabaseFalso } = require('./ayudantes/supabase-falso');

const VENCIDO = 'El formulario venció. Recarga la página e inténtalo de nuevo.';

// Dos rutas solo para estas pruebas: una que recibe formularios y otra que falla.
function montarRutasDePrueba(app) {
  app.post('/prueba', (req, res) => res.json({ ok: true }));
  app.get('/explota', () => {
    const error = new Error('duplicate key value: Key (cedula)=(9900000001) already exists');
    error.code = '23505';
    error.details = 'Key (cedula, fecha_ingreso)=(9900000001, 2026-11-06)';
    throw error;
  });
}

const app = (config = CONFIG) => crearApp(config, { montarRutas: montarRutasDePrueba, clientes: crearSupabaseFalso([]).clientes });

/** Abre la página de inicio y devuelve la cookie del token y el token que trae la página. */
async function pedirToken(base) {
  const respuesta = await fetch(`${base}/login`);
  const html = await respuesta.text();
  const cookie = respuesta.headers.getSetCookie().find((c) => c.startsWith('entrevistas_csrf='));
  return { cookie: cookie.split(';')[0], token: /data-csrf="([^"]+)"/.exec(html)[1], cookieCompleta: cookie };
}

function enviar(base, { cookie, campos, cabeceras = {} }) {
  return fetch(`${base}/prueba`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}), ...cabeceras },
    body: new URLSearchParams(campos ?? {}),
  });
}

test('RNF-06 · un formulario sin el token anti-falsificación se rechaza con el mensaje', async () => {
  await conServidor(app(), async (base) => {
    const { cookie } = await pedirToken(base);
    const sinToken = await enviar(base, { cookie, campos: { nombre: 'x' } });
    assert.equal(sinToken.status, 403);
    assert.ok((await sinToken.text()).includes(VENCIDO));
    const sinNada = await enviar(base, {});
    assert.equal(sinNada.status, 403);
  });
});

test('RNF-06 · con el token de su propia cookie, el formulario pasa (campo _csrf o cabecera X-CSRF-Token)', async () => {
  await conServidor(app(), async (base) => {
    const { cookie, token } = await pedirToken(base);
    const porCampo = await enviar(base, { cookie, campos: { _csrf: token } });
    assert.equal(porCampo.status, 200);
    const porCabecera = await enviar(base, { cookie, cabeceras: { 'x-csrf-token': token } });
    assert.equal(porCabecera.status, 200);
  });
});

test('RNF-06 · un token de otra cookie o una cookie alterada no sirven', async () => {
  await conServidor(app(), async (base) => {
    const primera = await pedirToken(base);
    const segunda = await pedirToken(base);
    const cruzado = await enviar(base, { cookie: primera.cookie, campos: { _csrf: segunda.token } });
    assert.equal(cruzado.status, 403);

    const ultima = primera.cookie.at(-1) === 'A' ? 'B' : 'A';
    const alterada = `${primera.cookie.slice(0, -1)}${ultima}`;
    const conAlterada = await enviar(base, { cookie: alterada, campos: { _csrf: primera.token } });
    assert.equal(conAlterada.status, 403);
  });
});

test('RNF-06 · la cookie del token es HttpOnly y SameSite=Lax; Secure solo al publicar', async () => {
  await conServidor(app(), async (base) => {
    const { cookieCompleta } = await pedirToken(base);
    assert.match(cookieCompleta, /HttpOnly/i);
    assert.match(cookieCompleta, /SameSite=Lax/i);
    assert.doesNotMatch(cookieCompleta, /Secure/i);
  });
  await conServidor(app({ ...CONFIG, produccion: true }), async (base) => {
    const respuesta = await fetch(`${base}/login`);
    // Al publicar, la cookie lleva el prefijo __Host- (otro subdominio no puede plantar una falsa).
    const cookie = respuesta.headers.getSetCookie().find((c) => c.startsWith('__Host-entrevistas_csrf='));
    assert.ok(cookie, 'con HTTPS la cookie se llama __Host-entrevistas_csrf');
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /Path=\//i);
    assert.doesNotMatch(cookie, /Domain=/i);
    assert.equal(respuesta.headers.get('strict-transport-security'), 'max-age=31536000');
  });
});

test('base · cabeceras de seguridad en todas las respuestas; la CSP no deja ejecutar código en línea', async () => {
  await conServidor(app(), async (base) => {
    for (const ruta of ['/', '/css/estilos.css', '/no-existe']) {
      const respuesta = await fetch(`${base}${ruta}`);
      const csp = respuesta.headers.get('content-security-policy');
      assert.ok(csp.includes("script-src 'self'"), ruta);
      assert.ok(csp.includes("frame-ancestors 'none'"), ruta);
      assert.ok(!csp.includes('unsafe-inline'), ruta);
      assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff', ruta);
      assert.equal(respuesta.headers.get('x-powered-by'), null, ruta);
    }
  });
});

test('HU-01.5 · las páginas no se guardan en la caché del navegador', async () => {
  await conServidor(app(), async (base) => {
    const respuesta = await fetch(`${base}/login`);
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  });
});

test('base · sin sesión, una página que no existe lleva al login, sin caché (el 404 con sesión: test/acceso)', async () => {
  await conServidor(app(), async (base) => {
    const respuesta = await fetch(`${base}/no-existe`, { redirect: 'manual' });
    assert.equal(respuesta.status, 303);
    assert.equal(respuesta.headers.get('location'), '/login');
    assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  });
});

test('RNF-08 · un error inesperado muestra un mensaje general y el registro solo lleva el código', async (t) => {
  const registro = t.mock.method(console, 'error', () => {});
  await conServidor(app(), async (base) => {
    const respuesta = await fetch(`${base}/explota`);
    const html = await respuesta.text();
    assert.equal(respuesta.status, 500);
    assert.ok(html.includes('Algo salió mal. Inténtalo de nuevo en un momento.'));
    assert.ok(!html.includes('9900000001'), 'la página no muestra el detalle');
    assert.ok(!html.includes('duplicate key'), 'la página no muestra el error');
  });
  const anotado = registro.mock.calls.map((llamada) => llamada.arguments.join(' ')).join('\n');
  assert.ok(anotado.includes('23505'), 'el registro trae el código');
  assert.ok(!anotado.includes('9900000001'), 'el registro no trae la cédula');
});

test('base · si se pide JSON (fetch), el error también llega como JSON', async () => {
  await conServidor(app(), async (base) => {
    const respuesta = await enviar(base, { cabeceras: { accept: 'application/json' } });
    assert.equal(respuesta.status, 403);
    assert.deepEqual(await respuesta.json(), { error: VENCIDO });
  });
});

test('base · un formulario demasiado grande se rechaza con un mensaje general', async () => {
  await conServidor(app(), async (base) => {
    const { cookie, token } = await pedirToken(base);
    const respuesta = await enviar(base, { cookie, campos: { _csrf: token, relleno: 'x'.repeat(25 * 1024) } });
    assert.equal(respuesta.status, 400);
    assert.ok((await respuesta.text()).includes('No pudimos leer lo que enviaste.'));
  });
});
