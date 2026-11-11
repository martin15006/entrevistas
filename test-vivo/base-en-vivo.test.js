'use strict';

// Pruebas EN VIVO contra el Supabase de desarrollo:  npm run test:vivo
// - Crean 3 cuentas @prueba.test con contraseñas al azar (nunca se muestran ni se guardan).
// - Prueban que la base frena las trampas aunque alguien le hable directo (RLS y guardias).
// - Al final borran todo lo que crearon (limpiar_pruebas() de 03-limpiar-pruebas.sql).
// Solo datos inventados (CL-01): cédulas que empiezan por 99 y censos del año 2099.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { esDesarrollo } = require('../scripts/sesion-de-prueba');

const URL_SUPABASE = (process.env.SUPABASE_URL ?? '').trim();
const PUBLICABLE = (process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
const SECRETA = (process.env.SUPABASE_SECRET_KEY ?? '').trim();
const SIN_GUARDAR = { auth: { autoRefreshToken: false, persistSession: false } };
// Estas pruebas crean y borran cuentas y datos: SOLO en la base de desarrollo (PYA tanda 4).
const HAY_ENV = Boolean(URL_SUPABASE && PUBLICABLE && SECRETA) && esDesarrollo(process.env);
const saltar = HAY_ENV ? false : 'falta el .env, o no dice ENTORNO=desarrollo (corre: npm run revisar-env)';

const admin = HAY_ENV ? createClient(URL_SUPABASE, SECRETA, SIN_GUARDAR) : null;
const sufijo = crypto.randomBytes(4).toString('hex');
const cuentas = {};
const creado = {};

const cuentasDeDesarrollo = {}; // para la prueba de que la limpieza no las toca

/**
 * Crea una cuenta con su perfil y le inicia sesión en un cliente propio. Las de las pruebas
 * automáticas empiezan por "tst-"; con prefijo "dev" imita una cuenta de desarrollo de una persona.
 */
async function crearCuenta(clave, { activo = true, prefijo = 'tst', guardarEn = cuentas } = {}) {
  const correo = `${prefijo}-${clave}-${sufijo}@prueba.test`;
  const contrasena = crypto.randomBytes(24).toString('base64url'); // al azar, no se muestra
  const { data, error } = await admin.auth.admin.createUser({ email: correo, password: contrasena, email_confirm: true });
  if (error) throw new Error(`No se creó la cuenta de prueba (${error.code ?? error.status})`);
  const { id } = data.user;
  const { error: errorPerfil } = await admin.from('perfiles').insert({ id, nombre: `TST ${clave.toUpperCase()} PRUEBA`, correo, rol: 'usuario', activo });
  if (errorPerfil) throw new Error(`No se creó el perfil de prueba (${errorPerfil.code})`);
  const cliente = createClient(URL_SUPABASE, PUBLICABLE, SIN_GUARDAR);
  const { error: errorEntrar } = await cliente.auth.signInWithPassword({ email: correo, password: contrasena });
  if (errorEntrar) throw new Error(`La cuenta de prueba no pudo entrar (${errorEntrar.code})`);
  // El correo y la contraseña quedan solo en la memoria de esta prueba (para el login de punta a punta).
  guardarEn[clave] = { id, cliente, correo, contrasena };
}

async function limpiar() {
  for (const { cliente } of Object.values(cuentas)) await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
  const { error } = await admin.rpc('limpiar_pruebas');
  if (error) throw new Error(`limpiar_pruebas falló (${error.code}). ¿Se aplicaron los SQL 03 y 04?`);
  for (const { id } of Object.values(cuentas)) await admin.auth.admin.deleteUser(id);
}

/** Borra a mano la cuenta "de desarrollo" que crea la prueba de la limpieza, y su censo. */
async function borrarCuentasDeDesarrollo() {
  for (const [clave, { id, cliente, censo }] of Object.entries(cuentasDeDesarrollo)) {
    await cliente.auth.signOut({ scope: 'local' }).catch(() => {});
    if (censo) await admin.from('censos').delete().eq('id', censo);
    await admin.auth.admin.deleteUser(id);
    delete cuentasDeDesarrollo[clave];
  }
}

before(async () => {
  if (!HAY_ENV) return;
  await admin.rpc('limpiar_pruebas'); // por si quedó algo de una corrida anterior
  await crearCuenta('ana');
  await crearCuenta('beto');
  await crearCuenta('ceci', { activo: false });
});

after(async () => {
  if (HAY_ENV && Object.keys(cuentas).length > 0) await limpiar().catch(() => {});
  if (HAY_ENV) await borrarCuentasDeDesarrollo().catch(() => {});
});

const fila = ({ data, error }) => {
  assert.equal(error, null, error && `error ${error.code}: ${error.message}`);
  return data;
};

test('CL-03 · en vivo · una cuenta activa lee; una desactivada no ve datos aunque tenga sesión', { skip: saltar }, async () => {
  fila(await cuentas.ana.cliente.from('censos').select('id').limit(1));
  const { data, error } = await cuentas.ceci.cliente.from('censos').select('id');
  assert.equal(error, null);
  assert.deepEqual(data, []);
  const propios = fila(await cuentas.ceci.cliente.from('perfiles').select('id, nombre'));
  assert.deepEqual(propios.map((p) => p.id), [cuentas.ceci.id], 'solo ve su propio perfil');
});

test('CL-02 · en vivo · los compañeros ven el nombre, no el correo', { skip: saltar }, async () => {
  const nombres = fila(await cuentas.ana.cliente.from('perfiles').select('id, nombre').eq('id', cuentas.beto.id));
  assert.equal(nombres[0].nombre, 'TST BETO PRUEBA');
  const { error } = await cuentas.ana.cliente.from('perfiles').select('correo');
  assert.equal(error?.code, '42501', 'pedir el correo debe dar "permiso negado"');
});

test('RN-08 · en vivo · el censo queda a nombre de quien lo sube, aunque diga otra cosa', { skip: saltar }, async () => {
  creado.censo = fila(await cuentas.ana.cliente.from('censos')
    .insert({ fecha: '2099-01-01', subido_por: cuentas.beto.id }).select('id, subido_por').single());
  assert.equal(creado.censo.subido_por, cuentas.ana.id);

  const cedula = `99${crypto.randomInt(10_000_000, 99_999_999)}`;
  creado.estancia = fila(await cuentas.ana.cliente.from('estancias')
    .insert({ cedula, fecha_ingreso: '2099-01-01', nombre: 'TST PACIENTE', nombre_busqueda: 'tst paciente' })
    .select('id').single());
});

test('RN-08 · en vivo · un candidato nace sin decidir; la decisión va a nombre de quien decide', { skip: saltar }, async () => {
  const nuevo = fila(await cuentas.ana.cliente.from('candidatos').insert({
    censo_id: creado.censo.id, estancia_id: creado.estancia.id, piso: 'Observacion', cama: '1 (Hombre)', dias: 0, orden: 4,
    decision: 'entrevistar', decidido_por: cuentas.beto.id, decidido_en: '2000-01-01T00:00:00Z',
  }).select('id, decision, decidido_por').single());
  assert.equal(nuevo.decision, null);
  assert.equal(nuevo.decidido_por, null);

  const decidido = fila(await cuentas.ana.cliente.from('candidatos')
    .update({ decision: 'entrevistar', decidido_por: cuentas.beto.id, piso: 'UCI' })
    .eq('id', nuevo.id).select('decision, decidido_por, piso').single());
  assert.equal(decidido.decision, 'entrevistar');
  assert.equal(decidido.decidido_por, cuentas.ana.id, 'no puede decidir a nombre de otro');
  assert.equal(decidido.piso, 'Observacion', 'lo que vino del censo no se cambia');
  creado.candidato = nuevo;
});

test('RN-05 · RN-08 · en vivo · una entrevista nace pendiente y a nombre de quien la crea', { skip: saltar }, async () => {
  const nueva = fila(await cuentas.ana.cliente.from('entrevistas').insert({
    estancia_id: creado.estancia.id, candidato_id: creado.candidato.id,
    estado: 'entrevistado', creado_por: cuentas.beto.id, entrevistado_por: cuentas.beto.id,
  }).select('id, estado, creado_por, entrevistado_por, version').single());
  assert.equal(nueva.estado, 'pendiente');
  assert.equal(nueva.creado_por, cuentas.ana.id);
  assert.equal(nueva.entrevistado_por, null);
  assert.equal(nueva.version, 1);
  creado.entrevista = nueva;
});

test('RN-10 · en vivo · no se puede marcar "entrevistado" sin los 5 datos obligatorios', { skip: saltar }, async () => {
  const { error } = await cuentas.beto.cliente.from('entrevistas')
    .update({ estado: 'entrevistado', edad: 30, fecha_accidente: '2099-01-01', lugar: 'TST lugar', tipo_declaracion: 'C/M' })
    .eq('id', creado.entrevista.id);
  assert.equal(error?.code, '23514', 'falta el relato: la base debe rechazarlo');
});

test('RN-08 · CB-17 · en vivo · "hecha por" la pone la base, y cada cambio sube la versión', { skip: saltar }, async () => {
  const hecha = fila(await cuentas.beto.cliente.from('entrevistas').update({
    estado: 'entrevistado', edad: 30, fecha_accidente: '2099-01-01', lugar: 'TST lugar',
    tipo_declaracion: 'C/M', relato: 'TST relato', entrevistado_por: cuentas.ana.id, creado_por: cuentas.beto.id,
  }).eq('id', creado.entrevista.id).select('estado, entrevistado_por, creado_por, version').single());
  assert.equal(hecha.estado, 'entrevistado');
  assert.equal(hecha.entrevistado_por, cuentas.beto.id, 'no puede firmar a nombre de otro');
  assert.equal(hecha.creado_por, cuentas.ana.id, 'quién la creó no cambia');
  assert.equal(hecha.version, 2);
});

test('HU-11 · en vivo · al corregir una entrevista hecha queda "corregida por"', { skip: saltar }, async () => {
  const corregida = fila(await cuentas.ana.cliente.from('entrevistas')
    .update({ relato: 'TST relato corregido' }).eq('id', creado.entrevista.id)
    .select('corregido_por, entrevistado_por').single());
  assert.equal(corregida.corregido_por, cuentas.ana.id);
  assert.equal(corregida.entrevistado_por, cuentas.beto.id);
});

test('RN-06 · CB-11 · en vivo · una entrevista hecha no vuelve atrás ni se borra', { skip: saltar }, async () => {
  const { error: atras } = await cuentas.ana.cliente.from('entrevistas').update({ estado: 'pendiente' }).eq('id', creado.entrevista.id);
  assert.equal(atras?.code, '23514', 'volver a pendiente debe dar error');

  // Con su sesión, la política ni la deja ver para borrar: no borra nada.
  await cuentas.ana.cliente.from('entrevistas').delete().eq('id', creado.entrevista.id);
  // Ni siquiera el servidor con la llave secreta puede borrarla: el guardia lo frena.
  const { error: servidor } = await admin.from('entrevistas').delete().eq('id', creado.entrevista.id);
  assert.equal(servidor?.code, '23514');

  const sigue = fila(await admin.from('entrevistas').select('id, estado').eq('id', creado.entrevista.id));
  assert.deepEqual(sigue, [{ id: creado.entrevista.id, estado: 'entrevistado' }]);
});

// --- HU-04 · guardar_censo (database/05). Censos de 2099 (directo a la base) o de 2000 (por la
// pantalla, que no acepta fechas futuras) y cédulas que empiezan por 99. ---

const cedulaInventada = () => `99${crypto.randomInt(10_000_000, 99_999_999)}`;
const candidatoInventado = (orden, dias = 0) => ({
  cedula: cedulaInventada(), fecha_ingreso: '2099-03-01', nombre: `TST PACIENTE ${orden}`,
  nombre_busqueda: `tst paciente ${orden}`, piso: 'Observacion', cama: `${orden} (Hombre)`, dias, orden,
});

test('HU-04.2 · CB-03 · en vivo · guardar_censo guarda en un paso y, la segunda vez, solo agrega los nuevos', { skip: saltar }, async () => {
  const primeros = [candidatoInventado(4), candidatoInventado(5, 1)];
  const primera = fila(await cuentas.beto.cliente.rpc('guardar_censo', { p_fecha: '2099-03-01', p_filas: primeros }));
  assert.equal(primera.censo_nuevo, true);
  assert.equal(primera.agregados, 2);
  assert.equal(primera.ya_estaban, 0);

  const censo = fila(await admin.from('censos').select('id, subido_por').eq('fecha', '2099-03-01').single());
  assert.equal(censo.subido_por, cuentas.beto.id, 'RN-08: "subido por" es quien lo sube');
  assert.equal(censo.id, primera.censo_id);
  const antes = fila(await admin.from('candidatos').select('id, decision, orden').eq('censo_id', censo.id).order('orden'));
  assert.deepEqual(antes.map((c) => [c.orden, c.decision]), [[4, null], [5, null]]);

  // Alguien decide sobre el primero…
  fila(await cuentas.beto.cliente.from('candidatos').update({ decision: 'no_entrevistar' }).eq('id', antes[0].id).select('id').single());

  // …y se vuelve a subir el censo del mismo día, con un paciente más.
  const segunda = fila(await cuentas.beto.cliente.rpc('guardar_censo', {
    p_fecha: '2099-03-01', p_filas: [...primeros, candidatoInventado(6)],
  }));
  assert.equal(segunda.censo_nuevo, false);
  assert.equal(segunda.censo_id, censo.id, 'sigue siendo el mismo censo');
  assert.equal(segunda.agregados, 1);
  assert.equal(segunda.ya_estaban, 2);

  const despues = fila(await admin.from('candidatos').select('orden, decision').eq('censo_id', censo.id).order('orden'));
  assert.deepEqual(despues.map((c) => [c.orden, c.decision]), [[4, 'no_entrevistar'], [5, null], [6, null]], 'lo que ya se revisó se conserva');

  // RNF-04 · CL-02: la estancia guarda solo cédula, fecha de ingreso y nombre (y el nombre para buscar).
  const estancia = fila(await admin.from('estancias').select('*').eq('cedula', primeros[0].cedula).single());
  assert.deepEqual(Object.keys(estancia).sort(), ['cedula', 'fecha_ingreso', 'id', 'nombre', 'nombre_busqueda']);
});

test('CL-03 · en vivo · guardar_censo: ni una cuenta desactivada ni un visitante pueden guardar', { skip: saltar }, async () => {
  const filas = [candidatoInventado(7)];
  const { error: desactivada } = await cuentas.ceci.cliente.rpc('guardar_censo', { p_fecha: '2099-03-03', p_filas: filas });
  assert.equal(desactivada?.code, '42501');
  const visitante = createClient(URL_SUPABASE, PUBLICABLE, SIN_GUARDAR);
  const { error: sinSesion } = await visitante.rpc('guardar_censo', { p_fecha: '2099-03-03', p_filas: filas });
  assert.ok(sinSesion, 'un visitante sin sesión no la puede usar');
  const { count } = await admin.from('censos').select('*', { count: 'exact', head: true }).eq('fecha', '2099-03-03');
  assert.equal(count, 0, 'no se guardó nada');
});

test('CL-03 · en vivo · al cerrar las sesiones de alguien, sale al instante (no una hora después)', { skip: saltar }, async () => {
  fila(await admin.rpc('cerrar_sesiones', { p_usuario: cuentas.ana.id }));
  // Su token todavía no ha vencido, pero la base ya no la reconoce como cuenta activa.
  const { data, error } = await cuentas.ana.cliente.from('censos').select('id');
  assert.equal(error, null);
  assert.deepEqual(data, []);
});

test('HU-01 · en vivo · el login completo funciona con el servidor y el Supabase de verdad', { skip: saltar }, async () => {
  const { crearApp } = require('../app');
  const { leerConfiguracion } = require('../lib/configuracion');
  const { conServidor } = require('../test/ayudantes/servidor');
  const { crearNavegador } = require('../test/ayudantes/supabase-falso');
  await crearCuenta('dana');
  const app = crearApp(leerConfiguracion()); // la app real, con los clientes reales de Supabase

  await conServidor(app, async (base) => {
    // HU-01.2: entra y llega a Entrevistas, con su nombre y sin el menú de administrador.
    const nav = crearNavegador(base);
    await nav.get('/login');
    const entrar = await nav.post('/login', { correo: cuentas.dana.correo, contrasena: cuentas.dana.contrasena });
    assert.equal(entrar.ubicacion, '/entrevistas');
    const cookiesDeSupabase = entrar.cabeceras.getSetCookie().filter((c) => c.startsWith('sb-'));
    assert.ok(cookiesDeSupabase.length > 0, 'Supabase guardó la sesión en cookies');
    for (const cookie of cookiesDeSupabase) {
      assert.match(cookie, /HttpOnly/i, 'RNF-06: el JavaScript de la página no la puede leer');
      assert.match(cookie, /Max-Age=28800/i, 'RNF-07: dura como máximo 8 horas');
    }
    const pagina = await nav.get('/entrevistas');
    assert.equal(pagina.estado, 200);
    assert.ok(pagina.texto.includes('Hola, TST DANA PRUEBA.'));
    assert.ok(!pagina.texto.includes('href="/usuarios"'), 'HU-02.11: el usuario normal no ve Usuarios');

    // HU-01.5: sale y ya no puede volver a entrar sin iniciar sesión.
    assert.equal((await nav.post('/salir')).ubicacion, '/login');
    assert.equal((await nav.get('/entrevistas')).ubicacion, '/login');

    // HU-01.3 y HU-01.4 con el Supabase de verdad.
    const otro = crearNavegador(base);
    await otro.get('/login');
    const mala = await otro.post('/login', { correo: cuentas.dana.correo, contrasena: 'no-es-la-clave' });
    assert.equal(mala.estado, 401);
    assert.ok(mala.texto.includes('Correo o contraseña incorrectos.'));
    const desactivada = await otro.post('/login', { correo: cuentas.ceci.correo, contrasena: cuentas.ceci.contrasena });
    assert.equal(desactivada.estado, 403);
    assert.ok(desactivada.texto.includes('Tu cuenta está desactivada. Habla con el administrador.'));
  });
});

test('HU-04 · en vivo · subir el censo como lo hace la pantalla: resumen, guardar, revisión y otra vez', { skip: saltar }, async () => {
  const { crearApp } = require('../app');
  const { leerConfiguracion } = require('../lib/configuracion');
  const { conServidor } = require('../test/ayudantes/servidor');
  const { crearNavegador } = require('../test/ayudantes/supabase-falso');
  const { inventarFilas, escribirCenso } = require('../scripts/censo-de-prueba');
  const { leerCenso } = require('../lib/censo');
  const { esCandidato } = require('../lib/reglas');
  if (!cuentas.dana) await crearCuenta('dana');

  const archivo = await escribirCenso(inventarFilas({ cantidad: 40, fecha: '2000-03-02', semilla: 9 }), { fecha: '2000-03-02' });
  const candidatos = (await leerCenso(archivo)).filas.filter(esCandidato);
  assert.ok(candidatos.length > 0);

  await conServidor(crearApp(leerConfiguracion()), async (base) => {
    const nav = crearNavegador(base);
    await nav.get('/login');
    await nav.post('/login', { correo: cuentas.dana.correo, contrasena: cuentas.dana.contrasena });
    assert.equal((await nav.get('/censo')).estado, 200);

    // HU-04.1: el resumen, sin guardar nada.
    const resumen = JSON.parse((await nav.subir('/censo/leer', archivo)).texto);
    assert.equal(resumen.linea, `Censo del 02/03/2000 · 40 pacientes · ${candidatos.length} para revisar`);
    assert.deepEqual(resumen.avisos, []);
    const { count: antes } = await admin.from('censos').select('*', { count: 'exact', head: true }).eq('fecha', '2000-03-02');
    assert.equal(antes, 0, 'leer no guarda nada');

    // HU-04.2: confirmar guarda y lleva a la revisión de ese día.
    const guardado = JSON.parse((await nav.subir('/censo/guardar', archivo)).texto);
    assert.equal(guardado.redirigir, '/revision?dia=2000-03-02');
    assert.equal(guardado.agregados, candidatos.length);
    const censo = fila(await admin.from('censos').select('id, subido_por').eq('fecha', '2000-03-02').single());
    assert.equal(censo.subido_por, cuentas.dana.id);
    const { count: guardados } = await admin.from('candidatos').select('*', { count: 'exact', head: true }).eq('censo_id', censo.id);
    assert.equal(guardados, candidatos.length, 'RN-01: solo los de día 0 o 1, sin Quirófano');
    const revision = await nav.get(guardado.redirigir);
    assert.ok(revision.texto.includes('Revisión del censo del 02/03/2000'));

    // HU-04.7 · CB-03: otra vez el mismo censo → aviso, y no se duplica nada.
    const otraVez = JSON.parse((await nav.subir('/censo/leer', archivo)).texto);
    assert.deepEqual(otraVez.avisos, ['Ya hay un censo del 02/03/2000. Se agregarán solo los pacientes nuevos; lo que ya se revisó se conserva.']);
    assert.equal(JSON.parse((await nav.subir('/censo/guardar', archivo)).texto).agregados, 0);
    const { count: igual } = await admin.from('candidatos').select('*', { count: 'exact', head: true }).eq('censo_id', censo.id);
    assert.equal(igual, candidatos.length);
  });
});

test('base · en vivo · la limpieza borra lo de las pruebas automáticas y NO toca las cuentas de desarrollo', { skip: saltar }, async () => {
  // Una cuenta "de desarrollo" (como martin@prueba.test, sin "tst-") con un censo suyo.
  await crearCuenta('dev', { prefijo: 'dev', guardarEn: cuentasDeDesarrollo });
  const censoDev = fila(await cuentasDeDesarrollo.dev.cliente.from('censos').insert({ fecha: '2099-02-01' }).select('id').single());
  cuentasDeDesarrollo.dev.censo = censoDev.id;

  await limpiar();

  // Exactamente lo que crearon las pruebas automáticas ya no existe…
  for (const [tabla, registro] of [['entrevistas', creado.entrevista], ['candidatos', creado.candidato],
    ['censos', creado.censo], ['estancias', creado.estancia]]) {
    const { count } = await admin.from(tabla).select('*', { count: 'exact', head: true }).eq('id', registro.id);
    assert.equal(count, 0, `${tabla}: lo de la prueba debe haberse borrado`);
  }
  const { count: cuentasTst } = await admin.from('perfiles').select('*', { count: 'exact', head: true }).like('correo', 'tst-%@prueba.test');
  assert.equal(cuentasTst, 0, 'no quedan cuentas tst-');
  for (const fecha of ['2099-03-01', '2000-03-02']) { // los censos de las pruebas de HU-04
    const { count } = await admin.from('censos').select('*', { count: 'exact', head: true }).eq('fecha', fecha);
    assert.equal(count, 0, `el censo de prueba del ${fecha} se borró`);
  }
  for (const clave of Object.keys(cuentas)) delete cuentas[clave]; // ya no hay nada que limpiar en after()

  // …pero la cuenta de desarrollo y su censo siguen ahí.
  const { count: censoQueda } = await admin.from('censos').select('*', { count: 'exact', head: true }).eq('id', censoDev.id);
  assert.equal(censoQueda, 1, 'el censo de la cuenta de desarrollo no se toca');
  const { count: perfilQueda } = await admin.from('perfiles').select('*', { count: 'exact', head: true }).eq('id', cuentasDeDesarrollo.dev.id);
  assert.equal(perfilQueda, 1, 'la cuenta de desarrollo no se toca');
  await borrarCuentasDeDesarrollo();
});
