'use strict';

// Lectura del censo consolidado (HU-04). No toca la base de datos ni el disco:
// recibe el archivo en memoria (un Buffer) y devuelve solo los datos de CL-02.
//
// El archivo lo sube una persona, así que se trata como sospechoso (revisión PYA de la tanda 1):
// 1. se abre en un hilo aparte (lib/censo-trabajador.js) con tope de memoria y de tiempo;
// 2. ahí, antes de ExcelJS, lib/zip-seguro.js descomprime con un tope real ("bombas zip");
// 3. un archivo que dice tener más de 10.000 filas se rechaza sin recorrerlas.
// Si algo sale mal, se cae ese hilo y no el servidor.

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const ExcelJS = require('exceljs');
const {
  normalizar, limpiarTexto, limpiarNombre, limpiarCedula, leerDias, esCandidato, recortar,
} = require('./reglas');
const { fechaIsoDesdeCelda, desdeFechaCorta } = require('./fechas');

const TAMANO_MAXIMO = 5 * 1024 * 1024; // 5 MB (HU-04.6)
const FILAS_PARA_ENCABEZADOS = 10; // los encabezados se buscan en las primeras 10 filas (HU-04.4)
const LIMITE_FILAS = 10000; // un censo real tiene unos cientos de filas
const LIMITE_MEMORIA_MB = 256; // memoria máxima del hilo que abre el archivo
const TIEMPO_MAXIMO_MS = 15000; // si tarda más, se corta
// Los largos máximos que acepta la base (database/01-esquema.sql).
const LARGO_MAXIMO = Object.freeze({ cedula: 20, nombre: 200, piso: 80, cama: 80 });

const MENSAJES = {
  NO_ES_XLSX: 'El archivo debe ser el censo en Excel (.xlsx).',
  MUY_GRANDE: 'El archivo pesa más de 5 MB. El censo normal pesa mucho menos: revisa que sea el archivo correcto.',
  SIN_ENCABEZADOS: 'Este archivo no parece el censo consolidado: no encontré las columnas Piso, Cama Asignada, Identificación, Nombre, Fecha Ingreso y Días.',
};

/** Error con un código conocido y el mensaje exacto que ve el usuario. */
class ErrorCenso extends Error {
  constructor(codigo) {
    super(MENSAJES[codigo]);
    this.name = 'ErrorCenso';
    this.codigo = codigo;
  }
}

// Las únicas columnas que se leen (CL-02), con su encabezado ya normalizado.
// Edad, N° Admisión, Entidad, Médicos, Siniestro y Consumo se ignoran a propósito.
const COLUMNAS = {
  piso: 'piso',
  cama: 'cama asignada',
  cedula: 'identificacion',
  nombre: 'nombre',
  fechaIngreso: 'fecha ingreso',
  dias: 'dias',
};

// Un .xlsx es un .zip: empieza con las letras "PK" y los bytes 3 y 4.
function pareceZip(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

/** Lo que guarda una celda de ExcelJS, convertido a un valor simple. */
function valorPlano(valor) {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date || typeof valor !== 'object') return valor;
  if (Array.isArray(valor.richText)) return valor.richText.map((parte) => parte.text).join('');
  if ('result' in valor) return valorPlano(valor.result); // celda con fórmula
  if ('text' in valor) return valorPlano(valor.text); // celda con enlace
  return ''; // errores de Excel (#N/A…) y cualquier otra cosa rara
}

function textoPlano(valor) {
  const plano = valorPlano(valor);
  if (plano instanceof Date) {
    // Una "fecha" imposible (un número enorme con formato de fecha) no rompe la lectura.
    return Number.isNaN(plano.getTime()) ? '' : plano.toISOString();
  }
  return String(plano);
}

/** Busca la fila de encabezados y en qué columna está cada dato. */
function buscarEncabezados(hoja) {
  const ultima = Math.min(FILAS_PARA_ENCABEZADOS, hoja.rowCount);
  for (let numero = 1; numero <= ultima; numero += 1) {
    const fila = hoja.findRow(numero);
    if (!fila) continue;
    const columnas = {};
    fila.eachCell((celda, columna) => {
      const nombre = normalizar(textoPlano(celda.value));
      for (const [clave, encabezado] of Object.entries(COLUMNAS)) {
        if (nombre === encabezado && !(clave in columnas)) columnas[clave] = columna;
      }
    });
    if (Object.keys(columnas).length === Object.keys(COLUMNAS).length) return { fila: numero, columnas };
  }
  return null;
}

/** La fecha de "Generado el: DD/MM/AAAA", buscada en las filas de arriba de los encabezados. */
function buscarFecha(hoja, filaEncabezados) {
  for (let numero = 1; numero < filaEncabezados; numero += 1) {
    const fila = hoja.findRow(numero);
    if (!fila) continue;
    let fecha = null;
    fila.eachCell((celda) => {
      const coincide = /generado el:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(textoPlano(celda.value));
      if (coincide && !fecha) fecha = desdeFechaCorta(coincide[1]);
    });
    if (fecha) return fecha;
  }
  return null;
}

