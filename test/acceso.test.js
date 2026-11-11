'use strict';

// HU-01 · Iniciar y cerrar sesión, con un Supabase de mentira (sin internet).
// Las cuentas y contraseñas son inventadas, solo para estas pruebas (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearApp } = require('../app');
const { CONFIG, conServidor } = require('./ayudantes/servidor');
const { crearSupabaseFalso, crearNavegador } = require('./ayudantes/supabase-falso');
const { crearMarca, sigueActiva, LIMITE_INACTIVIDAD_MS } = require('../lib/inactividad');

const INCORRECTOS = 'Correo o contraseña incorrectos.';
const DESACTIVADA = 'Tu cuenta está desactivada. Habla con el administrador.';
const INACTIVIDAD = 'Tu sesión se cerró por inactividad.';
const OCHO_HORAS = 8 * 60 * 60 * 1000;

const cuentas = () => [
  { id: 'id-ana', correo: 'ana@prueba.test', contrasena: 'clave-ana-123', perfil: { nombre: 'ANA PRUEBA', rol: 'usuario', activo: true } },
  { id: 'id-luis', correo: 'luis@prueba.test', contrasena: 'clave-luis-123', perfil: { nombre: 'LUIS PRUEBA', rol: 'administrador', activo: true } },
  { id: 'id-eva', correo: 'eva@prueba.test', contrasena: 'clave-eva-123', perfil: { nombre: 'EVA PRUEBA', rol: 'usuario', activo: false } },
  { id: 'id-sin', correo: 'sin@prueba.test', contrasena: 'clave-sin-123', perfil: null },
];

/** Arma la app con el Supabase de mentira y un reloj que la prueba controla. */
function preparar() {
  const falso = crearSupabaseFalso(cuentas());
  const reloj = { ahora: 1_000_000_000_000 };
  const app = crearApp(CONFIG, { clientes: falso.clientes, reloj: () => reloj.ahora });
  return { app, falso, reloj };
}

async function entrar(nav, correo, contrasena) {
  await nav.get('/login');
  return nav.post('/login', { correo, contrasena });
}

test('HU-01.1 · sin sesión, las páginas del sistema llevan a "Iniciar sesión"', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const nav = crearNavegador(base);
    const entrevistas = await nav.get('/entrevistas');
    assert.equal(entrevistas.estado, 303);
    assert.equal(entrevistas.ubicacion, '/login');
    const raiz = await nav.get('/');
    assert.equal(raiz.ubicacion, '/login'); // todo pide sesión: "/" lleva directo al login

    const login = await nav.get('/login');
    assert.equal(login.estado, 200);
    assert.ok(login.texto.includes('<h1 id="titulo-acceso">Iniciar sesión</h1>'));
  });
});

test('HU-01.2 · con el correo y la contraseña correctos se entra a "Entrevistas"', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const nav = crearNavegador(base);
    const respuesta = await entrar(nav, 'ana@prueba.test', 'clave-ana-123');
    assert.equal(respuesta.estado, 303);
    assert.equal(respuesta.ubicacion, '/entrevistas');
    const pagina = await nav.get('/entrevistas');
    assert.equal(pagina.estado, 200);
    assert.ok(pagina.texto.includes('Hola, ANA PRUEBA.'));
    assert.ok(pagina.texto.includes('Cerrar sesión'));
  });
});

test('HU-01.2 · el correo se acepta con mayúsculas y espacios alrededor', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const respuesta = await entrar(crearNavegador(base), '  ANA@Prueba.TEST ', 'clave-ana-123');
    assert.equal(respuesta.ubicacion, '/entrevistas');
  });
});

