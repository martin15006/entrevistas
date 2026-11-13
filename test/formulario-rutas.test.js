'use strict';

// HU-09 · Llenar la entrevista, de punta a punta con el servidor de prueba (Supabase y base falsos).
// Las funciones de verdad (database/10) se prueban en vivo (test-vivo/). Todo es inventado (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearApp } = require('../app');
const { CONFIG, conServidor } = require('./ayudantes/servidor');
const { crearSupabaseFalso, crearNavegador } = require('./ayudantes/supabase-falso');
const { crearBaseFalsa } = require('./ayudantes/datos-falsos');

// 7 de noviembre de 2026 a las 10:00 en Colombia: "hoy" es 2026-11-07.
const AHORA = Date.parse('2026-11-07T15:00:00Z');
const JSON_ACCEPT = { accept: 'application/json' };
const json = (respuesta) => JSON.parse(respuesta.texto);

const cuentas = () => [
  { id: 'id-ana', correo: 'ana@prueba.test', contrasena: 'clave-ana-123', perfil: { nombre: 'ANA PRUEBA', rol: 'usuario', activo: true } },
  { id: 'id-beto', correo: 'beto@prueba.test', contrasena: 'clave-beto-123', perfil: { nombre: 'BETO PRUEBA', rol: 'usuario', activo: true } },
  { id: 'id-raro', correo: 'raro@prueba.test', contrasena: 'clave-raro-123', perfil: { nombre: '<img src=x onerror=alert(1)>', rol: 'usuario', activo: true } },
];

const paciente = (orden, piso, extra = {}) => ({
  cedula: `99300${orden}`, fecha_ingreso: '2026-11-05', nombre: `PACIENTE ${orden} PRUEBA`, nombre_busqueda: `paciente ${orden} prueba`,
  piso, cama: `Cama ${orden}`, dias: 0, orden, ...extra,
});

const completa = (extra = {}) => ({
  edad: '34', fecha_accidente: '2026-11-06', hora_accidente: '18:40', lugar: 'Calle 10 con carrera 5',
  direccion: 'Barrio Prueba', telefono: '3001234567', tipo_declaracion: 'C/M', relato: 'Venía en la moto y lo cerraron.',
  placa: 'abc 12d', ...extra,
});

async function preparar({ reloj = () => AHORA } = {}) {
  const falso = crearSupabaseFalso(cuentas());
  const falsa = crearBaseFalsa({ reloj });
  const app = crearApp(CONFIG, { clientes: falso.clientes, fabricaDeDatos: falsa.fabrica, reloj });
  await falsa.fabrica(null).guardarCenso('2026-11-06', [paciente(3, 'UCI'), paciente(4, 'Observacion')]);
  const candidato = (cedula) => [...falsa.base.censos.get('2026-11-06').candidatos.values()].find((c) => c.cedula === cedula);
  /** Decide en verde y devuelve la entrevista pendiente. */
  const verde = (cedula, por = 'id-ana') => {
    const c = candidato(cedula);
    falsa.decidirComo(c.id, 'entrevistar', por);
    return falsa.base.entrevistas.get(c.clave);
  };
  return { app, ...falsa, verde };
}

async function entrar(servidor, correo = 'ana@prueba.test', contrasena = 'clave-ana-123') {
  const nav = crearNavegador(servidor);
  await nav.get('/login');
  await nav.post('/login', { correo, contrasena });
  return nav;
}

test('RNF-03 · sin sesión, el formulario lleva al login (y con fetch, un 401 para CB-02)', async () => {
  const { app, verde } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = crearNavegador(servidor);
    const pagina = await nav.get(`/entrevistas/${e.id}`);
    assert.deepEqual([pagina.estado, pagina.ubicacion], [303, '/login']);
  });
});

