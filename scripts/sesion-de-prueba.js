'use strict';

// Deja una SESIÓN de prueba lista para cargarla en la ventana del navegador (navegador-visible),
// sin que nadie escriba una contraseña en la pantalla (regla de Martín).
//
// Uso (con el servidor encendido):
//   node --env-file=.env scripts/sesion-de-prueba.js <admin|usuario> <archivo-de-sesion.json> [http://localhost:3000]
//
// - Las cuentas son de Claude, para probar: claude-admin@prueba.test y claude-usuario@prueba.test.
//   Si no existen, se crean (perfil activo, con su rol).
// - Sus contraseñas son al azar y viven SOLO en .env.pruebas (que git ignora). Nunca se muestran.
// - Se entra con el login de verdad de la app (POST /login) y las cookies que devuelve se
//   guardan en el archivo de sesión, en el formato que carga agent-browser (state load).
//   Ese archivo tiene la sesión: va en la carpeta temporal y se borra al terminar la prueba.
// - No usan el prefijo "tst-": las pruebas automáticas no las borran. Se borran en la limpieza
//   final de la base (OB-48).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const ARCHIVO_CLAVES = path.join(__dirname, '..', '.env.pruebas');
const CUENTAS = {
  admin: { correo: 'claude-admin@prueba.test', nombre: 'CLAUDE ADMIN PRUEBA', rol: 'administrador', variable: 'CLAUDE_ADMIN_CONTRASENA' },
  usuario: { correo: 'claude-usuario@prueba.test', nombre: 'CLAUDE USUARIO PRUEBA', rol: 'usuario', variable: 'CLAUDE_USUARIO_CONTRASENA' },
};

/** ¿El .env dice que esta es la base de DESARROLLO? (y no es producción) */
function esDesarrollo(env) {
  return String(env.ENTORNO ?? '').trim() === 'desarrollo' && String(env.NODE_ENV ?? '').trim() !== 'production';
}

/** Lee .env.pruebas como { NOMBRE: valor }. */
function leerClaves(archivo = ARCHIVO_CLAVES) {
  if (!fs.existsSync(archivo)) return {};
  const claves = {};
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const igual = linea.indexOf('=');
    if (igual > 0 && !linea.startsWith('#')) claves[linea.slice(0, igual).trim()] = linea.slice(igual + 1).trim();
  }
  return claves;
}

function guardarClaves(claves, archivo = ARCHIVO_CLAVES) {
  const texto = [
    '# Contraseñas de las cuentas de prueba de Claude (scripts/sesion-de-prueba.js).',
    '# Se generan al azar. Este archivo NO se sube a GitHub (.gitignore: .env.*) y no se comparte.',
    ...Object.entries(claves).map(([nombre, valor]) => `${nombre}=${valor}`),
    '',
  ].join('\n');
  fs.writeFileSync(archivo, texto, { mode: 0o600 });
}

/** Busca la cuenta por correo en Supabase Auth (son pocas cuentas: alcanza con una página). */
async function buscarUsuario(admin, correo) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`No pude leer las cuentas (${error.code ?? error.status})`);
  return data.users.find((u) => u.email === correo) ?? null;
}

/** ¿Esta contraseña abre esta cuenta? (con un cliente de un solo uso, que después se cierra) */
async function contrasenaFunciona(correo, contrasena) {
  const desechable = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await desechable.auth.signInWithPassword({ email: correo, password: contrasena });
  if (!error) await desechable.auth.signOut({ scope: 'local' });
  return !error;
}

/**
 * Deja la cuenta lista: existe, es LA QUE CREÓ este script, su contraseña es la de .env.pruebas
 * y su perfil está activo con su rol.
 * PYA tanda 4: el script nunca le da el rol a una cuenta que no puede demostrar que es suya.
 * La prueba es el id guardado en .env.pruebas, o entrar con la contraseña al azar que el script
 * generó (alguien que hubiera creado antes una cuenta con ese correo no la conoce).
 */
async function prepararCuenta(admin, cuenta, { archivoClaves = ARCHIVO_CLAVES } = {}) {
  const claves = leerClaves(archivoClaves);
  const variableId = cuenta.variable.replace('_CONTRASENA', '_ID');
  let contrasena = claves[cuenta.variable];
  let usuario = await buscarUsuario(admin, cuenta.correo);

  if (!usuario) {
    contrasena = crypto.randomBytes(24).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email: cuenta.correo, password: contrasena, email_confirm: true });
    if (error) throw new Error(`No se creó la cuenta (${error.code ?? error.status})`);
    usuario = data.user;
  } else if (claves[variableId]) {
    if (claves[variableId] !== usuario.id) {
      throw new Error(`La cuenta ${cuenta.correo} no es la que creó este script: no la toco. Revísala en Supabase.`);
    }
    if (!contrasena) {
      // Es nuestra (por su id) pero se perdió su contraseña: se le pone una nueva.
      contrasena = crypto.randomBytes(24).toString('base64url');
      const { error } = await admin.auth.admin.updateUserById(usuario.id, { password: contrasena });
      if (error) throw new Error(`No se pudo renovar la contraseña (${error.code ?? error.status})`);
    }
  } else if (!contrasena || !(await contrasenaFunciona(cuenta.correo, contrasena))) {
    throw new Error(`Ya existe una cuenta ${cuenta.correo} que este script no puede reconocer como suya: no la toco. Revísala en Supabase.`);
  }
  guardarClaves({ ...claves, [cuenta.variable]: contrasena, [variableId]: usuario.id }, archivoClaves);

  const { error: errorPerfil } = await admin.from('perfiles').upsert(
    { id: usuario.id, nombre: cuenta.nombre, correo: cuenta.correo, rol: cuenta.rol, activo: true },
    { onConflict: 'id' },
  );
  if (errorPerfil) throw new Error(`No se pudo preparar el perfil (${errorPerfil.code})`);
  return contrasena;
}

