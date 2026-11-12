'use strict';

// HU-04 · Subir el censo, de punta a punta con el servidor de prueba (Supabase y base falsos).
// Todos los censos son inventados (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { crearApp } = require('../app');
const { CONFIG, conServidor } = require('./ayudantes/servidor');
const { crearSupabaseFalso, crearNavegador } = require('./ayudantes/supabase-falso');
const { crearBaseFalsa } = require('./ayudantes/datos-falsos');
const { inventarFilas, escribirCenso, escribirCensoXls } = require('../scripts/censo-de-prueba');
const { leerCenso, TAMANO_MAXIMO } = require('../lib/censo');
const { armarResumen } = require('../lib/resumen-censo');
const { esCandidato } = require('../lib/reglas');

const NO_ES_XLSX = 'El archivo debe ser el censo en Excel (.xlsx o .xls).';
const MUY_GRANDE = 'El archivo pesa más de 5 MB. El censo normal pesa mucho menos: revisa que sea el archivo correcto.';
const SIN_ENCABEZADOS = 'Este archivo no parece el censo consolidado: no encontré las columnas Piso, Cama Asignada, Identificación, Nombre, Fecha Ingreso y Días.';
const YA_EXISTE = 'Ya hay un censo del 06/11/2026. Se agregarán solo los pacientes nuevos; lo que ya se revisó se conserva.';
const FECHA_NO_VALIDA = 'Elige una fecha del censo que exista y que no sea posterior a hoy.';

// 7 de noviembre de 2026 a las 10:00 en Colombia: "hoy" es 2026-11-07.
const AHORA = Date.parse('2026-11-07T15:00:00Z');

const cuentas = () => [
  { id: 'id-ana', correo: 'ana@prueba.test', contrasena: 'clave-ana-123', perfil: { nombre: 'ANA PRUEBA', rol: 'usuario', activo: true } },
];

function preparar() {
  const falso = crearSupabaseFalso(cuentas());
  const { base, fabrica } = crearBaseFalsa();
  const app = crearApp(CONFIG, { clientes: falso.clientes, fabricaDeDatos: fabrica, reloj: () => AHORA });
  return { app, base };
}

/** Entra como Ana y abre "Subir censo" (así el navegador tiene el token de esa página). */
async function entrarYAbrirCenso(base) {
  const nav = crearNavegador(base);
  await nav.get('/login');
  await nav.post('/login', { correo: 'ana@prueba.test', contrasena: 'clave-ana-123' });
  const pagina = await nav.get('/censo');
  assert.equal(pagina.estado, 200);
  return { nav, pagina };
}

const json = (respuesta) => JSON.parse(respuesta.texto);
const censoDe47 = () => escribirCenso(inventarFilas({ cantidad: 47, fecha: '2026-11-06' }), { fecha: '2026-11-06' });

test('HU-04.1 · "Subir censo" tiene el selector de archivo y el botón "Leer censo"', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const { pagina } = await entrarYAbrirCenso(base);
    assert.ok(pagina.texto.includes('<h1 id="titulo-censo">Subir censo</h1>'));
    assert.ok(pagina.texto.includes('accept=".xlsx,.xls,'), 'enmienda 4: también el .xls del sistema');
    assert.ok(pagina.texto.includes('application/vnd.ms-excel'));
    assert.ok(pagina.texto.includes('(.xlsx o .xls, como lo descarga el sistema)'));
    assert.ok(pagina.texto.includes('>Leer censo</button>'));
    assert.ok(pagina.texto.includes('>Confirmar</button>') && pagina.texto.includes('>Cancelar</button>'));
    assert.ok(pagina.texto.includes('<script src="/js/censo.js" defer></script>'));
  });
});

test('HU-04.1 · HU-04.2 · leer da el resumen y NO guarda nada ("Cancelar" no deja rastro)', async () => {
  const { app, base } = preparar();
  const archivo = await censoDe47();
  const esperado = armarResumen(await leerCenso(archivo));
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    const respuesta = await nav.subir('/censo/leer', archivo);
    assert.equal(respuesta.estado, 200);
    const resumen = json(respuesta);
    assert.equal(resumen.linea, `Censo del 06/11/2026 · 47 pacientes · ${esperado.paraRevisar} para revisar`);
    assert.ok(esperado.paraRevisar > 0);
    assert.equal(resumen.sinFecha, false);
    assert.deepEqual(resumen.avisos, []);
    assert.equal(base.llamadas.length, 0, 'leer no guarda nada');
    assert.equal(base.censos.size, 0);
  });
});

