'use strict';

// Lee el .env una sola vez al arrancar. Si falta algo, el servidor no arranca y dice
// QUÉ falta, nunca los valores (CL-04).

const LARGO_MINIMO_CLAVE_FIRMA = 32;
const SOLO_ESTE_PC = new Set(['127.0.0.1', 'localhost', '::1']);

function leerConfiguracion(env = process.env) {
  const texto = (nombre) => String(env[nombre] ?? '').trim();
  const faltan = [];

  const url = texto('SUPABASE_URL');
  const llavePublicable = texto('SUPABASE_PUBLISHABLE_KEY');
  const llaveSecreta = texto('SUPABASE_SECRET_KEY');
  const claveFirma = texto('CLAVE_FIRMA');

  if (!url) faltan.push('SUPABASE_URL');
  if (!llavePublicable) faltan.push('SUPABASE_PUBLISHABLE_KEY');
  if (!llaveSecreta) faltan.push('SUPABASE_SECRET_KEY');
  if (claveFirma.length < LARGO_MINIMO_CLAVE_FIRMA) faltan.push(`CLAVE_FIRMA (mínimo ${LARGO_MINIMO_CLAVE_FIRMA} caracteres)`);

  if (faltan.length > 0) {
    throw new Error(`Faltan valores en el .env: ${faltan.join(', ')}. Mira .env.example.`);
  }

  const produccion = texto('NODE_ENV') === 'production';
  const host = texto('HOST') || '127.0.0.1'; // por defecto, solo este PC

  // Abrir el servidor a la red sin HTTPS haría viajar las cookies de la sesión sin cifrar
  // (PYA tanda 3). Solo se permite marcándolo a propósito, para una prueba corta (CB-22).
  if (!SOLO_ESTE_PC.has(host) && !produccion && texto('ACEPTO_RED_SIN_HTTPS') !== 'si') {
    throw new Error(`HOST=${host} abre el servidor a la red sin HTTPS. Usa NODE_ENV=production (con HTTPS) o, solo para una prueba corta, ACEPTO_RED_SIN_HTTPS=si.`);
  }

  const proxies = Number(texto('PROXIES') || 0);

  return {
    supabase: { url, llavePublicable, llaveSecreta },
    claveFirma,
    produccion,
    puerto: Number(texto('PORT')) || 3000,
    host,
    proxies: Number.isInteger(proxies) && proxies >= 0 ? proxies : 0, // cuántos proxies hay delante (hosting)
  };
}

module.exports = { leerConfiguracion, LARGO_MINIMO_CLAVE_FIRMA };
