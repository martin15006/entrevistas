'use strict';

// Ayudante de pruebas: la puerta a la base (lib/datos.js) con los censos guardados en memoria.
// Imita lo que hace guardar_censo() en la base de verdad (database/05): crea el censo o usa el
// que ya existe, y agrega solo los candidatos nuevos sin tocar la decisión de los que ya estaban.
// Lo de verdad se prueba en vivo (test-vivo/).

const { crearDatos } = require('../../lib/datos');

function crearBaseFalsa() {
  const base = {
    censos: new Map(), // fecha → { id, candidatos: Map(clave de estancia → candidato) }
    llamadas: [], // cada guardarCenso: { fecha, filas }
    siguienteId: 1,
  };

  /** (cliente) => datos: perfilDe sigue usando el Supabase falso; lo del censo, esta base. */
  function fabrica(cliente) {
    return {
      ...crearDatos(cliente),
      async censoDelDia(fecha) {
        const censo = base.censos.get(fecha);
        return censo ? { id: censo.id, fecha } : null;
      },
      async guardarCenso(fecha, filas) {
        base.llamadas.push({ fecha, filas: structuredClone(filas) });
        let censo = base.censos.get(fecha);
        const nuevo = !censo;
        if (!censo) {
          censo = { id: base.siguienteId, candidatos: new Map() };
          base.siguienteId += 1;
          base.censos.set(fecha, censo);
        }
        let agregados = 0;
        for (const fila of filas) {
          const clave = `${fila.cedula}|${fila.fecha_ingreso}`;
          if (censo.candidatos.has(clave)) continue; // ya estaba: no se toca
          censo.candidatos.set(clave, { ...fila, decision: null });
          agregados += 1;
        }
        return { censo_id: censo.id, censo_nuevo: nuevo, agregados, ya_estaban: filas.length - agregados };
      },
      async resumenDelCenso(fecha) {
        const censo = base.censos.get(fecha);
        return censo ? { fecha, candidatos: censo.candidatos.size } : null;
      },
    };
  }

  return { base, fabrica };
}

module.exports = { crearBaseFalsa };
