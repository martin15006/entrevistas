'use strict';

// Genera censos INVENTADOS con la misma estructura del censo real (CL-01).
// Ningún nombre ni cédula sale de un censo de verdad.
//
// Uso:  npm run censo-prueba -- [--fecha 2026-11-06] [--filas 47] [--semilla 1]
//                                [--casos-borde] [--sin-fecha] [--salida ruta.xlsx]
// Sin --salida, el archivo queda en datos-prueba/ (que no se sube a GitHub).

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

// Los mismos encabezados del censo real, con sus espacios raros incluidos.
const ENCABEZADOS = [
  'Piso', 'Cama Asignada', 'Identificación', 'Nombre', 'Edad', 'Fecha Ingreso', 'N° Admisión', 'Días',
  'Entidad', '                         Médicos / Especialistas                     ', 'Siniestro',
  '                         Consumo con siniestro                     ',
];

const SERVICIOS = [
  { piso: 'Hospitalizacion A', camas: ['Camilla No 1', 'Camilla No 2', 'Camilla No 3', 'Cama No 5', 'Cama No 6', 'CAMA 12', 'Camilla 9'] },
  { piso: 'Hospitalizacion B', camas: ['306A', '307A', '308A', '309', '311', '312 (Pediátrica)', 'Camilla 306B'] },
  { piso: 'Hospitalizacion C', camas: ['301A', '301B', '302A', '302B', '303A', '303B', '304A'] },
  { piso: 'Hospitalizacion D', camas: ['401A', '401B', '402A', '402B', '403B', '404A', '405A'] },
  { piso: 'UCI', camas: ['Intensiva 1', 'Intensiva 3', 'Intensiva 4', 'Intensiva 5', 'Intensiva 6'] },
  { piso: 'Observacion', camas: ['1 (Hombre)', '2 (Hombre)', '3 (Hombre)', '8 (Mujer)', '9 (Mujer)', '13 (Pediátrica)', 'Camilla 7.5', 'YESOS 1', 'SILLA 1'] },
  { piso: 'Quirofano', camas: ['Camilla Quirofano 1', 'Camilla Quirofano 2'] },
];

const NOMBRES = ['ANA', 'LUIS', 'MARTA', 'JORGE', 'SOFÍA', 'CARLOS', 'LAURA', 'ANDRÉS', 'PAULA', 'DIEGO', 'VALENTINA', 'MATEO', 'CAMILA', 'JUAN', 'DANIELA', 'FELIPE'];
const APELLIDOS = ['PRUEBA', 'EJEMPLO', 'FICTICIO', 'INVENTADO', 'MUESTRA', 'ENSAYO', 'SIMULADO', 'MUÑOZ'];
const ENTIDADES = ['ASEGURADORA DE PRUEBA SOAT', 'SEGUROS FICTICIOS S.A.', 'EPS DE PRUEBA', 'ADRES'];

