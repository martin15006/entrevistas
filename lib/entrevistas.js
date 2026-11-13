'use strict';

// HU-08 · Arma la pantalla "Entrevistas" con lo que devuelve entrevistas_del_dia() (database/09).
// No habla con la base: así se prueba sola (test/entrevistas.test.js).
// Agrupa con la MISMA regla RN-09 de la revisión (agrupar, de lib/revision.js): no se copia.

const { esFechaIso, fechaCorta } = require('./fechas');
const { agrupar, cuando } = require('./revision');
const { MENSAJES } = require('./mensajes');

const PESTANAS = Object.freeze(['pendientes', 'entrevistados', 'salieron']);
const EN_CURSO_MS = 15 * 60 * 1000; // RN-13 · "En curso" dura 15 minutos (CB-27)

const esPestana = (valor) => PESTANAS.includes(valor);

/** RN-13 · ¿La abrió OTRA persona hace menos de 15 minutos? */
function enCurso(fila, ahora) {
  if (fila.en_curso_mio === true || !fila.en_curso_desde) return null;
  const desde = Date.parse(fila.en_curso_desde);
  if (Number.isNaN(desde) || ahora - desde >= EN_CURSO_MS) return null; // CB-27: a los 15 min desaparece
  return MENSAJES.enCurso(fila.en_curso_por);
}

/** Una fila tal como se muestra, con la posición que trae la base (para el orden de RN-09). */
const fila = (f, posicion) => ({
  id: f.id,
  servicio: String(f.piso ?? ''),
  cama: String(f.cama ?? ''),
  nombre: String(f.nombre ?? ''),
  cedula: String(f.cedula ?? ''),
  orden: posicion + 1,
});

/**
 * @param resultado lo que devuelve entrevistas_del_dia(): { dias, censo, pendientes, entrevistados, salieron }
 * @param pestana   'pendientes' (la que se abre por defecto, HU-08.1), 'entrevistados' o 'salieron'
 * @param hoy       'AAAA-MM-DD' en Colombia (HU-08.4)
 * @param ahora     la hora en milisegundos (para "En curso", RN-13)
 * @param diaPedido el día elegido en el selector (HU-08.3), o null
 */
function armarEntrevistas(resultado, { pestana = 'pendientes', hoy, ahora, diaPedido = null } = {}) {
  const activa = esPestana(pestana) ? pestana : 'pendientes';
  const dias = (Array.isArray(resultado?.dias) ? resultado.dias : []).filter(esFechaIso);
  const ultimoCenso = dias[0] ?? null; // vienen del más nuevo al más viejo
  const censo = resultado?.censo && esFechaIso(resultado.censo.fecha) ? resultado.censo : null;
  const lista = (clave) => (Array.isArray(resultado?.[clave]) ? resultado[clave] : []);

  // HU-08.2 · Todas las pendientes, con "Desde el [fecha]" si vienen de un censo anterior al último.
  const pendientes = lista('pendientes').map((f, i) => ({
    ...fila(f, i),
    href: `/entrevistas/${encodeURIComponent(f.id)}`,
    desde: esFechaIso(f.censo_fecha) && ultimoCenso && f.censo_fecha < ultimoCenso
      ? MENSAJES.desdeEl(fechaCorta(f.censo_fecha)) : null,
    enCurso: enCurso(f, ahora), // HU-08.6
  }));

  // HU-08.1 · Las pestañas; Entrevistados y Salieron recuerdan el día elegido.
  const conDia = diaPedido && esFechaIso(diaPedido) ? `&dia=${diaPedido}` : '';
  const pestanas = PESTANAS.map((clave) => ({
    clave,
    texto: clave === 'pendientes' ? `Pendientes (${pendientes.length})` : clave === 'entrevistados' ? 'Entrevistados' : 'Salieron',
    href: clave === 'pendientes' ? '/entrevistas' : `/entrevistas?pestana=${clave}${conDia}`,
    activa: clave === activa,
  }));

  const vista = {
    pestana: activa,
    pestanas,
    // HU-08.4 · Falta el censo de hoy (hora de Colombia).
    avisoCensoDeHoy: esFechaIso(hoy) && !dias.includes(hoy) ? MENSAJES.faltaCensoDeHoy : null,
    dias: [],
    censo: null,
    grupos: [],
    mensaje: null,
  };

  if (activa === 'pendientes') {
    vista.grupos = agrupar(pendientes);
    vista.mensaje = pendientes.length === 0 ? MENSAJES.sinPendientes : null;
    return vista;
  }

  // HU-08.3 · Entrevistados o Salieron: las del censo elegido (el más reciente si no se eligió).
  if (censo && !dias.includes(censo.fecha)) dias.push(censo.fecha);
  vista.dias = [...dias].sort((a, b) => (a < b ? 1 : -1))
    .map((dia) => ({ valor: dia, texto: fechaCorta(dia), elegido: dia === censo?.fecha }));
  if (!censo) {
    vista.mensaje = dias.length === 0 || !esFechaIso(diaPedido) ? MENSAJES.sinCensos : MENSAJES.censoNoExiste(fechaCorta(diaPedido));
    return vista;
  }
  vista.censo = { fecha: censo.fecha, fechaTexto: fechaCorta(censo.fecha) };
  const filas = lista(activa).map((f, i) => ({
    ...fila(f, i),
    quien: [f.por, cuando(f.en, censo.fecha)].filter(Boolean).join(' · '),
  }));
  vista.grupos = agrupar(filas);
  if (filas.length === 0) vista.mensaje = activa === 'entrevistados' ? MENSAJES.sinEntrevistados : MENSAJES.sinSalieron;
  return vista;
}

module.exports = { armarEntrevistas, esPestana, PESTANAS, EN_CURSO_MS };
