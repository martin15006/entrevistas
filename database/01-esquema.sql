-- =====================================================================
-- Entrevistas · 01 · esquema de la base de datos (Supabase / PostgreSQL)
-- Historial: primer paso, aplicado el 2026-11-09. Para una base NUEVA no se usa este
-- archivo: se pega database/global.sql, que ya trae todo (CL-11).
-- Modelo: SRS §5.4. Seguridad: CL-02 (solo lo mínimo) y CL-03 (RLS en todo).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Perfiles: una fila por cuenta de Supabase Auth (HU-01, HU-02)
--    El rol vive AQUÍ y no en los metadatos del usuario, porque esos los
--    puede cambiar el propio usuario. Solo el servidor (llave secreta) lo cambia.
-- ---------------------------------------------------------------------
create table public.perfiles (
  id        uuid primary key references auth.users (id) on delete cascade,
  nombre    text not null check (char_length(nombre) between 1 and 120),
  correo    text not null check (char_length(correo) between 3 and 254),
  rol       text not null default 'usuario' check (rol in ('administrador', 'usuario')),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index perfiles_correo_unico on public.perfiles (lower(correo));


-- ---------------------------------------------------------------------
-- 2. Censos: un día de censo (HU-04). La fecha es única (CB-03).
--    El archivo NO se guarda (CL-02): solo la fecha y quién lo subió.
-- ---------------------------------------------------------------------
create table public.censos (
  id         bigint generated always as identity primary key,
  fecha      date not null unique,
  subido_por uuid not null references public.perfiles (id),
  subido_en  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. Estancias: misma cédula + misma fecha de ingreso = misma estancia (RN-02)
-- ---------------------------------------------------------------------
create table public.estancias (
  id              bigint generated always as identity primary key,
  cedula          text not null check (char_length(cedula) between 1 and 20),
  fecha_ingreso   date not null,
  nombre          text not null default '' check (char_length(nombre) <= 200),
  nombre_busqueda text not null default '' check (char_length(nombre_busqueda) <= 200), -- sin tildes ni ñ (HU-13)
  unique (cedula, fecha_ingreso)
);
create index estancias_cedula_inicio on public.estancias (cedula text_pattern_ops); -- buscar por el inicio (HU-13)


-- ---------------------------------------------------------------------
-- 4. Candidatos: una estancia en un censo, con día 0 o 1 (RN-01) y su decisión
--    (HU-05, HU-06). Única por censo y estancia.
-- ---------------------------------------------------------------------
create table public.candidatos (
  id           bigint generated always as identity primary key,
  censo_id     bigint not null references public.censos (id),
  estancia_id  bigint not null references public.estancias (id),
  piso         text not null check (char_length(piso) <= 80),
  cama         text not null check (char_length(cama) <= 80),
  dias         smallint not null check (dias in (0, 1)),
  orden        integer not null check (orden > 0), -- fila del censo, para el orden de RN-09
  decision     text check (decision in ('entrevistar', 'no_entrevistar')),
  decidido_por uuid references public.perfiles (id),
  decidido_en  timestamptz,
  unique (censo_id, estancia_id),
  -- una decisión siempre dice quién y cuándo (RN-08)
  check ((decision is null) = (decidido_por is null) and (decision is null) = (decidido_en is null))
);
create index candidatos_estancia on public.candidatos (estancia_id);


-- ---------------------------------------------------------------------
-- 5. Entrevistas: una por estancia en verde (RN-05)
-- ---------------------------------------------------------------------
create table public.entrevistas (
  id               bigint generated always as identity primary key,
  estancia_id      bigint not null unique references public.estancias (id),
  candidato_id     bigint not null references public.candidatos (id), -- el censo donde se decidió
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'entrevistado', 'salio')),

  -- Lo que se pregunta (HU-09, reglas de datos del SRS)
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

  -- Dónde está ahora, según el último censo (HU-12)
  piso_actual      text check (char_length(piso_actual) <= 80),
  cama_actual      text check (char_length(cama_actual) <= 80),
  visto_en_censo   date,

  -- "En curso" (RN-13)
  en_curso_por     uuid references public.perfiles (id),
  en_curso_desde   timestamptz,

  -- Quién y cuándo (RN-08). Que apunten a perfiles hace cumplir RN-12:
  -- una cuenta que ya trabajó no se puede borrar.
  creado_por       uuid not null references public.perfiles (id),
  creado_en        timestamptz not null default now(),
  entrevistado_por uuid references public.perfiles (id),
  entrevistado_en  timestamptz,
  corregido_por    uuid references public.perfiles (id),
  corregido_en     timestamptz,
  salio_por        uuid references public.perfiles (id),
  salio_en         timestamptz,
  version          integer not null default 1, -- gana el primero que guarda (CB-17)

  -- RN-10: no hay "entrevistado" sin los 5 datos obligatorios
  check (estado <> 'entrevistado' or (
    edad is not null and fecha_accidente is not null and tipo_declaracion is not null
    and char_length(coalesce(lugar, '')) > 0 and char_length(coalesce(relato, '')) > 0
  )),
  -- "No sabe" y una placa escrita no van juntos (CB-14)
  check (not (placa_no_sabe and placa is not null)),
  -- "En curso" siempre dice quién y desde cuándo
  check ((en_curso_por is null) = (en_curso_desde is null))
);
create index entrevistas_estado on public.entrevistas (estado);
create index entrevistas_candidato on public.entrevistas (candidato_id);


