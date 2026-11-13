'use strict';

// HU-05 y HU-06 · La revisión y el verde o rojo, de punta a punta con el servidor de prueba
// (Supabase y base falsos). La regla de la base de verdad se prueba en vivo (test-vivo/).
// Todos los pacientes son inventados (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearApp } = require('../app');
const { CONFIG, conServidor } = require('./ayudantes/servidor');
const { crearSupabaseFalso, crearNavegador } = require('./ayudantes/supabase-falso');
const { crearBaseFalsa } = require('./ayudantes/datos-falsos');

// 7 de noviembre de 2026 a las 10:00 en Colombia.
const AHORA = Date.parse('2026-11-07T15:00:00Z');
const YA_REVISO = 'BETO PRUEBA ya revisó a este paciente.';
const HECHA = 'Este paciente ya tiene la entrevista hecha.';
const SOLICITUD_MALA = 'No pudimos leer lo que enviaste. Recarga la página e inténtalo de nuevo.';

const cuentas = () => [
  { id: 'id-ana', correo: 'ana@prueba.test', contrasena: 'clave-ana-123', perfil: { nombre: 'ANA PRUEBA', rol: 'usuario', activo: true } },
  { id: 'id-beto', correo: 'beto@prueba.test', contrasena: 'clave-beto-123', perfil: { nombre: 'BETO PRUEBA', rol: 'usuario', activo: true } },
  // Un nombre con HTML adentro: tiene que verse como texto, nunca ejecutarse (CL-05, PYA tanda 6).
  { id: 'id-raro', correo: 'raro@prueba.test', contrasena: 'clave-raro-123', perfil: { nombre: '<img src=x onerror=alert(1)>', rol: 'usuario', activo: true } },
];

/** Un candidato inventado, como lo guarda guardar_censo. */
const paciente = (orden, piso, { cedula = `99100${orden}`, dias = orden % 2, ingreso = '2026-11-05' } = {}) => ({
  cedula, fecha_ingreso: ingreso, nombre: `PACIENTE ${orden} PRUEBA`, nombre_busqueda: `paciente ${orden} prueba`,
  piso, cama: `Cama ${orden}`, dias, orden,
});

function preparar() {
  const falso = crearSupabaseFalso(cuentas());
  // Cada decisión, un segundo después de la anterior: así cada una tiene su propia hora (A→B→A).
  let segundos = 0;
  const falsa = crearBaseFalsa({ reloj: () => AHORA + 1000 * (segundos += 1) });
  const app = crearApp(CONFIG, { clientes: falso.clientes, fabricaDeDatos: falsa.fabrica, reloj: () => AHORA });
  const sembrar = (fecha, filas) => falsa.fabrica(null).guardarCenso(fecha, filas);
  /** El candidato de un censo por su cédula. */
  const candidato = (fecha, cedula) => [...falsa.base.censos.get(fecha).candidatos.values()].find((c) => c.cedula === cedula);
  return { app, ...falsa, sembrar, candidato };
}

async function entrar(servidor, correo = 'ana@prueba.test', contrasena = 'clave-ana-123') {
  const nav = crearNavegador(servidor);
  await nav.get('/login');
  await nav.post('/login', { correo, contrasena });
  return nav;
}

const JSON_ACCEPT = { accept: 'application/json' };
const decidir = (nav, campos, cabeceras = JSON_ACCEPT) => nav.post('/revision/decidir', campos, cabeceras);
const json = (respuesta) => JSON.parse(respuesta.texto);
const cuantos = (html, patron) => (html.match(patron) ?? []).length;

test('RNF-03 · sin sesión, la revisión y decidir llevan al login', async () => {
  const { app } = preparar();
  await conServidor(app, async (servidor) => {
    const nav = crearNavegador(servidor);
    const pagina = await nav.get('/revision');
    assert.equal(pagina.estado, 303);
    assert.equal(pagina.ubicacion, '/login');
    const pidiendoJson = await nav.get('/revision?dia=2026-11-06', JSON_ACCEPT);
    assert.equal(pidiendoJson.estado, 401);
    await nav.get('/login'); // para tener un token válido: lo que frena es la falta de sesión
    const sinSesion = await decidir(nav, { candidato: '1', decision: 'entrevistar' });
    assert.equal(sinSesion.estado, 401);
    const sinSesionNiJs = await decidir(nav, { candidato: '1', decision: 'entrevistar' }, {});
    assert.equal(sinSesionNiJs.estado, 303);
    assert.equal(sinSesionNiJs.ubicacion, '/login');
  });
});