test('HU-09.1 · HU-09.2 · HU-09.3 · arriba los datos fijos del paciente, y los campos en orden con teclado numérico', async () => {
  const { app, verde } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { estado, texto } = await nav.get(`/entrevistas/${e.id}`);
    assert.equal(estado, 200);
    assert.ok(texto.includes('<link rel="stylesheet" href="/css/paginas/entrevista.css">'), 'CL-12');
    assert.ok(texto.includes('<script src="/js/entrevista.js" defer></script>'));
    for (const dato of ['<dt>Cama</dt><dd>Cama 3</dd>', '<dt>Servicio</dt><dd>UCI</dd>', '<dt>Nombre</dt><dd>PACIENTE 3 PRUEBA</dd>', '<dt>Cédula</dt><dd>993003</dd>']) {
      assert.ok(texto.includes(dato), dato);
    }
    assert.ok(!/<input[^>]+name="(cedula|nombre|cama)"/.test(texto), 'HU-09.1: no son campos que se puedan cambiar');

    const orden = ['Edad', 'Fecha del accidente', 'Hora del accidente', 'Lugar del accidente', 'Dirección de residencia',
      'Teléfono', 'Declaración', 'C/M', 'P/M', 'C/A', 'P/A', 'Peatón', 'Ciclista', 'Otro', 'Relato', 'Placa', 'No sabe'];
    const posiciones = orden.map((etiqueta) => texto.indexOf(`>${etiqueta}<`) >= 0 ? texto.indexOf(`>${etiqueta}<`) : texto.indexOf(`${etiqueta}\n`));
    for (const [i, posicion] of posiciones.entries()) assert.ok(posicion > 0, `falta "${orden[i]}"`);
    assert.deepEqual([...posiciones].sort((a, b) => a - b), posiciones, 'en el orden de HU-09.2');

    assert.match(texto, /<input id="edad" name="edad" type="text" inputmode="numeric"/);
    assert.match(texto, /<input id="telefono" name="telefono" type="tel" inputmode="numeric"/);
    // PYA tanda 9 · El largo se mide después de dejar solo los números: pegar "300 123 4567" no se corta.
    assert.match(texto, /id="telefono"[^>]* maxlength="20"/);
    assert.match(texto, /id="edad"[^>]* maxlength="20"/);
    assert.match(texto, /<input id="fecha_accidente" name="fecha_accidente" type="date" max="2026-11-07"/, 'HU-09.6: no deja elegir un día posterior');
    assert.match(texto, /<textarea id="relato" name="relato" rows="5" maxlength="500"/, 'CB-12');
    assert.ok(texto.includes('<p id="contador-relato" class="declaracion__contador" aria-live="polite">0/500</p>'));
    assert.ok(texto.includes('<button id="guardar" type="submit" class="boton">Guardar entrevista</button>'));
    assert.ok(texto.includes('<a id="volver" class="boton boton--secundario" href="/entrevistas">Volver</a>'));
    // HU-09.8 · RNF-11 · La pregunta de salir sin guardar está en la página, con sus dos botones.
    assert.ok(texto.includes('<p id="texto-salir">Tienes cambios sin guardar. ¿Salir sin guardar?</p>'));
    assert.ok(texto.includes('>Seguir editando</button>') && texto.includes('>Salir sin guardar</a>'));
  });
});

test('CB-20 · una entrevista que no existe (o una dirección rara) dice "No encontramos esa entrevista."', async () => {
  const { app } = await preparar();
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const nada = await nav.get('/entrevistas/999999');
    assert.equal(nada.estado, 404);
    assert.ok(nada.texto.includes('No encontramos esa entrevista.'));
    const rara = await nav.get('/entrevistas/abc');
    assert.equal(rara.estado, 404);
    assert.ok(rara.texto.includes('No encontramos esa página.'));
  });
});

test('HU-09.9 · RN-13 · si otra persona la abrió hace menos de 15 minutos, primero se avisa; "Abrir igual" la abre', async () => {
  let ahora = AHORA;
  const { app, verde } = await preparar({ reloj: () => ahora });
  const e = Object.assign(verde('993003'), { enCursoPor: 'id-beto', enCursoDesde: new Date(AHORA - 5 * 60 * 1000).toISOString() });
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const aviso = (await nav.get(`/entrevistas/${e.id}`)).texto;
    assert.ok(aviso.includes('<p>BETO PRUEBA está haciendo esta entrevista. ¿Abrirla igual?</p>'));
    assert.ok(aviso.includes(`<a class="boton" href="/entrevistas/${e.id}?igual=1">Abrir igual</a>`));
    assert.ok(aviso.includes('<a class="boton boton--secundario" href="/entrevistas">Volver</a>'));
    assert.ok(!aviso.includes('name="edad"'), 'todavía no se ve el formulario');
    assert.ok(!aviso.includes('/js/entrevista.js'), 'ni se marca "En curso" a mi nombre');

    assert.ok((await nav.get(`/entrevistas/${e.id}?igual=1`)).texto.includes('name="edad"'));
    ahora = AHORA + 10 * 60 * 1000; // 15 minutos desde que Beto la abrió: ya no se avisa (CB-27)
    assert.ok((await nav.get(`/entrevistas/${e.id}`)).texto.includes('name="edad"'));
  });
});

