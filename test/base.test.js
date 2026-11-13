'use strict';

// Pruebas de la base de la tanda 2: configuración, clientes de Supabase, registro y esquema.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { leerConfiguracion } = require('../lib/configuracion');
const { crearClientes, opcionesCookie, ajustarOpcionesCookie, OCHO_HORAS } = require('../lib/supabase');
const { registrarError } = require('../lib/registro');
const { CONFIG } = require('./ayudantes/servidor');

const RAIZ = path.join(__dirname, '..');
const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');

function archivosEn(carpeta, extensiones) {
  if (!fs.existsSync(carpeta)) return [];
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosEn(ruta, extensiones);
    return extensiones.some((ext) => entrada.name.endsWith(ext)) ? [ruta] : [];
  });
}

// --- Configuración ---

const ENV = {
  SUPABASE_URL: 'https://prueba.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'llave-publicable-de-prueba',
  SUPABASE_SECRET_KEY: 'llave-secreta-de-prueba',
  CLAVE_FIRMA: 'k'.repeat(32),
};

test('base · con el .env completo arranca con valores seguros por defecto', () => {
  const config = leerConfiguracion(ENV);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.puerto, 3000);
  assert.equal(config.produccion, false);
  assert.equal(leerConfiguracion({ ...ENV, NODE_ENV: 'production' }).produccion, true);
});

test('CL-04 · si falta algo en el .env, dice qué falta y nunca muestra los valores', () => {
  assert.throws(() => leerConfiguracion({ SUPABASE_URL: ENV.SUPABASE_URL, SUPABASE_SECRET_KEY: ENV.SUPABASE_SECRET_KEY }), (error) => {
    assert.match(error.message, /SUPABASE_PUBLISHABLE_KEY/);
    assert.match(error.message, /CLAVE_FIRMA/);
    assert.ok(!error.message.includes('llave-secreta-de-prueba'));
    assert.ok(!error.message.includes('prueba.supabase.co'));
    return true;
  });
});

test('base · CLAVE_FIRMA: 32 caracteres sirve, 31 no', () => {
  assert.doesNotThrow(() => leerConfiguracion({ ...ENV, CLAVE_FIRMA: 'k'.repeat(32) }));
  assert.throws(() => leerConfiguracion({ ...ENV, CLAVE_FIRMA: 'k'.repeat(31) }), /CLAVE_FIRMA/);
});

test('RNF-06 · el servidor no se abre a la red sin HTTPS, salvo que se marque a propósito para una prueba', () => {
  for (const host of ['127.0.0.1', 'localhost', '::1']) assert.doesNotThrow(() => leerConfiguracion({ ...ENV, HOST: host }), host);
  assert.throws(() => leerConfiguracion({ ...ENV, HOST: '0.0.0.0' }), /abre el servidor a la red sin HTTPS/);
  assert.throws(() => leerConfiguracion({ ...ENV, HOST: '192.168.1.20' }), /abre el servidor a la red sin HTTPS/);
  assert.equal(leerConfiguracion({ ...ENV, HOST: '0.0.0.0', NODE_ENV: 'production' }).host, '0.0.0.0');
  assert.equal(leerConfiguracion({ ...ENV, HOST: '0.0.0.0', ACEPTO_RED_SIN_HTTPS: 'si' }).host, '0.0.0.0');
});

test('CB-28 · detrás del hosting se puede decir cuántos proxies hay, para ver el equipo de verdad', () => {
  assert.equal(leerConfiguracion(ENV).proxies, 0);
  assert.equal(leerConfiguracion({ ...ENV, PROXIES: '1' }).proxies, 1);
  assert.equal(leerConfiguracion({ ...ENV, PROXIES: 'muchos' }).proxies, 0);
});

// --- Clientes de Supabase (RNF-05, RNF-06, CL-04) ---