test('HU-05.1 · "Revisión" está en el menú y abre el censo más reciente, con el selector de días', async () => {
  const { app, sembrar } = preparar();
  await sembrar('2026-11-05', [paciente(4, 'UCI')]);
  await sembrar('2026-11-06', [paciente(5, 'UCI')]);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const pagina = await nav.get('/revision');
    assert.equal(pagina.estado, 200);
    assert.ok(pagina.texto.includes('<a href="/revision" aria-current="page">Revisión</a>'));
    assert.ok(pagina.texto.includes('Revisión del censo del 06/11/2026'));
    assert.ok(pagina.texto.includes('<option value="2026-11-06" selected>06/11/2026</option>'));
    assert.ok(pagina.texto.includes('<option value="2026-11-05">05/11/2026</option>'));
    assert.ok(pagina.texto.includes('<form class="selector-dia" method="get" action="/revision">'));

    const otroDia = await nav.get('/revision?dia=2026-11-05');
    assert.ok(otroDia.texto.includes('Revisión del censo del 05/11/2026'));
    assert.ok(otroDia.texto.includes('<option value="2026-11-05" selected>05/11/2026</option>'));
  });
});

test('HU-05.2 · "Por revisar" agrupa por servicio con conteo, y cada uno trae cama, nombre, cédula y día', async () => {
  const { app, sembrar } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'Observacion'), paciente(4, 'UCI'), paciente(7, 'Observacion')]);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    const primero = texto.indexOf('<h3 class="grupo__titulo">Observacion · 2</h3>');
    const segundo = texto.indexOf('<h3 class="grupo__titulo">UCI · 1</h3>');
    assert.ok(primero > 0 && segundo > primero, 'Observacion aparece primero en el censo (RN-09)');
    assert.ok(texto.indexOf('Cama 3') < texto.indexOf('Cama 7'), 'dentro del servicio, por fila');
    assert.ok(texto.includes('<p class="candidato__cama">Cama 3</p>'));
    assert.ok(texto.includes('<p class="candidato__nombre">PACIENTE 3 PRUEBA</p>'));
    assert.ok(texto.includes('991003 · <span class="candidato__dia">Día 1</span>'));
    assert.ok(texto.includes('991004 · <span class="candidato__dia">Día 0</span>'));
  });
});

test('HU-05.4 · un censo sin candidatos lo dice', async () => {
  const { app, sembrar } = preparar();
  await sembrar('2026-11-06', []);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('Este censo no tiene pacientes con día 0 o 1 para revisar.'));
    assert.ok(!texto.includes('Por revisar'));
  });
});

test('HU-05.5 · el aviso del censo anterior con pacientes sin revisar lleva a ese día', async () => {
  const { app, sembrar } = preparar();
  await sembrar('2026-11-04', [paciente(1, 'UCI', { ingreso: '2026-11-04' })]);
  await sembrar('2026-11-05', [paciente(2, 'UCI'), paciente(3, 'UCI')]);
  await sembrar('2026-11-06', [paciente(4, 'UCI')]);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('<a href="/revision?dia=2026-11-05">El censo del 05/11/2026 tiene 2 pacientes sin revisar.</a>'));
    assert.ok(texto.includes('<a href="/revision?dia=2026-11-04">El censo del 04/11/2026 tiene 1 paciente sin revisar.</a>'));
    // Viendo el del 05, solo se avisa de los anteriores a él.
    const delCinco = await nav.get('/revision?dia=2026-11-05');
    assert.ok(delCinco.texto.includes('El censo del 04/11/2026 tiene 1 paciente sin revisar.'));
    assert.ok(!delCinco.texto.includes('El censo del 06/11/2026'));
  });
});