test('RN-13 · abrir la marca "En curso" a mi nombre y da su hora; soltar suelta solo ESA apertura; ambas piden el token', async () => {
  let ahora = AHORA;
  const { app, verde, base } = await preparar({ reloj: () => ahora });
  const e = verde('993003');
  const otra = Object.assign(verde('993004'), { enCursoPor: 'id-beto', enCursoDesde: new Date(AHORA).toISOString() });
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    const abrir = await nav.post(`/entrevistas/${e.id}/abrir`, {}, JSON_ACCEPT);
    assert.equal(abrir.estado, 200);
    const { desde } = json(abrir);
    assert.equal(desde, new Date(AHORA).toISOString());
    assert.equal(e.enCursoPor, 'id-ana');

    // Recargar: otra apertura (otra hora). La pantalla vieja, al irse, no suelta la nueva.
    ahora = AHORA + 1000;
    const otraVez = json(await nav.post(`/entrevistas/${e.id}/abrir`, {}, JSON_ACCEPT)).desde;
    assert.equal((await nav.post(`/entrevistas/${e.id}/soltar`, { desde }, JSON_ACCEPT)).estado, 204);
    assert.equal(e.enCursoPor, 'id-ana', 'la apertura vieja no suelta la nueva');
    await nav.post(`/entrevistas/${e.id}/soltar`, { desde: otraVez }, JSON_ACCEPT);
    assert.equal(e.enCursoPor, null, 'la de esta pantalla sí');

    await nav.post(`/entrevistas/${otra.id}/soltar`, { desde: otra.enCursoDesde }, JSON_ACCEPT);
    assert.equal(otra.enCursoPor, 'id-beto', 'la de otra persona no se suelta');
    assert.equal((await nav.post(`/entrevistas/${e.id}/soltar`, {}, JSON_ACCEPT)).estado, 400, 'sin la hora, no');

    const sinToken = await nav.post(`/entrevistas/${e.id}/abrir`, { _csrf: 'otro' }, JSON_ACCEPT);
    assert.equal(sinToken.estado, 403);
    assert.equal(base.aperturas.length, 2, 'sin el token, ni se llega a la base');
    assert.equal((await nav.post('/entrevistas/999999/abrir', {}, JSON_ACCEPT)).estado, 404);
  });
});