test('RNF-06 · las cookies de la sesión son HttpOnly y SameSite=Lax; Secure solo al publicar', () => {
  assert.deepEqual(opcionesCookie({ produccion: false }), { httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
  assert.equal(opcionesCookie({ produccion: true }).secure, true);
});

test('RNF-07 · las cookies de Supabase duran como máximo 8 horas, y se pueden seguir borrando', () => {
  assert.equal(OCHO_HORAS, 28800);
  const cuatrocientosDias = 400 * 24 * 60 * 60;
  // Lo que pide Supabase por defecto (400 días) queda en 8 horas, con nuestras reglas encima.
  assert.deepEqual(
    ajustarOpcionesCookie({ maxAge: cuatrocientosDias, httpOnly: false, sameSite: 'none', path: '/' }, { produccion: true }),
    { maxAge: OCHO_HORAS, httpOnly: true, sameSite: 'lax', secure: true, path: '/' },
  );
  assert.equal(ajustarOpcionesCookie({ maxAge: OCHO_HORAS }, { produccion: false }).maxAge, OCHO_HORAS);
  assert.equal(ajustarOpcionesCookie({ maxAge: OCHO_HORAS + 1 }, { produccion: false }).maxAge, OCHO_HORAS);
  assert.equal(ajustarOpcionesCookie({ maxAge: 3600 }, { produccion: false }).maxAge, 3600);
  assert.equal(ajustarOpcionesCookie({}, { produccion: false }).maxAge, OCHO_HORAS);
  // maxAge 0 es como Supabase borra la cookie al cerrar sesión: no se toca.
  assert.equal(ajustarOpcionesCookie({ maxAge: 0 }, { produccion: false }).maxAge, 0);
});

test('base · el cliente de administración es uno solo; el desechable es nuevo cada vez', () => {
  const clientes = crearClientes(CONFIG.supabase);
  assert.equal(clientes.admin(), clientes.admin());
  assert.notEqual(clientes.desechable(), clientes.desechable());
});

test('RNF-05 · nada de lo que llega al navegador (public/ y views/) nombra las llaves', () => {
  const archivos = [...archivosEn(path.join(RAIZ, 'public'), ['.js', '.css', '.html']), ...archivosEn(path.join(RAIZ, 'views'), ['.ejs'])];
  assert.ok(archivos.length > 0);
  for (const ruta of archivos) {
    assert.doesNotMatch(fs.readFileSync(ruta, 'utf8'), /SUPABASE_|sb_secret|sb_publishable|llaveSecreta|llavePublicable|process\.env/, path.relative(RAIZ, ruta));
  }
});

test('CL-04 · en la aplicación, solo lib/supabase.js y lib/configuracion.js manejan las llaves', () => {
  const permitidos = new Set(['lib/supabase.js', 'lib/configuracion.js']);
  const archivos = [
    path.join(RAIZ, 'app.js'), path.join(RAIZ, 'server.js'),
    ...archivosEn(path.join(RAIZ, 'lib'), ['.js']), ...archivosEn(path.join(RAIZ, 'middleware'), ['.js']),
  ];
  for (const ruta of archivos) {
    const relativo = path.relative(RAIZ, ruta).replaceAll('\\', '/');
    if (permitidos.has(relativo)) continue;
    assert.doesNotMatch(fs.readFileSync(ruta, 'utf8'), /SUPABASE_SECRET_KEY|llaveSecreta/, relativo);
  }
});

// --- Registro (RNF-08) ---

test('RNF-08 · un error se anota solo con su código, nunca con su texto ni sus detalles', (t) => {
  const registro = t.mock.method(console, 'error', () => {});
  registrarError('guardar estancia', {
    code: '23505', status: 409,
    message: 'duplicate key value violates unique constraint',
    details: 'Key (cedula, fecha_ingreso)=(9900000001, 2026-11-06) already exists.',
  });
  registrarError('leer censo', { code: 'ANA PRUEBA 9900000002' }); // un "código" raro no se anota
  const texto = registro.mock.calls.map((llamada) => llamada.arguments.join(' ')).join('\n');
  assert.match(texto, /guardar estancia: 23505 \(409\)/);
  assert.match(texto, /leer censo: sin-codigo/);
  for (const prohibido of ['9900000001', '9900000002', 'ANA PRUEBA', 'duplicate', 'fecha_ingreso']) {
    assert.ok(!texto.includes(prohibido), `el registro no debe traer "${prohibido}"`);
  }
});

// --- Esquema de la base (lectura del archivo; la base real la revisa npm run revisar-base) ---

const SQL = leer('database', '01-esquema.sql');
const SQL_SIN_COMENTARIOS = SQL.split('\n').map((linea) => linea.replace(/--.*$/, '')).join('\n');

test('CL-03 · todas las tablas tienen RLS activo', () => {
  const tablas = [...SQL.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]).sort();
  const conRls = [...SQL.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map((m) => m[1]).sort();
  assert.deepEqual(tablas, ['candidatos', 'censos', 'entrevistas', 'estancias', 'perfiles']);
  assert.deepEqual(conRls, tablas);
});

test('CL-03 · ninguna política es para visitantes sin sesión, y a ellos se les quita todo', () => {
  const politicas = [...SQL_SIN_COMENTARIOS.matchAll(/create policy[\s\S]*?;/g)].map((m) => m[0]);
  assert.ok(politicas.length >= 10);
  for (const politica of politicas) {
    assert.match(politica, /\bto authenticated\b/);
    assert.doesNotMatch(politica, /\bto (anon|public)\b/);
  }
  assert.match(SQL, /revoke all on public\.perfiles, public\.censos, public\.estancias, public\.candidatos, public\.entrevistas from anon;/);
});

test('CL-03 · las funciones con permisos especiales fijan su search_path y no las usa un visitante', () => {
  const funciones = [...SQL_SIN_COMENTARIOS.matchAll(/create or replace function public\.(\w+)[\s\S]*?\$\$;/g)];
  assert.equal(funciones.length, 2);
  for (const [texto, nombre] of funciones) {
    assert.match(texto, /security definer/, nombre);
    assert.match(texto, /set search_path = ''/, nombre);
    assert.match(SQL, new RegExp(`revoke execute on function public\\.${nombre}\\([^)]*\\) from public, anon`), nombre);
  }
});

test('CL-02 · la base no tiene dónde guardar entidad, médicos, siniestro, consumo ni N° de admisión', () => {
  assert.doesNotMatch(SQL_SIN_COMENTARIOS.toLowerCase(), /entidad|medico|siniestro|consumo|admision/);
});

// --- 02-proteger-registros.sql (revisión PYA de la tanda 2) ---
// Estas pruebas leen el archivo. Los guardias se prueban de verdad, contra la base, con
// cuentas de prueba en la tanda del login (ver Hallazgos del pacto).

const SQL02 = leer('database', '02-proteger-registros.sql');
const SQL02_SIN_COMENTARIOS = SQL02.split('\n').map((linea) => linea.replace(/--.*$/, '')).join('\n');

test('RN-08 · la base pone quién hizo cada cosa en entrevistas, candidatos y censos', () => {
  for (const [tabla, eventos] of [
    ['entrevistas', 'before insert or update or delete'], ['candidatos', 'before insert or update'],
    ['censos', 'before insert'], ['estancias', 'before update'],
  ]) {
    assert.match(SQL02_SIN_COMENTARIOS, new RegExp(`${eventos} on public\\.${tabla}\\s+for each row`), tabla);
  }
  for (const asignacion of ['new.creado_por := yo', 'new.entrevistado_por := yo', 'new.corregido_por := yo',
    'new.salio_por := yo', 'new.en_curso_por := yo', 'new.decidido_por := yo', 'new.subido_por := yo',
    'new.creado_por := old.creado_por']) {
    assert.ok(SQL02_SIN_COMENTARIOS.includes(asignacion), asignacion);
  }
});

test('RN-06 · CB-11 · en la base, una entrevista hecha no vuelve atrás ni se borra', () => {
  assert.match(SQL02_SIN_COMENTARIOS, /if tg_op = 'DELETE' then\s+if old\.estado = 'entrevistado' then\s+raise exception/);
  assert.match(SQL02_SIN_COMENTARIOS, /old\.estado = 'entrevistado' and new\.estado <> 'entrevistado' then\s+raise exception/);
});

test('CL-03 · una cuenta activa necesita además una sesión que todavía exista', () => {
  assert.match(SQL02_SIN_COMENTARIOS, /from auth\.sessions s\s+where s\.id = nullif\(\(select auth\.jwt\(\)\) ->> 'session_id', ''\)::uuid/);
  assert.match(SQL02, /revoke execute on function public\.es_cuenta_activa\(\) from public, anon;/);
  for (const funcion of SQL02_SIN_COMENTARIOS.matchAll(/create or replace function public\.(\w+)[\s\S]*?\$\$;/g)) {
    assert.match(funcion[0], /set search_path = ''/, funcion[1]);
  }
});

test('CL-02 · los compañeros no ven el correo de los demás; visitantes sin acceso a tablas nuevas', () => {
  assert.match(SQL02, /revoke select on public\.perfiles from authenticated;/);
  assert.match(SQL02, /grant select \(id, nombre, rol, activo, creado_en\) on public\.perfiles to authenticated;/);
  assert.match(SQL02, /alter default privileges in schema public revoke all on tables from anon;/);
});

// --- 05-guardar-censo.sql (tanda 4). Lo de verdad se prueba en vivo (test-vivo/). ---

const SQL05 = leer('database', '05-guardar-censo.sql');
const SQL05_SIN_COMENTARIOS = SQL05.split('\n').map((linea) => linea.replace(/--.*$/, '')).join('\n');

test('CL-03 · guardar_censo corre con los permisos de quien la llama: RLS y guardias siguen mandando', () => {
  assert.match(SQL05_SIN_COMENTARIOS, /create or replace function public\.guardar_censo\(p_fecha date, p_filas jsonb\)/);
  assert.match(SQL05_SIN_COMENTARIOS, /security invoker/);
  assert.doesNotMatch(SQL05_SIN_COMENTARIOS, /security definer/, 'con "definer" se saltaría el RLS');
  assert.match(SQL05_SIN_COMENTARIOS, /set search_path = ''/);
  assert.match(SQL05_SIN_COMENTARIOS, /if not \(select public\.es_cuenta_activa\(\)\) then\s+raise exception/);
  assert.match(SQL05, /revoke execute on function public\.guardar_censo\(date, jsonb\) from public, anon;/);
  assert.match(SQL05, /grant execute on function public\.guardar_censo\(date, jsonb\) to authenticated;/);
});

test('CB-03 · guardar_censo no toca lo que ya estaba: censo, estancias y candidatos con "do nothing"', () => {
  assert.match(SQL05_SIN_COMENTARIOS, /on conflict \(fecha\) do nothing/);
  assert.match(SQL05_SIN_COMENTARIOS, /on conflict \(cedula, fecha_ingreso\) do nothing/);
  assert.match(SQL05_SIN_COMENTARIOS, /on conflict \(censo_id, estancia_id\) do nothing/);
  assert.doesNotMatch(SQL05_SIN_COMENTARIOS, /do update/, 'nunca se sobreescribe algo que ya estaba');
});

test('CL-02 · guardar_censo solo lee de cada fila los datos permitidos', () => {
  const columnas = [...SQL05_SIN_COMENTARIOS.matchAll(/as f\(([^)]*)\)/g)]
    .flatMap((m) => m[1].split(',').map((c) => c.trim().split(' ')[0]));
  assert.deepEqual([...new Set(columnas)].sort(), ['cama', 'cedula', 'dias', 'fecha_ingreso', 'nombre', 'nombre_busqueda', 'orden', 'piso']);
});

// --- 06-revision.sql (tanda 5). Lo de verdad se prueba en vivo (test-vivo/). ---

const SQL06 = leer('database', '06-revision.sql');
const SQL06_SIN_COMENTARIOS = SQL06.split('\n').map((linea) => linea.replace(/--.*$/, '')).join('\n');
const FUNCIONES_06 = { por_revisar: 'bigint, date, text', revision_del_censo: 'date', decidir_candidato: 'bigint, text, text' };

test('CL-03 · en 06, las funciones de la revisión corren con los permisos de quien llama (07 cambia decidir_candidato)', () => {
  assert.doesNotMatch(SQL06_SIN_COMENTARIOS, /security definer/, 'con "definer" se saltaría el RLS');
  assert.equal((SQL06_SIN_COMENTARIOS.match(/security invoker/g) ?? []).length, 3);
  assert.equal((SQL06_SIN_COMENTARIOS.match(/set search_path = ''/g) ?? []).length, 4, 'las 3 funciones y el guardia');
  assert.equal((SQL06_SIN_COMENTARIOS.match(/if not \(select public\.es_cuenta_activa\(\)\) then\s+raise exception/g) ?? []).length, 2);
  for (const [nombre, argumentos] of Object.entries(FUNCIONES_06)) {
    assert.ok(SQL06.includes(`revoke execute on function public.${nombre}(${argumentos}) from public, anon;`), nombre);
    assert.ok(SQL06.includes(`grant execute on function public.${nombre}(${argumentos}) to authenticated;`), nombre);
  }
});

test('CB-16 · decidir_candidato pone en fila las decisiones del mismo paciente y compara con lo que se veía', () => {
  assert.match(SQL06_SIN_COMENTARIOS, /perform 1 from public\.estancias where id = v_estancia for update;/);
  assert.match(SQL06_SIN_COMENTARIOS, /if v_decision is distinct from p_desde then/);
  assert.match(SQL06_SIN_COMENTARIOS, /if v_estado = 'entrevistado' then\s+return jsonb_build_object\('resultado', 'ya_entrevistado'\)/);
});

test('RN-08 · el guardia de candidatos no deja que una decisión vuelva a "sin decidir"', () => {
  assert.match(SQL06_SIN_COMENTARIOS, /if new\.decision is null then\s+raise exception/);
  assert.match(leer('database', 'global.sql'), /if new\.decision is null then\s+raise exception/, 'y global.sql trae la versión nueva');
});

// --- 07-decidir-por-una-sola-puerta.sql (revisión PYA de la tanda 5). En vivo: test-vivo/. ---

const SQL07 = leer('database', '07-decidir-por-una-sola-puerta.sql');
const SQL07_SIN_COMENTARIOS = SQL07.split('\n').map((linea) => linea.replace(/--.*$/, '')).join('\n');
const GLOBAL = leer('database', 'global.sql');

test('CL-03 · se decide por una sola puerta: sin escrituras directas, y la función exige una cuenta activa', () => {
  for (const linea of ['revoke update on public.candidatos from authenticated;', 'revoke insert, delete on public.entrevistas from authenticated;']) {
    assert.ok(SQL07.includes(linea), linea);
    assert.ok(GLOBAL.includes(linea), `global.sql: ${linea}`);
  }
  assert.match(SQL07_SIN_COMENTARIOS, /security definer\s+set search_path = ''/);
  assert.match(SQL07_SIN_COMENTARIOS, /begin\s+if not \(select public\.es_cuenta_activa\(\)\) then\s+raise exception/, 'lo primero que hace');
  assert.match(SQL07, /drop function public\.decidir_candidato\(bigint, text, text\);/, 'no queda la versión vieja como otra puerta');
  assert.ok(SQL07.includes('revoke execute on function public.decidir_candidato(bigint, text, text, timestamptz) from public, anon;'));
  assert.ok(SQL07.includes('grant execute on function public.decidir_candidato(bigint, text, text, timestamptz) to authenticated;'));
});

test('RN-02 · una entrevista solo apunta al candidato de su misma estancia', () => {
  assert.ok(SQL07.includes('add constraint entrevistas_candidato_de_su_estancia foreign key (candidato_id, estancia_id) references public.candidatos (id, estancia_id)'));
  assert.ok(GLOBAL.includes('constraint entrevistas_candidato_de_su_estancia foreign key (candidato_id, estancia_id) references public.candidatos (id, estancia_id)'));
});

test('CB-16 · RN-07 · decidir aparta también la entrevista, compara la hora y no sigue si algo cambió', () => {
  assert.match(SQL07_SIN_COMENTARIOS, /for update;\s+if not found then\s+raise exception 'No se pudo apartar/);
  assert.match(SQL07_SIN_COMENTARIOS, /from public\.entrevistas where estancia_id = v_estancia\s+for update;/);
  assert.match(SQL07_SIN_COMENTARIOS, /or \(p_desde is not null and v_en is distinct from p_desde_en\)/);
  assert.match(SQL07_SIN_COMENTARIOS, /delete from public\.entrevistas where id = v_entrevista;\s+if not found then\s+raise exception/);
});

// --- 08-recordar-rojo-anterior.sql (tanda 6). En vivo: test-vivo/. ---

const SQL08 = leer('database', '08-recordar-rojo-anterior.sql');
const SQL08_SIN_COMENTARIOS = SQL08.split('\n').map((linea) => linea.replace(/--.*$/, '')).join('\n');

test('HU-07.1 · HU-07.3 · RN-04 · el rojo anterior es de la MISMA estancia, de un censo anterior, con la fecha de ese censo', () => {
  assert.match(SQL08_SIN_COMENTARIOS, /where r\.estancia_id = c\.estancia_id and r\.decision = 'no_entrevistar' and z\.fecha < v_fecha\s+order by z\.fecha desc\s+limit 1/);
  assert.match(SQL08_SIN_COMENTARIOS, /'rojo_anterior', case when rojo\.fecha is not null\s+then jsonb_build_object\('fecha', rojo\.fecha, 'por', rojo\.nombre\) end/);
  assert.match(SQL08_SIN_COMENTARIOS, /security invoker/);
  assert.doesNotMatch(SQL08_SIN_COMENTARIOS, /security definer/, 'solo lee: con "invoker" el RLS sigue mandando');
  assert.match(SQL08_SIN_COMENTARIOS, /if not \(select public\.es_cuenta_activa\(\)\) then\s+raise exception/);
  assert.ok(GLOBAL.includes("'rojo_anterior', case when rojo.fecha is not null"), 'y global.sql trae la versión nueva');
});

// --- 09-entrevistas-por-estado.sql (tanda 8). En vivo: test-vivo/. ---

const SQL09 = leer('database', '09-entrevistas-por-estado.sql');
const SQL09_SIN_COMENTARIOS = SQL09.split('\n').map((linea) => linea.replace(/--.*$/, '')).join('\n');

test('HU-08 · CL-03 · entrevistas_del_dia solo lee, con los permisos de quien llama y solo para cuentas activas', () => {
  assert.match(SQL09_SIN_COMENTARIOS, /security invoker/);
  assert.doesNotMatch(SQL09_SIN_COMENTARIOS, /security definer|insert |update |delete /);
  assert.match(SQL09_SIN_COMENTARIOS, /if not \(select public\.es_cuenta_activa\(\)\) then\s+raise exception/);
  assert.ok(SQL09.includes('revoke execute on function public.entrevistas_del_dia(date) from public, anon;'));
  assert.ok(SQL09.includes('grant execute on function public.entrevistas_del_dia(date) to authenticated;'));
  // HU-08.2: las pendientes de cualquier censo; HU-08.3: las otras, solo del censo elegido.
  assert.match(SQL09_SIN_COMENTARIOS, /where i\.estado = 'pendiente'\s+\)/);
  assert.match(SQL09_SIN_COMENTARIOS, /where i\.estado = 'entrevistado' and c\.censo_id = v_id/);
  assert.match(SQL09_SIN_COMENTARIOS, /where i\.estado = 'salio' and c\.censo_id = v_id/);
  assert.match(SQL09_SIN_COMENTARIOS, /'en_curso_mio', coalesce\(i\.en_curso_por = \(select auth\.uid\(\)\), false\)/);
  assert.ok(GLOBAL.includes('create or replace function public.entrevistas_del_dia(p_fecha date default null)'));
});

test('RN-02 · RN-10 · la base exige una estancia por cédula y fecha, y los 5 datos para "entrevistado"', () => {
  assert.match(SQL, /unique \(cedula, fecha_ingreso\)/);
  assert.match(SQL, /check \(estado <> 'entrevistado' or \(/);
  for (const dato of ['edad is not null', 'fecha_accidente is not null', 'tipo_declaracion is not null', "coalesce(lugar, '')", "coalesce(relato, '')"]) {
    assert.ok(SQL.includes(dato), dato);
  }
});
