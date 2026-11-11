'use strict';

// HU-06 · Decidir en verde o rojo SIN recargar la página (HU-06.2 y 06.3).
// - Cada botón es un formulario de verdad: sin JavaScript, el servidor recarga la página.
// - Con JavaScript: se manda la decisión, se pide otra vez la página y se cambia solo la lista
//   (#revision-lista). Así la lista siempre la arma el servidor, en un solo lugar.
// - Mientras guarda, los botones de ese paciente se desactivan (CB-24).
// - Todo el texto se pone con textContent, nunca como HTML (CL-05).

(() => {
  const pagina = document.getElementById('revision');
  if (!pagina) return;

  const csrf = document.body.dataset.csrf || '';
  const textoListo = pagina.dataset.mensajeListo || '';
  const textoConexion = pagina.dataset.mensajeConexion || '';
  const estado = document.getElementById('estado-revision'); // lo que salió bien
  const aviso = document.getElementById('aviso-revision'); // lo que no se pudo
  const ICONOS = { entrevistar: '🟢', no_entrevistar: '🔴' };

  // Después de cambiar la lista, otro paciente queda justo bajo el dedo: un segundo toque
  // rápido (un doble toque) no debe decidir por él.
  const PAUSA_DESPUES_DE_CAMBIAR = 700;
  let ocupado = false;
  let quietoHasta = 0;
  const temporizadores = new Map();

  function mostrar(elemento, texto, segundos) {
    clearTimeout(temporizadores.get(elemento));
    elemento.hidden = !texto;
    elemento.textContent = texto || '';
    if (texto) temporizadores.set(elemento, setTimeout(() => mostrar(elemento, ''), segundos * 1000));
  }

  /** Pide la página otra vez y cambia solo la lista, conservando lo que estaba abierto. */
  async function refrescarLista() {
    const actual = document.getElementById('revision-lista');
    const dia = actual?.dataset.dia;
    if (!dia) return;
    const revisadosAbierto = Boolean(document.getElementById('revisados')?.open);

    const respuesta = await fetch(`/revision?dia=${encodeURIComponent(dia)}`, {
      headers: { Accept: 'text/html' },
      credentials: 'same-origin',
    });
    if (respuesta.redirected && new URL(respuesta.url).pathname === '/login') {
      window.location.assign('/login');
      return;
    }
    const html = await respuesta.text();
    const nueva = new DOMParser().parseFromString(html, 'text/html').getElementById('revision-lista');
    if (!nueva) return;
    actual.replaceWith(nueva);
    const revisados = document.getElementById('revisados');
    if (revisados && revisadosAbierto) revisados.open = true;
  }

  /** Después de cambiar la lista, el foco va al paciente que quedó en el mismo lugar. */
  function enfocarCerca(indice) {
    const pacientes = document.querySelectorAll('#titulo-por-revisar ~ .grupo .candidato');
    const siguiente = pacientes[Math.min(indice, pacientes.length - 1)]?.querySelector('button');
    const titulo = document.getElementById('titulo-por-revisar');
    if (siguiente) siguiente.focus({ preventScroll: true });
    else if (titulo) {
      titulo.setAttribute('tabindex', '-1'); // un título no recibe el foco si no se le permite
      titulo.focus({ preventScroll: true });
    }
  }

  pagina.addEventListener('submit', async (evento) => {
    const formulario = evento.target;
    if (!(formulario instanceof HTMLFormElement) || !formulario.hasAttribute('data-decidir')) return;
    evento.preventDefault();
    if (ocupado || Date.now() < quietoHasta) return;

    const paciente = formulario.closest('.candidato');
    const botones = paciente ? [...paciente.querySelectorAll('button')] : [];
    const enPorRevisar = [...document.querySelectorAll('#titulo-por-revisar ~ .grupo .candidato')];
    const indice = Math.max(0, enPorRevisar.indexOf(paciente));
    const decision = formulario.elements.decision?.value;

    ocupado = true;
    for (const boton of botones) boton.disabled = true; // CB-24
    pagina.setAttribute('aria-busy', 'true');
    mostrar(aviso, '');

    try {
      const respuesta = await fetch(formulario.action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-CSRF-Token': csrf,
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        body: new URLSearchParams(new FormData(formulario)),
      });
      if (respuesta.status === 401) {
        window.location.assign('/login');
        return;
      }
      const datos = await respuesta.json().catch(() => ({}));

      // Bien o mal, la lista se pone al día: si otra persona decidió antes (HU-06.5), se ve
      // lo que decidió ella.
      await refrescarLista();
      quietoHasta = Date.now() + PAUSA_DESPUES_DE_CAMBIAR;
      enfocarCerca(indice);

      if (respuesta.ok && datos.ok) {
        const nombre = paciente?.dataset.nombre || '';
        mostrar(estado, `${ICONOS[decision] || ''} ${nombre} ${textoListo}`.trim(), 5);
      } else {
        mostrar(aviso, datos.error || textoConexion, 10);
      }
    } catch {
      // Sin conexión: no cambió nada en la pantalla y se puede volver a tocar.
      for (const boton of botones) boton.disabled = false;
      mostrar(aviso, textoConexion, 10);
    } finally {
      ocupado = false;
      pagina.setAttribute('aria-busy', 'false');
    }
  });
})();