test('HU-09.9 · RN-13 · si otra persona la abrió un momento antes, abrir no se la quita sin "Abrir igual"', async () => {
  const { app, verde, base } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`); // la página se pintó sin aviso…
    Object.assign(e, { enCursoPor: 'id-beto', enCursoDesde: new Date(AHORA).toISOString() }); // …y Beto la abrió justo antes
    const sinIgual = await nav.post(`/entrevistas/${e.id}/abrir`, {}, JSON_ACCEPT);
    assert.equal(sinIgual.estado, 409);
    assert.deepEqual(json(sinIgual), { error: 'BETO PRUEBA está haciendo esta entrevista. ¿Abrirla igual?', codigo: 'en_curso' });
    assert.equal(e.enCursoPor, 'id-beto', 'no se la quitó');
    const conIgual = await nav.post(`/entrevistas/${e.id}/abrir`, { igual: '1' }, JSON_ACCEPT);
    assert.equal(conIgual.estado, 200);
    assert.equal(e.enCursoPor, 'id-ana', '"Abrir igual" sí');
    assert.deepEqual(base.aperturas.map((a) => a.igual), [false, true]);
    // La pantalla con "Abrir igual" se lo dice al JavaScript.
    assert.ok((await nav.get(`/entrevistas/${e.id}?igual=1`)).texto.includes('data-igual="1"'));
    assert.ok((await nav.get(`/entrevistas/${e.id}`)).texto.includes('data-igual=""'));
  });
});

test('RN-13 · al cerrar sesión se sueltan las entrevistas que tenía abiertas', async () => {
  const { app, verde, base } = await preparar();
  const mia = Object.assign(verde('993003'), { enCursoPor: 'id-ana', enCursoDesde: new Date(AHORA).toISOString() });
  const deBeto = Object.assign(verde('993004'), { enCursoPor: 'id-beto', enCursoDesde: new Date(AHORA).toISOString() });
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get('/entrevistas');
    assert.equal((await nav.post('/salir')).ubicacion, '/login');
    assert.deepEqual(base.soltadasTodas, ['id-ana']);
    assert.equal(mia.enCursoPor, null);
    assert.equal(deBeto.enCursoPor, 'id-beto', 'la de otra persona sigue');
  });
});

test('HU-09.4 · HU-09.7 · con lo obligatorio, se guarda, pasa a Entrevistado y vuelve a Pendientes con "Entrevista guardada."', async () => {
  const { app, verde, base } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    const respuesta = await nav.post(`/entrevistas/${e.id}`, completa(), JSON_ACCEPT);
    assert.equal(respuesta.estado, 200);
    assert.deepEqual(json(respuesta), { ok: true, ir: '/entrevistas?guardada=1' });
    assert.equal(e.estado, 'entrevistado');
    assert.equal(e.entrevistadoPor, 'id-ana', 'RN-08');
    assert.deepEqual(base.guardados[0].datos, {
      edad: 34, fecha_accidente: '2026-11-06', hora_accidente: '18:40', lugar: 'Calle 10 con carrera 5', direccion: 'Barrio Prueba',
      telefono: '3001234567', tipo_declaracion: 'C/M', relato: 'Venía en la moto y lo cerraron.', placa: 'ABC12D', placa_no_sabe: false,
    });

    const pendientes = (await nav.get('/entrevistas?guardada=1')).texto;
    assert.ok(pendientes.includes('<p class="aviso aviso--exito" role="status">Entrevista guardada.</p>'));
    assert.ok(pendientes.includes('Pendientes (0)'));
    assert.ok((await nav.get('/entrevistas?pestana=entrevistados')).texto.includes('Censo del 06/11/2026 · ANA PRUEBA · 10:00'), 'enmienda 5: hecha hoy');
  });
});

test('HU-09.4 · sin JavaScript, el mismo formulario guarda y lleva a Pendientes', async () => {
  const { app, verde } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    const respuesta = await nav.post(`/entrevistas/${e.id}`, completa());
    assert.deepEqual([respuesta.estado, respuesta.ubicacion], [303, '/entrevistas?guardada=1']);
    assert.equal(e.estado, 'entrevistado');
  });
});

test('HU-09.5 · HU-09.6 · lo que falta o está fuera de las reglas no se guarda, con su texto bajo cada campo', async () => {
  const { app, verde, base } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    const conJs = await nav.post(`/entrevistas/${e.id}`, completa({ edad: '', lugar: '', telefono: '12', placa: 'ABCDEFGH', fecha_accidente: '2026-11-08' }), JSON_ACCEPT);
    assert.equal(conJs.estado, 422);
    assert.deepEqual(json(conJs), {
      primero: 'edad',
      errores: {
        edad: 'Falta este dato.', fecha_accidente: 'La fecha del accidente no puede ser posterior a hoy.', lugar: 'Falta este dato.',
        telefono: 'El teléfono debe tener entre 7 y 10 números.', placa: 'La placa tiene hasta 7 letras o números.',
      },
    });
    assert.deepEqual(json(await nav.post(`/entrevistas/${e.id}`, completa({ edad: '121' }), JSON_ACCEPT)).errores, { edad: 'La edad debe estar entre 0 y 120.' });
    assert.equal(base.guardados.length, 0, 'ni se llega a la base');
    assert.equal(e.estado, 'pendiente');

    // Sin JavaScript: la página vuelve con lo escrito y los textos bajo cada campo.
    const sinJs = await nav.post(`/entrevistas/${e.id}`, completa({ edad: '', relato: 'Lo que pasó' }));
    assert.equal(sinJs.estado, 422);
    assert.ok(sinJs.texto.includes('<p id="error-edad" class="campo__error">Falta este dato.</p>'));
    assert.ok(sinJs.texto.includes('value="Calle 10 con carrera 5"'), 'todo lo escrito sigue ahí');
    assert.ok(sinJs.texto.includes('>Lo que pasó</textarea>'));
    assert.match(sinJs.texto, /id="tipo-cm" name="tipo_declaracion" value="C\/M" checked/);
  });
});

test('CB-17 · si otra persona la guardó un momento antes, gana la primera y no se pisa nada', async () => {
  const { app, verde, fabrica } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    // Beto la guarda primero (como si lo hiciera desde su celular).
    const beto = fabrica({ auth: { getUser: async () => ({ data: { user: { id: 'id-beto' } } }) } });
    await beto.guardarEntrevista(e.id, { edad: 50, fecha_accidente: '2026-11-06', lugar: 'Otro lugar', tipo_declaracion: 'P/M', relato: 'Lo de Beto.' });
    const respuesta = await nav.post(`/entrevistas/${e.id}`, completa(), JSON_ACCEPT);
    assert.equal(respuesta.estado, 409);
    assert.deepEqual(json(respuesta), { error: 'BETO PRUEBA guardó esta entrevista hace un momento. Recarga para ver sus datos.', codigo: 'ya_entrevistado' });
    assert.equal(e.datos.relato, 'Lo de Beto.', 'no se pisó');
    assert.equal(e.entrevistadoPor, 'id-beto');
  });
});

test('CB-24 · PYA tanda 9 · un segundo guardado mío con OTROS datos no se traga en silencio: no pisa y avisa', async () => {
  const { app, verde } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    assert.equal((await nav.post(`/entrevistas/${e.id}`, completa(), JSON_ACCEPT)).estado, 200);
    const otro = await nav.post(`/entrevistas/${e.id}`, completa({ edad: '38' }), JSON_ACCEPT);
    assert.equal(otro.estado, 409);
    assert.equal(json(otro).error, 'ANA PRUEBA guardó esta entrevista hace un momento. Recarga para ver sus datos.');
    assert.equal(e.datos.edad, 34, 'no se pisó (corregir es HU-11)');
  });
});

test('HU-09.6 · PYA tanda 9 · si a medianoche la base ya dice que la fecha es posterior a hoy, se avisa en el campo', async () => {
  const { app, verde, base } = await preparar();
  const e = verde('993003');
  base.hoyDeLaBase = '2026-11-06'; // el reloj de la base va un día atrás del servidor (07/11)
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    const respuesta = await nav.post(`/entrevistas/${e.id}`, completa({ fecha_accidente: '2026-11-07' }), JSON_ACCEPT);
    assert.equal(respuesta.estado, 422);
    assert.deepEqual(json(respuesta), { primero: 'fecha_accidente', errores: { fecha_accidente: 'La fecha del accidente no puede ser posterior a hoy.' } });
    assert.equal(e.estado, 'pendiente');
  });
});

test('RN-10 · PYA tanda 9 · un lugar o un relato hechos solo de espacios, saltos o invisibles no cuentan', async () => {
  const { app, verde, base } = await preparar();
  const e = verde('993003');
  const invisible = String.fromCharCode(0x200b);
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    const respuesta = await nav.post(`/entrevistas/${e.id}`, completa({ lugar: '\t\n ', relato: `${invisible}\r\n${invisible}` }), JSON_ACCEPT);
    assert.equal(respuesta.estado, 422);
    assert.deepEqual(json(respuesta).errores, { lugar: 'Falta este dato.', relato: 'Falta este dato.' });
    assert.equal(base.guardados.length, 0);
  });
});

test('CB-24 · el mismo guardado que llega dos veces se guarda una sola vez', async () => {
  const { app, verde } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    const [uno, dos] = await Promise.all([
      nav.post(`/entrevistas/${e.id}`, completa(), JSON_ACCEPT),
      nav.post(`/entrevistas/${e.id}`, completa(), JSON_ACCEPT),
    ]);
    assert.deepEqual([uno.estado, dos.estado], [200, 200]);
    assert.equal(e.entrevistadoPor, 'id-ana');
  });
});

test('base · si mientras se llenaba alguien marcó "Salió" o la cambió a rojo, se dice por qué y no se guarda', async () => {
  const { app, verde, decidirComo, base } = await preparar();
  const salio = verde('993003');
  const roja = verde('993004');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${salio.id}`);
    Object.assign(salio, { estado: 'salio', salioPor: 'id-beto', salioEn: new Date(AHORA).toISOString() });
    const r1 = await nav.post(`/entrevistas/${salio.id}`, completa(), JSON_ACCEPT);
    assert.deepEqual([r1.estado, json(r1).error], [409, 'BETO PRUEBA marcó que este paciente salió. No se guardó: lo escrito sigue aquí.']);

    decidirComo(roja.candidatoId, 'no_entrevistar', 'id-beto');
    const r2 = await nav.post(`/entrevistas/${roja.id}`, completa(), JSON_ACCEPT);
    assert.deepEqual([r2.estado, json(r2).error], [409, 'Esta entrevista ya no existe: alguien la marcó como «No entrevistar».']);
    assert.equal(salio.estado, 'salio');
    assert.equal(base.entrevistas.size, 1);

    // Sin JavaScript, la página vuelve con lo escrito y el aviso arriba.
    const sinJs = await nav.post(`/entrevistas/${salio.id}`, completa());
    assert.equal(sinJs.estado, 409);
    assert.ok(sinJs.texto.includes('BETO PRUEBA marcó que este paciente salió.'));
    assert.ok(sinJs.texto.includes('value="Calle 10 con carrera 5"'));
  });
});