/** Las líneas Set-Cookie de una respuesta, en el formato de sesión de agent-browser (Playwright). */
function cookiesParaElNavegador(lineas, { dominio, ahoraSegundos = Math.floor(Date.now() / 1000) }) {
  const cookies = new Map();
  for (const linea of lineas) {
    const [par, ...atributos] = linea.split(';').map((parte) => parte.trim());
    const igual = par.indexOf('=');
    const nombre = par.slice(0, igual);
    const valor = par.slice(igual + 1);
    const atributo = (clave) => atributos.find((a) => a.toLowerCase().startsWith(`${clave}=`))?.split('=')[1];
    const maxAge = atributo('max-age');
    if (valor === '' || maxAge === '0') {
      cookies.delete(nombre); // la app la borró
      continue;
    }
    cookies.set(nombre, {
      name: nombre,
      value: valor,
      domain: dominio,
      path: atributo('path') ?? '/',
      expires: maxAge ? ahoraSegundos + Number(maxAge) : -1,
      httpOnly: atributos.some((a) => a.toLowerCase() === 'httponly'),
      secure: atributos.some((a) => a.toLowerCase() === 'secure'),
      sameSite: 'Lax',
    });
  }
  return [...cookies.values()];
}

/** Entra con el login de verdad y devuelve las cookies de la sesión. */
async function entrar(base, correo, contrasena) {
  const tarro = new Map(); // nombre → "nombre=valor", lo que el navegador mandaría
  const todas = [];
  const recordar = (respuesta) => {
    for (const linea of respuesta.headers.getSetCookie()) {
      todas.push(linea);
      const par = linea.split(';')[0];
      tarro.set(par.slice(0, par.indexOf('=')), par);
    }
  };
  const pagina = await fetch(`${base}/login`, { redirect: 'manual' });
  recordar(pagina);
  const token = /data-csrf="([^"]+)"/.exec(await pagina.text())?.[1];
  if (!token) throw new Error('No encontré el token anti-falsificación en /login. ¿Está encendido el servidor?');

  const respuesta = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: [...tarro.values()].join('; ') },
    body: new URLSearchParams({ _csrf: token, correo, contrasena }),
  });
  recordar(respuesta);
  if (respuesta.status !== 303 || respuesta.headers.get('location') !== '/entrevistas') {
    throw new Error(`El login no dejó entrar (respondió ${respuesta.status}).`);
  }
  return todas;
}

async function principal() {
  const [rol, archivoSalida, base = 'http://localhost:3000'] = process.argv.slice(2);
  const cuenta = CUENTAS[rol];
  if (!cuenta || !archivoSalida) {
    console.log('Uso: node --env-file=.env scripts/sesion-de-prueba.js <admin|usuario> <archivo.json> [http://localhost:3000]');
    process.exitCode = 1;
    return;
  }
  const destino = new URL(base);
  if (!['localhost', '127.0.0.1'].includes(destino.hostname)) {
    throw new Error('Solo para el servidor de desarrollo de este PC (localhost).');
  }
  // Solo en la base de desarrollo (PYA tanda 4): nunca crear cuentas de prueba en la de la clínica.
  if (!esDesarrollo(process.env)) {
    throw new Error('Solo con ENTORNO=desarrollo en el .env (nunca en la base de la clínica).');
  }
  // Con el registro abierto, alguien podría haber creado antes una cuenta con este correo.
  const ajustes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
  }).then((r) => r.json()).catch(() => ({}));
  if (ajustes.disable_signup !== true) {
    throw new Error('El registro de cuentas nuevas está encendido en Supabase (o no pude comprobarlo): apágalo antes.');
  }
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const contrasena = await prepararCuenta(admin, cuenta);
  const lineas = await entrar(base, cuenta.correo, contrasena);
  const cookies = cookiesParaElNavegador(lineas, { dominio: destino.hostname });
  fs.writeFileSync(archivoSalida, JSON.stringify({ cookies, origins: [] }), { mode: 0o600 });
  console.log(`Sesión de ${cuenta.nombre} lista en ${archivoSalida} (${cookies.length} cookies; no se muestran).`);
}

if (require.main === module) {
  principal().catch((error) => {
    console.error(`No se pudo preparar la sesión: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { cookiesParaElNavegador, CUENTAS, esDesarrollo, prepararCuenta };
