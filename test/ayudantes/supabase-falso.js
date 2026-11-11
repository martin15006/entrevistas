'use strict';

// Ayudante de pruebas: un Supabase de mentira para probar el login sin internet.
// Guarda la "sesión" en una cookie propia y contesta como lo haría Supabase.
// Las cuentas son inventadas (CL-01).

const { parseCookieHeader } = require('@supabase/ssr');

const COOKIE = 'sb-falso';

/**
 * cuentas: [{ id, correo, contrasena, perfil: { nombre, rol, activo } | null }]
 * Devuelve { clientes, registro } — registro anota lo que pasó, y deja simular fallas.
 */
function crearSupabaseFalso(cuentas = []) {
  const registro = {
    entradas: 0, cierres: [], caido: false, perfilFalla: false, cierreFalla: false, llamadasDeAdmin: [],
  };
  const buscar = (id) => cuentas.find((cuenta) => cuenta.id === id);

  function porPeticion(req, res) {
    const enCookie = parseCookieHeader(req.headers.cookie ?? '').find((c) => c.name === COOKIE)?.value;
    let sesion = enCookie && buscar(enCookie) ? enCookie : null;

    return {
      auth: {
        async signInWithPassword({ email, password }) {
          registro.entradas += 1;
          if (registro.caido) return { data: { user: null, session: null }, error: { code: 'unexpected_failure', status: 500 } };
          const cuenta = cuentas.find((c) => c.correo === email && c.contrasena === password);
          if (!cuenta) return { data: { user: null, session: null }, error: { code: 'invalid_credentials', status: 400 } };
          sesion = cuenta.id;
          res.appendHeader('Set-Cookie', `${COOKIE}=${cuenta.id}; Path=/; HttpOnly; SameSite=Lax`);
          return { data: { user: { id: cuenta.id }, session: {} }, error: null };
        },
        async getUser() {
          if (!sesion) return { data: { user: null }, error: { code: 'session_missing', status: 400 } };
          return { data: { user: { id: sesion } }, error: null };
        },
        async signOut({ scope } = {}) {
          registro.cierres.push(scope ?? 'global');
          // Simula un corte de Supabase: no cierra nada y devuelve un error.
          if (registro.cierreFalla) return { error: { code: 'unexpected_failure', status: 500 } };
          sesion = null;
          res.appendHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0`);
          return { error: null };
        },
      },
      // Solo lo que usa lib/datos.js: from('perfiles').select(…).eq('id', id).maybeSingle()
      from(tabla) {
        let id = null;
        const consulta = {
          select: () => consulta,
          eq: (columna, valor) => {
            if (columna === 'id') id = valor;
            return consulta;
          },
          async maybeSingle() {
            if (registro.perfilFalla) return { data: null, error: { code: 'PGRST000', message: 'falla de prueba' } };
            if (tabla !== 'perfiles') return { data: null, error: { code: 'PGRST205' } };
            const cuenta = buscar(id);
            return { data: cuenta?.perfil ? { id, ...cuenta.perfil } : null, error: null };
          },
        };
        return consulta;
      },
    };
  }

  // El cliente de administración solo se usa de respaldo, para cerrar sesiones (rpc).
  const admin = () => ({
    async rpc(nombre, argumentos) {
      registro.llamadasDeAdmin.push({ nombre, argumentos });
      return { data: null, error: null };
    },
  });
  const noSeUsa = () => { throw new Error('Este cliente no se usa en estas pruebas'); };
  return { clientes: { porPeticion, admin, desechable: noSeUsa }, registro, cuentas };
}

/**
 * Un "navegador" mínimo: recuerda las cookies entre página y página, no sigue las
 * redirecciones solo (así se pueden revisar) y guarda el token anti-falsificación de la
 * última página para enviarlo en los formularios.
 */
function crearNavegador(base) {
  const cookies = new Map();
  let token = '';

  async function pedir(ruta, { method = 'GET', cabeceras = {}, campos, cuerpo } = {}) {
    const headers = { ...cabeceras, cookie: [...cookies].map(([nombre, valor]) => `${nombre}=${valor}`).join('; ') };
    let body = cuerpo;
    if (campos) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(campos);
    }
    const respuesta = await fetch(`${base}${ruta}`, { method, headers, body, redirect: 'manual' });
    for (const linea of respuesta.headers.getSetCookie()) {
      const [par, ...atributos] = linea.split(';');
      const igual = par.indexOf('=');
      const nombre = par.slice(0, igual).trim();
      const valor = par.slice(igual + 1).trim();
      const borrar = valor === '' || atributos.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (borrar) cookies.delete(nombre);
      else cookies.set(nombre, valor);
    }
    const texto = await respuesta.text();
    const encontrado = /data-csrf="([^"]+)"/.exec(texto);
    if (encontrado) token = encontrado[1];
    return { estado: respuesta.status, ubicacion: respuesta.headers.get('location'), texto, cabeceras: respuesta.headers };
  }

  return {
    get: (ruta, cabeceras) => pedir(ruta, { cabeceras }),
    post: (ruta, campos = {}, cabeceras) => pedir(ruta, { method: 'POST', campos: { _csrf: token, ...campos }, cabeceras }),
    /** Como la pantalla del censo: el archivo crudo, con el token en la cabecera, pidiendo JSON. */
    subir: (ruta, archivo, cabeceras = {}) => pedir(ruta, {
      method: 'POST',
      cuerpo: archivo,
      cabeceras: { 'content-type': 'application/octet-stream', 'x-csrf-token': token, accept: 'application/json', ...cabeceras },
    }),
    cookies,
    get token() { return token; },
  };
}

module.exports = { crearSupabaseFalso, crearNavegador };
