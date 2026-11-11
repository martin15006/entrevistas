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

    /** Para la página de revisión: el censo de una fecha y cuántos candidatos tiene. */
    async resumenDelCenso(fecha) {
      const censo = await censoDelDia(fecha);
      if (!censo) return null;
      const { count, error } = await cliente
        .from('candidatos')
        .select('id', { count: 'exact', head: true })
        .eq('censo_id', censo.id);
      if (error) throw error;
      return { fecha: censo.fecha, candidatos: count ?? 0 };
    },
  };
}

module.exports = { crearDatos };
