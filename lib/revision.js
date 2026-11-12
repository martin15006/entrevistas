'use strict';

// HU-05 · Arma la pantalla de revisión con lo que devuelve revision_del_censo() (database/06).
// No habla con la base: así se prueba sola (test/revision.test.js).
// La regla de quién sigue "Por revisar" vive en la base (por_revisar), en un solo lugar;
// aquí solo se agrupa, se ordena y se escriben los textos.

const { esFechaIso, fechaCorta, horaBogota, hoyBogota } = require('./fechas');
const { MENSAJES } = require('./mensajes');

const DECISIONES = Object.freeze({
  entrevistar: Object.freeze({ icono: '🟢', etiqueta: 'Entrevistar', contraria: 'no_entrevistar' }),
  no_entrevistar: Object.freeze({ icono: '🔴', etiqueta: 'No entrevistar', contraria: 'entrevistar' }),
});

const esDecision = (valor) => Object.hasOwn(DECISIONES, valor);

/**
 * "A qué hora" se decidió (HU-05.3): "10:42", o "11/11/2026 10:42" si fue otro día distinto
 * al del censo (así no se confunde la hora de hoy con la de ayer).
 */
function cuando(instante, fechaDelCenso) {
  if (!instante) return '';
  const fecha = new Date(instante);
  if (Number.isNaN(fecha.getTime())) return '';
  const hora = horaBogota(fecha);
  const dia = hoyBogota(fecha);
  return dia === fechaDelCenso ? hora : `${fechaCorta(dia)} ${hora}`;
}

/** Un candidato tal como se muestra. */
function verCandidato(fila, fechaDelCenso) {
  const propia = esDecision(fila.decision) ? fila.decision : null;
  const otra = fila.otra && esDecision(fila.otra.decision) ? fila.otra : null;
  const vigente = propia ?? otra?.decision ?? null;
  const quien = propia
    ? [fila.decidido_por, cuando(fila.decidido_en, fechaDelCenso)]
    : [otra?.por, cuando(otra?.en, fechaDelCenso)];
  const contraria = propia ? DECISIONES[propia].contraria : null;

  return {
    id: fila.id,
    servicio: String(fila.piso ?? ''),
    cama: String(fila.cama ?? ''),
    nombre: String(fila.nombre ?? ''),
    cedula: String(fila.cedula ?? ''),
    orden: Number(fila.orden) || 0,
    dia: `Día ${fila.dias}`,
    porRevisar: fila.por_revisar === true,
    // HU-07.1 · Si su estancia se marcó en rojo en un censo anterior, se recuerda en "Por revisar".
    avisoRojo: fila.por_revisar === true && fila.rojo_anterior && esFechaIso(fila.rojo_anterior.fecha)
      ? MENSAJES.rojoAnterior(fechaCorta(fila.rojo_anterior.fecha), fila.rojo_anterior.por)
      : null,
    decision: vigente,
    icono: vigente ? DECISIONES[vigente].icono : '',
    etiqueta: vigente ? DECISIONES[vigente].etiqueta : '',
    quien: quien.filter(Boolean).join(' · '),
    // Se decidió en otro censo: el enlace lleva a ese día, que es donde se cambia.
    otroCenso: otra && esFechaIso(otra.fecha)
      ? { texto: MENSAJES.decididoEnOtroCenso(fechaCorta(otra.fecha)), href: `/revision?dia=${otra.fecha}` }
      : null,
    // HU-06.4 · Solo se cambia donde se decidió, y si nada más nuevo manda (RN-07).
    puedeCambiar: Boolean(propia) && !otra,
    entrevistaHecha: fila.entrevista_hecha === true,
    desde: propia ?? '',
    // La hora exacta de esa decisión, tal como la dio la base: si al cambiarla ya no es esa,
    // alguien la cambió en el medio (A→B→A, CB-16).
    desdeEn: propia && fila.decidido_en ? String(fila.decidido_en) : '',
    cambiarA: contraria,
    cambiarEtiqueta: contraria ? DECISIONES[contraria].etiqueta : '',
  };
}

