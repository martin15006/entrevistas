'use strict';

// Ayudante de pruebas: la puerta a la base (lib/datos.js) con los datos guardados en memoria.
// Imita lo que hacen en la base de verdad:
// - guardar_censo() (database/05): crea el censo o usa el que ya existe, y agrega solo los
//   candidatos nuevos sin tocar la decisión de los que ya estaban;
// - revision_del_censo() y decidir_candidato() (database/06): la misma regla de "Por revisar"
//   (decidido aquí, con entrevista, o decidido en un censo posterior) y las mismas respuestas.
// Lo de verdad se prueba en vivo (test-vivo/), contra el SQL real.

const { crearDatos } = require('../../lib/datos');

/** @param reloj hora en milisegundos para "decidido en" (las pruebas la fijan) */
function crearBaseFalsa({ reloj = Date.now } = {}) {
  const base = {
    censos: new Map(), // fecha → { id, fecha, candidatos: Map(clave de estancia → candidato) }
    // clave de estancia → { id, candidatoId, estado } (+ lo que pongan las pruebas: enCursoPor, enCursoDesde,
    // entrevistadoPor, entrevistadoEn, salioPor, salioEn).
    entrevistas: new Map(),
    llamadas: [], // cada guardarCenso: { fecha, filas }
    decisiones: [], // cada decidirCandidato: { id, decision, desde }
    siguienteId: 1,
    siguienteCandidato: 1,
    // Como en la base, la entrevista tiene su PROPIO id, distinto del de su candidato (solo los verdes
    // crean entrevista). Empieza en 1001 para que una prueba note si alguien usa uno por el otro (PYA tanda 8).
    siguienteEntrevista: 1001,
  };

  const todos = () => [...base.censos.values()]
    .flatMap((censo) => [...censo.candidatos.values()].map((candidato) => ({ censo, candidato })));
  const buscar = (id) => todos().find(({ candidato }) => candidato.id === id) ?? null;

  /** La decisión más nueva de la misma estancia en un censo POSTERIOR a esa fecha. */
  function posterior(clave, fecha) {
    return todos()
      .filter(({ censo, candidato }) => candidato.clave === clave && candidato.decision && censo.fecha > fecha)
      .sort((a, b) => (a.censo.fecha < b.censo.fecha ? 1 : -1))[0] ?? null;
  }

  const porRevisar = (clave, fecha, decision) => decision === null && !base.entrevistas.has(clave) && !posterior(clave, fecha);

  /** Para las pruebas: decide como si lo hubiera hecho otra persona (sin pasar por la pantalla). */
  function decidirComo(id, decision, por) {
    const { candidato } = buscar(id);
    candidato.decision = decision;
    candidato.decidido_por = por;
    candidato.decidido_en = new Date(reloj()).toISOString();
    if (decision === 'entrevistar') {
      base.entrevistas.set(candidato.clave, { id: base.siguienteEntrevista++, candidatoId: id, estado: 'pendiente' });
    }
    else if (base.entrevistas.get(candidato.clave)?.candidatoId === id) base.entrevistas.delete(candidato.clave);
  }

  /** (cliente) => datos: perfilDe sigue usando el Supabase falso; lo demás, esta base. */
  function fabrica(cliente) {
    const datos = crearDatos(cliente);
    const nombreDe = async (id) => (id ? (await datos.perfilDe(id))?.nombre ?? null : null);
    const yo = async () => (await cliente.auth.getUser()).data.user.id;

    return {
      ...datos,
      async censoDelDia(fecha) {
        const censo = base.censos.get(fecha);
        return censo ? { id: censo.id, fecha } : null;
      },

      async guardarCenso(fecha, filas) {
        base.llamadas.push({ fecha, filas: structuredClone(filas) });
        let censo = base.censos.get(fecha);
        const nuevo = !censo;
        if (!censo) {
          censo = { id: base.siguienteId, fecha, candidatos: new Map() };
          base.siguienteId += 1;
          base.censos.set(fecha, censo);
        }
        let agregados = 0;
        for (const fila of filas) {
          const clave = `${fila.cedula}|${fila.fecha_ingreso}`;
          if (censo.candidatos.has(clave)) continue; // ya estaba: no se toca
          censo.candidatos.set(clave, {
            ...fila, id: base.siguienteCandidato, clave, decision: null, decidido_por: null, decidido_en: null,
          });
          base.siguienteCandidato += 1;
          agregados += 1;
        }
        return { censo_id: censo.id, censo_nuevo: nuevo, agregados, ya_estaban: filas.length - agregados };
      },

      async revisionDelCenso(fecha) {
        const fechas = [...base.censos.keys()].sort().reverse();
        const elegida = fecha ?? fechas[0] ?? null;
        const censo = elegida ? base.censos.get(elegida) ?? null : null;
        const resultado = { dias: fechas.slice(0, 60), censo: null, candidatos: [], pendientes: [] };
        if (!censo) return resultado;

        resultado.censo = { id: censo.id, fecha: censo.fecha };
        for (const c of [...censo.candidatos.values()].sort((a, b) => a.orden - b.orden)) {
          const entrevista = base.entrevistas.get(c.clave);
          let otra = null;
          if (entrevista && (c.decision === null || entrevista.candidatoId !== c.id)) {
            const origen = buscar(entrevista.candidatoId);
            otra = {
              decision: 'entrevistar', por: await nombreDe(origen.candidato.decidido_por),
              en: origen.candidato.decidido_en, fecha: origen.censo.fecha,
            };
          } else {
            const despues = posterior(c.clave, censo.fecha);
            if (despues) {
              otra = {
                decision: despues.candidato.decision, por: await nombreDe(despues.candidato.decidido_por),
                en: despues.candidato.decidido_en, fecha: despues.censo.fecha,
              };
            }
          }
          // HU-07 (database/08) · El rojo más reciente de la MISMA estancia en un censo anterior.
          const rojo = todos()
            .filter(({ censo: z, candidato: r }) => r.clave === c.clave && r.decision === 'no_entrevistar' && z.fecha < censo.fecha)
            .sort((a, b) => (a.censo.fecha < b.censo.fecha ? 1 : -1))[0];
          resultado.candidatos.push({
            id: c.id, piso: c.piso, cama: c.cama, dias: c.dias, orden: c.orden, cedula: c.cedula, nombre: c.nombre,
            por_revisar: porRevisar(c.clave, censo.fecha, c.decision),
            decision: c.decision, decidido_por: await nombreDe(c.decidido_por), decidido_en: c.decidido_en,
            entrevista_hecha: entrevista?.candidatoId === c.id && entrevista.estado === 'entrevistado',
            otra,
            rojo_anterior: rojo ? { fecha: rojo.censo.fecha, por: await nombreDe(rojo.candidato.decidido_por) } : null,
          });
        }
        for (const anterior of fechas.filter((f) => f < censo.fecha)) {
          const pendientes = [...base.censos.get(anterior).candidatos.values()]
            .filter((c) => porRevisar(c.clave, anterior, c.decision)).length;
          if (pendientes > 0) resultado.pendientes.push({ fecha: anterior, pendientes });
        }
        return resultado;
      },

      // Como entrevistas_del_dia() (database/09): todas las pendientes (las más viejas primero) y las
      // entrevistadas y las que salieron del censo elegido.
      async entrevistasDelDia(fecha) {
        const fechas = [...base.censos.keys()].sort().reverse();
        const elegida = fecha ?? fechas[0] ?? null;
        const censo = elegida ? base.censos.get(elegida) ?? null : null;
        const quien = await yo();
        const todas = [...base.entrevistas.values()].map((e) => ({ e, ...buscar(e.candidatoId) }))
          .sort((a, b) => (a.censo.fecha === b.censo.fecha ? a.candidato.orden - b.candidato.orden : (a.censo.fecha < b.censo.fecha ? -1 : 1)));
        const comun = ({ e, candidato: c }) => ({ id: e.id, piso: c.piso, cama: c.cama, cedula: c.cedula, nombre: c.nombre });
        const resultado = {
          dias: fechas.slice(0, 60), censo: censo ? { id: censo.id, fecha: censo.fecha } : null,
          pendientes: [], entrevistados: [], salieron: [],
        };
        for (const x of todas) {
          if (x.e.estado === 'pendiente') {
            resultado.pendientes.push({
              ...comun(x), censo_fecha: x.censo.fecha,
              en_curso_por: await nombreDe(x.e.enCursoPor), en_curso_desde: x.e.enCursoDesde ?? null,
              en_curso_mio: Boolean(x.e.enCursoPor) && x.e.enCursoPor === quien,
            });
          } else if (censo && x.censo.id === censo.id && x.e.estado === 'entrevistado') {
            resultado.entrevistados.push({ ...comun(x), por: await nombreDe(x.e.entrevistadoPor), en: x.e.entrevistadoEn ?? null });
          } else if (censo && x.censo.id === censo.id && x.e.estado === 'salio') {
            resultado.salieron.push({ ...comun(x), por: await nombreDe(x.e.salioPor), en: x.e.salioEn ?? null });
          }
        }
        return resultado;
      },

      async decidirCandidato(id, decision, desde, desdeEn) {
        base.decisiones.push({ id, decision, desde, desdeEn });
        const encontrado = buscar(id);
        if (!encontrado) return { resultado: 'no_existe' };
        const { censo, candidato } = encontrado;
        const entrevista = base.entrevistas.get(candidato.clave);

        if (entrevista && entrevista.candidatoId !== id) {
          return { resultado: 'ya_revisado', por: await nombreDe(buscar(entrevista.candidatoId).candidato.decidido_por) };
        }
        const despues = posterior(candidato.clave, censo.fecha);
        if (despues) return { resultado: 'ya_revisado', por: await nombreDe(despues.candidato.decidido_por) };

        const quien = await yo();
        // Como en la base (database/07): al cambiar, también tiene que ser la misma hora (A→B→A).
        const otraHora = (desde ?? null) !== null && candidato.decidido_en !== (desdeEn ?? null);
        if (candidato.decision !== (desde ?? null) || otraHora) {
          if (candidato.decision === decision && candidato.decidido_por === quien) return { resultado: 'ok' };
          return { resultado: 'ya_revisado', por: await nombreDe(candidato.decidido_por) };
        }
        if (candidato.decision === decision) return { resultado: 'ok' };
        if (entrevista?.estado === 'entrevistado') return { resultado: 'ya_entrevistado' };

        decidirComo(id, decision, quien);
        return { resultado: 'ok' };
      },
    };
  }

  return { base, fabrica, decidirComo, buscar };
}

module.exports = { crearBaseFalsa };
