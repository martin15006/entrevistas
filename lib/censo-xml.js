'use strict';

// Enmienda 4 · El censo en ".xls" que exporta el sistema de la clínica. Por dentro NO es un Excel
// binario: es un "XML Spreadsheet 2003" (texto XML que Excel abre). Este archivo lo lee y arma una
// "hoja" con la MISMA forma que la de ExcelJS (rowCount, findRow, eachCell, findCell): así
// lib/censo.js aplica exactamente las mismas reglas que al .xlsx (encabezados, "Generado el",
// cédulas, días y solo los 6 datos de CL-02).
//
// Se trata como sospechoso, igual que el .xlsx (corre en el hilo aparte, con topes):
// - saxes solo conoce las 5 entidades de XML: no expande entidades declaradas ni lee archivos
//   de afuera. Igual, cualquier <!DOCTYPE> se rechaza a propósito (segunda cerradura).
// - Solo se lee la PRIMERA hoja; los comentarios de las celdas se ignoran.
// - Filas y columnas tienen tope: un archivo trucado no llena la memoria.

const { SaxesParser } = require('saxes');

const MAXIMO_FILA = 1_048_576; // lo máximo de Excel
const MAXIMO_COLUMNA = 16_384;
const MAXIMO_FILAS_CON_DATOS = 10_000; // como LIMITE_FILAS de lib/censo.js: un censo real tiene cientos
const MAXIMO_TEXTO_CELDA = 32_767; // lo máximo de una celda de Excel
// Un censo anida unas 8 etiquetas (Workbook › Worksheet › Table › Row › Cell › Data › formato).
// Miles de etiquetas una dentro de otra solo sirven para llenar la memoria (PYA enmienda 4).
const MAXIMO_PROFUNDIDAD = 64;
// Un número como lo escribe Excel: 12, -3, 0.5, 1.5E-2. Nada de 0x1F, 0b11 ni texto vacío.
const NUMERO = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

class ErrorXml extends Error {}

/** El nombre sin prefijo: "ss:Index" → "Index", "Row" → "Row". */
const local = (nombre) => nombre.slice(nombre.indexOf(':') + 1);

/**
 * Un atributo de SpreadsheetML (ss:Index o Index). Se lee directo, sin recorrer todos: un
 * elemento con miles de atributos no gasta memoria de más (PYA enmienda 4).
 */
function atributo(nodo, nombre) {
  return nodo.attributes[`ss:${nombre}`] ?? nodo.attributes[nombre];
}

/** Un número entero entre 1 y el máximo, o error. */
function entero(texto, maximo) {
  if (!/^\d{1,7}$/.test(String(texto))) throw new ErrorXml('índice no válido');
  const numero = Number(texto);
  if (numero < 1 || numero > maximo) throw new ErrorXml('índice fuera de rango');
  return numero;
}

/** El texto de una celda según su tipo, como lo daría ExcelJS. */
function convertir(tipo, texto) {
  if (tipo === 'Number') {
    // Vacío queda vacío, como en el .xlsx (si no, unos "Días" vacíos serían día 0: CB-04).
    const limpio = texto.trim();
    if (limpio === '') return '';
    return NUMERO.test(limpio) && Number.isFinite(Number(limpio)) ? Number(limpio) : texto;
  }
  if (tipo === 'DateTime') {
    const coincide = /^\s*(\d{4}-\d{2}-\d{2})T/.exec(texto);
    return coincide ? coincide[1] : texto; // 'AAAA-MM-DD': lo entiende fechaIsoDesdeCelda
  }
  if (tipo === 'Boolean') return texto.trim() === '1';
  if (tipo === 'Error') return '';
  return texto; // String y cualquier otro
}

/** El texto del archivo: UTF-8 (lo normal) o Latin-1/Windows-1252 si así lo declara. */
function decodificar(buffer) {
  const inicio = buffer.subarray(0, 200).toString('latin1');
  const declarada = /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(inicio)?.[1]?.toLowerCase();
  if (declarada && /^(iso-8859-1|latin1|windows-1252|cp1252)$/.test(declarada)) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
  return new TextDecoder('utf-8').decode(buffer); // también quita el BOM si lo trae
}

/** La hoja con la misma forma que la de ExcelJS, a partir de las filas leídas. */
function crearHoja(filas, rowCount) {
  return {
    rowCount,
    findRow(numero) {
      const celdas = filas.get(numero);
      if (!celdas) return undefined;
      const enOrden = [...celdas].sort((a, b) => a[0] - b[0]);
      return {
        eachCell(alVer) { for (const [columna, value] of enOrden) alVer({ value }, columna); },
        findCell(columna) { return celdas.has(columna) ? { value: celdas.get(columna) } : undefined; },
      };
    },
  };
}

/**
 * Lee un "XML Spreadsheet 2003" y devuelve su primera hoja (o null si no tiene ninguna).
 * Lanza ErrorXml si el archivo no es eso o trae algo no permitido.
 */
