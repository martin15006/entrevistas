-- =====================================================================
-- Entrevistas · GLOBAL: la base completa en un solo archivo
--
-- Para una base NUEVA o vacía (por ejemplo, si se borró o al pasar al Supabase de la
-- clínica): se pega este archivo entero en el SQL Editor y se corre UNA vez.
-- Para una base que ya existe: NO se usa este archivo; se corren solo los archivos
-- numerados que falten (01-esquema.sql, 02-proteger-registros.sql…), en orden.
--
-- Es la suma limpia de: 01-esquema.sql + 02-proteger-registros.sql + 03-limpiar-pruebas.sql
-- + 04-limpiar-solo-pruebas-automaticas.sql + 05-guardar-censo.sql + 06-revision.sql (CL-11).
-- test/sql-global.test.js comprueba que no le falte nada de esos archivos.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tablas (SRS §5.4). Del censo solo se guarda lo mínimo (CL-02).
-- ---------------------------------------------------------------------

-- Perfiles: una fila por cuenta de Supabase Auth (HU-01, HU-02). El rol vive aquí y no en
-- los metadatos del usuario, porque esos los puede cambiar él mismo.
create table public.perfiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  nombre    text not null check (char_length(nombre) between 1 and 120),
  correo    text not null check (char_length(correo) between 3 and 254),
  rol       text not null default 'usuario' check (rol in ('administrador', 'usuario')),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index perfiles_correo_unico on public.perfiles (lower(correo));

-- Censos: un día de censo (HU-04). El archivo NO se guarda, solo la fecha y quién lo subió.
create table public.censos (
  id         bigint generated always as identity primary key,
  fecha      date not null unique,
  subido_por uuid not null references public.perfiles (id),
  subido_en  timestamptz not null default now()
);

-- Estancias: misma cédula + misma fecha de ingreso = misma estancia (RN-02).
create table public.estancias (
  id              bigint generated always as identity primary key,
  cedula          text not null check (char_length(cedula) between 1 and 20),
  fecha_ingreso   date not null,
  nombre          text not null default '' check (char_length(nombre) <= 200),
  nombre_busqueda text not null default '' check (char_length(nombre_busqueda) <= 200), -- sin tildes ni ñ (HU-13)
  unique (cedula, fecha_ingreso)
);
create index estancias_cedula_inicio on public.estancias (cedula text_pattern_ops);

-- Candidatos: una estancia en un censo, con día 0 o 1 (RN-01) y su decisión (HU-05, HU-06).
create table public.candidatos (
  id           bigint generated always as identity primary key,
  censo_id     bigint not null references public.censos (id),
  estancia_id  bigint not null references public.estancias (id),
  piso         text not null check (char_length(piso) <= 80),
  cama         text not null check (char_length(cama) <= 80),
  dias         smallint not null check (dias in (0, 1)),
  orden        integer not null check (orden > 0),
  decision     text check (decision in ('entrevistar', 'no_entrevistar')),
  decidido_por uuid references public.perfiles (id),
  decidido_en  timestamptz,
  unique (censo_id, estancia_id),
  check ((decision is null) = (decidido_por is null) and (decision is null) = (decidido_en is null)),
  -- para que una entrevista solo pueda apuntar al candidato de su estancia (PYA tanda 5)
  constraint candidatos_id_estancia unique (id, estancia_id)
);
create index candidatos_estancia on public.candidatos (estancia_id);

