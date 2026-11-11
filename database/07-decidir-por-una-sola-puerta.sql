-- =====================================================================
-- Entrevistas · 07 · Decidir solo por decidir_candidato (revisión PYA de la tanda 5)
-- Historial: séptimo paso, se aplica DESPUÉS de 06-revision.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
--
-- Por qué: en 06, las reglas de HU-06 (gana el primero, no se cambia una entrevista hecha, se
-- decide donde se decidió, verde crea la Pendiente y rojo la borra) vivían solo DENTRO de
-- decidir_candidato. Pero el RLS dejaba que cualquier cuenta activa cambiara la decisión o
-- creara y borrara entrevistas escribiendo directo en las tablas, saltándose la función.
-- Ahora la función es la ÚNICA puerta:
--   1. Una entrevista solo puede apuntar al candidato de SU estancia.
--   2. A las cuentas se les quita cambiar candidatos y crear o borrar entrevistas directo.
--      Llenar, corregir y marcar "Salió" (HU-09 a HU-11) siguen siendo un UPDATE de entrevistas.
--   3. decidir_candidato corre con los permisos de su dueño (security definer). Igual exige una
--      cuenta activa, y auth.uid() sigue siendo quien la llama: los guardias anotan a esa persona.
--      Además bloquea la entrevista antes de mirarla (alguien podía marcarla hecha en medio), y
--      compara también la hora de la decisión que la pantalla mostraba: si alguien la cambió y la
--      volvió a dejar igual (A→B→A), tampoco es lo que se veía (CB-16).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Una entrevista apunta al candidato de su misma estancia.
-- ---------------------------------------------------------------------
alter table public.candidatos add constraint candidatos_id_estancia unique (id, estancia_id);
alter table public.entrevistas add constraint entrevistas_candidato_de_su_estancia foreign key (candidato_id, estancia_id) references public.candidatos (id, estancia_id);


-- ---------------------------------------------------------------------
-- 2. Nadie decide ni crea o borra entrevistas escribiendo directo en las tablas.
--    (Las políticas de 01 se quedan: sin el permiso no sirven, pero dicen la regla.)
-- ---------------------------------------------------------------------
revoke update on public.candidatos from authenticated;
revoke insert, delete on public.entrevistas from authenticated;


-- ---------------------------------------------------------------------
-- 3. decidir_candidato, la única puerta. p_desde_en: la hora de la decisión que se veía.
-- ---------------------------------------------------------------------
drop function public.decidir_candidato(bigint, text, text);

create or replace function public.decidir_candidato(p_candidato bigint, p_decision text, p_desde text default null, p_desde_en timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_estancia bigint;
  v_fecha date;
  v_decision text;
  v_por uuid;
  v_en timestamptz;
  v_entrevista bigint;
  v_entrevista_de bigint;
  v_estado text;
  v_otro_por uuid;
begin
  -- Corre con permisos de dueño: esta revisión es la que deja afuera a quien no debe entrar.
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

  -- CB-16 · Las decisiones sobre un mismo paciente (en cualquier censo) se hacen en fila.
  perform 1 from public.estancias where id = v_estancia for update;
  if not found then
    raise exception 'No se pudo apartar al paciente' using errcode = '55P03';
  end if;

  select decision, decidido_por, decidido_en into v_decision, v_por, v_en
  from public.candidatos where id = p_candidato;
  -- La entrevista también se aparta: así nadie la marca hecha mientras se decide.
  select id, candidato_id, estado into v_entrevista, v_entrevista_de, v_estado
  from public.entrevistas where estancia_id = v_estancia
  for update;

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

  -- La pantalla mostraba otra cosa: alguien decidió un momento antes (HU-06.5, CB-16). Al cambiar
  -- una decisión se compara también su hora: A→B→A deja el mismo color, pero no la misma decisión.
  if v_decision is distinct from p_desde
     or (p_desde is not null and v_en is distinct from p_desde_en) then
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
    if not found then
      raise exception 'La entrevista cambió mientras se decidía' using errcode = '40001';
    end if;
  end if;

  return jsonb_build_object('resultado', 'ok');
end;
$$;
revoke execute on function public.decidir_candidato(bigint, text, text, timestamptz) from public, anon;
grant execute on function public.decidir_candidato(bigint, text, text, timestamptz) to authenticated;