test('HU-01.3 · correo que no existe o contraseña equivocada: el mismo mensaje, sin pistas', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const noExiste = await entrar(crearNavegador(base), 'nadie@prueba.test', 'clave-ana-123');
    const equivocada = await entrar(crearNavegador(base), 'ana@prueba.test', 'otra-clave-999');
    for (const respuesta of [noExiste, equivocada]) {
      assert.equal(respuesta.estado, 401);
      assert.ok(respuesta.texto.includes(INCORRECTOS));
      assert.ok(!respuesta.texto.includes('clave-ana-123'), 'la contraseña nunca vuelve a la página');
      assert.ok(!respuesta.texto.includes('otra-clave-999'), 'la contraseña nunca vuelve a la página');
    }
    assert.ok(equivocada.texto.includes('value="ana@prueba.test"'), 'el correo se conserva para corregirlo');
  });
});

test('HU-01.3 · campos vacíos o demasiado largos: el mismo mensaje y no se le pregunta a Supabase', async () => {
  const { app, falso } = preparar();
  await conServidor(app, async (base) => {
    const casos = [
      ['', 'clave-ana-123'], ['ana@prueba.test', ''],
      [`${'a'.repeat(250)}@x.co`, 'clave'], ['ana@prueba.test', 'x'.repeat(201)],
    ];
    for (const [correo, contrasena] of casos) {
      const respuesta = await entrar(crearNavegador(base), correo, contrasena);
      assert.equal(respuesta.estado, 401);
      assert.ok(respuesta.texto.includes(INCORRECTOS));
    }
    assert.equal(falso.registro.entradas, 0);
    // 200 caracteres de contraseña todavía se le preguntan a Supabase (el límite es N+1).
    await entrar(crearNavegador(base), 'ana@prueba.test', 'x'.repeat(200));
    assert.equal(falso.registro.entradas, 1);
  });
});

test('HU-01.4 · una cuenta desactivada o sin perfil no entra, y no le queda la sesión abierta', async () => {
  const { app, falso } = preparar();
  await conServidor(app, async (base) => {
    for (const [correo, contrasena] of [['eva@prueba.test', 'clave-eva-123'], ['sin@prueba.test', 'clave-sin-123']]) {
      const nav = crearNavegador(base);
      const respuesta = await entrar(nav, correo, contrasena);
      assert.equal(respuesta.estado, 403);
      assert.ok(respuesta.texto.includes(DESACTIVADA));
      assert.equal((await nav.get('/entrevistas')).ubicacion, '/login', 'no quedó adentro');
    }
    assert.deepEqual(falso.registro.cierres, ['local', 'local']);
  });
});

test('HU-02.6 · si desactivan la cuenta con la sesión abierta, en su siguiente acción sale con el mensaje', async () => {
  const { app, falso } = preparar();
  await conServidor(app, async (base) => {
    const nav = crearNavegador(base);
    await entrar(nav, 'ana@prueba.test', 'clave-ana-123');
    assert.equal((await nav.get('/entrevistas')).estado, 200);

    falso.cuentas.find((c) => c.id === 'id-ana').perfil.activo = false; // el admin la desactiva
    const siguiente = await nav.get('/entrevistas');
    assert.equal(siguiente.estado, 303);
    assert.equal(siguiente.ubicacion, '/login?motivo=desactivada');
    assert.ok((await nav.get('/login?motivo=desactivada')).texto.includes(DESACTIVADA));
  });
});

test('HU-01.5 · "Cerrar sesión" vuelve al login, solo en este equipo, y las páginas no quedan en caché', async () => {
  const { app, falso } = preparar();
  await conServidor(app, async (base) => {
    const nav = crearNavegador(base);
    await entrar(nav, 'ana@prueba.test', 'clave-ana-123');
    const pagina = await nav.get('/entrevistas');
    assert.equal(pagina.cabeceras.get('cache-control'), 'no-store', 'el botón "atrás" no muestra datos');

    const salir = await nav.post('/salir');
    assert.equal(salir.estado, 303);
    assert.equal(salir.ubicacion, '/login');
    assert.deepEqual(falso.registro.cierres, ['local'], 'signOut solo en este equipo, no en todos');
    assert.equal((await nav.get('/entrevistas')).ubicacion, '/login');
  });
});