test('HU-06.1 · cada candidato por revisar tiene "Entrevistar" en verde y "No entrevistar" en rojo', async () => {
  const { app, sembrar } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI'), paciente(4, 'UCI')]);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.equal(cuantos(texto, /<button type="submit" class="boton boton--verde">Entrevistar<\/button>/g), 2);
    assert.equal(cuantos(texto, /<button type="submit" class="boton boton--rojo">No entrevistar<\/button>/g), 2);
    assert.equal(cuantos(texto, /<form class="decidir" method="post" action="\/revision\/decidir" data-decidir>/g), 4);
    assert.ok(texto.includes('<script src="/js/revision.js" defer></script>'));
  });
});

test('HU-06.2 · RN-05 · RN-08 · "Entrevistar" crea la entrevista Pendiente y pasa a "Ya revisados" con 🟢', async () => {
  const { app, base, sembrar, candidato } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI'), paciente(4, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    const respuesta = await decidir(nav, { candidato: String(c.id), decision: 'entrevistar', desde: '', dia: '2026-11-06' });
    assert.equal(respuesta.estado, 200);
    assert.deepEqual(json(respuesta), { ok: true });
    assert.equal(c.decision, 'entrevistar');
    assert.equal(c.decidido_por, 'id-ana', 'RN-08: a nombre de quien decidió');
    const { id: idEntrevista, ...entrevista } = base.entrevistas.get(c.clave);
    assert.deepEqual(entrevista, { candidatoId: c.id, estado: 'pendiente' });
    assert.notEqual(idEntrevista, c.id, 'la entrevista tiene su propio id, como en la base');

    const { texto } = await nav.get('/revision?dia=2026-11-06');
    assert.ok(texto.includes('<details class="revisados" id="revisados">'), 'HU-05.3: "Ya revisados" llega plegado');
    assert.ok(texto.includes('<summary>Ya revisados (1)</summary>'));
    assert.ok(texto.indexOf('id="titulo-por-revisar"') < texto.indexOf('id="revisados"'), 'HU-05.3: abajo de "Por revisar"');
    assert.ok(texto.includes('<p class="candidato__decision">🟢 Entrevistar · ANA PRUEBA · 07/11/2026 10:00</p>'));
    assert.ok(texto.includes('<h3 class="grupo__titulo">UCI · 1</h3>'), 'en "Por revisar" queda uno');
  });
});

test('HU-06.3 · "No entrevistar" pasa a "Ya revisados" con 🔴 y no crea entrevista', async () => {
  const { app, base, sembrar, candidato } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    const respuesta = await decidir(nav, { candidato: String(c.id), decision: 'no_entrevistar', desde: '', dia: '2026-11-06' });
    assert.equal(respuesta.estado, 200);
    assert.equal(c.decision, 'no_entrevistar');
    assert.equal(base.entrevistas.size, 0);
    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('<p class="candidato__decision">🔴 No entrevistar · ANA PRUEBA · 07/11/2026 10:00</p>'));
    assert.ok(texto.includes('Ya se revisaron todos los pacientes de este censo.'));
  });
});

test('HU-06.4 · RN-07 · "Cambiar decisión" pasa al otro color: verde→rojo borra la Pendiente, rojo→verde la crea', async () => {
  const { app, base, sembrar, candidato } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    await decidir(nav, { candidato: String(c.id), decision: 'entrevistar', desde: '', dia: '2026-11-06' });

    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('<summary>Cambiar decisión</summary>'));
    assert.ok(texto.includes('<input type="hidden" name="desde" value="entrevistar">'));
    assert.ok(texto.includes(`<input type="hidden" name="desde_en" value="${c.decidido_en}">`), 'y la hora de esa decisión');
    assert.ok(texto.includes('<button type="submit" class="boton boton--rojo">No entrevistar</button>'));

    const aRojo = await decidir(nav, { candidato: String(c.id), decision: 'no_entrevistar', desde: 'entrevistar', desde_en: c.decidido_en, dia: '2026-11-06' });
    assert.equal(aRojo.estado, 200);
    assert.equal(c.decision, 'no_entrevistar');
    assert.equal(base.entrevistas.has(c.clave), false, 'la entrevista Pendiente se borró');

    const aVerde = await decidir(nav, { candidato: String(c.id), decision: 'entrevistar', desde: 'no_entrevistar', desde_en: c.decidido_en, dia: '2026-11-06' });
    assert.equal(aVerde.estado, 200);
    assert.equal(base.entrevistas.get(c.clave)?.estado, 'pendiente');
  });
});

