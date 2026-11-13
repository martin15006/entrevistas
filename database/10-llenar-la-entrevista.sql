-- =====================================================================
-- Entrevistas · 10 · Llenar la entrevista (HU-09), la enmienda 5 y los arreglos de PYA (tanda 8)
-- Historial: décimo paso, se aplica DESPUÉS de 09-entrevistas-por-estado.sql.
-- Para una base NUEVA no se usa este archivo: se pega database/global.sql (CL-11).
--
-- 1. Un solo reloj: la base dice qué día es hoy en Colombia (RNF-15) y si un "En curso" sigue
--    vigente (RN-13, CB-27). Antes, "En curso" lo ponía el reloj de la base y lo comparaba el del
--    servidor: si se separaban, el aviso duraba de menos o de más (PYA tanda 8).
-- 2. Al guardarse o marcarse "Salió" (cambia el estado), la entrevista deja de estar "En curso".
-- 3. Un censo con fecha posterior a hoy se rechaza también en la base (la pantalla ya lo hacía,
--    enmienda 2), aunque alguien le hable a la base sin pasar por el servidor (PYA tanda 8).
-- 4. Una sola puerta también para llenar la entrevista: las cuentas ya no cambian la tabla
--    entrevistas directo. Abrir, soltar y guardar van por funciones (como decidir_candidato).
--    HU-10 ("Salió") y HU-11 ("Corregir") tendrán las suyas. Y nadie vacía tablas (truncate).
-- 5. entrevistas_del_dia() con la enmienda 5: "Entrevistados" y "Salieron" son las que se
--    hicieron (o se marcaron) ESE día en Colombia, cada una con su censo (HU-08.3).
-- 6. HU-09: ver_entrevista (solo lee); abrir_entrevista, soltar_entrevista y
--    soltar_mis_entrevistas ("En curso", HU-09.9); texto_limpio (la misma limpieza del servidor) y
--    guardar_entrevista (pasa a Entrevistado; gana el primero, CB-17; sin pisar nada, CB-24).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Un solo reloj.
-- ---------------------------------------------------------------------
create or replace function public.hoy_colombia()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Bogota')::date
$$;
revoke execute on function public.hoy_colombia() from public, anon;
grant execute on function public.hoy_colombia() to authenticated;