test('HU-04.2 · al confirmar se guardan solo los candidatos y se va a la revisión de ese día', async () => {
  const { app, base } = preparar();
  const archivo = await censoDe47();
  const candidatos = (await leerCenso(archivo)).filas.filter(esCandidato);
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    const respuesta = await nav.subir('/censo/guardar', archivo);
    assert.equal(respuesta.estado, 200);
    const datos = json(respuesta);
    assert.equal(datos.redirigir, '/revision?dia=2026-11-06');
    assert.equal(datos.agregados, candidatos.length);

    assert.equal(base.llamadas.length, 1);
    assert.equal(base.llamadas[0].fecha, '2026-11-06');
    assert.deepEqual(base.llamadas[0].filas.map((f) => f.cedula), candidatos.map((f) => f.cedula));

    const revision = await nav.get(datos.redirigir);
    assert.equal(revision.estado, 200);
    assert.ok(revision.texto.includes('Revisión del censo del 06/11/2026'));
    // HU-04.2 → HU-05: los candidatos guardados están todos "Por revisar".
    assert.ok(revision.texto.includes('<h2 id="titulo-por-revisar">Por revisar</h2>'));
    assert.equal((revision.texto.match(/<li class="candidato" /g) ?? []).length, candidatos.length);
  });
});

test('RNF-04 · CL-02 · a la base solo le llega lo permitido: ni entidad, ni médicos, ni siniestro, ni edad', async () => {
  const { app, base } = preparar();
  const archivo = await censoDe47();
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    await nav.subir('/censo/guardar', archivo);
  });
  const enviado = JSON.stringify(base.llamadas);
  for (const prohibido of ['SEGUROS FICTICIOS', 'ASEGURADORA DE PRUEBA', 'EPS DE PRUEBA', 'MEDICO DE PRUEBA', 'edad', 'admision', 'siniestro', 'consumo', 'entidad']) {
    assert.ok(!enviado.includes(prohibido), `no debe llegar "${prohibido}"`);
  }
  for (const candidato of base.llamadas[0].filas) {
    assert.deepEqual(Object.keys(candidato).sort(), ['cama', 'cedula', 'dias', 'fecha_ingreso', 'nombre', 'nombre_busqueda', 'orden', 'piso']);
    assert.ok(candidato.dias === 0 || candidato.dias === 1);
  }
});

test('HU-04.3 · un archivo que no es .xlsx se rechaza con el mensaje exacto', async () => {
  const { app, base } = preparar();
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    for (const ruta of ['/censo/leer', '/censo/guardar']) {
      const respuesta = await nav.subir(ruta, Buffer.from('Censo en texto plano, no en Excel'));
      assert.equal(respuesta.estado, 400);
      assert.deepEqual(json(respuesta), { error: NO_ES_XLSX, codigo: 'NO_ES_XLSX' });
    }
    const vacio = await nav.subir('/censo/leer', Buffer.alloc(0));
    assert.equal(json(vacio).error, NO_ES_XLSX);
    assert.equal(base.llamadas.length, 0);
  });
});

test('HU-04.4 · un .xlsx sin las columnas del censo se rechaza con el mensaje exacto', async () => {
  const { app } = preparar();
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet('Pedidos').addRow(['Producto', 'Precio']);
  const otro = Buffer.from(await libro.xlsx.writeBuffer());
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    const respuesta = await nav.subir('/censo/leer', otro);
    assert.equal(respuesta.estado, 400);
    assert.equal(json(respuesta).error, SIN_ENCABEZADOS);
  });
});

test('HU-04.5 · sin "Generado el": la página trae el selector con hoy (y no deja pasar de hoy)', async () => {
  const { app } = preparar();
  await conServidor(app, async (servidor) => {
    const { pagina } = await entrarYAbrirCenso(servidor);
    assert.ok(pagina.texto.includes('No encontré la fecha del censo. Elígela:'));
    assert.ok(pagina.texto.includes('<input type="date" id="fecha" value="2026-11-07" max="2026-11-07">'));
  });
});

test('HU-04.5 · sin "Generado el", el resumen pide la fecha y se guarda con la elegida', async () => {
  const { app, base } = preparar();
  const sinFecha = await escribirCenso(inventarFilas({ cantidad: 20, fecha: '2026-11-05' }), { sinFecha: true });
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);

    const sinElegir = json(await nav.subir('/censo/leer', sinFecha));
    assert.equal(sinElegir.sinFecha, true);
    assert.equal(sinElegir.fecha, null);
    assert.match(sinElegir.linea, /^Censo · 20 pacientes · \d+ para revisar$/);

    const elegida = json(await nav.subir('/censo/leer?fecha=2026-11-05', sinFecha));
    assert.equal(elegida.fecha, '2026-11-05');
    assert.match(elegida.linea, /^Censo del 05\/11\/2026 · /);

    // Sin fecha no se guarda; con la elegida, sí.
    const sinGuardar = await nav.subir('/censo/guardar', sinFecha);
    assert.equal(sinGuardar.estado, 400);
    assert.equal(json(sinGuardar).error, FECHA_NO_VALIDA);
    const guardado = json(await nav.subir('/censo/guardar?fecha=2026-11-05', sinFecha));
    assert.equal(guardado.redirigir, '/revision?dia=2026-11-05');
    assert.equal(base.llamadas.length, 1);
  });
});