test('HU-06.4 · CB-11 · con la entrevista hecha no cambia nada, ni con la pantalla ni enviando el formulario a mano', async () => {
  const { app, base, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  decidirComo(c.id, 'entrevistar', 'id-ana');
  base.entrevistas.get(c.clave).estado = 'entrevistado';
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes(`<p class="aviso">${HECHA}</p>`), 'al abrir "Cambiar decisión" se ve el texto');
    assert.ok(!texto.includes('name="desde" value="entrevistar"'), 'y no hay botón para cambiarla');

    const conJs = await decidir(nav, { candidato: String(c.id), decision: 'no_entrevistar', desde: 'entrevistar', desde_en: c.decidido_en, dia: '2026-11-06' });
    assert.equal(conJs.estado, 409);
    assert.deepEqual(json(conJs), { error: HECHA, codigo: 'ya_entrevistado' });

    const aMano = await decidir(nav, { candidato: String(c.id), decision: 'no_entrevistar', desde: 'entrevistar', desde_en: c.decidido_en, dia: '2026-11-06' }, {});
    assert.equal(aMano.estado, 409);
    assert.ok(aMano.texto.includes(`<p class="aviso aviso--error" role="alert">${HECHA}</p>`));
    assert.equal(c.decision, 'entrevistar');
    assert.equal(base.entrevistas.get(c.clave).estado, 'entrevistado');
  });
});

test('HU-06.5 · CB-16 · si otra persona decidió un momento antes, gana ella y se ve su nombre', async () => {
  const { app, base, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision'); // Ana ve al paciente sin decidir…
    decidirComo(c.id, 'no_entrevistar', 'id-beto'); // …y Beto lo decide primero.

    const respuesta = await decidir(nav, { candidato: String(c.id), decision: 'entrevistar', desde: '', dia: '2026-11-06' });
    assert.equal(respuesta.estado, 409);
    assert.deepEqual(json(respuesta), { error: YA_REVISO, codigo: 'ya_revisado' });
    assert.equal(c.decision, 'no_entrevistar', 'queda lo de Beto');
    assert.equal(c.decidido_por, 'id-beto');
    assert.equal(base.entrevistas.size, 0);

    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('🔴 No entrevistar · BETO PRUEBA'), 'la lista se actualiza con su decisión');

    // Lo mismo si Beto CAMBIÓ la decisión mientras Ana miraba la vieja.
    const cambio = await decidir(nav, { candidato: String(c.id), decision: 'no_entrevistar', desde: 'entrevistar', dia: '2026-11-06' });
    assert.equal(cambio.estado, 409);
  });
});

test('CB-16 · HU-06.5 · A→B→A: una pantalla vieja no pisa la decisión de otra persona aunque el color sea el mismo', async () => {
  const { app, base, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  decidirComo(c.id, 'entrevistar', 'id-ana');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    const loQueAnaVe = c.decidido_en; // Ana ve el 🟢 que ella misma puso…
    decidirComo(c.id, 'no_entrevistar', 'id-beto'); // …Beto lo pasa a rojo…
    decidirComo(c.id, 'entrevistar', 'id-beto'); // …y lo vuelve a verde, con una entrevista nueva.

    const respuesta = await decidir(nav, { candidato: String(c.id), decision: 'no_entrevistar', desde: 'entrevistar', desde_en: loQueAnaVe, dia: '2026-11-06' });
    assert.equal(respuesta.estado, 409);
    assert.deepEqual(json(respuesta), { error: YA_REVISO, codigo: 'ya_revisado' });
    assert.equal(c.decision, 'entrevistar', 'queda lo de Beto');
    assert.equal(base.entrevistas.get(c.clave)?.estado, 'pendiente', 'la entrevista nueva de Beto no se borró');
  });
});