/**
 * Lee el archivo sin protecciones. Solo la usa lib/censo-trabajador.js, dentro del
 * hilo aparte; el resto del sistema llama a leerCenso().
 */
async function analizarCenso(buffer) {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw new ErrorCenso('NO_ES_XLSX');
  }

  const hoja = libro.worksheets[0];
  if (hoja && hoja.rowCount > LIMITE_FILAS) throw new ErrorCenso('NO_ES_XLSX');
  const encabezados = hoja ? buscarEncabezados(hoja) : null;
  if (!encabezados) throw new ErrorCenso('SIN_ENCABEZADOS');

  const { fila: filaEncabezados, columnas } = encabezados;
  const fecha = buscarFecha(hoja, filaEncabezados);

  const filas = [];
  const saltadas = [];
  const repetidas = [];
  const vistas = new Map(); // cédula → fila donde apareció primero

  for (let numero = filaEncabezados + 1; numero <= hoja.rowCount; numero += 1) {
    const fila = hoja.findRow(numero); // findRow no crea filas vacías en memoria
    if (!fila) continue;
    const crudo = {};
    for (const [clave, columna] of Object.entries(columnas)) crudo[clave] = valorPlano(fila.findCell(columna)?.value);

    // El censo trae cientos de filas vacías al final: se ignoran sin avisar.
    if (Object.values(crudo).every((valor) => String(valor).trim() === '')) continue;

    const cedula = limpiarCedula(crudo.cedula);
    const dias = leerDias(crudo.dias);
    const fechaIngreso = fechaIsoDesdeCelda(crudo.fechaIngreso);

    if (!cedula) { saltadas.push({ fila: numero, motivo: 'sin cédula' }); continue; }
    // Más larga que lo que acepta la base: guardarla haría fallar el censo entero (tanda 4).
    if (cedula.length > LARGO_MAXIMO.cedula) { saltadas.push({ fila: numero, motivo: 'cédula no válida' }); continue; }
    if (dias === null) { saltadas.push({ fila: numero, motivo: 'días vacío o no válido' }); continue; }
    if (!fechaIngreso) { saltadas.push({ fila: numero, motivo: 'fecha de ingreso vacía o no válida' }); continue; }

    if (vistas.has(cedula)) {
      repetidas.push({ filaTomada: vistas.get(cedula), filaIgnorada: numero });
      continue;
    }
    vistas.set(cedula, numero);

    // Los textos se recortan al largo que acepta la base (tanda 4), por caracteres (recortar())
    // para no partir en dos un carácter especial (PYA tanda 4).
    filas.push({
      fila: numero,
      piso: recortar(limpiarTexto(textoPlano(crudo.piso)), LARGO_MAXIMO.piso),
      cama: recortar(limpiarTexto(textoPlano(crudo.cama)), LARGO_MAXIMO.cama),
      cedula,
      nombre: recortar(limpiarNombre(textoPlano(crudo.nombre)), LARGO_MAXIMO.nombre),
      fechaIngreso,
      dias,
    });
  }

  return { fecha, filas, saltadas, repetidas };
}

// --- El hilo aparte que abre los censos ---
// Cargar ExcelJS en un hilo nuevo tarda ~1,7 s en el PC de desarrollo, y leer un censo de
// 300 filas, ~0,1 s. Por eso el hilo se REUTILIZA (tanda 3, RNF-01): se abre una vez y
// atiende los censos de a uno. Si un archivo lo tumba o se pasa del tiempo, el siguiente
// censo abre uno nuevo. Los topes de memoria y de tiempo no cambian.

const SCRIPT_DEL_HILO = path.join(__dirname, 'censo-trabajador.js');
let hiloCompartido = null;
let cola = Promise.resolve();
let siguienteId = 1;

function crearHilo({ script, limiteMemoriaMb }) {
  const hilo = new Worker(script, {
    resourceLimits: { maxOldGenerationSizeMb: limiteMemoriaMb, maxYoungGenerationSizeMb: 32 },
  });
  hilo.unref(); // un hilo esperando no mantiene vivo al programa
  // La "red" del hilo (PYA tanda 3): un error suyo nunca tumba al servidor, aunque llegue
  // mientras espera o justo cuando se le acabó el tiempo; y si se cae, se olvida, para que
  // el siguiente censo abra uno nuevo en vez de esperar 15 s a un hilo muerto.
  hilo.on('error', () => {});
  hilo.on('exit', () => {
    if (hiloCompartido === hilo) hiloCompartido = null;
  });
  return hilo;
}

