-- =====================================================================
-- Entrevistas · 03 · Limpiar los datos de las cuentas de prueba
-- Historial: tercer paso, se aplica DESPUÉS de 02-proteger-registros.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
--
-- Por qué existe: las pruebas en vivo (npm run test:vivo) crean entrevistas "hechas" con
-- cuentas @prueba.test, y el guardia no deja borrar una entrevista hecha, ni al servidor.
-- Esta función es la ÚNICA excepción: solo la puede usar el servidor (llave secreta) y solo
-- borra lo que crearon las cuentas cuyo correo termina en @prueba.test.
-- =====================================================================


-- 1. El guardia de entrevistas, igual que en 02, salvo el borrado: ahora deja pasar el
--    borrado de una entrevista hecha solo mientras corre limpiar_pruebas().
create or replace function public.proteger_entrevista()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid()); -- null cuando es el servidor con la llave secreta
begin
  if tg_op = 'DELETE' then
    if old.estado = 'entrevistado'
       and coalesce(current_setting('entrevistas.limpiando_pruebas', true), '') <> 'si' then
      raise exception 'Una entrevista hecha no se borra' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'entrevistado' and new.estado <> 'entrevistado' then
    raise exception 'Una entrevista hecha no vuelve atrás' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;

  if yo is null then return new; end if;

  if tg_op = 'INSERT' then
    new.estado := 'pendiente';
    new.creado_por := yo;              new.creado_en := now();
    new.entrevistado_por := null;      new.entrevistado_en := null;
    new.corregido_por := null;         new.corregido_en := null;
    new.salio_por := null;             new.salio_en := null;
    new.en_curso_por := null;          new.en_curso_desde := null;
    new.version := 1;
    return new;
  end if;

  new.estancia_id := old.estancia_id;
  new.candidato_id := old.candidato_id;
  new.creado_por := old.creado_por;
  new.creado_en := old.creado_en;

  if new.estado = 'entrevistado' and old.estado <> 'entrevistado' then
    new.entrevistado_por := yo; new.entrevistado_en := now();
  else
    new.entrevistado_por := old.entrevistado_por; new.entrevistado_en := old.entrevistado_en;
  end if;

  if old.estado = 'entrevistado' and (
       new.edad, new.fecha_accidente, new.hora_accidente, new.lugar, new.direccion, new.telefono,
       new.tipo_declaracion, new.relato, new.placa, new.placa_no_sabe
     ) is distinct from (
       old.edad, old.fecha_accidente, old.hora_accidente, old.lugar, old.direccion, old.telefono,
       old.tipo_declaracion, old.relato, old.placa, old.placa_no_sabe
     ) then
    new.corregido_por := yo; new.corregido_en := now();
  else
    new.corregido_por := old.corregido_por; new.corregido_en := old.corregido_en;
  end if;

  if new.estado = 'salio' and old.estado <> 'salio' then
    new.salio_por := yo; new.salio_en := now();
  elsif new.estado <> 'salio' then
    new.salio_por := null; new.salio_en := null;
  else
    new.salio_por := old.salio_por; new.salio_en := old.salio_en;
  end if;

  if new.en_curso_por is distinct from old.en_curso_por or new.en_curso_desde is distinct from old.en_curso_desde then
    if new.en_curso_por is null then
      new.en_curso_desde := null;
    else
      new.en_curso_por := yo; new.en_curso_desde := now();
    end if;
  end if;

  return new;
end;
$$;


-- 2. Borra todo lo que crearon las cuentas @prueba.test: entrevistas, candidatos, censos y
--    las estancias que quedaron sin usar. Las cuentas mismas las borra el script de pruebas
--    con la API de administración de Supabase. Solo la puede usar el servidor.
create or replace function public.limpiar_pruebas()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pruebas uuid[];
  estancias_de_prueba bigint[];
begin
  select coalesce(array_agg(id), '{}') into pruebas
  from public.perfiles where lower(correo) like '%@prueba.test';
  if cardinality(pruebas) = 0 then return; end if;

  -- Solo dentro de esta transacción: el guardia deja borrar entrevistas hechas.
  perform set_config('entrevistas.limpiando_pruebas', 'si', true);

  delete from public.entrevistas where creado_por = any(pruebas);

  with borrados as (
    delete from public.candidatos c
    using public.censos z
    where z.id = c.censo_id and z.subido_por = any(pruebas)
    returning c.estancia_id
  )
  select coalesce(array_agg(distinct estancia_id), '{}') into estancias_de_prueba from borrados;

  delete from public.censos where subido_por = any(pruebas);

  delete from public.estancias e
  where e.id = any(estancias_de_prueba)
    and not exists (select 1 from public.candidatos c where c.estancia_id = e.id)
    and not exists (select 1 from public.entrevistas i where i.estancia_id = e.id);

  perform set_config('entrevistas.limpiando_pruebas', '', true);
end;
$$;
revoke execute on function public.limpiar_pruebas() from public, anon, authenticated;
grant execute on function public.limpiar_pruebas() to service_role;