test('CB-24 · el mismo toque que llega dos veces se procesa una sola vez', async () => {
  const { app, base, sembrar, candidato } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    const campos = { candidato: String(c.id), decision: 'entrevistar', desde: '', dia: '2026-11-06' };
    const [uno, dos] = [await decidir(nav, campos), await decidir(nav, campos)];
    assert.deepEqual([uno.estado, dos.estado], [200, 200], 'el segundo no muestra un error de "ya revisó"');
    assert.equal(base.entrevistas.size, 1, 'una sola entrevista');
    assert.equal(c.decidido_por, 'id-ana');
  });
});

test('base · sin JavaScript, decidir vuelve a la revisión de ese día', async () => {
  const { app, sembrar, candidato } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    const respuesta = await decidir(nav, { candidato: String(c.id), decision: 'entrevistar', desde: '', dia: '2026-11-06' }, {});
    assert.equal(respuesta.estado, 303);
    assert.equal(respuesta.ubicacion, '/revision?dia=2026-11-06');
    assert.equal(c.decision, 'entrevistar');
  });
});

test('base · decidir rechaza lo que no es un candidato, una decisión o un día válidos, sin tocar la base', async () => {
  const { app, base, sembrar, candidato } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const id = String(candidato('2026-11-06', '991003').id);
  const malos = [
    { candidato: '0', decision: 'entrevistar' },
    { candidato: '-3', decision: 'entrevistar' },
    { candidato: '1e3', decision: 'entrevistar' },
    { candidato: '9'.repeat(16), decision: 'entrevistar' },
    { candidato: id, decision: 'quizas' },
    { candidato: id, decision: '' },
    { candidato: id, decision: 'entrevistar', desde: 'tal-vez' },
    { candidato: id, decision: 'entrevistar', desde: 'entrevistar', desde_en: 'ayer' },
    { candidato: id, decision: 'entrevistar', desde: 'entrevistar', desde_en: '2026-11-07 15:00:00' },
    { candidato: id, decision: 'entrevistar', dia: '2026-02-30' },
    { candidato: id, decision: 'entrevistar', dia: '<script>' },
  ];
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    for (const campos of malos) {
      const respuesta = await decidir(nav, campos);
      assert.equal(respuesta.estado, 400, JSON.stringify(campos));
      assert.deepEqual(json(respuesta), { error: SOLICITUD_MALA });
    }
    // Un candidato que no existe en la base tampoco cambia nada.
    const noExiste = await decidir(nav, { candidato: '777', decision: 'entrevistar' });
    assert.equal(noExiste.estado, 400);
    assert.deepEqual(base.decisiones.map((d) => d.id), [777], 'solo llegó a la base el que tenía forma válida');
  });
});

test('RNF-06 · decidir sin el token anti-falsificación se rechaza', async () => {
  const { app, base, sembrar, candidato } = preparar();
  await sembrar('2026-11-06', [paciente(3, 'UCI')]);
  const c = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    const respuesta = await decidir(nav, { _csrf: 'falso', candidato: String(c.id), decision: 'entrevistar' });
    assert.equal(respuesta.estado, 403);
    assert.equal(base.decisiones.length, 0);
    assert.equal(c.decision, null);
  });
});

test('base · un día sin censo o mal escrito no rompe nada', async () => {
  const { app, sembrar } = preparar();
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const vacia = await nav.get('/revision');
    assert.ok(vacia.texto.includes('Todavía no hay censos. Sube el primero desde «Censo».'));

    await sembrar('2026-11-06', [paciente(3, 'UCI')]);
    const sinCenso = await nav.get('/revision?dia=2026-01-01');
    assert.equal(sinCenso.estado, 200);
    assert.ok(sinCenso.texto.includes('No hay censo del 01/01/2026. Elige otro día o súbelo desde «Censo».'));
    for (const dia of ['no-es-fecha', '2026-02-30', '<script>alert(1)</script>']) {
      const pagina = await nav.get(`/revision?dia=${encodeURIComponent(dia)}`);
      assert.equal(pagina.estado, 200, dia);
      assert.ok(pagina.texto.includes('Revisión del censo del 06/11/2026'), `${dia}: muestra el más reciente`);
      assert.ok(!pagina.texto.includes('<script>alert'), dia);
    }
  });
});