-- RN-13 · CB-27 · "En curso" dura 15 minutos desde que se abrió.
create or replace function public.en_curso_vigente(p_desde timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_desde is not null and p_desde > now() - interval '15 minutes'
$$;
revoke execute on function public.en_curso_vigente(timestamptz) from public, anon;
grant execute on function public.en_curso_vigente(timestamptz) to authenticated;


-- ---------------------------------------------------------------------
-- 2. El guardia de entrevistas: igual que en 02, más soltar "En curso" al cambiar de estado.
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

  -- RN-13 · Al guardarse o marcarse "Salió", ya nadie la está haciendo (PYA tanda 8).
  if new.estado is distinct from old.estado then
    new.en_curso_por := null; new.en_curso_desde := null;
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. El guardia de censos: igual que en 02, más rechazar una fecha posterior a hoy.
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
    -- HU-04.8 (enmienda 2) también en la base: un censo de un día que no ha llegado no se crea.
    if new.fecha > public.hoy_colombia() then
      raise exception 'La fecha del censo es posterior a hoy' using errcode = '22023';
    end if;
    new.subido_por := yo;
    new.subido_en := now();
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Nadie cambia una entrevista escribiendo directo en la tabla: solo por las funciones.
--    (La política de 01 se queda: sin el permiso no sirve, pero dice la regla.)
--    Además (PYA tanda 9): Supabase deja por defecto a las cuentas vaciar tablas (truncate), y
--    truncate no pasa por el RLS ni por los guardias. La app nunca lo usa: se quita.
-- ---------------------------------------------------------------------
revoke update on public.entrevistas from authenticated;
revoke truncate, references, trigger on public.perfiles, public.censos, public.estancias, public.candidatos, public.entrevistas from authenticated;


-- ---------------------------------------------------------------------
-- 5. Las entrevistas por estado (HU-08), con la enmienda 5 (HU-08.3).
-- p_fecha: el día de trabajo que se mira en Entrevistados y Salieron (null = hoy en Colombia).
-- ---------------------------------------------------------------------
create or replace function public.entrevistas_del_dia(p_fecha date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_hoy date := public.hoy_colombia();
  v_dia date;
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;

  -- El día elegido va de las 00:00 a las 24:00 de Colombia (RNF-15).
  v_dia := coalesce(p_fecha, v_hoy);
  v_desde := v_dia::timestamp at time zone 'America/Bogota';
  v_hasta := (v_dia + 1)::timestamp at time zone 'America/Bogota';

  return jsonb_build_object(
    'hoy', v_hoy,
    'dia', v_dia,

    -- Los días con censo, del más nuevo al más viejo: para "Desde el" (HU-08.2) y el aviso de HU-08.4.
    'dias_censo', coalesce((
      select jsonb_agg(d.fecha order by d.fecha desc)
      from (select fecha from public.censos order by fecha desc limit 60) d
    ), '[]'::jsonb),

    -- HU-08.3 · Los días del selector: hoy y los días en que se hizo o se marcó algo.
    'dias', coalesce((
      select jsonb_agg(d.dia order by d.dia desc)
      from (
        select u.dia from (
          select v_hoy as dia
          union
          select (i.entrevistado_en at time zone 'America/Bogota')::date
          from public.entrevistas i where i.estado = 'entrevistado' and i.entrevistado_en is not null
          union
          select (i.salio_en at time zone 'America/Bogota')::date
          from public.entrevistas i where i.estado = 'salio' and i.salio_en is not null
        ) u
        order by u.dia desc
        limit 60
      ) d
    ), '[]'::jsonb),

    -- HU-08.2 · Todas las pendientes. La cama y el servicio son los del último censo si ya se
    -- conocen (HU-12) y, si no, los del censo donde se decidió. Van primero las más viejas.
    'pendientes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'piso', coalesce(i.piso_actual, c.piso), 'cama', coalesce(i.cama_actual, c.cama),
        'cedula', e.cedula, 'nombre', e.nombre, 'censo_fecha', z.fecha,
        -- RN-13 · Quién la está haciendo: solo si es OTRA persona y no pasaron 15 minutos.
        'en_curso_por', case when i.en_curso_por is distinct from v_yo and public.en_curso_vigente(i.en_curso_desde)
                             then pc.nombre end
      ) order by z.fecha, c.orden)
      from public.entrevistas i
      join public.candidatos c on c.id = i.candidato_id
      join public.censos z on z.id = c.censo_id
      join public.estancias e on e.id = i.estancia_id
      left join public.perfiles pc on pc.id = i.en_curso_por
      where i.estado = 'pendiente'
    ), '[]'::jsonb),

    -- HU-08.3 · Las que se hicieron ese día, cada una con su censo (RN-05).
    'entrevistados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'piso', coalesce(i.piso_actual, c.piso), 'cama', coalesce(i.cama_actual, c.cama),
        'cedula', e.cedula, 'nombre', e.nombre, 'censo_fecha', z.fecha, 'por', pe.nombre, 'en', i.entrevistado_en
      ) order by z.fecha, c.orden)
      from public.entrevistas i
      join public.candidatos c on c.id = i.candidato_id
      join public.censos z on z.id = c.censo_id
      join public.estancias e on e.id = i.estancia_id
      left join public.perfiles pe on pe.id = i.entrevistado_por
      where i.estado = 'entrevistado' and i.entrevistado_en >= v_desde and i.entrevistado_en < v_hasta
    ), '[]'::jsonb),

    -- HU-08.3 · Las que se marcaron "Salió" ese día, cada una con su censo.
    'salieron', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'piso', coalesce(i.piso_actual, c.piso), 'cama', coalesce(i.cama_actual, c.cama),
        'cedula', e.cedula, 'nombre', e.nombre, 'censo_fecha', z.fecha, 'por', ps.nombre, 'en', i.salio_en
      ) order by z.fecha, c.orden)
      from public.entrevistas i
      join public.candidatos c on c.id = i.candidato_id
      join public.censos z on z.id = c.censo_id
      join public.estancias e on e.id = i.estancia_id
      left join public.perfiles ps on ps.id = i.salio_por
      where i.estado = 'salio' and i.salio_en >= v_desde and i.salio_en < v_hasta
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.entrevistas_del_dia(date) from public, anon;
grant execute on function public.entrevistas_del_dia(date) to authenticated;


-- ---------------------------------------------------------------------
-- 6. HU-09 · Llenar la entrevista.
-- ---------------------------------------------------------------------

