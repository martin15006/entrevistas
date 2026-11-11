'use strict';

// Fechas y horas en hora de Colombia (RNF-15), aunque el servidor esté en otra zona.
// Las fechas "de calendario" (sin hora) se manejan como texto ISO: 'AAAA-MM-DD'.

const ZONA = 'America/Bogota';

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

const formatoBogota = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Año, mes, día, hora y minuto de un instante, vistos en Colombia. */
function partesBogota(instante = new Date()) {
  const partes = {};
  for (const { type, value } of formatoBogota.formatToParts(instante)) partes[type] = value;
  return { anio: partes.year, mes: partes.month, dia: partes.day, hora: partes.hour, minuto: partes.minute };
}

/** "Hoy" en Colombia, como 'AAAA-MM-DD'. */
function hoyBogota(instante = new Date()) {
  const p = partesBogota(instante);
  return `${p.anio}-${p.mes}-${p.dia}`;
}

/** La hora de un instante en Colombia, como 'HH:MM'. */
function horaBogota(instante = new Date()) {
  const p = partesBogota(instante);
  return `${p.hora}:${p.minuto}`;
}

/** true si el texto es 'AAAA-MM-DD' y esa fecha existe (no acepta 2026-02-30). */
function esFechaIso(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

/** 'DD/MM/AAAA' (o 'D/M/AAAA') → 'AAAA-MM-DD'; null si no es una fecha válida. */
function desdeFechaCorta(texto) {
  const coincide = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(String(texto ?? ''));
  if (!coincide) return null;
  const iso = `${coincide[3]}-${coincide[2].padStart(2, '0')}-${coincide[1].padStart(2, '0')}`;
  return esFechaIso(iso) ? iso : null;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
function fechaCorta(iso) {
  if (!esFechaIso(iso)) return '';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** 'AAAA-MM-DD' → 'VIERNES 6 DE NOVIEMBRE DEL 2026' (fila 2 de la hoja descargada, HU-15.3). */
function diaEnLetras(iso) {
  if (!esFechaIso(iso)) return '';
  const [anio, mes, dia] = iso.split('-').map(Number);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS[diaSemana]} ${dia} DE ${MESES[mes - 1]} DEL ${anio}`;
}

/**
 * Convierte lo que trae una celda de "Fecha Ingreso" a 'AAAA-MM-DD'.
 * Acepta texto ISO (como viene en el censo), 'DD/MM/AAAA' o una fecha de Excel.
 * Devuelve null si no se puede leer.
 */
function fechaIsoDesdeCelda(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    // Excel guarda las fechas sin zona; ExcelJS las entrega a la medianoche UTC.
    const iso = valor.toISOString().slice(0, 10);
    return esFechaIso(iso) ? iso : null;
  }
  const texto = String(valor ?? '').trim();
  if (esFechaIso(texto)) return texto;
  return desdeFechaCorta(texto);
}

module.exports = {
  ZONA,
  partesBogota,
  hoyBogota,
  horaBogota,
  esFechaIso,
  desdeFechaCorta,
  fechaCorta,
  diaEnLetras,
  fechaIsoDesdeCelda,
};
