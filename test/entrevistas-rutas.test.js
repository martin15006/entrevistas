'use strict';

// HU-08 · La pantalla "Entrevistas", de punta a punta con el servidor de prueba (Supabase y base
// falsos). La consulta de verdad (database/09) se prueba en vivo (test-vivo/). Todo es inventado (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearApp } = require('../app');
const { CONFIG, conServidor } = require('./ayudantes/servidor');
const { crearSupabaseFalso, crearNavegador } = require('./ayudantes/supabase-falso');
const { crearBaseFalsa } = require('./ayudantes/datos-falsos');

// 7 de noviembre de 2026 a las 10:00 en Colombia: "hoy" es 2026-11-07.
const AHORA = Date.parse('2026-11-07T15:00:00Z');

const cuentas = () => [
  { id: 'id-ana', correo: 'ana@prueba.test', contrasena: 'clave-ana-123', perfil: { nombre: 'ANA PRUEBA', rol: 'usuario', activo: true } },
  { id: 'id-beto', correo: 'beto@prueba.test', contrasena: 'clave-beto-123', perfil: { nombre: 'BETO PRUEBA', rol: 'usuario', activo: true } },
  { id: 'id-raro', correo: 'raro@prueba.test', contrasena: 'clave-raro-123', perfil: { nombre: '<img src=x onerror=alert(1)>', rol: 'usuario', activo: true } },
];

const paciente = (orden, piso, { ingreso = '2026-11-05' } = {}) => ({
  cedula: `99200${orden}`, fecha_ingreso: ingreso, nombre: `PACIENTE ${orden} PRUEBA`, nombre_busqueda: `paciente ${orden} prueba`,
  piso, cama: `Cama ${orden}`, dias: 0, orden,
});

function preparar({ reloj = () => AHORA } = {}) {
  const falso = crearSupabaseFalso(cuentas());
  const falsa = crearBaseFalsa({ reloj });
  const app = crearApp(CONFIG, { clientes: falso.clientes, fabricaDeDatos: falsa.fabrica, reloj });
  const sembrar = (fecha, filas) => falsa.fabrica(null).guardarCenso(fecha, filas);
  const candidato = (fecha, cedula) => [...falsa.base.censos.get(fecha).candidatos.values()].find((c) => c.cedula === cedula);
  /** Decide en verde y devuelve la entrevista (para ponerle estado, "en curso"…). */
  const verde = (fecha, cedula, por = 'id-ana') => {
    const c = candidato(fecha, cedula);
    falsa.decidirComo(c.id, 'entrevistar', por);
    return falsa.base.entrevistas.get(c.clave);
  };
  return { app, ...falsa, sembrar, candidato, verde };
}

async function entrar(servidor) {
  const nav = crearNavegador(servidor);
  await nav.get('/login');
  await nav.post('/login', { correo: 'ana@prueba.test', contrasena: 'clave-ana-123' });
  return nav;
}

const cuantos = (html, patron) => (html.match(patron) ?? []).length;

test('RNF-03 · sin sesión, Entrevistas lleva al login', async () => {
  const { app } = preparar();
  await conServidor(app, async (servidor) => {
    const respuesta = await crearNavegador(servidor).get('/entrevistas?pestana=salieron');
    assert.equal(respuesta.estado, 303);
    assert.equal(respuesta.ubicacion, '/login');
  });
});

test('HU-08.1 · HU-01.2 · al entrar se ve "Entrevistas" con sus pestañas y "Pendientes" abierta', async () => {
  const { app, sembrar, verde } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI'), paciente(4, 'UCI')]);
  verde('2026-11-06', '992003');
  verde('2026-11-06', '992004');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const raiz = await nav.get('/');
    assert.deepEqual([raiz.estado, raiz.ubicacion], [303, '/entrevistas'], '"/" lleva a Entrevistas');
    const pagina = await nav.get('/entrevistas');
    assert.equal(pagina.estado, 200);
    assert.ok(pagina.texto.includes('<a class="pestanas__enlace" href="/entrevistas" aria-current="page">Pendientes (2)</a>'));
    assert.ok(pagina.texto.includes('<a class="pestanas__enlace" href="/entrevistas?pestana=entrevistados">Entrevistados</a>'));
    assert.ok(pagina.texto.includes('<a class="pestanas__enlace" href="/entrevistas?pestana=salieron">Salieron</a>'));
    assert.ok(pagina.texto.includes('<link rel="stylesheet" href="/css/paginas/entrevistas.css">'), 'CL-12');
  });
});

