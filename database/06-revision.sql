-- =====================================================================
-- Entrevistas · 06 · La revisión del censo y la decisión en verde o rojo (HU-05, HU-06)
-- Historial: sexto paso, se aplica DESPUÉS de 05-guardar-censo.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
--
-- Tres funciones y un ajuste a un guardia. Todas corren con los permisos de quien las llama
-- (security invoker): el RLS y los guardias siguen aplicando, y cada decisión queda a su nombre.
--
-- ¿Cuándo un candidato ya está revisado? (HU-05.3, RN-03 y la aclaración del 2026-11-11)
--   · si se decidió en este censo, o
--   · si su estancia ya tiene entrevista (en cualquier estado, RN-03), o
--   · si su estancia se decidió en un censo POSTERIOR (así nadie lo verifica dos veces).
-- Un rojo de un censo ANTERIOR no cuenta: vuelve a "Por revisar" (RN-04, el aviso es HU-07).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La regla de "Por revisar", en un solo lugar: la usan la lista y el aviso de HU-05.5.
-- ---------------------------------------------------------------------
create or replace function public.por_revisar(p_estancia bigint, p_fecha date, p_decision text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_decision is null
    and not exists (select 1 from public.entrevistas i where i.estancia_id = p_estancia)
    and not exists (
      select 1
      from public.candidatos d
      join public.censos z on z.id = d.censo_id
      where d.estancia_id = p_estancia and d.decision is not null and z.fecha > p_fecha
    );
$$;
revoke execute on function public.por_revisar(bigint, date, text) from public, anon;
grant execute on function public.por_revisar(bigint, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. Todo lo que muestra la pantalla de revisión, en una sola consulta (HU-05).
--    p_fecha null = el censo más reciente (HU-05.1). Supabase entrega máximo 1.000 filas por
--    consulta: por eso los pendientes de los días anteriores se cuentan aquí y no en el servidor.
-- ---------------------------------------------------------------------
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
        end
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


-- ---------------------------------------------------------------------
-- 3. Decidir en verde o rojo, o cambiar la decisión (HU-06, RN-05, RN-07, RN-08).
--    p_desde es la decisión que la pantalla mostraba (null = "sin decidir"). Si ya no es la
--    que hay, alguien decidió antes: gana el primero (CB-16) y se responde quién fue.
--    Respuesta: { resultado: 'ok' | 'ya_revisado' | 'ya_entrevistado' | 'no_existe', por }.
-- ---------------------------------------------------------------------
create or replace function public.decidir_candidato(p_candidato bigint, p_decision text, p_desde text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_estancia bigint;
  v_fecha date;
  v_decision text;
  v_por uuid;
  v_entrevista bigint;
  v_entrevista_de bigint;
  v_estado text;
  v_otro_por uuid;
begin
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('entrevistar', 'no_entrevistar')
     or (p_desde is not null and p_desde not in ('entrevistar', 'no_entrevistar')) then
    raise exception 'Decisión no válida' using errcode = '22023';
  end if;

  select c.estancia_id, z.fecha into v_estancia, v_fecha
  from public.candidatos c
  join public.censos z on z.id = c.censo_id
  where c.id = p_candidato;
  if v_estancia is null then
    return jsonb_build_object('resultado', 'no_existe');
  end if;

  -- CB-16 · Las decisiones sobre un mismo paciente (en cualquier censo) se hacen en fila:
  -- quien llega segundo espera aquí y después ve lo que decidió el primero.
  perform 1 from public.estancias where id = v_estancia for update;

  select decision, decidido_por into v_decision, v_por from public.candidatos where id = p_candidato;
  select id, candidato_id, estado into v_entrevista, v_entrevista_de, v_estado
  from public.entrevistas where estancia_id = v_estancia;

  -- Ya se decidió en otro censo (RN-03, o uno posterior): se cambia allá, no aquí.
  if v_entrevista is not null and v_entrevista_de <> p_candidato then
    select decidido_por into v_otro_por from public.candidatos where id = v_entrevista_de;
    return jsonb_build_object('resultado', 'ya_revisado',
      'por', (select nombre from public.perfiles where id = v_otro_por));
  end if;
  select d.decidido_por into v_otro_por
  from public.candidatos d
  join public.censos z on z.id = d.censo_id
  where d.estancia_id = v_estancia and d.decision is not null and z.fecha > v_fecha
  order by z.fecha desc
  limit 1;
  if v_otro_por is not null then
    return jsonb_build_object('resultado', 'ya_revisado',
      'por', (select nombre from public.perfiles where id = v_otro_por));
  end if;

  -- La pantalla mostraba otra cosa: alguien decidió un momento antes (HU-06.5, CB-16).
  if v_decision is distinct from p_desde then
    if v_decision = p_decision and v_por = v_yo then
      return jsonb_build_object('resultado', 'ok'); -- CB-24: el mismo toque llegó dos veces
    end if;
    return jsonb_build_object('resultado', 'ya_revisado',
      'por', (select nombre from public.perfiles where id = v_por));
  end if;
  if v_decision = p_decision then
    return jsonb_build_object('resultado', 'ok'); -- ya estaba así: nada que cambiar
  end if;

  -- RN-07 · CB-11 · Con la entrevista hecha, la decisión ya no cambia.
  if v_estado = 'entrevistado' then
    return jsonb_build_object('resultado', 'ya_entrevistado');
  end if;

  -- El guardia de candidatos pone quién y cuándo (RN-08).
  update public.candidatos set decision = p_decision where id = p_candidato;
  if p_decision = 'entrevistar' then
    -- RN-05 · Verde crea la entrevista Pendiente, ligada a este censo.
    insert into public.entrevistas (estancia_id, candidato_id, creado_por)
    values (v_estancia, p_candidato, v_yo);
  elsif v_entrevista is not null then
    -- RN-07 · De verde a rojo se borra la entrevista Pendiente o Salió.
    delete from public.entrevistas where id = v_entrevista;
  end if;

  return jsonb_build_object('resultado', 'ok');
end;
$$;
revoke execute on function public.decidir_candidato(bigint, text, text) from public, anon;
grant execute on function public.decidir_candidato(bigint, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Guardia de candidatos (02, ajustado): además, una decisión no vuelve a "sin decidir".
--    Se puede cambiar de color (RN-07), pero no borrar quién la tomó (RN-08).
-- ---------------------------------------------------------------------
create or replace function public.proteger_candidato()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid());
begin
  if yo is null then return new; end if;

  if tg_op = 'INSERT' then
    new.decision := null; new.decidido_por := null; new.decidido_en := null; -- nace sin decidir
    return new;
  end if;

  new.censo_id := old.censo_id;   new.estancia_id := old.estancia_id;
  new.piso := old.piso;           new.cama := old.cama;
  new.dias := old.dias;           new.orden := old.orden;

  if new.decision is distinct from old.decision then
    if new.decision is null then
      raise exception 'Una decisión no vuelve a quedar sin decidir' using errcode = 'check_violation';
    end if;
    new.decidido_por := yo; new.decidido_en := now();
  else
    new.decidido_por := old.decidido_por; new.decidido_en := old.decidido_en;
  end if;
  return new;
end;
$$;