-- 6.1 Lo que muestra el formulario (HU-09.1) y quién la está haciendo (HU-09.9). Solo lee.
--     null si no existe (o si la cuenta no la puede ver).
create or replace function public.ver_entrevista(p_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_resultado jsonb;
begin
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', i.id, 'estado', i.estado, 'hoy', public.hoy_colombia(),
    'piso', coalesce(i.piso_actual, c.piso), 'cama', coalesce(i.cama_actual, c.cama),
    'cedula', e.cedula, 'nombre', e.nombre, 'censo_fecha', z.fecha,
    'edad', i.edad, 'fecha_accidente', i.fecha_accidente, 'hora_accidente', to_char(i.hora_accidente, 'HH24:MI'),
    'lugar', i.lugar, 'direccion', i.direccion, 'telefono', i.telefono,
    'tipo_declaracion', i.tipo_declaracion, 'relato', i.relato,
    'placa', i.placa, 'placa_no_sabe', i.placa_no_sabe,
    'en_curso_por', case when i.en_curso_por is distinct from v_yo and public.en_curso_vigente(i.en_curso_desde)
                         then pc.nombre end
  ) into v_resultado
  from public.entrevistas i
  join public.candidatos c on c.id = i.candidato_id
  join public.censos z on z.id = c.censo_id
  join public.estancias e on e.id = i.estancia_id
  left join public.perfiles pc on pc.id = i.en_curso_por
  where i.id = p_id;

  return v_resultado;
end;
$$;
revoke execute on function public.ver_entrevista(bigint) from public, anon;
grant execute on function public.ver_entrevista(bigint) to authenticated;

