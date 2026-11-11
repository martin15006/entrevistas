-- =====================================================================
-- Entrevistas · 02 · La base protege quién hizo cada cosa y las entrevistas hechas
-- Historial: segundo paso, aplicado el 2026-11-09 DESPUÉS de 01-esquema.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
-- Sale de la revisión de seguridad (PYA) de la tanda 2.
--
-- Los "triggers" son guardias que la base corre antes de cada cambio. Funcionan aunque
-- alguien le hable a la base sin pasar por nuestro servidor: son la segunda cerradura.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Cuenta activa = perfil activo + una sesión que todavía existe.
--    Así, al cerrar las sesiones de alguien (cerrar_sesiones, HU-02.6 y 02.9), su token
--    deja de servir en ese mismo momento, sin esperar a que venza (hasta 1 hora).
-- ---------------------------------------------------------------------
create or replace function public.es_cuenta_activa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.activo
  )
  and exists (
    select 1 from auth.sessions s
    where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and s.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.es_cuenta_activa() from public, anon;
grant execute on function public.es_cuenta_activa() to authenticated;


-- ---------------------------------------------------------------------
-- 2. Entrevistas (RN-05, RN-06, RN-08, CB-11, CB-17, RN-13)
-- ---------------------------------------------------------------------
create or replace function public.proteger_entrevista()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid()); -- null cuando es el servidor con la llave secreta
begin
  -- Una entrevista hecha no se borra ni vuelve atrás: tampoco el servidor (RN-06, CB-11).
  if tg_op = 'DELETE' then
    if old.estado = 'entrevistado' then
      raise exception 'Una entrevista hecha no se borra' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'entrevistado' and new.estado <> 'entrevistado' then
    raise exception 'Una entrevista hecha no vuelve atrás' using errcode = 'check_violation';
  end if;

  -- Cada cambio sube la versión: si dos personas guardan a la vez, gana la primera (CB-17).
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;

  if yo is null then return new; end if;

  if tg_op = 'INSERT' then
    -- Una entrevista nace pendiente y a nombre de quien la crea (RN-05, RN-08).
    new.estado := 'pendiente';
    new.creado_por := yo;              new.creado_en := now();
    new.entrevistado_por := null;      new.entrevistado_en := null;
    new.corregido_por := null;         new.corregido_en := null;
    new.salio_por := null;             new.salio_en := null;
    new.en_curso_por := null;          new.en_curso_desde := null;
    new.version := 1;
    return new;
  end if;

  -- UPDATE: lo que identifica a la entrevista y quién la creó no cambian nunca.
  new.estancia_id := old.estancia_id;
  new.candidato_id := old.candidato_id;
  new.creado_por := old.creado_por;
  new.creado_en := old.creado_en;

  -- "Hecha por": la base pone a quien la deja en Entrevistado.
  if new.estado = 'entrevistado' and old.estado <> 'entrevistado' then
    new.entrevistado_por := yo; new.entrevistado_en := now();
  else
    new.entrevistado_por := old.entrevistado_por; new.entrevistado_en := old.entrevistado_en;
  end if;

  -- "Corregida por": quien cambia un dato de una entrevista ya hecha (HU-11).
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

  -- "Salió": a nombre de quien lo marca; "Deshacer" lo limpia (HU-10).
  if new.estado = 'salio' and old.estado <> 'salio' then
    new.salio_por := yo; new.salio_en := now();
  elsif new.estado <> 'salio' then
    new.salio_por := null; new.salio_en := null;
  else
    new.salio_por := old.salio_por; new.salio_en := old.salio_en;
  end if;

  -- "En curso": cada quien solo se puede apartar a sí mismo; soltarlo sí se permite (RN-13).
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

create trigger proteger_entrevista
  before insert or update or delete on public.entrevistas
  for each row execute function public.proteger_entrevista();


-- ---------------------------------------------------------------------
-- 3. Candidatos: la decisión va a nombre de quien decide (RN-08); lo que vino del censo
--    (servicio, cama, días, orden) no se cambia después.
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
      new.decidido_por := null; new.decidido_en := null;
    else
      new.decidido_por := yo; new.decidido_en := now();
    end if;
  else
    new.decidido_por := old.decidido_por; new.decidido_en := old.decidido_en;
  end if;
  return new;
end;
$$;

create trigger proteger_candidato
  before insert or update on public.candidatos
  for each row execute function public.proteger_candidato();


-- ---------------------------------------------------------------------
-- 4. Censos: "subido por" es siempre quien lo sube (RN-08).
--    Estancias: la cédula y la fecha de ingreso no cambian (RN-02).
-- ---------------------------------------------------------------------
create or replace function public.proteger_censo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  yo uuid := (select auth.uid());
begin
  if yo is not null then
    new.subido_por := yo;
    new.subido_en := now();
  end if;
  return new;
end;
$$;

create trigger proteger_censo
  before insert on public.censos
  for each row execute function public.proteger_censo();

create or replace function public.proteger_estancia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cedula := old.cedula;
  new.fecha_ingreso := old.fecha_ingreso;
  return new;
end;
$$;

create trigger proteger_estancia
  before update on public.estancias
  for each row execute function public.proteger_estancia();

-- (Las funciones de los guardias no se pueden llamar a mano: PostgreSQL solo deja usarlas
-- como trigger. Por eso no hace falta quitarles permisos.)


-- ---------------------------------------------------------------------
-- 5. Perfiles: los compañeros ven nombre y rol, no el correo (CL-02, lo mínimo).
--    El correo solo lo ve el servidor con la llave secreta (pantalla de Usuarios, HU-02).
-- ---------------------------------------------------------------------
revoke select on public.perfiles from authenticated;
grant select (id, nombre, rol, activo, creado_en) on public.perfiles to authenticated;


-- ---------------------------------------------------------------------
-- 6. Una tabla nueva que se cree más adelante no queda abierta a visitantes sin sesión.
-- ---------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon;