test('HU-08.2 · HU-08.5 · las pendientes por servicio, con cama, nombre, cédula y "Desde el"; cada una lleva a su formulario', async () => {
  const { app, sembrar, verde } = preparar();
  await sembrar('2026-11-05', [paciente(1, 'UCI')]);
  await sembrar('2026-11-06', [paciente(3, 'Observacion'), paciente(4, 'UCI')]);
  const vieja = verde('2026-11-05', '992001');
  const hoy = verde('2026-11-06', '992003');
  verde('2026-11-06', '992004');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/entrevistas');
    assert.ok(texto.includes('<h2 class="grupo__titulo">UCI · 2</h2>'));
    assert.ok(texto.includes('<h2 class="grupo__titulo">Observacion · 1</h2>'));
    assert.ok(texto.indexOf('UCI · 2') < texto.indexOf('Observacion · 1'), 'las más viejas primero (la de UCI del 05/11)');
    // El enlace lleva el id de la ENTREVISTA, nunca el del candidato (en la base son distintos).
    assert.ok(texto.includes(`<a class="fila-entrevista" href="/entrevistas/${vieja.id}">`));
    assert.ok(!texto.includes(`href="/entrevistas/${vieja.candidatoId}"`));
    assert.ok(texto.includes('<span class="fila-entrevista__cama">Cama 1</span>'));
    assert.ok(texto.includes('<span class="fila-entrevista__nombre">PACIENTE 1 PRUEBA</span>'));
    assert.ok(texto.includes('<span class="fila-entrevista__detalle">992001</span>'));
    assert.equal(cuantos(texto, /<span class="fila-entrevista__desde">Desde el 05\/11\/2026<\/span>/g), 1, 'solo la del censo anterior');
    assert.ok(texto.includes(`href="/entrevistas/${hoy.id}"`));
  });
});

test('HU-08.3 · Entrevistados y Salieron: las del censo más reciente, con selector para elegir otro día', async () => {
  const { app, sembrar, verde } = preparar();
  await sembrar('2026-11-05', [paciente(1, 'UCI')]);
  await sembrar('2026-11-06', [paciente(3, 'UCI'), paciente(4, 'UCI'), paciente(5, 'UCI')]);
  Object.assign(verde('2026-11-05', '992001'), { estado: 'entrevistado', entrevistadoPor: 'id-beto', entrevistadoEn: '2026-11-05T16:00:00Z' });
  Object.assign(verde('2026-11-06', '992003'), { estado: 'entrevistado', entrevistadoPor: 'id-ana', entrevistadoEn: '2026-11-06T15:30:00Z' });
  Object.assign(verde('2026-11-06', '992004'), { estado: 'salio', salioPor: 'id-beto', salioEn: '2026-11-06T17:05:00Z' });
  verde('2026-11-06', '992005'); // sigue pendiente
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const hechas = (await nav.get('/entrevistas?pestana=entrevistados')).texto;
    assert.ok(hechas.includes('<a class="pestanas__enlace" href="/entrevistas?pestana=entrevistados" aria-current="page">Entrevistados</a>'));
    assert.ok(hechas.includes('Pendientes (1)'));
    assert.ok(hechas.includes('<option value="2026-11-06" selected>06/11/2026</option>'));
    assert.ok(hechas.includes('<input type="hidden" name="pestana" value="entrevistados">'));
    assert.ok(hechas.includes('<span class="fila-entrevista__quien">ANA PRUEBA · 10:30</span>'));
    assert.ok(!hechas.includes('PACIENTE 1 PRUEBA'), 'la del 05/11 es de otro censo');
    assert.ok(!hechas.includes('href="/entrevistas/'), 'las hechas no se abren desde aquí');

    const delCinco = (await nav.get('/entrevistas?pestana=entrevistados&dia=2026-11-05')).texto;
    assert.ok(delCinco.includes('PACIENTE 1 PRUEBA'));
    assert.ok(delCinco.includes('<option value="2026-11-05" selected>05/11/2026</option>'));

    const salieron = (await nav.get('/entrevistas?pestana=salieron')).texto;
    assert.ok(salieron.includes('<span class="fila-entrevista__quien">BETO PRUEBA · 12:05</span>'));
    assert.ok(!salieron.includes('PACIENTE 3 PRUEBA'));
  });
});