-- 6.2 RN-13 · Al abrir una pendiente queda "En curso" a mi nombre (el guardia pone quién y cuándo).
--     HU-09.9 · Si OTRA persona la está haciendo, no se le quita: hace falta "Abrir igual" (p_igual).
--     Así el aviso se decide aquí, en el mismo momento en que se marca (PYA tanda 9).
--     Devuelve 'desde' (la hora de esta apertura): solo con ella se puede soltar después.
create or replace function public.abrir_entrevista(p_id bigint, p_igual boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_estado text;
  v_por uuid;
  v_desde timestamptz;
begin
  -- Corre con permisos de dueño: esta revisión es la que deja afuera a quien no debe entrar.
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;

  select estado, en_curso_por, en_curso_desde into v_estado, v_por, v_desde
  from public.entrevistas where id = p_id
  for update;
  if not found then
    return jsonb_build_object('resultado', 'no_existe');
  end if;
  if v_estado <> 'pendiente' then
    return jsonb_build_object('resultado', 'no_pendiente');
  end if;
  if not coalesce(p_igual, false) and v_por is distinct from v_yo and public.en_curso_vigente(v_desde) then
    return jsonb_build_object('resultado', 'en_curso',
      'por', (select nombre from public.perfiles where id = v_por));
  end if;

  update public.entrevistas set en_curso_por = v_yo, en_curso_desde = now() where id = p_id;
  return jsonb_build_object('resultado', 'ok', 'desde', now());
end;
$$;
revoke execute on function public.abrir_entrevista(bigint, boolean) from public, anon;
grant execute on function public.abrir_entrevista(bigint, boolean) to authenticated;

-- 6.3 RN-13 · Al salir del formulario se suelta, pero solo si es MI apertura, la de esa pantalla
--     (p_desde): así recargar u otra pestaña no sueltan una que se sigue llenando (PYA tanda 9).
create or replace function public.soltar_entrevista(p_id bigint, p_desde timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;

  update public.entrevistas set en_curso_por = null, en_curso_desde = null
  where id = p_id and en_curso_por = (select auth.uid()) and en_curso_desde = p_desde;
  return jsonb_build_object('resultado', 'ok');
end;
$$;
revoke execute on function public.soltar_entrevista(bigint, timestamptz) from public, anon;
grant execute on function public.soltar_entrevista(bigint, timestamptz) to authenticated;

-- 6.4 RN-13 · Al cerrar sesión se sueltan todas las que yo tenía abiertas.
create or replace function public.soltar_mis_entrevistas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;

  update public.entrevistas set en_curso_por = null, en_curso_desde = null
  where en_curso_por = (select auth.uid()) and estado = 'pendiente';
  return jsonb_build_object('resultado', 'ok');
end;
$$;
revoke execute on function public.soltar_mis_entrevistas() from public, anon;
grant execute on function public.soltar_mis_entrevistas() to authenticated;

-- 6.5 El texto como lo deja el servidor (limpiarEscrito, lib/reglas.js): los espacios de cualquier
--     tipo, juntos, cuentan como uno; los caracteres invisibles se quitan; y nada en los bordes.
--     Con p_varias_lineas (el relato) se respetan los saltos de línea. Vacío = null (PYA tanda 9).
create or replace function public.texto_limpio(p_texto text, p_varias_lineas boolean default false)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(regexp_replace(regexp_replace(
    replace(p_texto, chr(13) || chr(10), chr(10)),
    '[\x01-\x08\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]', '', 'g'),
    case when p_varias_lineas then '[\t \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+'
         else '[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+' end,
    ' ', 'g'),
    '^\s+|\s+$', '', 'g'), '')
$$;
revoke execute on function public.texto_limpio(text, boolean) from public, anon;
grant execute on function public.texto_limpio(text, boolean) to authenticated;

-- 6.6 HU-09.4 · Guardar: la entrevista pendiente pasa a Entrevistado con sus datos. El servidor ya
--     revisó los datos (HU-09.5 a 09.7); la base igual los limpia como él (texto_limpio), exige los 5
--     obligatorios y los formatos (RN-10, reglas de la tabla) y que la fecha no sea posterior a hoy.
--     CB-17 · Gana el primero: si otra persona ya la guardó, no se pisa nada.
--     CB-24 · El MISMO guardado que llega dos veces es un ok; uno con OTROS datos no pisa lo guardado
--     (corregir es HU-11) y se avisa (PYA tanda 9).
create or replace function public.guardar_entrevista(p_id bigint, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yo uuid := (select auth.uid());
  v_estado text;
  v_entrevistado_por uuid;
  v_salio_por uuid;
  v_igual boolean;
  v_edad smallint;
  v_fecha date;
  v_hora time;
  v_lugar text;
  v_direccion text;
  v_telefono text;
  v_tipo text;
  v_relato text;
  v_placa text;
  v_no_sabe boolean;
begin
  if not (select public.es_cuenta_activa()) then
    raise exception 'La cuenta no está activa' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'Datos de la entrevista no válidos' using errcode = '22023';
  end if;

  -- Los datos como quedarían guardados.
  v_edad := (p_datos ->> 'edad')::smallint;
  v_fecha := (p_datos ->> 'fecha_accidente')::date;
  v_hora := nullif(p_datos ->> 'hora_accidente', '')::time;
  v_lugar := public.texto_limpio(p_datos ->> 'lugar');
  v_direccion := public.texto_limpio(p_datos ->> 'direccion');
  v_telefono := nullif(p_datos ->> 'telefono', '');
  v_tipo := p_datos ->> 'tipo_declaracion';
  v_relato := public.texto_limpio(p_datos ->> 'relato', true);
  v_placa := nullif(p_datos ->> 'placa', '');
  v_no_sabe := coalesce((p_datos ->> 'placa_no_sabe')::boolean, false);

  -- Se aparta la entrevista: dos guardados a la vez se hacen en fila (CB-17).
  select estado, entrevistado_por, salio_por,
         (edad, fecha_accidente, hora_accidente, lugar, direccion, telefono, tipo_declaracion, relato, placa, placa_no_sabe)
           is not distinct from (v_edad, v_fecha, v_hora, v_lugar, v_direccion, v_telefono, v_tipo, v_relato, v_placa, v_no_sabe)
  into v_estado, v_entrevistado_por, v_salio_por, v_igual
  from public.entrevistas where id = p_id
  for update;
  if not found then
    return jsonb_build_object('resultado', 'no_existe'); -- alguien cambió la decisión a rojo (RN-07)
  end if;
  if v_estado = 'entrevistado' then
    if v_entrevistado_por = v_yo and v_igual then
      return jsonb_build_object('resultado', 'ok'); -- CB-24: el mismo guardado llegó dos veces
    end if;
    return jsonb_build_object('resultado', 'ya_entrevistado',
      'por', (select nombre from public.perfiles where id = v_entrevistado_por));
  end if;
  if v_estado = 'salio' then
    return jsonb_build_object('resultado', 'salio',
      'por', (select nombre from public.perfiles where id = v_salio_por));
  end if;

  if v_fecha > public.hoy_colombia() then
    raise exception 'La fecha del accidente es posterior a hoy' using errcode = '22023';
  end if;

  -- El guardia pone quién y cuándo (RN-08) y suelta "En curso".
  update public.entrevistas set
    estado = 'entrevistado',
    edad = v_edad,
    fecha_accidente = v_fecha,
    hora_accidente = v_hora,
    lugar = v_lugar,
    direccion = v_direccion,
    telefono = v_telefono,
    tipo_declaracion = v_tipo,
    relato = v_relato,
    placa = v_placa,
    placa_no_sabe = v_no_sabe
  where id = p_id;

  return jsonb_build_object('resultado', 'ok');
end;
$$;
revoke execute on function public.guardar_entrevista(bigint, jsonb) from public, anon;
grant execute on function public.guardar_entrevista(bigint, jsonb) to authenticated;
