'use strict';

// Revisa la base de datos después de pegar los SQL de database/ en Supabase:
// 1. que las 5 tablas existan (con la llave secreta, que puede ver todo);
// 2. que un visitante SIN sesión no pueda leer ninguna (CL-03, RLS);
// 3. que la función para cerrar sesiones exista y solo la use el servidor.
// No lee ni muestra ningún dato.
//
// Uso:  npm run revisar-base

const { createClient } = require('@supabase/supabase-js');

const URL_SUPABASE = (process.env.SUPABASE_URL ?? '').trim();
const PUBLICABLE = (process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
const SECRETA = (process.env.SUPABASE_SECRET_KEY ?? '').trim();
const SIN_SESION = { auth: { autoRefreshToken: false, persistSession: false } };
const TABLAS = ['perfiles', 'censos', 'estancias', 'candidatos', 'entrevistas'];
const NADIE = '00000000-0000-0000-0000-000000000000';

let problemas = 0;
const bien = (texto) => console.log(`  ✅ ${texto}`);
const mal = (texto) => { problemas += 1; console.log(`  ❌ ${texto}`); };

async function principal() {
  if (!URL_SUPABASE || !PUBLICABLE || !SECRETA) {
    console.log('Falta algo en el .env: corre primero  npm run revisar-env');
    process.exitCode = 1;
    return;
  }
  const servidor = createClient(URL_SUPABASE, SECRETA, SIN_SESION);
  const visitante = createClient(URL_SUPABASE, PUBLICABLE, SIN_SESION);

  console.log('Revisión de la base de datos de Entrevistas (no se lee ningún dato)');

  console.log('\n1. Las tablas existen');
  for (const tabla of TABLAS) {
    const { error, count } = await servidor.from(tabla).select('*', { count: 'exact', head: true });
    if (error) mal(`${tabla}: no la encontré (${error.code ?? error.status ?? 'sin código'}). ¿Se pegó database/global.sql (base nueva) o los archivos numerados?`);
    else bien(`${tabla} (${count} filas)`);
  }

  console.log('\n2. Un visitante sin sesión no puede leer nada');
  for (const tabla of TABLAS) {
    const { data, error } = await visitante.from(tabla).select('*').limit(1);
    if (error) bien(`${tabla}: le niega el acceso (${error.code ?? error.status})`);
    else if (Array.isArray(data) && data.length === 0) bien(`${tabla}: no le devuelve nada`);
    else mal(`${tabla}: ¡un visitante sin sesión pudo leer datos! Revisa el RLS.`);
  }
  const { error: errorFuncion } = await visitante.rpc('es_cuenta_activa');
  if (errorFuncion) bien(`es_cuenta_activa: el visitante no la puede usar (${errorFuncion.code ?? errorFuncion.status})`);
  else mal('es_cuenta_activa: un visitante sin sesión la pudo usar.');

  console.log('\n3. Cerrar sesiones: solo el servidor');
  const { error: errorServidor } = await servidor.rpc('cerrar_sesiones', { p_usuario: NADIE });
  if (errorServidor) mal(`cerrar_sesiones: el servidor no la pudo usar (${errorServidor.code ?? errorServidor.status}).`);
  else bien('cerrar_sesiones: el servidor la puede usar');
  const { error: errorVisitante } = await visitante.rpc('cerrar_sesiones', { p_usuario: NADIE });
  if (errorVisitante) bien(`cerrar_sesiones: el visitante no la puede usar (${errorVisitante.code ?? errorVisitante.status})`);
  else mal('cerrar_sesiones: ¡un visitante sin sesión la pudo usar!');

  console.log('\n4. Guardar el censo: solo cuentas activas');
  // Una fecha lejana y ninguna fila: aunque algo fallara, no se guardaría nada de verdad.
  const vacio = { p_fecha: '2099-12-31', p_filas: [] };
  const { error: errorCensoServidor } = await servidor.rpc('guardar_censo', vacio);
  if (errorCensoServidor?.code === 'PGRST202') mal('guardar_censo: no existe. ¿Se pegó database/05-guardar-censo.sql?');
  else if (errorCensoServidor?.code === '42501') bien('guardar_censo existe y no deja guardar sin una cuenta activa');
  else mal(`guardar_censo: respondió algo inesperado (${errorCensoServidor?.code ?? 'sin error'}).`);
  const { error: errorCensoVisitante } = await visitante.rpc('guardar_censo', vacio);
  if (errorCensoVisitante) bien(`guardar_censo: el visitante no la puede usar (${errorCensoVisitante.code ?? errorCensoVisitante.status})`);
  else mal('guardar_censo: ¡un visitante sin sesión la pudo usar!');

  console.log('\n5. Revisión, verde o rojo, entrevistas y el formulario: solo cuentas activas');
  // Un día lejano y un candidato o una entrevista que no existen: aunque algo fallara, no se
  // decidiría ni se guardaría nada de verdad.
  const llamadas = [
    ['revision_del_censo', { p_fecha: '2099-12-31' }],
    ['decidir_candidato', { p_candidato: 0, p_decision: 'entrevistar', p_desde: null }],
    ['entrevistas_del_dia', { p_fecha: '2099-12-31' }],
    ['ver_entrevista', { p_id: 0 }], // database/10 (HU-09)
    ['abrir_entrevista', { p_id: 0, p_igual: false }],
    ['soltar_entrevista', { p_id: 0, p_desde: '2000-01-01T00:00:00Z' }],
    ['soltar_mis_entrevistas', {}],
    ['guardar_entrevista', { p_id: 0, p_datos: {} }],
  ];
  for (const [funcion, argumentos] of llamadas) {
    const { error: deServidor } = await servidor.rpc(funcion, argumentos);
    if (deServidor?.code === 'PGRST202') mal(`${funcion}: no existe. ¿Se pegaron todos los SQL de database/ (ver LEEME.md)?`);
    else if (deServidor?.code === '42501') bien(`${funcion} existe y no responde sin una cuenta activa`);
    else mal(`${funcion}: respondió algo inesperado (${deServidor?.code ?? 'sin error'}).`);
    const { error: deVisitante } = await visitante.rpc(funcion, argumentos);
    if (deVisitante) bien(`${funcion}: el visitante no la puede usar (${deVisitante.code ?? deVisitante.status})`);
    else mal(`${funcion}: ¡un visitante sin sesión la pudo usar!`);
  }

  console.log(problemas === 0 ? '\nTodo bien ✅' : `\n${problemas} cosa(s) por arreglar ❌`);
  process.exitCode = problemas === 0 ? 0 : 1;
}

principal().catch(() => {
  console.log('\nNo pude conectarme a Supabase: revisa el .env y tu conexión a internet.');
  process.exitCode = 1;
});
