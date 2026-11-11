-- =====================================================================
-- Entrevistas · 04 · La limpieza solo toca las cuentas de las pruebas automáticas
-- Historial: cuarto paso, se aplica DESPUÉS de 03-limpiar-pruebas.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
--
-- Por qué: en 03, limpiar_pruebas() trataba como de prueba a TODA cuenta @prueba.test. Pero las
-- cuentas de desarrollo de las personas (por ejemplo, el admin de Martín) también usan ese
-- dominio, y sus datos se habrían borrado en cada "npm run test:vivo". Ahora solo cuenta lo
-- que crean las pruebas automáticas: correos que empiezan por "tst-" (tst-…@prueba.test).
-- =====================================================================

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
  from public.perfiles where lower(correo) like 'tst-%@prueba.test';
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