test('HU-01.6 · tras 8 horas sin uso, la siguiente acción lleva al login con el aviso', async () => {
  const { app, falso, reloj } = preparar();
  await conServidor(app, async (base) => {
    const nav = crearNavegador(base);
    await entrar(nav, 'ana@prueba.test', 'clave-ana-123');

    reloj.ahora += OCHO_HORAS - 1; // 1 ms antes de las 8 horas: sigue adentro (y cuenta como uso)
    assert.equal((await nav.get('/entrevistas')).estado, 200);

    reloj.ahora += OCHO_HORAS; // exactamente 8 horas desde ese último uso: afuera
    const fuera = await nav.get('/entrevistas');
    assert.equal(fuera.estado, 303);
    assert.equal(fuera.ubicacion, '/login?motivo=inactividad');
    assert.ok((await nav.get('/login?motivo=inactividad')).texto.includes(INACTIVIDAD));
    assert.deepEqual(falso.registro.cierres, ['local']);
  });
});

test('HU-01.6 · RNF-07 · la marca de actividad no se puede falsificar ni usar con otra cuenta', () => {
  const clave = CONFIG.claveFirma;
  const ahora = 1_000_000_000_000;
  const marca = crearMarca(ahora, clave, 'id-ana');
  assert.equal(LIMITE_INACTIVIDAD_MS, OCHO_HORAS);
  assert.equal(sigueActiva(marca, ahora + OCHO_HORAS - 1, clave, 'id-ana'), true);
  assert.equal(sigueActiva(marca, ahora + OCHO_HORAS, clave, 'id-ana'), false);
  // La marca de Ana no sirve con la sesión de Luis (PYA tanda 3).
  assert.equal(sigueActiva(marca, ahora, clave, 'id-luis'), false);
  // Cambiarle la hora a la marca (para "rejuvenecerla") rompe la firma.
  const [, firma] = marca.split('.');
  assert.equal(sigueActiva(`${ahora + OCHO_HORAS}.${firma}`, ahora + OCHO_HORAS, clave, 'id-ana'), false);
  assert.equal(sigueActiva(crearMarca(ahora, 'otra-clave-de-firma-de-32-caracteres!', 'id-ana'), ahora, clave, 'id-ana'), false);
  assert.equal(sigueActiva(crearMarca(ahora + 1000, clave, 'id-ana'), ahora, clave, 'id-ana'), false, 'una hora del futuro no vale');
  for (const rara of [undefined, '', 'abc', `${ahora}`, `${ahora}.x.y`]) assert.equal(sigueActiva(rara, ahora, clave, 'id-ana'), false);
  assert.equal(sigueActiva(marca, ahora, clave, ''), false);
});

test('HU-01.6 · con la marca de otra cuenta, la sesión se cierra (no sirve mezclar cookies)', async () => {
  const { app, falso } = preparar();
  await conServidor(app, async (base) => {
    const ana = crearNavegador(base);
    const luis = crearNavegador(base);
    await entrar(ana, 'ana@prueba.test', 'clave-ana-123');
    await entrar(luis, 'luis@prueba.test', 'clave-luis-123');
    // Ana se queda con la sesión de Luis, pero con su propia marca de actividad.
    ana.cookies.set('sb-falso', luis.cookies.get('sb-falso'));
    const respuesta = await ana.get('/entrevistas');
    assert.equal(respuesta.ubicacion, '/login?motivo=inactividad');
    assert.ok(falso.registro.cierres.includes('local'), 'la sesión de Luis en ese navegador se cierra');
  });
});

