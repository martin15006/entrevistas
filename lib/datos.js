'use strict';

// La única puerta a la base de datos. Las rutas nunca le hablan a Supabase directo:
// piden los datos aquí. Así cada consulta vive en un solo lugar y, en las pruebas,
// esta puerta se cambia por una falsa (test/ayudantes/datos-falsos.js).
// Todo se hace con la sesión de la persona: el RLS y los guardias de la base aplican.
//
// Va creciendo con cada historia.

function crearDatos(cliente) {
  /** El censo de una fecha ('AAAA-MM-DD'), o null si no se ha subido. */
  async function censoDelDia(fecha) {
    const { data, error } = await cliente.from('censos').select('id, fecha').eq('fecha', fecha).maybeSingle();
    if (error) throw error;
    return data;
  }

  return {
    /** HU-01 · El perfil de una cuenta: nombre, rol y si está activa. null si no tiene perfil. */
    async perfilDe(id) {
      const { data, error } = await cliente
        .from('perfiles')
        .select('id, nombre, rol, activo')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    censoDelDia,

    /**
     * HU-04.2 · Guarda el censo del día y sus candidatos en un solo paso (database/05).
     * filas: lo que devuelve candidatosParaGuardar (lib/resumen-censo.js).
     * Devuelve { censo_id, censo_nuevo, agregados, ya_estaban }.
     */
    async guardarCenso(fecha, filas) {
      const { data, error } = await cliente.rpc('guardar_censo', { p_fecha: fecha, p_filas: filas });
      if (error) throw error;
      return data;
    },

    /**
     * HU-05 · Todo lo de la pantalla de revisión en una sola consulta (database/06).
     * fecha null = el censo más reciente. Devuelve { dias, censo, candidatos, pendientes }.
     */
    async revisionDelCenso(fecha) {
      const { data, error } = await cliente.rpc('revision_del_censo', { p_fecha: fecha ?? null });
      if (error) throw error;
      return data;
    },

    /**
     * HU-06 · Decide en verde o rojo, o cambia la decisión (database/07, la única puerta).
     * desde y desdeEn: la decisión que la pantalla mostraba y su hora (null = sin decidir).
     * Devuelve { resultado, por }.
     */
    async decidirCandidato(id, decision, desde, desdeEn) {
      const { data, error } = await cliente.rpc('decidir_candidato', {
        p_candidato: id, p_decision: decision, p_desde: desde ?? null, p_desde_en: desdeEn ?? null,
      });
      if (error) throw error;
      return data;
    },

    /**
     * HU-08 · Todo lo de la pantalla "Entrevistas" en una consulta (database/10): las pendientes
     * (todas) y las entrevistadas y las que salieron ESE día (null = hoy en Colombia, enmienda 5).
     */
    async entrevistasDelDia(fecha) {
      const { data, error } = await cliente.rpc('entrevistas_del_dia', { p_fecha: fecha ?? null });
      if (error) throw error;
      return data;
    },

    /** HU-09.1 · HU-09.9 · Lo que muestra el formulario de una entrevista (database/10). null si no existe. */
    async verEntrevista(id) {
      const { data, error } = await cliente.rpc('ver_entrevista', { p_id: id });
      if (error) throw error;
      return data;
    },

    /**
     * RN-13 · HU-09.9 · La deja "En curso" a nombre de quien la abre. Si otra persona la está
     * haciendo, solo con igual = true ("Abrir igual"). Devuelve { resultado, desde, por }.
     */
    async abrirEntrevista(id, igual = false) {
      const { data, error } = await cliente.rpc('abrir_entrevista', { p_id: id, p_igual: igual === true });
      if (error) throw error;
      return data;
    },

    /** RN-13 · La suelta al salir del formulario, solo si es MI apertura (desde: la que dio abrir). */
    async soltarEntrevista(id, desde) {
      const { data, error } = await cliente.rpc('soltar_entrevista', { p_id: id, p_desde: desde });
      if (error) throw error;
      return data;
    },

    /** RN-13 · Al cerrar sesión: suelta todas las que la cuenta tenía abiertas. */
    async soltarMisEntrevistas() {
      const { data, error } = await cliente.rpc('soltar_mis_entrevistas');
      if (error) throw error;
      return data;
    },

    /**
     * HU-09.4 · CB-17 · La guarda y pasa a Entrevistado (la única puerta, database/10).
     * datos: lo que devuelve validarEntrevista (lib/reglas.js). Devuelve { resultado, por }.
     */
    async guardarEntrevista(id, datos) {
      const { data, error } = await cliente.rpc('guardar_entrevista', { p_id: id, p_datos: datos });
      if (error) throw error;
      return data;
    },
  };
}

module.exports = { crearDatos };