/** Números pseudoaleatorios repetibles: la misma semilla da siempre el mismo censo. */
function crearAzar(semilla) {
  let estado = semilla >>> 0;
  return function azar() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function restarDias(fechaIso, dias) {
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

/**
 * Inventa las filas de un censo. Cada fila trae las 12 columnas del censo real
 * (también las que la aplicación debe ignorar, para comprobar que no se guardan).
 */
function inventarFilas({ cantidad = 47, fecha = '2026-11-06', semilla = 1, casosBorde = false } = {}) {
  const azar = crearAzar(semilla);
  const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
  const filas = [];

  for (let i = 0; i < cantidad; i += 1) {
    const servicio = SERVICIOS[i % SERVICIOS.length];
    const cama = servicio.camas[Math.floor(i / SERVICIOS.length) % servicio.camas.length];
    // Uno de cada cuatro pacientes llega con día 0 o 1, como en un día normal.
    const dias = azar() < 0.25 ? Math.floor(azar() * 2) : 2 + Math.floor(azar() * 60);
    const accidente = azar() < 0.7;
    filas.push({
      piso: servicio.piso,
      cama,
      cedula: String(9900000000 + i + 1), // prefijo 99: cédulas claramente inventadas
      nombre: `${elegir(NOMBRES)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`,
      edad: 1 + Math.floor(azar() * 90),
      fechaIngreso: restarDias(fecha, dias),
      admision: 1900000 + i,
      dias,
      entidad: accidente ? elegir(ENTIDADES.slice(0, 2)) : 'EPS DE PRUEBA',
      medicos: 'MEDICO DE PRUEBA',
      siniestro: accidente ? String(900000 + i) : '0',
      consumo: 100000 + Math.floor(azar() * 9000000),
    });
  }

  if (casosBorde) filas.push(...filasDeCasosBorde(fecha));
  return filas;
}

/** Filas con los problemas que trae el censo real o que podría traer (CB-04 a CB-08). */
function filasDeCasosBorde(fecha) {
  const base = {
    piso: 'Observacion', cama: '5 (Hombre)', edad: 30, admision: 1999000, entidad: 'ASEGURADORA DE PRUEBA SOAT',
    medicos: 'MEDICO DE PRUEBA', siniestro: '999999', consumo: 500000, fechaIngreso: fecha, dias: 0,
  };
  return [
    { ...base, cama: 'CAMA 13 ', cedula: '99.000.001.01', nombre: 'CAROLINA  PRUEBA   GÓMEZ' }, // CB-08
    { ...base, cedula: '9900000001', nombre: 'REPETIDA PRUEBA EJEMPLO' }, // CB-05 (repite la primera cédula inventada)
    { ...base, cedula: '9900000102', nombre: 'SIN DIAS PRUEBA', dias: '' }, // CB-04
    { ...base, cedula: '', nombre: 'SIN CEDULA PRUEBA' }, // CB-04
    { ...base, cedula: '9900000103', nombre: 'DIAS TEXTO PRUEBA', dias: '1.0' }, // CB-06
    { ...base, cedula: '9900000104', nombre: 'DIAS NEGATIVO PRUEBA', dias: -1 }, // CB-06
    { ...base, cedula: '9900000105', nombre: 'QUIROFANO UNO PRUEBA', piso: 'QUIRÓFANO' }, // CB-07
    { ...base, cedula: '9900000106', nombre: 'QUIROFANO DOS PRUEBA', piso: '  quirofano ' }, // CB-07
    { ...base, cedula: '9900000107', nombre: 'FECHA EXCEL PRUEBA', fechaIngreso: new Date(`${fecha}T00:00:00Z`) },
  ];
}

/** Escribe un censo .xlsx con la estructura real y devuelve el archivo en memoria. */
async function escribirCenso(filas, { fecha = '2026-11-06', sinFecha = false, filaEncabezados = 3 } = {}) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Censo Consolidado');

  const [anio, mes, dia] = fecha.split('-');
  hoja.getCell('A1').value = sinFecha
    ? 'Censo Consolidado de Camas'
    : `Censo Consolidado de Camas - Generado el: ${dia}/${mes}/${anio}`;
  hoja.mergeCells('A1:L1');
  hoja.getRow(filaEncabezados).values = ENCABEZADOS;

  filas.forEach((f, indice) => {
    hoja.getRow(filaEncabezados + 1 + indice).values = [
      f.piso, f.cama, f.cedula, f.nombre, f.edad, f.fechaIngreso, f.admision,
      f.dias, f.entidad, f.medicos, f.siniestro, f.consumo,
    ];
  });

  return Buffer.from(await libro.xlsx.writeBuffer());
}

function leerArgumentos(argv) {
  const opciones = { fecha: '2026-11-06', filas: 47, semilla: 1, casosBorde: false, sinFecha: false, salida: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fecha') opciones.fecha = argv[++i];
    else if (arg === '--filas') opciones.filas = Number(argv[++i]);
    else if (arg === '--semilla') opciones.semilla = Number(argv[++i]);
    else if (arg === '--casos-borde') opciones.casosBorde = true;
    else if (arg === '--sin-fecha') opciones.sinFecha = true;
    else if (arg === '--salida') opciones.salida = argv[++i];
    else throw new Error(`No conozco la opción ${arg}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opciones.fecha)) throw new Error('--fecha va como AAAA-MM-DD');
  if (!Number.isInteger(opciones.filas) || opciones.filas < 0) throw new Error('--filas va como un número entero');
  return opciones;
}

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const filas = inventarFilas({
    cantidad: opciones.filas, fecha: opciones.fecha, semilla: opciones.semilla, casosBorde: opciones.casosBorde,
  });
  const archivo = await escribirCenso(filas, { fecha: opciones.fecha, sinFecha: opciones.sinFecha });
  const salida = path.resolve(opciones.salida
    ?? path.join(__dirname, '..', 'datos-prueba', `censo-prueba-${opciones.fecha}.xlsx`));
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, archivo);
  console.log(`Censo inventado con ${filas.length} filas en: ${salida}`);
}

if (require.main === module) {
  principal().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { inventarFilas, escribirCenso, ENCABEZADOS, SERVICIOS };