test('base · una que ya no está pendiente no se puede llenar desde su dirección', async () => {
  const { app, verde } = await preparar();
  const e = Object.assign(verde('993003'), { estado: 'entrevistado', entrevistadoPor: 'id-beto', entrevistadoEn: new Date(AHORA).toISOString() });
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { estado, texto } = await nav.get(`/entrevistas/${e.id}`);
    assert.equal(estado, 200);
    assert.ok(texto.includes('Esta entrevista ya no está pendiente.'));
    assert.ok(!texto.includes('name="edad"'));
    assert.equal((await nav.post(`/entrevistas/${e.id}/abrir`, {}, JSON_ACCEPT)).estado, 409);
  });
});

test('base · lo que el formulario no puede mandar se rechaza sin llegar a la base', async () => {
  const { app, verde, base } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    for (const cambio of [{ tipo_declaracion: 'MOTO' }, { hora_accidente: '99:99' }, { lugar: 'x'.repeat(201) }]) {
      const respuesta = await nav.post(`/entrevistas/${e.id}`, completa(cambio), JSON_ACCEPT);
      assert.equal(respuesta.estado, 400, JSON.stringify(cambio));
    }
    assert.equal(base.guardados.length, 0);
  });
});

test('CB-02 · con la sesión vencida, guardar responde 401 con el texto exacto; al volver a entrar, /token da el nuevo y se guarda', async () => {
  const { app, verde } = await preparar();
  const e = verde('993003');
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    await nav.get(`/entrevistas/${e.id}`);
    const tokenViejo = nav.token;
    // La sesión de Supabase se perdió (por ejemplo, se cerró en otro equipo): solo quedan las cookies propias.
    for (const nombre of [...nav.cookies.keys()]) if (nombre.startsWith('sb-')) nav.cookies.delete(nombre);
    const vencida = await nav.post(`/entrevistas/${e.id}`, completa(), JSON_ACCEPT);
    assert.equal(vencida.estado, 401);
    assert.deepEqual(json(vencida), {
      error: 'Tu sesión se cerró. Toca «Iniciar sesión» (se abre en otra pestaña), entra y vuelve a tocar Guardar: lo que escribiste sigue aquí.',
      codigo: 'sesion',
    });
    assert.equal(e.estado, 'pendiente');

    // Entra otra vez (en "otra pestaña": el mismo navegador). El token cambió al entrar.
    await nav.post('/login', { correo: 'ana@prueba.test', contrasena: 'clave-ana-123' });
    const viejo = await nav.post(`/entrevistas/${e.id}`, completa({ _csrf: tokenViejo }), { ...JSON_ACCEPT });
    assert.equal(viejo.estado, 403, 'con el token de antes ya no sirve');
    const nuevo = json(await nav.get('/token', JSON_ACCEPT)).token;
    assert.ok(nuevo && nuevo !== tokenViejo);
    const guardada = await nav.post(`/entrevistas/${e.id}`, completa({ _csrf: nuevo }), JSON_ACCEPT);
    assert.equal(guardada.estado, 200);
    assert.equal(e.estado, 'entrevistado');
  });
});

test('CL-05 · el nombre de quien la está haciendo y el del paciente salen escapados', async () => {
  const { app, verde } = await preparar();
  const e = Object.assign(verde('993003'), { enCursoPor: 'id-raro', enCursoDesde: new Date(AHORA).toISOString() });
  await conServidor(app, async (servidor) => {
    const nav = await entrar(servidor);
    const { texto } = await nav.get(`/entrevistas/${e.id}`);
    assert.ok(texto.includes('&lt;img src=x onerror=alert(1)&gt; está haciendo esta entrevista.'));
    assert.ok(!texto.includes('<img src=x'));
  });
});
