'use strict';

// HU-08 · Arma la pantalla "Entrevistas" con lo que devuelve entrevistas_del_dia() (database/10).
// No habla con la base: así se prueba sola (test/entrevistas.test.js).
// Agrupa con la MISMA regla RN-09 de la revisión (agrupar, de lib/revision.js): no se copia.
// Un solo reloj (PYA tanda 8): "hoy" y si un "En curso" sigue vigente los dice la base.

const { esFechaIso, fechaCorta } = require('./fechas');
const { agrupar, cuando } = require('./revision');
const { MENSAJES } = require('./mensajes');

const PESTANAS = Object.freeze(['pendientes', 'entrevistados', 'salieron']);

const esPestana = (valor) => PESTANAS.includes(valor);
const fechas = (valor) => (Array.isArray(valor) ? valor : []).filter(esFechaIso);

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
 * @param resultado lo que devuelve entrevistas_del_dia():
 *                  { hoy, dia, dias_censo, dias, pendientes, entrevistados, salieron }
 * @param pestana   'pendientes' (la que se abre por defecto, HU-08.1), 'entrevistados' o 'salieron'
 * @param hoy       'AAAA-MM-DD' en Colombia, por si la base no lo dijo
 * @param diaPedido el día elegido en el selector (HU-08.3), o null
 * @param guardada  se acaba de guardar una entrevista (HU-09.4)
 */
function armarEntrevistas(resultado, { pestana = 'pendientes', hoy = null, diaPedido = null, guardada = false } = {}) {
  const activa = esPestana(pestana) ? pestana : 'pendientes';
  const hoyDeLaBase = esFechaIso(resultado?.hoy) ? resultado.hoy : (esFechaIso(hoy) ? hoy : null);
  const diasCenso = fechas(resultado?.dias_censo); // del más nuevo al más viejo
  const ultimoCenso = diasCenso[0] ?? null;
  const lista = (clave) => (Array.isArray(resultado?.[clave]) ? resultado[clave] : []);

  // HU-08.2 · Todas las pendientes, con "Desde el [fecha]" si vienen de un censo anterior al último.
  const pendientes = lista('pendientes').map((f, i) => ({
    ...fila(f, i),
    href: `/entrevistas/${encodeURIComponent(f.id)}`,
    desde: esFechaIso(f.censo_fecha) && ultimoCenso && f.censo_fecha < ultimoCenso
      ? MENSAJES.desdeEl(fechaCorta(f.censo_fecha)) : null,
    // HU-08.6 · RN-13 · La base solo lo manda si es OTRA persona y no pasaron 15 minutos (CB-27).
    enCurso: typeof f.en_curso_por === 'string' && f.en_curso_por ? MENSAJES.enCurso(f.en_curso_por) : null,
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
    // HU-09.4 · Al volver de guardar una entrevista.
    guardada: guardada ? MENSAJES.entrevistaGuardada : null,
    // HU-08.4 · Falta el censo de hoy (hora de Colombia).
    avisoCensoDeHoy: hoyDeLaBase && !diasCenso.includes(hoyDeLaBase) ? MENSAJES.faltaCensoDeHoy : null,
    dias: [],
    dia: null,
    grupos: [],
    mensaje: null,
  };

  if (activa === 'pendientes') {
    vista.grupos = agrupar(pendientes);
    vista.mensaje = pendientes.length === 0 ? MENSAJES.sinPendientes : null;
    return vista;
  }

  // HU-08.3 (enmienda 5) · Entrevistados o Salieron: las que se hicieron ESE día (hoy si no se
  // eligió otro), cada una con su censo. El selector: hoy y los días en que se hizo algo.
  const dia = esFechaIso(resultado?.dia) ? resultado.dia : (esFechaIso(diaPedido) ? diaPedido : hoyDeLaBase);
  const dias = fechas(resultado?.dias);
  if (dia && !dias.includes(dia)) dias.push(dia);
  vista.dias = [...dias].sort((a, b) => (a < b ? 1 : -1))
    .map((valor) => ({ valor, texto: fechaCorta(valor), elegido: valor === dia }));
  vista.dia = dia ? { fecha: dia, fechaTexto: fechaCorta(dia) } : null;

  const filas = lista(activa).map((f, i) => ({
    ...fila(f, i),
    quien: [
      esFechaIso(f.censo_fecha) ? MENSAJES.censoDel(fechaCorta(f.censo_fecha)) : null,
      f.por,
      cuando(f.en, dia),
    ].filter(Boolean).join(' · '),
  }));
  vista.grupos = agrupar(filas);
  if (filas.length === 0) vista.mensaje = activa === 'entrevistados' ? MENSAJES.sinEntrevistados : MENSAJES.sinSalieron;
  return vista;
}

module.exports = { armarEntrevistas, esPestana, PESTANAS };