test('CB-28 · tras 5 contraseñas equivocadas, esa cuenta se frena 15 minutos (aunque luego escriba la correcta)', async () => {
  const { app, falso, reloj } = preparar();
  await conServidor(app, async (base) => {
    for (let i = 1; i <= 5; i += 1) {
      const respuesta = await entrar(crearNavegador(base), 'ana@prueba.test', `mala-${i}`);
      assert.equal(respuesta.estado, 401, `intento ${i}`);
    }
    const sexto = await entrar(crearNavegador(base), 'ana@prueba.test', 'clave-ana-123');
    assert.equal(sexto.estado, 429);
    assert.ok(sexto.texto.includes('Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.'));
    assert.equal(falso.registro.entradas, 5, 'el sexto ni le preguntó a Supabase');

    // Otra cuenta, desde otro lado, sigue entrando (el freno es de ESA cuenta).
    // (Todas las pruebas salen del mismo equipo: van 5 de 20, así que el equipo no está frenado.)
    assert.equal((await entrar(crearNavegador(base), 'luis@prueba.test', 'clave-luis-123')).ubicacion, '/entrevistas');

    reloj.ahora += 15 * 60 * 1000; // pasan 15 minutos
    assert.equal((await entrar(crearNavegador(base), 'ana@prueba.test', 'clave-ana-123')).ubicacion, '/entrevistas');
  });
});

test('CB-28 · con 4 equivocadas y luego la correcta, entra, y la cuenta vuelve a cero', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    for (let i = 1; i <= 4; i += 1) await entrar(crearNavegador(base), 'ana@prueba.test', `mala-${i}`);
    assert.equal((await entrar(crearNavegador(base), 'ana@prueba.test', 'clave-ana-123')).ubicacion, '/entrevistas');
    // Volvió a cero: otras 4 equivocadas todavía no la frenan.
    for (let i = 1; i <= 4; i += 1) await entrar(crearNavegador(base), 'ana@prueba.test', `mala-${i}`);
    assert.equal((await entrar(crearNavegador(base), 'ana@prueba.test', 'clave-ana-123')).ubicacion, '/entrevistas');
  });
});

test('CB-28 · tras 20 contraseñas equivocadas desde el mismo equipo, se frena ese equipo', async () => {
  const { app, falso } = preparar();
  await conServidor(app, async (base) => {
    // 20 intentos con correos distintos (ninguna cuenta llega a 5).
    for (let i = 1; i <= 20; i += 1) {
      assert.equal((await entrar(crearNavegador(base), `nadie-${i}@prueba.test`, 'mala')).estado, 401, `intento ${i}`);
    }
    const siguiente = await entrar(crearNavegador(base), 'luis@prueba.test', 'clave-luis-123');
    assert.equal(siguiente.estado, 429);
    assert.equal(falso.registro.entradas, 20);
  });
});

test('HU-01.5 · si Supabase falla al cerrar la sesión, el servidor la cierra con su llave y borra las cookies', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { app, falso } = preparar();
  await conServidor(app, async (base) => {
    const nav = crearNavegador(base);
    await entrar(nav, 'ana@prueba.test', 'clave-ana-123');
    await nav.get('/entrevistas'); // la persona está en una página (con el token nuevo de después de entrar)
    falso.registro.cierreFalla = true;
    const salir = await nav.post('/salir');
    assert.equal(salir.ubicacion, '/login');
    assert.deepEqual(falso.registro.llamadasDeAdmin, [{ nombre: 'cerrar_sesiones', argumentos: { p_usuario: 'id-ana' } }]);
    assert.equal(nav.cookies.has('sb-falso'), false, 'la cookie de la sesión se borró igual');
    falso.registro.cierreFalla = false;
    assert.equal((await nav.get('/entrevistas')).ubicacion, '/login');
  });
});

test('RNF-03 · todo pide sesión por defecto: sin sesión, ni una página que no existe da pistas', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const sinSesion = await crearNavegador(base).get('/no-existe');
    assert.equal(sinSesion.ubicacion, '/login', 'sin sesión no se sabe si la página existe');

    const nav = crearNavegador(base);
    await entrar(nav, 'ana@prueba.test', 'clave-ana-123');
    const conSesion = await nav.get('/no-existe');
    assert.equal(conSesion.estado, 404);
    assert.equal(conSesion.cabeceras.get('cache-control'), 'no-store'); // la página de aviso también lleva el token
    assert.ok(conSesion.texto.includes('No encontramos esa página.'));
  });
});