/** En qué fila aparece por primera vez cada servicio en el censo (con TODOS sus candidatos). */
function ordenDeServicios(candidatos) {
  const primeraFila = new Map();
  for (const { servicio, orden } of candidatos) {
    if (!primeraFila.has(servicio) || orden < primeraFila.get(servicio)) primeraFila.set(servicio, orden);
  }
  return primeraFila;
}

/**
 * RN-09 · Por servicio, en el orden en que cada servicio aparece en el censo, y dentro de cada
 * servicio en el orden de las filas. El título lleva el conteo del grupo: "Observacion · 9".
 * primeraFila sale de todo el censo: así un grupo no cambia de lugar cuando se decide al primero
 * de su servicio (tanda 5, visto en la ventana).
 */
function agrupar(candidatos, primeraFila = ordenDeServicios(candidatos)) {
  const grupos = new Map();
  for (const candidato of [...candidatos].sort((a, b) => a.orden - b.orden)) {
    if (!grupos.has(candidato.servicio)) grupos.set(candidato.servicio, []);
    grupos.get(candidato.servicio).push(candidato);
  }
  return [...grupos]
    .sort(([a], [b]) => primeraFila.get(a) - primeraFila.get(b))
    .map(([servicio, lista]) => ({
      servicio,
      conteo: lista.length,
      titulo: `${servicio} · ${lista.length}`,
      candidatos: lista,
    }));
}

/**
 * @param resultado lo que devuelve revision_del_censo(): { dias, censo, candidatos, pendientes }
 * @param diaPedido el día que se pidió ('AAAA-MM-DD'), o null si se abrió "Revisión" sin elegir
 */
function armarRevision(resultado, { diaPedido = null } = {}) {
  const censo = resultado?.censo && esFechaIso(resultado.censo.fecha) ? resultado.censo : null;
  const fecha = censo?.fecha ?? null;

  // HU-05.1 · El selector de días, del más nuevo al más viejo (y siempre con el que se ve).
  const dias = (Array.isArray(resultado?.dias) ? resultado.dias : []).filter(esFechaIso);
  if (fecha && !dias.includes(fecha)) dias.push(fecha);
  dias.sort((a, b) => (a < b ? 1 : -1));
  const opciones = dias.map((dia) => ({ valor: dia, texto: fechaCorta(dia), elegido: dia === fecha }));

  const textos = { entrevistaHecha: MENSAJES.entrevistaHecha }; // HU-06.4
  const vacia = { porRevisar: [], revisados: { total: 0, grupos: [] }, avisos: [], sinCandidatos: null, todosRevisados: null, textos };
  if (!censo) {
    const mensaje = dias.length === 0 || !esFechaIso(diaPedido)
      ? MENSAJES.sinCensos
      : MENSAJES.censoNoExiste(fechaCorta(diaPedido));
    return { censo: null, dias: opciones, mensaje, ...vacia };
  }

  const candidatos = (Array.isArray(resultado.candidatos) ? resultado.candidatos : [])
    .map((fila) => verCandidato(fila, fecha));
  const porRevisar = candidatos.filter((c) => c.porRevisar);
  const revisados = candidatos.filter((c) => !c.porRevisar);

  // HU-05.5 · Los censos anteriores que todavía tienen pacientes por revisar.
  const avisos = (Array.isArray(resultado.pendientes) ? resultado.pendientes : [])
    .filter((p) => esFechaIso(p?.fecha) && Number.isInteger(p.pendientes) && p.pendientes > 0)
    .map((p) => ({ texto: MENSAJES.censoConPendientes(fechaCorta(p.fecha), p.pendientes), href: `/revision?dia=${p.fecha}` }));

  return {
    censo: { fecha, fechaTexto: fechaCorta(fecha) },
    dias: opciones,
    mensaje: null,
    avisos,
    porRevisar: agrupar(porRevisar, ordenDeServicios(candidatos)),
    revisados: { total: revisados.length, grupos: agrupar(revisados, ordenDeServicios(candidatos)) },
    sinCandidatos: candidatos.length === 0 ? MENSAJES.censoSinCandidatos : null, // HU-05.4
    todosRevisados: candidatos.length > 0 && porRevisar.length === 0 ? MENSAJES.todosRevisados : null,
    textos,
  };
}

module.exports = { armarRevision, agrupar, verCandidato, cuando, DECISIONES };
