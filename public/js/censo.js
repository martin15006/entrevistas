'use strict';

// HU-04 · Pantalla "Subir censo": Leer censo → resumen → Confirmar o Cancelar.
// - El archivo se manda al servidor tal cual; el servidor lo lee en memoria y no lo guarda (CL-02).
// - "Confirmar" vuelve a mandar el MISMO archivo; mientras se ve el resumen no se puede cambiar.
// - Todo el texto se pone con textContent, nunca como HTML (CL-05).

(() => {
  const pagina = document.getElementById('subir-censo');
  if (!pagina) return;

  const csrf = document.body.dataset.csrf || '';
  const tamanoMaximo = Number(pagina.dataset.tamanoMaximo);
  const mensajes = {
    grande: pagina.dataset.mensajeGrande,
    sinArchivo: pagina.dataset.mensajeSinArchivo,
    conexion: pagina.dataset.mensajeConexion,
  };

  const elemento = (id) => document.getElementById(id);
  const formulario = elemento('form-censo');
  const archivo = elemento('archivo');
  const leer = elemento('leer');
  const aviso = elemento('aviso');
  const resumen = elemento('resumen');
  const linea = elemento('resumen-linea');
  const avisos = elemento('resumen-avisos');
  const elegirFecha = elemento('elegir-fecha');
  const fecha = elemento('fecha');
  const confirmar = elemento('confirmar');
  const cancelar = elemento('cancelar');

  let ocupado = false; // CB-24: un toque doble no manda dos veces
  let pedidoDeResumen = 0; // si llegan dos resúmenes, solo se pinta el más reciente
  let esperaDeFecha = null;

  function mostrarAviso(texto) {
    aviso.textContent = texto || '';
    aviso.hidden = !texto;
  }

  function ocupar(si) {
    ocupado = si;
    // La fecha NO se bloquea: al teclearla, cada parte completa (día, mes, año) avisa un
    // cambio, y bloquearla en medio hacía perder las teclas siguientes (tanda 4, en la ventana).
    for (const boton of [leer, confirmar, cancelar]) boton.disabled = si;
    pagina.setAttribute('aria-busy', si ? 'true' : 'false');
  }

  /** Manda el archivo elegido a una ruta del servidor y devuelve su respuesta (JSON). */
  async function enviar(ruta) {
    const parametros = new URLSearchParams();
    if (fecha.value) parametros.set('fecha', fecha.value); // solo se usa si el archivo no trae fecha
    let respuesta;
    try {
      respuesta = await fetch(`${ruta}?${parametros.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-CSRF-Token': csrf,
          Accept: 'application/json',
        },
        body: archivo.files[0],
        credentials: 'same-origin',
      });
    } catch {
      throw new Error(mensajes.conexion);
    }
    if (respuesta.status === 401) {
      // La sesión se cerró: al login (el archivo se vuelve a elegir después de entrar).
      window.location.assign('/login');
      return new Promise(() => {});
    }
    let datos = {};
    try {
      datos = await respuesta.json();
    } catch {
      datos = {};
    }
    if (!respuesta.ok) throw new Error(datos.error || mensajes.conexion);
    return datos;
  }

  function pintarResumen(datos) {
    linea.textContent = datos.linea;
    avisos.replaceChildren(...datos.avisos.map((texto) => {
      const item = document.createElement('li');
      item.textContent = texto;
      return item;
    }));
    elegirFecha.hidden = !datos.sinFecha; // HU-04.5
    resumen.hidden = false;
  }

  /** Vuelve todo al principio, sin mandar nada (HU-04.2: "Cancelar" no guarda). */
  function volverAEmpezar() {
    clearTimeout(esperaDeFecha);
    pedidoDeResumen += 1; // un resumen que venga en camino ya no se pinta
    resumen.hidden = true;
    linea.textContent = '';
    avisos.replaceChildren();
    elegirFecha.hidden = true;
    archivo.disabled = false;
    archivo.value = '';
    leer.hidden = false;
    mostrarAviso('');
    archivo.focus();
  }

  async function leerCenso() {
    if (ocupado) return;
    mostrarAviso('');
    const elegido = archivo.files[0];
    if (!elegido) {
      mostrarAviso(mensajes.sinArchivo);
      return;
    }
    if (elegido.size > tamanoMaximo) { // HU-04.6, sin mandar un archivo enorme
      mostrarAviso(mensajes.grande);
      return;
    }
    ocupar(true);
    try {
      pintarResumen(await enviar('/censo/leer'));
      archivo.disabled = true; // lo que se confirma es lo que se vio en el resumen
      leer.hidden = true;
      confirmar.focus();
    } catch (error) {
      mostrarAviso(error.message);
    } finally {
      ocupar(false);
    }
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    leerCenso();
  });

  // HU-04.5 y 04.7: al cambiar la fecha elegida, el resumen se vuelve a pedir (por si ya
  // hay un censo de ese día), 400 ms después de la última tecla.
  async function releerConLaFecha() {
    pedidoDeResumen += 1;
    const este = pedidoDeResumen;
    try {
      const datos = await enviar('/censo/leer');
      if (este === pedidoDeResumen) {
        mostrarAviso('');
        pintarResumen(datos);
      }
    } catch (error) {
      if (este === pedidoDeResumen) mostrarAviso(error.message);
    }
  }

  fecha.addEventListener('change', () => {
    if (resumen.hidden) return;
    clearTimeout(esperaDeFecha);
    esperaDeFecha = setTimeout(releerConLaFecha, 400);
  });

  confirmar.addEventListener('click', async () => {
    if (ocupado) return;
    clearTimeout(esperaDeFecha); // se guarda con la fecha que se ve en el campo
    pedidoDeResumen += 1; // un resumen que venga en camino ya no se pinta
    mostrarAviso('');
    ocupar(true);
    try {
      const datos = await enviar('/censo/guardar');
      // Solo se va a una página de este mismo sitio: se arma la dirección completa y se compara
      // el origen (una expresión regular se podía engañar con "/\otro-sitio", PYA tanda 4).
      let destino = '/censo';
      try {
        const url = new URL(String(datos.redirigir), window.location.origin);
        if (url.origin === window.location.origin) destino = url.pathname + url.search;
      } catch {
        destino = '/censo';
      }
      window.location.assign(destino);
    } catch (error) {
      mostrarAviso(error.message);
      ocupar(false);
    }
  });

  cancelar.addEventListener('click', () => {
    if (!ocupado) volverAEmpezar();
  });
})();
