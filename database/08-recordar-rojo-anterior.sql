-- =====================================================================
-- Entrevistas · 08 · Recordar un rojo anterior (HU-07)
-- Historial: octavo paso, se aplica DESPUÉS de 07-decidir-por-una-sola-puerta.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
--
-- revision_del_censo() devuelve además, para cada candidato, el rojo más reciente que tuvo
-- SU estancia (misma cédula + misma fecha de ingreso, RN-02) en un censo anterior: la fecha de
-- ese censo y quién lo marcó. La pantalla lo muestra en "Por revisar" (RN-04):
-- "El [fecha] se marcó como NO entrevistar (por [nombre])." (HU-07.1). Otra estancia de la
-- misma cédula no lo trae (HU-07.3). Lo demás de la función queda igual que en 06.
-- =====================================================================

create or replace function public.revision_del_censo(p_fecha date default null)
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
    -- Los días para el selector (HU-05.1), del más nuevo al más viejo.
    'dias', coalesce((
      select jsonb_agg(d.fecha order by d.fecha desc)
      from (select fecha from public.censos order by fecha desc limit 60) d
    ), '[]'::jsonb),

    'censo', case when v_id is null then null
                  else jsonb_build_object('id', v_id, 'fecha', v_fecha) end,

    -- Los candidatos, en el orden de las filas del censo (RN-09).
    'candidatos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'piso', c.piso, 'cama', c.cama, 'dias', c.dias, 'orden', c.orden,
        'cedula', e.cedula, 'nombre', e.nombre,
        'por_revisar', public.por_revisar(c.estancia_id, v_fecha, c.decision),
        'decision', c.decision, 'decidido_por', pd.nombre, 'decidido_en', c.decidido_en,
        'entrevista_hecha', coalesce(i.candidato_id = c.id and i.estado = 'entrevistado', false),
        -- La decisión que manda y se tomó en OTRO censo: ahí es donde se cambia.
        'otra', case
          when i.id is not null and (c.decision is null or i.candidato_id <> c.id) then
            jsonb_build_object('decision', 'entrevistar', 'por', origen.nombre,
                               'en', origen.decidido_en, 'fecha', origen.fecha)
          when despues.fecha is not null then
            jsonb_build_object('decision', despues.decision, 'por', despues.nombre,
                               'en', despues.decidido_en, 'fecha', despues.fecha)
        end,
        -- HU-07 · El rojo más reciente de esta MISMA estancia en un censo ANTERIOR (RN-04),
        -- con la fecha de ese censo (Martín, 2026-11-12) y quién lo marcó.
        'rojo_anterior', case when rojo.fecha is not null
          then jsonb_build_object('fecha', rojo.fecha, 'por', rojo.nombre) end
      ) order by c.orden)
      from public.candidatos c
      join public.estancias e on e.id = c.estancia_id
      left join public.perfiles pd on pd.id = c.decidido_por
      left join public.entrevistas i on i.estancia_id = c.estancia_id
      left join lateral (
        select z.fecha, o.decidido_en, po.nombre
        from public.candidatos o
        join public.censos z on z.id = o.censo_id
        left join public.perfiles po on po.id = o.decidido_por
        where o.id = i.candidato_id
      ) origen on true
      left join lateral (
        select z.fecha, d.decision, d.decidido_en, pp.nombre
        from public.candidatos d
        join public.censos z on z.id = d.censo_id
        left join public.perfiles pp on pp.id = d.decidido_por
        where d.estancia_id = c.estancia_id and d.decision is not null and z.fecha > v_fecha
        order by z.fecha desc
        limit 1
      ) despues on true
      left join lateral (
        select z.fecha, pr.nombre
        from public.candidatos r
        join public.censos z on z.id = r.censo_id
        left join public.perfiles pr on pr.id = r.decidido_por
        where r.estancia_id = c.estancia_id and r.decision = 'no_entrevistar' and z.fecha < v_fecha
        order by z.fecha desc
        limit 1
      ) rojo on true
      where c.censo_id = v_id
    ), '[]'::jsonb),

    -- HU-05.5 · Los censos ANTERIORES que todavía tienen pacientes por revisar.
    'pendientes', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', t.fecha, 'pendientes', t.n) order by t.fecha desc)
      from (
        select z.fecha, count(*) as n
        from public.candidatos c
        join public.censos z on z.id = c.censo_id
        where z.fecha < v_fecha and c.decision is null
          and public.por_revisar(c.estancia_id, z.fecha, c.decision)
        group by z.fecha
      ) t
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.revision_del_censo(date) from public, anon;
grant execute on function public.revision_del_censo(date) to authenticated;