test('RN-03 · aclaración 2026-11-11 · decidido en un censo posterior: aparece revisado, sin aviso, y se cambia allá', async () => {
  const { app, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-05', [paciente(3, 'UCI', { dias: 0 }), paciente(4, 'UCI')]);
  await sembrar('2026-11-06', [paciente(3, 'UCI', { dias: 1 })]); // la misma estancia, al otro día
  const viejo = candidato('2026-11-05', '991003');
  decidirComo(candidato('2026-11-06', '991003').id, 'no_entrevistar', 'id-beto');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const hoy = await nav.get('/revision');
    assert.ok(hoy.texto.includes('El censo del 05/11/2026 tiene 1 paciente sin revisar.'), 'cuenta solo al que de verdad falta');

    const { texto } = await nav.get('/revision?dia=2026-11-05');
    assert.ok(texto.includes('<summary>Ya revisados (1)</summary>'));
    assert.ok(texto.includes('🔴 No entrevistar · BETO PRUEBA'));
    assert.ok(texto.includes('<a href="/revision?dia=2026-11-06">Se decidió en el censo del 06/11/2026.</a>'));
    assert.equal(cuantos(texto, /<summary>Cambiar decisión<\/summary>/g), 0);

    const aqui = await decidir(nav, { candidato: String(viejo.id), decision: 'entrevistar', desde: '', dia: '2026-11-05' });
    assert.equal(aqui.estado, 409);
    assert.deepEqual(json(aqui), { error: YA_REVISO, codigo: 'ya_revisado' });
  });
});

test('HU-07.1 · HU-07.2 · un rojo de un censo anterior vuelve a "Por revisar" con su aviso, y se decide igual', async () => {
  const { app, base, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-05', [paciente(3, 'UCI', { dias: 0 })]);
  decidirComo(candidato('2026-11-05', '991003').id, 'no_entrevistar', 'id-beto');
  await sembrar('2026-11-06', [paciente(3, 'UCI', { dias: 1 }), paciente(4, 'UCI')]); // vuelve la misma estancia
  const hoy = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('<p class="candidato__aviso">El 05/11/2026 se marcó como NO entrevistar (por BETO PRUEBA).</p>'));
    assert.equal(cuantos(texto, /class="candidato__aviso"/g), 1, 'solo el que tuvo el rojo');
    const enPorRevisar = texto.indexOf('id="titulo-por-revisar"') < texto.indexOf('El 05/11/2026 se marcó');
    assert.ok(enPorRevisar, 'en "Por revisar" (RN-04)');

    // HU-07.2 · "Entrevistar" funciona igual que en HU-06.
    const respuesta = await decidir(nav, { candidato: String(hoy.id), decision: 'entrevistar', desde: '', dia: '2026-11-06' });
    assert.equal(respuesta.estado, 200);
    assert.equal(hoy.decision, 'entrevistar');
    assert.equal(base.entrevistas.get(hoy.clave)?.candidatoId, hoy.id);
    const despues = await nav.get('/revision');
    assert.equal(cuantos(despues.texto, /class="candidato__aviso"/g), 0, 'ya decidido: el aviso ya no hace falta');
  });
});

test('HU-07.2 · con el aviso, "No entrevistar" también funciona igual', async () => {
  const { app, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-05', [paciente(3, 'UCI', { dias: 0 })]);
  decidirComo(candidato('2026-11-05', '991003').id, 'no_entrevistar', 'id-beto');
  await sembrar('2026-11-06', [paciente(3, 'UCI', { dias: 1 })]);
  const hoy = candidato('2026-11-06', '991003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/revision');
    const respuesta = await decidir(nav, { candidato: String(hoy.id), decision: 'no_entrevistar', desde: '', dia: '2026-11-06' });
    assert.equal(respuesta.estado, 200);
    assert.equal(hoy.decision, 'no_entrevistar');
    assert.equal(hoy.decidido_por, 'id-ana');
  });
});