function hojaDesdeXml(buffer) {
  const filas = new Map(); // número de fila → Map(columna → valor)
  let ultimaFila = 0;
  let raiz = null;
  let hojas = 0;
  let enPrimeraHoja = false;
  let enComentario = 0;
  let fila = 0;
  let celdasDeLaFila = null;
  let columna = 0;
  let unirHacia = 0;
  let enCelda = false; // un <Data> solo cuenta dentro de un <Cell>
  let dato = null; // { tipo, texto } mientras se lee un <Data>
  let profundidad = 0;

  const parser = new SaxesParser({ xmlns: false });
  parser.on('doctype', () => { throw new ErrorXml('el censo no trae DOCTYPE'); });
  parser.on('opentag', (nodo) => {
    profundidad += 1;
    if (profundidad > MAXIMO_PROFUNDIDAD) throw new ErrorXml('demasiadas etiquetas una dentro de otra');
    const nombre = local(nodo.name);
    if (raiz === null) {
      raiz = nombre;
      if (raiz !== 'Workbook') throw new ErrorXml('no es un libro de Excel');
      return;
    }
    if (nombre === 'Worksheet') {
      hojas += 1;
      enPrimeraHoja = hojas === 1;
      return;
    }
    if (!enPrimeraHoja) return;
    if (nombre === 'Comment') { enComentario += 1; return; }
    if (enComentario > 0) return;

    if (nombre === 'Row') {
      const indice = atributo(nodo, 'Index');
      fila = indice === undefined ? fila + 1 : entero(indice, MAXIMO_FILA);
      if (fila > MAXIMO_FILA) throw new ErrorXml('demasiadas filas');
      celdasDeLaFila = new Map();
      columna = 0;
    } else if (nombre === 'Cell' && celdasDeLaFila) {
      const indice = atributo(nodo, 'Index');
      columna = indice === undefined ? columna + 1 : entero(indice, MAXIMO_COLUMNA);
      if (columna > MAXIMO_COLUMNA) throw new ErrorXml('demasiadas columnas');
      const unir = atributo(nodo, 'MergeAcross');
      unirHacia = unir === undefined ? 0 : entero(Number(unir) + 1, MAXIMO_COLUMNA) - 1;
      enCelda = true;
    } else if (nombre === 'Data' && enCelda) {
      dato = { tipo: atributo(nodo, 'Type') ?? 'String', texto: '' };
    }
  });
  const alTexto = (texto) => {
    if (!dato || enComentario > 0) return; // un comentario metido dentro del dato no cuenta
    dato.texto += texto;
    if (dato.texto.length > MAXIMO_TEXTO_CELDA) throw new ErrorXml('celda demasiado larga');
  };
  parser.on('text', alTexto);
  parser.on('cdata', alTexto);
  parser.on('closetag', (nodo) => {
    profundidad -= 1;
    const nombre = local(nodo.name);
    if (nombre === 'Worksheet') { enPrimeraHoja = false; return; }
    if (!enPrimeraHoja) return;
    if (nombre === 'Comment') { enComentario -= 1; return; }
    if (enComentario > 0) return;

    if (nombre === 'Data' && dato) {
      const valor = convertir(dato.tipo, dato.texto);
      if (valor !== '') celdasDeLaFila.set(columna, valor);
      dato = null;
    } else if (nombre === 'Cell') {
      columna += unirHacia; // la próxima celda empieza después de las columnas unidas
      unirHacia = 0;
      enCelda = false;
    } else if (nombre === 'Row' && celdasDeLaFila) {
      if (celdasDeLaFila.size > 0) {
        filas.set(fila, celdasDeLaFila);
        if (filas.size > MAXIMO_FILAS_CON_DATOS) throw new ErrorXml('demasiadas filas');
        ultimaFila = Math.max(ultimaFila, fila);
      }
      celdasDeLaFila = null;
    }
  });

  parser.write(decodificar(buffer)).close();
  if (raiz !== 'Workbook') throw new ErrorXml('no es un libro de Excel');
  return hojas === 0 ? null : crearHoja(filas, ultimaFila);
}

// --- Para reconocer el archivo antes de abrirlo (lib/censo.js) ---

const ESPACIO_DE_NOMBRES = 'urn:schemas-microsoft-com:office:spreadsheet';

/** ¿Parece un "XML Spreadsheet 2003"? Se mira solo el comienzo (sin abrir todo el archivo). */
function pareceXmlSpreadsheet(buffer) {
  const inicio = buffer.subarray(0, 8192).toString('latin1').replace(/^ï»¿/, '');
  return /^\s*<\?xml\b/.test(inicio) && inicio.includes(ESPACIO_DE_NOMBRES) && /<(\w+:)?Workbook\b/.test(inicio);
}

/** ¿Es un .xls binario viejo (Excel 97-2003)? Empiezan siempre con estos 8 bytes. */
function pareceXlsViejo(buffer) {
  const firma = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return buffer.length >= firma.length && firma.every((byte, i) => buffer[i] === byte);
}

module.exports = { hojaDesdeXml, pareceXmlSpreadsheet, pareceXlsViejo, ErrorXml };