/** Le pasa un archivo al hilo y espera su respuesta, con tope de tiempo. */
function usarHilo(hilo, buffer, tiempoMaximoMs, alPerderElHilo) {
  return new Promise((resolver, rechazar) => {
    const id = siguienteId;
    siguienteId += 1;
    let listo = false;

    const terminar = (accion) => {
      if (listo) return;
      listo = true;
      clearTimeout(reloj);
      hilo.off('message', alResponder);
      hilo.off('error', alCaerse);
      hilo.off('exit', alCaerse);
      hilo.unref();
      accion();
    };
    function alResponder(respuesta) {
      if (respuesta?.id !== id) return;
      terminar(() => {
        if (respuesta.ok) resolver(respuesta.censo);
        else rechazar(new ErrorCenso(respuesta.codigo in MENSAJES ? respuesta.codigo : 'NO_ES_XLSX'));
      });
    }
    // Se quedó sin memoria o terminó sin responder: ese hilo ya no sirve.
    function alCaerse() {
      terminar(() => {
        alPerderElHilo();
        rechazar(new ErrorCenso('NO_ES_XLSX'));
      });
    }
    const reloj = setTimeout(() => terminar(() => {
      alPerderElHilo();
      hilo.terminate();
      rechazar(new ErrorCenso('NO_ES_XLSX'));
    }), tiempoMaximoMs);

    hilo.on('message', alResponder);
    hilo.once('error', alCaerse);
    hilo.once('exit', alCaerse);
    hilo.ref(); // mientras trabaja, el programa lo espera
    hilo.postMessage({ id, archivo: buffer });
  });
}

function hiloDelLector() {
  hiloCompartido ??= crearHilo({ script: SCRIPT_DEL_HILO, limiteMemoriaMb: LIMITE_MEMORIA_MB });
  return hiloCompartido;
}

/** Abre el hilo (y carga ExcelJS) antes del primer censo, para que ese no espere. */
function precalentarLector() {
  hiloDelLector();
}

// Los únicos scripts de hilo que aceptan las pruebas: los de test/ayudantes/ (PYA tanda 3).
const AYUDANTES_DE_PRUEBA = path.join(__dirname, '..', 'test', 'ayudantes') + path.sep;

async function leerConTopes(buffer, { tiempoMaximoMs = TIEMPO_MAXIMO_MS, limiteMemoriaMb, trabajadorParaPruebas } = {}) {
  if (!Buffer.isBuffer(buffer)) throw new ErrorCenso('NO_ES_XLSX');
  if (buffer.length > TAMANO_MAXIMO) throw new ErrorCenso('MUY_GRANDE');
  if (!pareceZip(buffer)) throw new ErrorCenso('NO_ES_XLSX');

  // Pruebas de los topes: un hilo de un solo uso, con su propio tope o su propio script.
  if (limiteMemoriaMb !== undefined || trabajadorParaPruebas !== undefined) {
    if (trabajadorParaPruebas !== undefined && !path.resolve(trabajadorParaPruebas).startsWith(AYUDANTES_DE_PRUEBA)) {
      throw new Error('Solo se aceptan hilos de prueba de test/ayudantes/');
    }
    const hilo = crearHilo({ script: trabajadorParaPruebas ?? SCRIPT_DEL_HILO, limiteMemoriaMb: limiteMemoriaMb ?? LIMITE_MEMORIA_MB });
    try {
      return await usarHilo(hilo, buffer, tiempoMaximoMs, () => {});
    } finally {
      hilo.terminate();
    }
  }

  // Uso normal: el hilo compartido, un censo a la vez.
  const turno = cola.then(() => {
    const hilo = hiloDelLector();
    return usarHilo(hilo, buffer, tiempoMaximoMs, () => {
      if (hiloCompartido === hilo) hiloCompartido = null; // el próximo censo abre uno nuevo
    });
  });
  cola = turno.catch(() => {}); // un censo que falla no traba a los siguientes
  return turno;
}

/**
 * Lee el censo y devuelve:
 * - fecha: 'AAAA-MM-DD' de "Generado el", o null si no está (HU-04.5);
 * - filas: [{ fila, piso, cama, cedula, nombre, fechaIngreso, dias }] (solo CL-02);
 * - saltadas: [{ fila, motivo }] (CB-04);
 * - repetidas: [{ filaTomada, filaIgnorada }] (CB-05).
 * Lanza ErrorCenso si el archivo no sirve (HU-04.3, 04.4 y 04.6).
 * No recibe opciones: es la que usa el sistema, y nada de la petición puede cambiar sus topes.
 */
function leerCenso(buffer) {
  return leerConTopes(buffer);
}

/** SOLO para las pruebas: la misma lectura, pero con otros topes o con un hilo de test/ayudantes/. */
function leerCensoParaPruebas(buffer, opciones) {
  return leerConTopes(buffer, opciones);
}

/** Los números del resumen de HU-04.1: "47 pacientes · 12 para revisar". */
function resumirCenso({ filas }) {
  return { pacientes: filas.length, paraRevisar: filas.filter(esCandidato).length };
}

module.exports = {
  leerCenso,
  leerCensoParaPruebas,
  precalentarLector,
  resumirCenso,
  analizarCenso,
  ErrorCenso,
  MENSAJES,
  TAMANO_MAXIMO,
  FILAS_PARA_ENCABEZADOS,
  LIMITE_FILAS,
  LARGO_MAXIMO,
};