test('HU-04.5 · la fecha elegida debe existir y no pasar de hoy (hoy sí, mañana no)', async () => {
  const { app, base } = preparar();
  const sinFecha = await escribirCenso(inventarFilas({ cantidad: 5 }), { sinFecha: true });
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    assert.equal(json(await nav.subir('/censo/leer?fecha=2026-11-07', sinFecha)).fecha, '2026-11-07', 'hoy sirve');
    for (const mala of ['2026-11-08', '2026-02-30', 'ayer', '2026-11-07T00:00']) {
      const resumen = json(await nav.subir(`/censo/leer?fecha=${encodeURIComponent(mala)}`, sinFecha));
      assert.equal(resumen.fecha, null, mala);
      assert.ok(resumen.avisos.includes(FECHA_NO_VALIDA), mala);
      assert.equal((await nav.subir(`/censo/guardar?fecha=${encodeURIComponent(mala)}`, sinFecha)).estado, 400, mala);
    }
    assert.equal(base.llamadas.length, 0);
  });
});

test('HU-04.5 · un archivo con fecha posterior a hoy se rechaza (hoy sí, mañana no) (PYA tanda 4)', async () => {
  const { app, base } = preparar();
  const deManana = await escribirCenso(inventarFilas({ cantidad: 5, fecha: '2026-11-08' }), { fecha: '2026-11-08' });
  const deHoy = await escribirCenso(inventarFilas({ cantidad: 5, fecha: '2026-11-07' }), { fecha: '2026-11-07' });
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    for (const ruta of ['/censo/leer', '/censo/guardar']) {
      const respuesta = await nav.subir(ruta, deManana);
      assert.equal(respuesta.estado, 400, ruta);
      assert.deepEqual(json(respuesta), {
        error: 'La fecha del censo (08/11/2026) es posterior a hoy. Revisa que sea el archivo correcto.',
        codigo: 'FECHA_FUTURA',
      });
    }
    assert.equal(base.llamadas.length, 0);
    assert.equal(json(await nav.subir('/censo/leer', deHoy)).fecha, '2026-11-07', 'hoy sí sirve');
  });
});

test('HU-04.5 · si el archivo SÍ trae fecha, una fecha elegida se ignora', async () => {
  const { app, base } = preparar();
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    const guardado = json(await nav.subir('/censo/guardar?fecha=2026-11-01', await censoDe47()));
    assert.equal(guardado.redirigir, '/revision?dia=2026-11-06');
    assert.equal(base.llamadas[0].fecha, '2026-11-06');
  });
});

test('HU-04.6 · 5 MB pasa el control de tamaño; 5 MB + 1 byte se corta con el mensaje exacto', async () => {
  const { app, base } = preparar();
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    const justo = await nav.subir('/censo/leer', Buffer.alloc(TAMANO_MAXIMO));
    assert.equal(justo.estado, 400);
    assert.equal(json(justo).error, NO_ES_XLSX, 'pasó el tamaño; se rechaza por no ser un .xlsx');

    for (const ruta of ['/censo/leer', '/censo/guardar']) {
      const grande = await nav.subir(ruta, Buffer.alloc(TAMANO_MAXIMO + 1));
      assert.equal(grande.estado, 413);
      assert.deepEqual(json(grande), { error: MUY_GRANDE, codigo: 'MUY_GRANDE' });
    }
    assert.equal(base.llamadas.length, 0);
  });
});

test('HU-04.7 · CB-03 · al subir otra vez el censo del mismo día: aviso, y solo se agregan los nuevos', async () => {
  const { app, base } = preparar();
  const primero = await escribirCenso(inventarFilas({ cantidad: 30, fecha: '2026-11-06', semilla: 4 }), { fecha: '2026-11-06' });
  const segundo = await escribirCenso(inventarFilas({ cantidad: 47, fecha: '2026-11-06', semilla: 4 }), { fecha: '2026-11-06' });
  const nuevos = (await leerCenso(segundo)).filas.filter(esCandidato).length - (await leerCenso(primero)).filas.filter(esCandidato).length;
  assert.ok(nuevos > 0, 'el segundo censo trae pacientes nuevos');

  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    assert.deepEqual(json(await nav.subir('/censo/leer', primero)).avisos, [], 'la primera vez no hay aviso');
    await nav.subir('/censo/guardar', primero);

    // Alguien ya decidió sobre uno de los candidatos.
    const yaDecidido = [...base.censos.get('2026-11-06').candidatos.values()][0];
    yaDecidido.decision = 'entrevistar';

    const resumen = json(await nav.subir('/censo/leer', segundo));
    assert.deepEqual(resumen.avisos, [YA_EXISTE]);
    const guardado = json(await nav.subir('/censo/guardar', segundo));
    assert.equal(guardado.agregados, nuevos);
    assert.equal(yaDecidido.decision, 'entrevistar', 'lo que ya se revisó se conserva');
    assert.equal(base.censos.size, 1, 'sigue habiendo un solo censo de ese día');
  });
});