-- ---------------------------------------------------------------------
-- 6. Seguridad: RLS en TODAS las tablas (CL-03)
-- ---------------------------------------------------------------------
alter table public.perfiles    enable row level security;
alter table public.censos      enable row level security;
alter table public.estancias   enable row level security;
alter table public.candidatos  enable row level security;
alter table public.entrevistas enable row level security;

-- Los visitantes sin sesión (anon) no tienen nada que hacer aquí.
revoke all on public.perfiles, public.censos, public.estancias, public.candidatos, public.entrevistas from anon;

-- ¿La persona que hace la consulta tiene una cuenta activa?
-- "security definer" deja leer perfiles sin dar vueltas por las políticas de esa misma tabla.
create or replace function public.es_cuenta_activa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = (select auth.uid()) and activo
  );
$$;
revoke execute on function public.es_cuenta_activa() from public, anon;
grant execute on function public.es_cuenta_activa() to authenticated;

-- Perfiles: cada quien ve el suyo (para saber si su cuenta está activa) y las cuentas
-- activas ven los de sus compañeros (para "Hecha por …"). Nadie los cambia con su
-- sesión: crear, editar o desactivar cuentas lo hace el servidor con la llave secreta (HU-02).
create policy "cada quien ve su perfil" on public.perfiles
  for select to authenticated using (id = (select auth.uid()));
create policy "las cuentas activas ven los perfiles" on public.perfiles
  for select to authenticated using ((select public.es_cuenta_activa()));

-- Censos, estancias y candidatos: las 4 personas hacen el mismo trabajo, así que
-- toda cuenta activa lee, crea y cambia. Nadie borra.
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

-- Entrevistas: igual, y además se puede BORRAR solo una que no se ha hecho
-- (pasar de verde a rojo, RN-07); una entrevista hecha nunca se borra (CB-11).
create policy "cuentas activas leen entrevistas" on public.entrevistas
  for select to authenticated using ((select public.es_cuenta_activa()));
create policy "cuentas activas crean entrevistas" on public.entrevistas
  for insert to authenticated with check ((select public.es_cuenta_activa()));
create policy "cuentas activas cambian entrevistas" on public.entrevistas
  for update to authenticated using ((select public.es_cuenta_activa())) with check ((select public.es_cuenta_activa()));
create policy "se borra solo una entrevista no hecha" on public.entrevistas
  for delete to authenticated using ((select public.es_cuenta_activa()) and estado <> 'entrevistado');


-- ---------------------------------------------------------------------
-- 7. Cerrar las sesiones de una cuenta (al desactivarla o restablecer su
--    contraseña, HU-02.6 y 02.9). Solo la puede usar el servidor.
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
