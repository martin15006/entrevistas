'use strict';

// OB-08 · Crea el PRIMER administrador desde la terminal.
// Uso (en la carpeta del proyecto):  npm run crear-admin
//
// La contraseña la escribe la persona en la terminal: se ve como asteriscos, no se guarda
// en ningún archivo y no se muestra nunca. Las demás cuentas se crean desde la pantalla
// "Usuarios" (HU-02).

const readline = require('node:readline/promises');
const { leerConfiguracion } = require('../lib/configuracion');
const { crearClientes } = require('../lib/supabase');

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Revisa lo escrito. Devuelve el problema en palabras, o null si todo está bien. */
function revisarDatos({ nombre, correo, contrasena, repetida }) {
  if (!nombre || nombre.length > 120) return 'El nombre es obligatorio (hasta 120 caracteres).';
  if (!CORREO_VALIDO.test(correo) || correo.length > 254) return 'Escribe un correo válido.';
  if (contrasena.length < 8 || contrasena.length > 200) return 'La contraseña debe tener entre 8 y 200 caracteres.';
  if (contrasena !== repetida) return 'Las contraseñas no coinciden.';
  return null;
}

/**
 * Crea la cuenta en Supabase Auth y su perfil de administrador. Si el perfil falla, borra
 * la cuenta recién creada para no dejar nada a medias. Devuelve { ok, mensaje }.
 */
async function crearPrimerAdmin(admin, { nombre, correo, contrasena }) {
  const { count, error: errorConteo } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .eq('rol', 'administrador')
    .eq('activo', true);
  if (errorConteo) return { ok: false, mensaje: 'No pude revisar la base. Corre primero: npm run revisar-base' };
  if (count > 0) {
    return { ok: false, mensaje: 'Ya hay un administrador activo. Las demás cuentas se crean desde la pantalla "Usuarios".' };
  }

  const { data, error } = await admin.auth.admin.createUser({ email: correo, password: contrasena, email_confirm: true });
  if (error) {
    if (error.code === 'email_exists') return { ok: false, mensaje: 'Ya existe una cuenta con ese correo.' };
    return { ok: false, mensaje: `Supabase no creó la cuenta (${error.code ?? error.status ?? 'sin código'}).` };
  }

  const id = data.user.id;
  const { error: errorPerfil } = await admin
    .from('perfiles')
    .insert({ id, nombre, correo, rol: 'administrador', activo: true });
  if (errorPerfil) {
    await admin.auth.admin.deleteUser(id); // no dejar una cuenta sin perfil
    return { ok: false, mensaje: `No se pudo guardar el perfil (${errorPerfil.code ?? 'sin código'}); la cuenta se deshizo.` };
  }
  return { ok: true, mensaje: `Administrador creado: ${nombre} (${correo}).` };
}

/** Pregunta algo que se ve al escribirlo. */
async function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(texto);
  rl.close();
  return respuesta.trim();
}

/** Pregunta una contraseña: cada tecla se ve como "*" y Borrar funciona. */
function preguntarOculto(texto) {
  return new Promise((resolver, rechazar) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) {
      rechazar(new Error('Para escribir la contraseña hace falta correr esto en una terminal.'));
      return;
    }
    process.stdout.write(texto);
    let valor = '';
    const limpiar = () => {
      entrada.removeListener('data', alTeclear);
      entrada.setRawMode(false);
      entrada.pause();
    };
    function alTeclear(teclas) {
      for (const tecla of teclas) {
        if (tecla === '\r' || tecla === '\n') {
          limpiar();
          process.stdout.write('\n');
          resolver(valor);
          return;
        }
        if (tecla === '\u0003') { // Ctrl+C
          limpiar();
          process.stdout.write('\nCancelado.\n');
          process.exit(130);
        }
        if (tecla === '\u001b') return; // flechas y otras teclas especiales: se ignoran
        if (tecla === '\u0008' || tecla === '\u007f') { // Borrar
          if (valor.length > 0) {
            valor = valor.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (tecla < ' ') continue;
        valor += tecla;
        process.stdout.write('*');
      }
    }
    entrada.setRawMode(true);
    entrada.setEncoding('utf8');
    entrada.resume();
    entrada.on('data', alTeclear);
  });
}

async function principal() {
  const config = leerConfiguracion();
  const admin = crearClientes(config.supabase).admin();

  console.log('Crear el primer administrador de Entrevistas\n');
  const nombre = (await preguntar('Nombre: ')).replace(/\s+/g, ' ');
  const correo = (await preguntar('Correo: ')).toLowerCase();
  const contrasena = await preguntarOculto('Contraseña (mínimo 8): ');
  const repetida = await preguntarOculto('Repite la contraseña: ');

  const problema = revisarDatos({ nombre, correo, contrasena, repetida });
  if (problema) {
    console.log(`\n${problema} No se creó nada.`);
    process.exitCode = 1;
    return;
  }

  const resultado = await crearPrimerAdmin(admin, { nombre, correo, contrasena });
  console.log(`\n${resultado.mensaje}`);
  if (resultado.ok) console.log(`Ya puedes entrar en http://localhost:${config.puerto}/login`);
  process.exitCode = resultado.ok ? 0 : 1;
}

if (require.main === module) {
  principal().catch((error) => {
    console.error(`\nNo se pudo crear el administrador: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { revisarDatos, crearPrimerAdmin };
