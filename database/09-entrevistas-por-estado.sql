-- =====================================================================
-- Entrevistas · 09 · Las entrevistas por estado (HU-08)
-- Historial: noveno paso, se aplica DESPUÉS de 08-recordar-rojo-anterior.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
--
-- entrevistas_del_dia() trae todo lo de la pantalla "Entrevistas" en una sola consulta:
--   · pendientes: TODAS, vengan del censo que vengan (HU-08.2), con "En curso" (RN-13);
--   · entrevistados y salieron: las del censo elegido, es decir, las que se decidieron en verde
--     ese día (RN-05), con quién y a qué hora (HU-08.3).
-- p_fecha null = el censo más reciente. Solo lee: corre con los permisos de quien la llama
-- (security invoker), así el RLS sigue mandando.
-- =====================================================================

create or replace function public.entrevistas_del_dia(p_fecha date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_fecha date;
begin
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;

  if p_fecha is null then
    select id, fecha into v_id, v_fecha from public.censos order by fecha desc limit 1;
  else
    select id, fecha into v_id, v_fecha from public.censos where fecha = p_fecha;
  end if;

  return jsonb_build_object(
    -- Los días para el selector (HU-08.3), del más nuevo al más viejo.
    'dias', coalesce((
      select jsonb_agg(d.fecha order by d.fecha desc)
      from (select fecha from public.censos order by fecha desc limit 60) d
    ), '[]'::jsonb),

    'censo', case when v_id is null then null
                  else jsonb_build_object('id', v_id, 'fecha', v_fecha) end,

    -- HU-08.2 · Todas las pendientes. La cama y el servicio son los del último censo si ya se
    -- conocen (HU-12) y, si no, los del censo donde se decidió. Van primero las más viejas.
    'pendientes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'piso', coalesce(i.piso_actual, c.piso), 'cama', coalesce(i.cama_actual, c.cama),
        'cedula', e.cedula, 'nombre', e.nombre, 'censo_fecha', z.fecha,
        -- RN-13 · Quién la abrió y desde cuándo; si fui yo, no hace falta avisarme.
        'en_curso_por', pc.nombre, 'en_curso_desde', i.en_curso_desde,
        'en_curso_mio', coalesce(i.en_curso_por = (select auth.uid()), false)
      ) order by z.fecha, c.orden)
      from public.entrevistas i
      join public.candidatos c on c.id = i.candidato_id
      join public.censos z on z.id = c.censo_id
      join public.estancias e on e.id = i.estancia_id
      left join public.perfiles pc on pc.id = i.en_curso_por
      where i.estado = 'pendiente'
    ), '[]'::jsonb),

    -- HU-08.3 · Las hechas, del censo elegido.
    'entrevistados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'piso', coalesce(i.piso_actual, c.piso), 'cama', coalesce(i.cama_actual, c.cama),
        'cedula', e.cedula, 'nombre', e.nombre, 'por', pe.nombre, 'en', i.entrevistado_en
      ) order by c.orden)
      from public.entrevistas i
      join public.candidatos c on c.id = i.candidato_id
      join public.estancias e on e.id = i.estancia_id
      left join public.perfiles pe on pe.id = i.entrevistado_por
      where i.estado = 'entrevistado' and c.censo_id = v_id
    ), '[]'::jsonb),

    -- HU-08.3 · Las que salieron, del censo elegido.
    'salieron', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'piso', coalesce(i.piso_actual, c.piso), 'cama', coalesce(i.cama_actual, c.cama),
        'cedula', e.cedula, 'nombre', e.nombre, 'por', ps.nombre, 'en', i.salio_en
      ) order by c.orden)
      from public.entrevistas i
      join public.candidatos c on c.id = i.candidato_id
      join public.estancias e on e.id = i.estancia_id
      left join public.perfiles ps on ps.id = i.salio_por
      where i.estado = 'salio' and c.censo_id = v_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.entrevistas_del_dia(date) from public, anon;
grant execute on function public.entrevistas_del_dia(date) to authenticated;
