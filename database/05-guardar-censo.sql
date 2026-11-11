-- =====================================================================
-- Entrevistas · 05 · Guardar el censo de un día en un solo paso (HU-04)
-- Historial: quinto paso, se aplica DESPUÉS de 04-limpiar-solo-pruebas-automaticas.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
--
-- guardar_censo() guarda el censo, sus estancias y sus candidatos en UNA transacción: o queda
-- todo o no queda nada. Corre con los permisos de quien la llama (security invoker): el RLS y
-- los guardias siguen aplicando, y "subido por" queda a su nombre.
-- Si el censo de ese día ya existe, agrega solo los pacientes nuevos y no toca lo que ya se
-- revisó (HU-04.7, CB-03).
-- p_filas: [{ cedula, fecha_ingreso, nombre, nombre_busqueda, piso, cama, dias, orden }]
-- (solo los datos de CL-02, y solo los candidatos: día 0 o 1, sin Quirófano).
-- =====================================================================

create or replace function public.guardar_censo(p_fecha date, p_filas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_censo bigint;
  v_nuevo boolean := false;
  v_total integer;
  v_agregados integer;
begin
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;
  if p_fecha is null or jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'Datos del censo no válidos' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_filas);
  if v_total > 10000 then
    raise exception 'Demasiadas filas' using errcode = '22023';
  end if;

  -- El censo del día: se crea, o se usa el que ya existe.
  insert into public.censos (fecha) values (p_fecha)
  on conflict (fecha) do nothing
  returning id into v_censo;
  if v_censo is null then
    select id into v_censo from public.censos where fecha = p_fecha;
  else
    v_nuevo := true;
  end if;

  -- Las estancias (misma cédula + misma fecha de ingreso, RN-02): las que ya existen se dejan igual.
  insert into public.estancias (cedula, fecha_ingreso, nombre, nombre_busqueda)
  select f.cedula, f.fecha_ingreso, f.nombre, f.nombre_busqueda
  from jsonb_to_recordset(p_filas) as f(cedula text, fecha_ingreso date, nombre text, nombre_busqueda text)
  on conflict (cedula, fecha_ingreso) do nothing;

  -- Los candidatos de este censo: los que ya estaban (con su decisión) no se tocan.
  with nuevos as (
    insert into public.candidatos (censo_id, estancia_id, piso, cama, dias, orden)
    select v_censo, e.id, f.piso, f.cama, f.dias, f.orden
    from jsonb_to_recordset(p_filas) as f(cedula text, fecha_ingreso date, piso text, cama text, dias smallint, orden integer)
    join public.estancias e on e.cedula = f.cedula and e.fecha_ingreso = f.fecha_ingreso
    on conflict (censo_id, estancia_id) do nothing
    returning 1
  )
  select count(*) into v_agregados from nuevos;

  return jsonb_build_object(
    'censo_id', v_censo,
    'censo_nuevo', v_nuevo,
    'agregados', v_agregados,
    'ya_estaban', v_total - v_agregados
  );
end;
$$;
revoke execute on function public.guardar_censo(date, jsonb) from public, anon;
grant execute on function public.guardar_censo(date, jsonb) to authenticated;
