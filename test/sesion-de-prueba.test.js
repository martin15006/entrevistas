'use strict';

// scripts/sesion-de-prueba.js: pasar las cookies del login al formato de agent-browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { cookiesParaElNavegador, CUENTAS, esDesarrollo, prepararCuenta } = require('../scripts/sesion-de-prueba');

/** Un Supabase de administración de mentira donde ya existe una cuenta con el correo dado. */
function adminConCuentaExistente(correo, id) {
  const registro = { cambiosDeContrasena: 0, perfiles: 0 };
  return {
    registro,
    cliente: {
      auth: {
        admin: {
          listUsers: async () => ({ data: { users: [{ id, email: correo }] }, error: null }),
          createUser: async () => { throw new Error('no debería crear'); },
          updateUserById: async () => { registro.cambiosDeContrasena += 1; return { error: null }; },
        },
      },
      from: () => ({ upsert: async () => { registro.perfiles += 1; return { error: null }; } }),
    },
  };
}

/** Un archivo de claves temporal (nunca el .env.pruebas de verdad). */
function archivoTemporal(t, contenido) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'entrevistas-claves-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const archivo = path.join(carpeta, '.env.pruebas');
  if (contenido) fs.writeFileSync(archivo, contenido);
  return archivo;
}

test('base · PYA tanda 4 · una cuenta que ya existía y el script no creó no se toca (ni contraseña ni rol)', async (t) => {
  const { cliente, registro } = adminConCuentaExistente(CUENTAS.admin.correo, 'id-de-otra-persona');
  const archivoClaves = archivoTemporal(t); // sin id ni contraseña guardados
  await assert.rejects(prepararCuenta(cliente, CUENTAS.admin, { archivoClaves }), /no puede reconocer como suya/);
  assert.deepEqual(registro, { cambiosDeContrasena: 0, perfiles: 0 });
});

test('base · PYA tanda 4 · si el id guardado no coincide, tampoco se toca', async (t) => {
  const { cliente, registro } = adminConCuentaExistente(CUENTAS.admin.correo, 'id-de-otra-persona');
  const archivoClaves = archivoTemporal(t, 'CLAUDE_ADMIN_ID=id-nuestro\nCLAUDE_ADMIN_CONTRASENA=clave-de-prueba\n');
  await assert.rejects(prepararCuenta(cliente, CUENTAS.admin, { archivoClaves }), /no es la que creó este script/);
  assert.deepEqual(registro, { cambiosDeContrasena: 0, perfiles: 0 });
});

test('base · si el id guardado coincide pero se perdió la contraseña, se renueva y se guarda', async (t) => {
  const { cliente, registro } = adminConCuentaExistente(CUENTAS.admin.correo, 'id-nuestro');
  const archivoClaves = archivoTemporal(t, 'CLAUDE_ADMIN_ID=id-nuestro\n');
  const contrasena = await prepararCuenta(cliente, CUENTAS.admin, { archivoClaves });
  assert.equal(registro.cambiosDeContrasena, 1);
  assert.equal(registro.perfiles, 1);
  assert.ok(fs.readFileSync(archivoClaves, 'utf8').includes(`CLAUDE_ADMIN_CONTRASENA=${contrasena}`));
});

test('base · las pruebas en vivo y las cuentas de prueba solo corren con ENTORNO=desarrollo (PYA tanda 4)', () => {
  assert.equal(esDesarrollo({ ENTORNO: 'desarrollo' }), true);
  assert.equal(esDesarrollo({ ENTORNO: ' desarrollo ' }), true);
  assert.equal(esDesarrollo({}), false, 'sin la línea, no');
  assert.equal(esDesarrollo({ ENTORNO: 'produccion' }), false);
  assert.equal(esDesarrollo({ ENTORNO: 'Desarrollo' }), false);
  assert.equal(esDesarrollo({ ENTORNO: 'desarrollo', NODE_ENV: 'production' }), false, 'nunca con producción');
});

test('base · las cookies del login quedan en el formato que carga el navegador', () => {
  const cookies = cookiesParaElNavegador([
    'entrevistas_csrf=uno; Path=/; HttpOnly; SameSite=Lax',
    'entrevistas_csrf=dos; Path=/; HttpOnly; SameSite=Lax', // el token se renueva al entrar: gana el último
    'sb-abc-auth-token=base64-xyz; Max-Age=28800; Path=/; HttpOnly; SameSite=Lax',
    'entrevistas_actividad=123.firma; Path=/; HttpOnly; SameSite=Lax',
    'sb-abc-auth-token-code-verifier=; Max-Age=0; Path=/', // borrada por la app: no va
  ], { dominio: 'localhost', ahoraSegundos: 1000 });

  assert.deepEqual(cookies.map((c) => c.name), ['entrevistas_csrf', 'sb-abc-auth-token', 'entrevistas_actividad']);
  assert.equal(cookies[0].value, 'dos');
  assert.deepEqual(cookies[1], {
    name: 'sb-abc-auth-token', value: 'base64-xyz', domain: 'localhost', path: '/',
    expires: 1000 + 28800, httpOnly: true, secure: false, sameSite: 'Lax',
  });
  assert.equal(cookies[2].expires, -1, 'sin Max-Age: dura lo que dure el navegador');
});

test('base · las cuentas de Claude son de prueba, no usan "tst-" y sus claves no se suben a GitHub', () => {
  for (const cuenta of Object.values(CUENTAS)) {
    assert.match(cuenta.correo, /^claude-[a-z]+@prueba\.test$/);
  }
  assert.deepEqual(Object.values(CUENTAS).map((c) => c.rol).sort(), ['administrador', 'usuario']);
  const gitignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env\.\*$/m, '.env.pruebas queda fuera de git');
});