test('HU-08.4 · sin el censo de hoy (hora de Colombia) se ve el aviso con "Subir censo"; con él, no', async () => {
  const { app, sembrar } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const sin = (await nav.get('/entrevistas')).texto;
    assert.ok(sin.includes('<p>Todavía no se ha subido el censo de hoy.</p>'));
    assert.ok(sin.includes('<a class="boton" href="/censo">Subir censo</a>'));
    await sembrar('2026-11-07', []);
    const con = (await nav.get('/entrevistas')).texto;
    assert.ok(!con.includes('Todavía no se ha subido el censo de hoy.'));
  });
});

test('HU-08.4 · RNF-15 · "hoy" es el de Colombia: a las 23:30 del 06/11 en Colombia ya es 07/11 en UTC', async () => {
  const tarde = Date.parse('2026-11-07T04:30:00Z'); // 23:30 del 06/11 en Colombia
  const { app, sembrar } = preparar({ reloj: () => tarde });
  await sembrar('2026-11-06', []);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    assert.ok(!(await nav.get('/entrevistas')).texto.includes('Todavía no se ha subido el censo de hoy.'));
  });
});

test('HU-08.6 · CB-27 · "En curso · [nombre]" si otra persona la abrió hace menos de 15 minutos', async () => {
  let ahora = AHORA;
  const { app, sembrar, verde } = preparar({ reloj: () => ahora });
  await sembrar('2026-11-06', [paciente(3, 'UCI'), paciente(4, 'UCI')]);
  Object.assign(verde('2026-11-06', '992003'), { enCursoPor: 'id-beto', enCursoDesde: new Date(AHORA - 5 * 60 * 1000).toISOString() });
  Object.assign(verde('2026-11-06', '992004'), { enCursoPor: 'id-ana', enCursoDesde: new Date(AHORA - 60 * 1000).toISOString() });
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const antes = (await nav.get('/entrevistas')).texto;
    assert.equal(cuantos(antes, /<span class="fila-entrevista__en-curso">En curso · BETO PRUEBA<\/span>/g), 1);
    assert.ok(!antes.includes('En curso · ANA PRUEBA'), 'la que abrió Ana misma no se le avisa a ella');

    ahora = AHORA + 10 * 60 * 1000; // 15 minutos desde que Beto la abrió
    const despues = (await nav.get('/entrevistas')).texto;
    assert.ok(!despues.includes('En curso'), 'a los 15 minutos desaparece (CB-27)');
  });
});

test('base · una pestaña o un día raros no rompen nada, y lo vacío tiene su aviso', async () => {
  const { app, sembrar } = preparar();
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const vacia = await nav.get('/entrevistas');
    assert.ok(vacia.texto.includes('No hay entrevistas pendientes.'));
    assert.ok((await nav.get('/entrevistas?pestana=entrevistados')).texto.includes('Todavía no hay censos. Sube el primero desde «Censo».'));
    await sembrar('2026-11-06', []);
    for (const ruta of ['/entrevistas?pestana=<script>', '/entrevistas?pestana=salieron&dia=no-es-fecha', '/entrevistas?pestana[]=x']) {
      const pagina = await nav.get(ruta);
      assert.equal(pagina.estado, 200, ruta);
      assert.ok(!pagina.texto.includes('<script>'), ruta);
    }
    assert.ok((await nav.get('/entrevistas?pestana=salieron')).texto.includes('Ningún paciente de este censo salió.'));
    assert.ok((await nav.get('/entrevistas?pestana=entrevistados')).texto.includes('Todavía no hay entrevistas hechas de este censo.'));
    assert.ok((await nav.get('/entrevistas?pestana=salieron&dia=2026-01-01')).texto.includes('No hay censo del 01/01/2026.'));
  });
});

test('CL-05 · los nombres salen escapados en "En curso" y en "Entrevistados"', async () => {
  const { app, sembrar, verde } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI'), paciente(4, 'UCI')]);
  Object.assign(verde('2026-11-06', '992003'), { enCursoPor: 'id-raro', enCursoDesde: new Date(AHORA - 60 * 1000).toISOString() });
  Object.assign(verde('2026-11-06', '992004'), { estado: 'entrevistado', entrevistadoPor: 'id-raro', entrevistadoEn: '2026-11-06T15:30:00Z' });
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const pendientes = (await nav.get('/entrevistas')).texto;
    assert.ok(pendientes.includes('En curso · &lt;img src=x onerror=alert(1)&gt;'));
    const hechas = (await nav.get('/entrevistas?pestana=entrevistados')).texto;
    assert.ok(hechas.includes('&lt;img src=x onerror=alert(1)&gt; · 10:30'));
    assert.ok(!pendientes.includes('<img src=x') && !hechas.includes('<img src=x'));
  });
});