test('HU-07.3 · RN-02 · la misma cédula con otra fecha de ingreso es otra estancia: sin aviso', async () => {
  const { app, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-05', [paciente(3, 'UCI', { dias: 0, ingreso: '2026-11-05' })]);
  decidirComo(candidato('2026-11-05', '991003').id, 'no_entrevistar', 'id-beto');
  // Salió y volvió a entrar el 06/11: la misma cédula, con otra fecha de ingreso.
  await sembrar('2026-11-06', [paciente(3, 'UCI', { dias: 0, ingreso: '2026-11-06' })]);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('<p class="candidato__nombre">PACIENTE 3 PRUEBA</p>'), 'aparece como candidato');
    assert.equal(cuantos(texto, /class="candidato__aviso"/g), 0);
    assert.ok(!texto.includes('se marcó como NO entrevistar'));
  });
});

test('CL-05 · el nombre de quien decidió sale escapado en el aviso del rojo y en "Ya revisados"', async () => {
  const { app, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-05', [paciente(3, 'UCI', { dias: 0 }), paciente(4, 'UCI', { dias: 0 })]);
  decidirComo(candidato('2026-11-05', '991003').id, 'no_entrevistar', 'id-raro');
  await sembrar('2026-11-06', [paciente(3, 'UCI', { dias: 1 }), paciente(5, 'UCI')]);
  decidirComo(candidato('2026-11-06', '991005').id, 'entrevistar', 'id-raro');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('(por &lt;img src=x onerror=alert(1)&gt;).'), 'en el aviso del rojo anterior');
    assert.ok(texto.includes('🟢 Entrevistar · &lt;img src=x onerror=alert(1)&gt;'), 'en "Ya revisados"');
    assert.ok(!texto.includes('<img src=x'), 'nunca como HTML');
  });
});

test('HU-07.1 · con dos rojos anteriores, el aviso es del más reciente', async () => {
  const { app, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-04', [paciente(3, 'UCI', { dias: 0, ingreso: '2026-11-04' })]);
  decidirComo(candidato('2026-11-04', '991003').id, 'no_entrevistar', 'id-ana');
  await sembrar('2026-11-05', [paciente(3, 'UCI', { dias: 1, ingreso: '2026-11-04' })]);
  decidirComo(candidato('2026-11-05', '991003').id, 'no_entrevistar', 'id-beto');
  await sembrar('2026-11-06', [paciente(3, 'UCI', { dias: 1, ingreso: '2026-11-04' })]);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.ok(texto.includes('El 05/11/2026 se marcó como NO entrevistar (por BETO PRUEBA).'));
    assert.ok(!texto.includes('El 04/11/2026 se marcó'), 'solo el más reciente');
  });
});

test('RN-03 · HU-07 · rojo y después verde en un censo del medio: ya está revisado, sin aviso', async () => {
  const { app, sembrar, candidato, decidirComo } = preparar();
  await sembrar('2026-11-04', [paciente(3, 'UCI', { dias: 0, ingreso: '2026-11-04' })]);
  decidirComo(candidato('2026-11-04', '991003').id, 'no_entrevistar', 'id-ana');
  await sembrar('2026-11-05', [paciente(3, 'UCI', { dias: 1, ingreso: '2026-11-04' })]);
  decidirComo(candidato('2026-11-05', '991003').id, 'entrevistar', 'id-beto'); // verde: ya tiene entrevista
  await sembrar('2026-11-06', [paciente(3, 'UCI', { dias: 1, ingreso: '2026-11-04' })]);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get('/revision');
    assert.equal(cuantos(texto, /class="candidato__aviso"/g), 0);
    assert.ok(texto.includes('<summary>Ya revisados (1)</summary>'));
    assert.ok(texto.includes('<a href="/revision?dia=2026-11-05">Se decidió en el censo del 05/11/2026.</a>'));
  });
});