test('HU-02.11 · CL-03 · la guardia de administrador deja pasar al admin y frena al usuario', async () => {
  const falso = crearSupabaseFalso(cuentas());
  const app = crearApp(CONFIG, {
    clientes: falso.clientes,
    montarRutas: (a, { requiereSesion, requiereRol }) => {
      a.get('/solo-admin', requiereSesion, requiereRol('administrador'), (req, res) => res.send('zona de admin'));
    },
  });
  await conServidor(app, async (base) => {
    const usuario = crearNavegador(base);
    await entrar(usuario, 'ana@prueba.test', 'clave-ana-123');
    const frenado = await usuario.get('/solo-admin');
    assert.equal(frenado.estado, 403);
    assert.ok(frenado.texto.includes('No tienes permiso para ver esta página.'));

    const admin = crearNavegador(base);
    await entrar(admin, 'luis@prueba.test', 'clave-luis-123');
    const paso = await admin.get('/solo-admin');
    assert.equal(paso.estado, 200);
    assert.equal(paso.texto, 'zona de admin');
  });
});

test('RNF-06 · el token anti-falsificación cambia al entrar y al salir', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const nav = crearNavegador(base);
    await nav.get('/login');
    const antes = nav.token;
    await nav.post('/login', { correo: 'ana@prueba.test', contrasena: 'clave-ana-123' });
    await nav.get('/entrevistas');
    const adentro = nav.token;
    assert.notEqual(adentro, antes);
    await nav.post('/salir');
    await nav.get('/login');
    assert.notEqual(nav.token, adentro);
  });
});

test('base · ya con sesión, /login lleva directo a "Entrevistas"', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const nav = crearNavegador(base);
    await entrar(nav, 'ana@prueba.test', 'clave-ana-123');
    assert.equal((await nav.get('/login')).ubicacion, '/entrevistas');
  });
});

test('base · un aviso desconocido en /login no muestra nada raro', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    for (const motivo of ['constructor', '__proto__', 'toString', '<script>']) {
      const pagina = await crearNavegador(base).get(`/login?motivo=${encodeURIComponent(motivo)}`);
      assert.equal(pagina.estado, 200);
      assert.ok(!pagina.texto.includes('role="alert"'), motivo);
    }
  });
});

test('base · si Supabase no responde al entrar, se ve un mensaje general', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { app, falso } = preparar();
  falso.registro.caido = true;
  await conServidor(app, async (base) => {
    const respuesta = await entrar(crearNavegador(base), 'ana@prueba.test', 'clave-ana-123');
    assert.equal(respuesta.estado, 503);
    assert.ok(respuesta.texto.includes('Algo salió mal. Inténtalo de nuevo en un momento.'));
  });
});

test('CB-02 · si una pantalla pide JSON sin sesión, recibe 401 con el aviso (no una redirección)', async () => {
  const { app } = preparar();
  await conServidor(app, async (base) => {
    const respuesta = await crearNavegador(base).get('/entrevistas', { accept: 'application/json' });
    assert.equal(respuesta.estado, 401);
    assert.equal(JSON.parse(respuesta.texto).codigo, 'sesion');
  });
});

test('RNF-03 · OB-11 · ninguna página del sistema responde sin sesión (salvo el login)', async () => {
  const { app } = preparar();
  // Todas las rutas GET que existen, sacadas de la propia app.
  const rutas = [];
  const recorrer = (pila) => {
    for (const capa of pila) {
      if (capa.route?.methods?.get) rutas.push(capa.route.path);
      else if (capa.handle?.stack) recorrer(capa.handle.stack);
    }
  };
  recorrer(app.router.stack);
  assert.ok(rutas.includes('/entrevistas') && rutas.includes('/login'));

  await conServidor(app, async (base) => {
    for (const ruta of rutas.filter((r) => r !== '/login')) {
      let respuesta = await crearNavegador(base).get(ruta);
      for (let saltos = 0; respuesta.estado === 303 && respuesta.ubicacion !== '/login' && saltos < 3; saltos += 1) {
        respuesta = await crearNavegador(base).get(respuesta.ubicacion);
      }
      assert.equal(respuesta.ubicacion, '/login', `${ruta} debería llevar al login`);
    }
  });
});