test('CB-04 · CB-05 · el resumen del servidor trae las filas saltadas y las cédulas repetidas', async () => {
  const { app } = preparar();
  const conProblemas = await escribirCenso(inventarFilas({ cantidad: 3, casosBorde: true }));
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    const resumen = json(await nav.subir('/censo/leer', conProblemas));
    assert.ok(resumen.avisos.includes('3 filas no se pudieron leer (filas 9, 10 y 12).'));
    assert.ok(resumen.avisos.includes('Una cédula aparece 2 veces; se tomó la fila 4.'));
  });
});

test('RNF-06 · subir sin el token anti-falsificación se rechaza y no guarda nada', async () => {
  const { app, base } = preparar();
  const archivo = await censoDe47();
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    const respuesta = await nav.subir('/censo/guardar', archivo, { 'x-csrf-token': 'inventado' });
    assert.equal(respuesta.estado, 403);
    assert.equal(base.llamadas.length, 0);
  });
});

test('RNF-03 · CB-02 · sin sesión, leer o guardar responde 401 (la pantalla lleva al login)', async () => {
  const { app, base } = preparar();
  const archivo = await censoDe47();
  await conServidor(app, async (servidor) => {
    const nav = crearNavegador(servidor);
    await nav.get('/login'); // solo para tener un token válido
    for (const ruta of ['/censo/leer', '/censo/guardar']) {
      const respuesta = await nav.subir(ruta, archivo);
      assert.equal(respuesta.estado, 401, ruta);
      assert.equal(json(respuesta).codigo, 'sesion');
    }
    assert.equal(base.llamadas.length, 0);
  });
});

test('RNF-01 · del archivo de 300 filas al resumen en menos de 3 segundos', async () => {
  const { app } = preparar();
  const archivo = await escribirCenso(inventarFilas({ cantidad: 300 }));
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    await nav.subir('/censo/leer', await censoDe47()); // el servidor real lo precalienta al arrancar
    const inicio = performance.now();
    const respuesta = await nav.subir('/censo/leer', archivo);
    const milisegundos = performance.now() - inicio;
    assert.equal(respuesta.estado, 200);
    assert.match(json(respuesta).linea, / 300 pacientes /);
    assert.ok(milisegundos < 3000, `tardó ${Math.round(milisegundos)} ms`);
  });
});

test('HU-04.1 · HU-04.2 · enmienda 4 · el .xls del sistema da el mismo resumen y se guarda igual', async () => {
  const { app, base } = preparar();
  const filas = inventarFilas({ cantidad: 47, fecha: '2026-11-06' });
  const xlsx = await escribirCenso(filas, { fecha: '2026-11-06' });
  const xls = escribirCensoXls(filas, { fecha: '2026-11-06' });
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    const resumenXlsx = json(await nav.subir('/censo/leer', xlsx));
    const respuesta = await nav.subir('/censo/leer', xls);
    assert.equal(respuesta.estado, 200);
    assert.deepEqual(json(respuesta), resumenXlsx);
    assert.equal(base.llamadas.length, 0, 'leer no guarda nada');

    const guardado = json(await nav.subir('/censo/guardar', xls));
    assert.equal(guardado.redirigir, '/revision?dia=2026-11-06');
    assert.equal(base.llamadas.length, 1);
    assert.ok(guardado.agregados > 0);
  });
});

test('HU-04.10 · subir un .xls binario viejo da su propio mensaje y no guarda nada', async () => {
  const { app, base } = preparar();
  const viejo = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(1024)]);
  await conServidor(app, async (servidor) => {
    const { nav } = await entrarYAbrirCenso(servidor);
    for (const ruta of ['/censo/leer', '/censo/guardar']) {
      const respuesta = await nav.subir(ruta, viejo);
      assert.equal(respuesta.estado, 400, ruta);
      assert.deepEqual(json(respuesta), {
        error: 'Este .xls es de un formato viejo que no se puede leer. Ábrelo en Excel y guárdalo como .xlsx.',
        codigo: 'XLS_VIEJO',
      });
    }
    assert.equal(base.llamadas.length, 0);
  });
});
