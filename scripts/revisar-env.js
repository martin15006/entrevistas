'use strict';

// Revisa que el .env esté bien armado y que Supabase responda, SIN mostrar las llaves:
// de cada llave solo se ve el prefijo y los últimos 4 caracteres.
// Las llaves solo se envían al propio proyecto de Supabase.
//
// Uso:  npm run revisar-env

const { createClient } = require('@supabase/supabase-js');

const URL_SUPABASE = (process.env.SUPABASE_URL ?? '').trim();
const PUBLICABLE = (process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
const SECRETA = (process.env.SUPABASE_SECRET_KEY ?? '').trim();

let problemas = 0;
const bien = (texto) => console.log(`  ✅ ${texto}`);
const mal = (texto) => { problemas += 1; console.log(`  ❌ ${texto}`); };

/** "sb_secret_…a1b2": el prefijo es público; del resto solo se ven 4 caracteres. */
function ocultar(valor) {
  const prefijo = (/^sb_(publishable|secret)_/.exec(valor) ?? [''])[0];
  return valor.length > prefijo.length + 8 ? `${prefijo}…${valor.slice(-4)}` : '(muy corta)';
}

function revisarForma() {
  console.log('\n1. Forma de los valores');

  if (!URL_SUPABASE) mal('SUPABASE_URL está vacía.');
  else if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(URL_SUPABASE)) {
    mal('SUPABASE_URL debería verse como https://xxxx.supabase.co (sin "/" al final, sin espacios ni comillas).');
  } else bien(`SUPABASE_URL = ${URL_SUPABASE}`);

  for (const [nombre, valor, prefijo, otro] of [
    ['SUPABASE_PUBLISHABLE_KEY', PUBLICABLE, 'sb_publishable_', 'sb_secret_'],
    ['SUPABASE_SECRET_KEY', SECRETA, 'sb_secret_', 'sb_publishable_'],
  ]) {
    if (!valor) mal(`${nombre} está vacía.`);
    else if (/^["']|["']$|\s/.test(valor)) mal(`${nombre} tiene comillas o espacios: pega solo la llave.`);
    else if (valor.startsWith(otro)) mal(`${nombre} tiene la llave equivocada (empieza con ${otro}): están cambiadas de lugar.`);
    else if (valor.startsWith('eyJ')) mal(`${nombre} es una llave antigua (anon o service_role). Usa la nueva, que empieza con ${prefijo}.`);
    else if (!valor.startsWith(prefijo)) mal(`${nombre} debería empezar con ${prefijo}.`);
    else bien(`${nombre} = ${ocultar(valor)}`);
  }

  const claveFirma = (process.env.CLAVE_FIRMA ?? '').trim();
  if (claveFirma.length < 32) {
    mal(`CLAVE_FIRMA tiene ${claveFirma.length} caracteres y necesita al menos 32. Mira cómo generarla en .env.example.`);
  } else bien(`CLAVE_FIRMA tiene ${claveFirma.length} caracteres (no se muestra)`);

  const entorno = (process.env.ENTORNO ?? '').trim();
  if (entorno === 'desarrollo') bien('ENTORNO = desarrollo (se permiten las pruebas en vivo y las cuentas de prueba)');
  else bien('ENTORNO no es "desarrollo": las pruebas en vivo y las cuentas de prueba no corren aquí');

  const host = (process.env.HOST ?? '127.0.0.1').trim();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    mal(`HOST=${host}: mientras no haya login, el servidor debe escuchar solo en 127.0.0.1.`);
  } else bien(`HOST = ${host} (solo este PC)`);
}

async function revisarConexion() {
  console.log('\n2. Conexión con Supabase');

  // La llave publicable: pide la configuración pública de las cuentas (no lee ningún dato).
  try {
    const respuesta = await fetch(`${URL_SUPABASE}/auth/v1/settings`, { headers: { apikey: PUBLICABLE } });
    if (!respuesta.ok) {
      mal(`La llave publicable no funcionó (Supabase respondió ${respuesta.status}).`);
    } else {
      bien('La llave publicable funciona.');
      const ajustes = await respuesta.json();
      if (ajustes.disable_signup === true) bien('El registro de cuentas nuevas está APAGADO (solo el admin crea cuentas).');
      else mal('El registro de cuentas nuevas sigue ENCENDIDO: apaga "Allow new users to sign up" en Authentication.');
    }
  } catch {
    mal('No pude conectarme a Supabase: revisa SUPABASE_URL y tu conexión a internet.');
    return;
  }

  // La llave secreta: solo cuenta las cuentas que existen (no muestra ninguna).
  try {
    const admin = createClient(URL_SUPABASE, SECRETA, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
    if (error) mal(`La llave secreta no funcionó (${error.status ?? 'sin código'}).`);
    else bien(`La llave secreta funciona. Cuentas creadas hasta ahora: ${data.users.length}.`);
  } catch {
    mal('La llave secreta no funcionó.');
  }
}

async function principal() {
  console.log('Revisión del .env de Entrevistas (las llaves nunca se muestran completas)');
  revisarForma();
  if (problemas === 0) await revisarConexion();
  else console.log('\n2. Conexión con Supabase: no la pruebo hasta que la forma esté bien.');
  console.log(problemas === 0 ? '\nTodo bien ✅' : `\n${problemas} cosa(s) por arreglar ❌`);
  process.exitCode = problemas === 0 ? 0 : 1;
}

principal();