-- Entrevistas: una por estancia en verde (RN-05).
create table public.entrevistas (
  id               bigint generated always as identity primary key,
  estancia_id      bigint not null unique references public.estancias (id),
  candidato_id     bigint not null references public.candidatos (id),
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'entrevistado', 'salio')),

  edad             smallint check (edad between 0 and 120),
  fecha_accidente  date,
  hora_accidente   time,
  lugar            text check (char_length(lugar) <= 200),
  direccion        text check (char_length(direccion) <= 200),
  telefono         text check (telefono ~ '^[0-9]{7,10}$'),
  tipo_declaracion text check (tipo_declaracion in ('C/M', 'P/M', 'C/A', 'P/A', 'PEATON', 'CICLISTA', 'OTRO')),
  relato           text check (char_length(relato) <= 500),
  placa            text check (placa ~ '^[A-Z0-9]{1,7}$'),
  placa_no_sabe    boolean not null default false,

  piso_actual      text check (char_length(piso_actual) <= 80),
  cama_actual      text check (char_length(cama_actual) <= 80),
  visto_en_censo   date,

  en_curso_por     uuid references public.perfiles (id),
  en_curso_desde   timestamptz,

  creado_por       uuid not null references public.perfiles (id),
  creado_en        timestamptz not null default now(),
  entrevistado_por uuid references public.perfiles (id),
  entrevistado_en  timestamptz,
  corregido_por    uuid references public.perfiles (id),
  corregido_en     timestamptz,
  salio_por        uuid references public.perfiles (id),
  salio_en         timestamptz,
  version          integer not null default 1,

  check (estado <> 'entrevistado' or (
    edad is not null and fecha_accidente is not null and tipo_declaracion is not null
    and char_length(coalesce(lugar, '')) > 0 and char_length(coalesce(relato, '')) > 0
  )),
  check (not (placa_no_sabe and placa is not null)),
  check ((en_curso_por is null) = (en_curso_desde is null)),
  -- el candidato de la entrevista es de su MISMA estancia (PYA tanda 5)
  constraint entrevistas_candidato_de_su_estancia foreign key (candidato_id, estancia_id) references public.candidatos (id, estancia_id)
);
create index entrevistas_estado on public.entrevistas (estado);
create index entrevistas_candidato on public.entrevistas (candidato_id);


-- ---------------------------------------------------------------------
-- 2. Permisos: RLS en TODAS las tablas (CL-03) y nada para visitantes sin sesión.
-- ---------------------------------------------------------------------
alter table public.perfiles    enable row level security;
alter table public.censos      enable row level security;
alter table public.estancias   enable row level security;
alter table public.candidatos  enable row level security;
alter table public.entrevistas enable row level security;

revoke all on public.perfiles, public.censos, public.estancias, public.candidatos, public.entrevistas from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Los compañeros ven nombre y rol, no el correo (el correo solo lo ve el servidor).
revoke select on public.perfiles from authenticated;
grant select (id, nombre, rol, activo, creado_en) on public.perfiles to authenticated;

-- Decidir y crear o borrar entrevistas, solo por decidir_candidato (sección 7, PYA tanda 5).
-- Llenar, corregir y marcar "Salió" siguen siendo un UPDATE de entrevistas.
revoke update on public.candidatos from authenticated;
revoke insert, delete on public.entrevistas from authenticated;

-- Cuenta activa = perfil activo + una sesión que todavía existe (al cerrar las sesiones
-- de alguien, su token deja de servir enseguida).
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

-- Perfiles: cada quien ve el suyo y las cuentas activas ven los de sus compañeros.
-- Nadie los cambia con su sesión: eso lo hace el servidor con la llave secreta (HU-02).
create policy "cada quien ve su perfil" on public.perfiles
  for select to authenticated using (id = (select auth.uid()));
create policy "las cuentas activas ven los perfiles" on public.perfiles
  for select to authenticated using ((select public.es_cuenta_activa()));

-- Censos, estancias y candidatos: toda cuenta activa lee, crea y cambia. Nadie borra.
create policy "cuentas activas leen censos" on public.censos
  for select to authenticated using ((select public.es_cuenta_activa()));
create policy "cuentas activas crean censos" on public.censos
  for insert to authenticated with check ((select public.es_cuenta_activa()));

create policy "cuentas activas leen estancias" on public.estancias
  for select to authenticated using ((select public.es_cuenta_activa()));
create policy "cuentas activas crean estancias" on public.estancias
  for insert to authenticated with check ((select public.es_cuenta_activa()));
create policy "cuentas activas cambian estancias" on public.estancias
  for update to authenticated using ((select public.es_cuenta_activa())) with check ((select public.es_cuenta_activa()));

create policy "cuentas activas leen candidatos" on public.candidatos
  for select to authenticated using ((select public.es_cuenta_activa()));
create policy "cuentas activas crean candidatos" on public.candidatos
  for insert to authenticated with check ((select public.es_cuenta_activa()));
create policy "cuentas activas deciden candidatos" on public.candidatos
  for update to authenticated using ((select public.es_cuenta_activa())) with check ((select public.es_cuenta_activa()));

