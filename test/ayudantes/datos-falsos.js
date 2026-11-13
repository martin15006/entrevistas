'use strict';

// Ayudante de pruebas: la puerta a la base (lib/datos.js) con los datos guardados en memoria.
// Imita lo que hacen en la base de verdad:
// - guardar_censo() (database/05): crea el censo o usa el que ya existe, y agrega solo los
//   candidatos nuevos sin tocar la decisión de los que ya estaban;
// - revision_del_censo() y decidir_candidato() (database/06): la misma regla de "Por revisar"
//   (decidido aquí, con entrevista, o decidido en un censo posterior) y las mismas respuestas.
// Lo de verdad se prueba en vivo (test-vivo/), contra el SQL real.

const { crearDatos } = require('../../lib/datos');
const { hoyBogota } = require('../../lib/fechas');

// RN-13 · CB-27 · Como en la base (en_curso_vigente, database/10): "En curso" dura 15 minutos.
const QUINCE_MINUTOS = 15 * 60 * 1000;
// Una entrevista pendiente todavía no tiene datos (como en la base: todo en null).
const VACIA = Object.freeze({
  edad: null, fecha_accidente: null, hora_accidente: null, lugar: null, direccion: null, telefono: null,
  tipo_declaracion: null, relato: null, placa: null, placa_no_sabe: false,
});

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
    aperturas: [], // cada abrirEntrevista: { id, igual }
    soltadas: [], // cada soltarEntrevista: { id, desde }
    soltadasTodas: [], // cada soltarMisEntrevistas: quién
    guardados: [], // cada guardarEntrevista: { id, datos }
    hoyDeLaBase: null, // para simular que el reloj de la base va en otro día que el del servidor
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

  /** La entrevista con ese id (el SUYO, no el del candidato), con su censo y su candidato. */
  function entrevistaPorId(id) {
    const e = [...base.entrevistas.values()].find((x) => x.id === id);
    return e ? { e, ...buscar(e.candidatoId) } : null;
  }

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
    /** RN-13 · El nombre de quien la está haciendo, solo si es OTRA persona y no pasaron 15 minutos. */
    const enCursoDeOtro = async (e, quien) => {
      if (!e.enCursoPor || e.enCursoPor === quien) return null;
      const desde = Date.parse(e.enCursoDesde);
      return Number.isNaN(desde) || reloj() - desde >= QUINCE_MINUTOS ? null : nombreDe(e.enCursoPor);
    };

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

      // Como entrevistas_del_dia() (database/10): todas las pendientes (las más viejas primero), y las
      // entrevistadas y las que salieron ESE día en Colombia (enmienda 5), cada una con su censo.
      async entrevistasDelDia(fecha) {
        const hoy = hoyBogota(new Date(reloj()));
        const dia = fecha ?? hoy;
        const quien = await yo();
        const delDia = (instante) => (instante ? hoyBogota(new Date(instante)) : null);
        const todas = [...base.entrevistas.values()].map((e) => ({ e, ...buscar(e.candidatoId) }))
          .sort((a, b) => (a.censo.fecha === b.censo.fecha ? a.candidato.orden - b.candidato.orden : (a.censo.fecha < b.censo.fecha ? -1 : 1)));
        const comun = ({ e, candidato: c, censo: z }) => ({
          id: e.id, piso: c.piso, cama: c.cama, cedula: c.cedula, nombre: c.nombre, censo_fecha: z.fecha,
        });
        const hechos = new Set([hoy]);
        for (const { e } of todas) {
          if (e.estado === 'entrevistado' && e.entrevistadoEn) hechos.add(delDia(e.entrevistadoEn));
          if (e.estado === 'salio' && e.salioEn) hechos.add(delDia(e.salioEn));
        }
        const resultado = {
          hoy, dia,
          dias_censo: [...base.censos.keys()].sort().reverse().slice(0, 60),
          dias: [...hechos].sort().reverse().slice(0, 60),
          pendientes: [], entrevistados: [], salieron: [],
        };
        for (const x of todas) {
          if (x.e.estado === 'pendiente') {
            resultado.pendientes.push({ ...comun(x), en_curso_por: await enCursoDeOtro(x.e, quien) });
          } else if (x.e.estado === 'entrevistado' && delDia(x.e.entrevistadoEn) === dia) {
            resultado.entrevistados.push({ ...comun(x), por: await nombreDe(x.e.entrevistadoPor), en: x.e.entrevistadoEn ?? null });
          } else if (x.e.estado === 'salio' && delDia(x.e.salioEn) === dia) {
            resultado.salieron.push({ ...comun(x), por: await nombreDe(x.e.salioPor), en: x.e.salioEn ?? null });
          }
        }
        return resultado;
      },

      // --- HU-09 · Como ver_entrevista, abrir_entrevista, soltar_entrevista y guardar_entrevista (database/10). ---

      async verEntrevista(id) {
        const encontrada = entrevistaPorId(id);
        if (!encontrada) return null;
        const { e, censo: z, candidato: c } = encontrada;
        return {
          id: e.id, estado: e.estado, hoy: hoyBogota(new Date(reloj())),
          piso: c.piso, cama: c.cama, cedula: c.cedula, nombre: c.nombre, censo_fecha: z.fecha,
          ...VACIA, ...(e.datos ?? {}),
          en_curso_por: await enCursoDeOtro(e, await yo()),
        };
      },

      async abrirEntrevista(id, igual = false) {
        base.aperturas.push({ id, igual });
        const encontrada = entrevistaPorId(id);
        if (!encontrada) return { resultado: 'no_existe' };
        if (encontrada.e.estado !== 'pendiente') return { resultado: 'no_pendiente' };
        const quien = await yo();
        // HU-09.9 · Si otra persona la está haciendo, sin "Abrir igual" no se le quita.
        if (!igual) {
          const otra = await enCursoDeOtro(encontrada.e, quien);
          if (otra) return { resultado: 'en_curso', por: otra };
        }
        const desde = new Date(reloj()).toISOString();
        Object.assign(encontrada.e, { enCursoPor: quien, enCursoDesde: desde });
        return { resultado: 'ok', desde };
      },

      async soltarEntrevista(id, desde) {
        base.soltadas.push({ id, desde });
        const encontrada = entrevistaPorId(id);
        // Solo MI apertura: la misma hora que dio abrir.
        if (encontrada && encontrada.e.enCursoPor === await yo() && encontrada.e.enCursoDesde === desde) {
          Object.assign(encontrada.e, { enCursoPor: null, enCursoDesde: null });
        }
        return { resultado: 'ok' };
      },

      async soltarMisEntrevistas() {
        const quien = await yo();
        base.soltadasTodas.push(quien);
        for (const e of base.entrevistas.values()) {
          if (e.enCursoPor === quien && e.estado === 'pendiente') Object.assign(e, { enCursoPor: null, enCursoDesde: null });
        }
        return { resultado: 'ok' };
      },

      async guardarEntrevista(id, datosDeLaEntrevista) {
        base.guardados.push({ id, datos: structuredClone(datosDeLaEntrevista) });
        const encontrada = entrevistaPorId(id);
        if (!encontrada) return { resultado: 'no_existe' };
        const { e } = encontrada;
        const quien = await yo();
        if (e.estado === 'entrevistado') {
          // CB-24 · El MISMO guardado otra vez es un ok; con otros datos no se pisa nada.
          if (e.entrevistadoPor === quien && JSON.stringify(e.datos) === JSON.stringify(datosDeLaEntrevista)) return { resultado: 'ok' };
          return { resultado: 'ya_entrevistado', por: await nombreDe(e.entrevistadoPor) };
        }
        if (e.estado === 'salio') return { resultado: 'salio', por: await nombreDe(e.salioPor) };
        // Como la base: la fecha del accidente no puede ser posterior a hoy (con SU reloj), ni faltar un obligatorio.
        const hoyDeLaBase = base.hoyDeLaBase ?? hoyBogota(new Date(reloj()));
        if (datosDeLaEntrevista.fecha_accidente > hoyDeLaBase) throw Object.assign(new Error('fecha posterior a hoy'), { code: '22023' });
        for (const obligatorio of ['edad', 'fecha_accidente', 'lugar', 'tipo_declaracion', 'relato']) {
          if (datosDeLaEntrevista[obligatorio] === null || datosDeLaEntrevista[obligatorio] === '') throw new Error(`falta ${obligatorio}`);
        }
        Object.assign(e, {
          estado: 'entrevistado', datos: structuredClone(datosDeLaEntrevista),
          entrevistadoPor: quien, entrevistadoEn: new Date(reloj()).toISOString(), enCursoPor: null, enCursoDesde: null,
        });
        return { resultado: 'ok' };
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
