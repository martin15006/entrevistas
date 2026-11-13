'use strict';

// HU-09 · El formulario de la entrevista, en el navegador.
// - RN-13: al abrir, la entrevista queda "En curso" a mi nombre; al salir del formulario, se suelta
//   SOLO esa apertura (la base da su hora: así recargar u otra pestaña no sueltan una que se llena).
// - HU-09.9: si justo al abrir otra persona la tenía, la base no se la quita (salvo "Abrir igual"):
//   la página se vuelve a pedir y el servidor muestra el aviso.
// - CB-13: Edad y Teléfono se quedan solo con los números, también al pegar.
// - CB-12: el contador del relato. CB-14: "No sabe" borra la placa y la bloquea.
// - HU-09.8: con cambios sin guardar, salir por "Volver" o por el menú pregunta dentro de la página (RNF-11).
// - Guardar con fetch (CB-01, CB-02, CB-17, CB-24): si algo falla, todo lo escrito sigue aquí.
// Sin JavaScript, el formulario igual funciona (el servidor recarga la página).
// Todo el texto se pone con textContent, nunca como HTML (CL-05).

(() => {
  const formulario = document.getElementById('entrevista');
  if (!formulario) return;

  const id = formulario.dataset.id;
  const igual = formulario.dataset.igual === '1';
  const textoConexion = formulario.dataset.mensajeConexion || '';
  let csrf = document.body.dataset.csrf || '';
  const aviso = document.getElementById('aviso-entrevista');
  const entrarDeNuevo = document.getElementById('entrar-de-nuevo');
  const guardar = document.getElementById('guardar');
  const relato = document.getElementById('relato');
  const contador = document.getElementById('contador-relato');
  const placa = document.getElementById('placa');
  const noSabe = document.getElementById('placa_no_sabe');
  const dialogo = document.getElementById('salir-sin-guardar');
  const salir = document.getElementById('salir');

  let sucio = false; // hay cambios sin guardar (HU-09.8)
  let guardada = false;
  let ocupado = false; // CB-24
  let tokenViejo = false; // CB-02: después de volver a entrar hay que pedir el token nuevo
  let desde = null; // RN-13: la hora de MI apertura, para soltar solo esa
  let destino = null; // HU-09.8: adónde iba la persona cuando se le preguntó
  let formularioPendiente = null; // o qué formulario quería enviar (por ejemplo, "Cerrar sesión")

  const ruta = (accion) => `/entrevistas/${encodeURIComponent(id)}/${accion}`;
  const cabeceras = (extra = {}) => ({ 'X-CSRF-Token': csrf, ...extra });
  const mismoSitio = (direccion) => typeof direccion === 'string' && /^\/(?![/\\])/.test(direccion);

  // --- RN-13 · "En curso" ---
  (async () => {
    try {
      const respuesta = await fetch(ruta('abrir'), {
        method: 'POST',
        headers: cabeceras({ 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }),
        credentials: 'same-origin',
        body: new URLSearchParams(igual ? { igual: '1' } : {}),
      });
      if (respuesta.ok) {
        const datos = await respuesta.json().catch(() => ({}));
        desde = typeof datos.desde === 'string' ? datos.desde : null;
      } else if ((respuesta.status === 409 || respuesta.status === 404) && !sucio) {
        // HU-09.9 · Otra persona la abrió un momento antes, o ya no está pendiente: el servidor
        // muestra el aviso que corresponde (todavía no se escribió nada).
        window.location.replace(window.location.pathname);
      }
    } catch {
      // Sin conexión al abrir: no pasa nada; a los 15 minutos se habría soltado igual (CB-27).
    }
  })();

  function soltar() {
    if (guardada || !desde) return; // al guardar, la base ya la soltó
    navigator.sendBeacon?.(ruta('soltar'), new URLSearchParams({ _csrf: csrf, desde }));
  }
  window.addEventListener('pagehide', soltar);

  // --- Los campos ---
  for (const nombre of ['edad', 'telefono']) {
    const campo = document.getElementById(nombre);
    campo?.addEventListener('input', () => {
      const limpio = campo.value.replace(/\D/g, ''); // CB-13
      if (limpio !== campo.value) campo.value = limpio;
    });
  }

  function contar() {
    if (relato && contador) contador.textContent = `${relato.value.length}/${relato.maxLength}`; // CB-12
  }
  relato?.addEventListener('input', contar);
  contar();

  function bloquearPlaca() {
    if (!placa || !noSabe) return;
    if (noSabe.checked) placa.value = ''; // CB-14
    placa.disabled = noSabe.checked;
  }
  noSabe?.addEventListener('change', bloquearPlaca);
  bloquearPlaca();

  formulario.addEventListener('input', () => { sucio = true; });
  formulario.addEventListener('change', () => { sucio = true; });

  // --- HU-09.8 · Salir con cambios sin guardar: "Volver", el menú, el logo o "Cerrar sesión" ---
  function preguntar() {
    if (!dialogo?.showModal) return false;
    dialogo.showModal();
    return true;
  }

  document.addEventListener('click', (evento) => {
    const enlace = evento.target instanceof Element ? evento.target.closest('a[href]') : null;
    if (!enlace || !sucio || enlace === salir || enlace.target === '_blank' || dialogo?.contains(enlace)) return;
    if (evento.defaultPrevented || evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey) return;
    destino = enlace.getAttribute('href');
    formularioPendiente = null;
    if (preguntar()) evento.preventDefault();
  });

  document.addEventListener('submit', (evento) => {
    const otro = evento.target;
    if (!sucio || otro === formulario || !(otro instanceof HTMLFormElement)) return;
    destino = null;
    formularioPendiente = otro;
    if (preguntar()) evento.preventDefault();
  });

  document.getElementById('seguir-editando')?.addEventListener('click', () => {
    destino = null;
    formularioPendiente = null;
    dialogo.close();
  });

  salir?.addEventListener('click', (evento) => {
    sucio = false;
    if (formularioPendiente) {
      evento.preventDefault();
      formularioPendiente.submit(); // .submit() no vuelve a pasar por la pregunta
      return;
    }
    if (mismoSitio(destino)) salir.setAttribute('href', destino);
  });

  // --- Los errores bajo cada campo (HU-09.5, HU-09.6) ---
  function limpiarErrores() {
    for (const error of formulario.querySelectorAll('.campo__error')) {
      error.hidden = true;
      error.textContent = '';
    }
    for (const campo of formulario.querySelectorAll('[aria-invalid]')) campo.removeAttribute('aria-invalid');
  }

  function mostrarErrores(errores, primero) {
    for (const [nombre, texto] of Object.entries(errores || {})) {
      const error = document.getElementById(`error-${nombre}`);
      if (error) {
        error.textContent = String(texto);
        error.hidden = false;
      }
      document.getElementById(nombre)?.setAttribute('aria-invalid', 'true');
    }
    // HU-09.5 · La página baja al primero que falta.
    const campo = document.getElementById(primero) || document.getElementById(`error-${primero}`);
    const enfocable = campo?.matches?.('input, textarea') ? campo : campo?.querySelector?.('input');
    (campo?.closest('.campo, .declaracion') || campo)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    enfocable?.focus({ preventScroll: true });
  }

  function mostrarAviso(texto, { entrar = false } = {}) {
    aviso.textContent = texto || '';
    aviso.hidden = !texto;
    if (entrarDeNuevo) entrarDeNuevo.hidden = !entrar;
    if (texto) aviso.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * CB-02 · Después de volver a entrar, el token cambió: se pide el nuevo antes de guardar otra vez.
   * Devuelve 'ok', o { sesion: texto } si tampoco hay sesión (hay que entrar primero).
   */
  async function renovarToken() {
    const respuesta = await fetch('/token', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.status === 401) return { sesion: datos.error };
    if (!respuesta.ok || typeof datos.token !== 'string' || !datos.token) return null;
    csrf = datos.token;
    document.body.dataset.csrf = csrf;
    for (const oculto of document.querySelectorAll('input[name="_csrf"]')) oculto.value = csrf;
    tokenViejo = false;
    return 'ok';
  }

  async function enviar() {
    return fetch(formulario.action, {
      method: 'POST',
      headers: cabeceras({ 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }),
      credentials: 'same-origin',
      body: new URLSearchParams(new FormData(formulario)),
    });
  }

  // --- Guardar ---
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (ocupado) return; // CB-24
    ocupado = true;
    guardar.disabled = true;
    formulario.setAttribute('aria-busy', 'true');
    limpiarErrores();
    mostrarAviso('');

    try {
      let sinSesion = null;
      if (tokenViejo) {
        const renovado = await renovarToken();
        if (renovado?.sesion) sinSesion = renovado.sesion;
      }
      let respuesta = null;
      if (!sinSesion) {
        respuesta = await enviar();
        // El token venció (por ejemplo, se entró de nuevo en otra pestaña): uno nuevo y otra vez, una sola.
        if (respuesta.status === 403) {
          const renovado = await renovarToken();
          if (renovado === 'ok') respuesta = await enviar();
          else if (renovado?.sesion) sinSesion = renovado.sesion;
        }
      }
      if (sinSesion) {
        tokenViejo = true; // CB-02: entrar en otra pestaña y volver a guardar
        mostrarAviso(sinSesion, { entrar: true });
        return;
      }
      const datos = await respuesta.json().catch(() => ({}));

      if (respuesta.ok && datos.ok) {
        // HU-09.4 · "Entrevista guardada." y de vuelta a Pendientes.
        guardada = true;
        sucio = false;
        window.location.assign(mismoSitio(datos.ir) ? datos.ir : '/entrevistas');
        return;
      }
      if (respuesta.status === 422) {
        mostrarErrores(datos.errores, datos.primero);
      } else if (respuesta.status === 401) {
        tokenViejo = true; // CB-02
        mostrarAviso(datos.error, { entrar: true });
      } else {
        mostrarAviso(datos.error || textoConexion); // CB-17, salió, ya no existe
      }
    } catch {
      mostrarAviso(textoConexion); // CB-01: sin conexión, todo sigue escrito
    } finally {
      if (!guardada) {
        ocupado = false;
        guardar.disabled = false;
        formulario.setAttribute('aria-busy', 'false');
      }
    }
  });
})();