-- Entrevistas: igual, y se puede borrar solo una que no se ha hecho (RN-07, CB-11).
create policy "cuentas activas leen entrevistas" on public.entrevistas
  for select to authenticated using ((select public.es_cuenta_activa()));
create policy "cuentas activas crean entrevistas" on public.entrevistas
  for insert to authenticated with check ((select public.es_cuenta_activa()));
create policy "cuentas activas cambian entrevistas" on public.entrevistas
  for update to authenticated using ((select public.es_cuenta_activa())) with check ((select public.es_cuenta_activa()));
create policy "se borra solo una entrevista no hecha" on public.entrevistas
  for delete to authenticated using ((select public.es_cuenta_activa()) and estado <> 'entrevistado');


-- ---------------------------------------------------------------------
-- 3. Guardias (triggers): la base pone quién hizo cada cosa (RN-08) y no deja que una
--    entrevista hecha vuelva atrás ni se borre (RN-06, CB-11), aunque alguien le hable
--    a la base sin pasar por el servidor.
-- ---------------------------------------------------------------------
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

create trigger proteger_entrevista
  before insert or update or delete on public.entrevistas
  for each row execute function public.proteger_entrevista();

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
    new.decision := null; new.decidido_por := null; new.decidido_en := null;
    return new;
  end if;

  new.censo_id := old.censo_id;   new.estancia_id := old.estancia_id;
  new.piso := old.piso;           new.cama := old.cama;
  new.dias := old.dias;           new.orden := old.orden;

  -- Se puede cambiar de color (RN-07), pero una decisión no vuelve a quedar sin decidir (RN-08).
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

create trigger proteger_candidato
  before insert or update on public.candidatos
  for each row execute function public.proteger_candidato();

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


-- ---------------------------------------------------------------------
-- 4. Cerrar las sesiones de una cuenta (HU-02.6 y 02.9). Solo la usa el servidor.
-- ---------------------------------------------------------------------
create or replace function public.cerrar_sesiones(p_usuario uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_usuario;
$$;
revoke execute on function public.cerrar_sesiones(uuid) from public, anon, authenticated;
grant execute on function public.cerrar_sesiones(uuid) to service_role;


-- ---------------------------------------------------------------------
-- 5. Limpiar lo que crearon las cuentas de las pruebas automáticas (tst-…@prueba.test), para
--    las pruebas en vivo (npm run test:vivo). Las cuentas de desarrollo de las personas
--    (otros …@prueba.test) no se tocan. Es la única forma de borrar una entrevista hecha, y
--    solo la puede usar el servidor.
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- 6. Guardar el censo de un día en un solo paso (HU-04): el censo, sus estancias y sus
--    candidatos en UNA transacción. Corre con los permisos de quien la llama (security
--    invoker): el RLS y los guardias siguen aplicando. Si el censo de ese día ya existe,
--    agrega solo los pacientes nuevos y no toca lo que ya se revisó (HU-04.7, CB-03).
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- 7. La revisión del censo y la decisión en verde o rojo (HU-05, HU-06). Corren con los
--    permisos de quien las llama (security invoker). ¿Cuándo un candidato ya está revisado?
--    Si se decidió en este censo, si su estancia ya tiene entrevista (RN-03) o si se decidió
--    en un censo POSTERIOR. Un rojo de un censo anterior vuelve a "Por revisar" (RN-04).
--    7.1 La regla de "Por revisar", en un solo lugar.
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
-- 7.2 Todo lo que muestra la pantalla de revisión, en una sola consulta (HU-05).
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
-- 7.3 Decidir en verde o rojo, o cambiar la decisión (HU-06, RN-05, RN-07, RN-08). Es la ÚNICA
--    puerta para decidir y para crear o borrar entrevistas (security definer, PYA tanda 5): igual
--    exige una cuenta activa y auth.uid() sigue siendo quien la llama. p_desde y p_desde_en son la
--    decisión que la pantalla mostraba y su hora: si ya no es esa, alguien decidió antes (CB-16).
--    Respuesta: { resultado: ok | ya_revisado | ya_entrevistado | no_existe, por }.
-- ---------------------------------------------------------------------
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
