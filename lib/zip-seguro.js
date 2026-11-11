'use strict';

// Revisa un .zip (un .xlsx es un .zip) ANTES de dárselo a ExcelJS, para frenar las
// "bombas zip": archivos chiquitos que al descomprimirse ocupan gigas.
//
// No se le cree al tamaño que el zip "dice" tener (un archivo trucado puede mentir):
// se descomprime cada parte de verdad, con un tope (maxOutputLength) que Node respeta.
// Solo usa módulos de Node, sin librerías nuevas.

const zlib = require('node:zlib');

const FIRMA_FIN = 0x06054b50; // "fin del directorio central"
const FIRMA_CENTRAL = 0x02014b50; // una entrada del directorio central
const FIRMA_LOCAL = 0x04034b50; // el encabezado de cada archivo dentro del zip

const MAX_DESCOMPRIMIDO = 50 * 1024 * 1024; // 50 MB en total (un censo real pesa menos de 1 MB)
const MAX_ENTRADAS = 1000;

/** Busca el registro del final del zip (puede tener un comentario de hasta 65.535 bytes). */
function buscarFin(buffer) {
  const ultimo = buffer.length - 22;
  for (let i = ultimo; i >= Math.max(0, ultimo - 0xffff); i -= 1) {
    if (buffer.readUInt32LE(i) === FIRMA_FIN) return i;
  }
  return -1;
}

/**
 * true si el zip está bien armado y todo su contenido, descomprimido de verdad,
 * cabe en `maxDescomprimido` bytes. false ante cualquier cosa rara.
 */
function revisarZip(buffer, { maxDescomprimido = MAX_DESCOMPRIMIDO, maxEntradas = MAX_ENTRADAS } = {}) {
  try {
    const fin = buscarFin(buffer);
    if (fin < 0) return false;

    const entradas = buffer.readUInt16LE(fin + 10);
    const inicioCentral = buffer.readUInt32LE(fin + 16);
    // Los zip64 (para archivos de más de 4 GB) no los necesita ningún censo.
    if (entradas === 0xffff || inicioCentral === 0xffffffff) return false;
    if (entradas > maxEntradas) return false;

    let posicion = inicioCentral;
    let presupuesto = maxDescomprimido;

    for (let n = 0; n < entradas; n += 1) {
      if (buffer.readUInt32LE(posicion) !== FIRMA_CENTRAL) return false;
      const metodo = buffer.readUInt16LE(posicion + 10);
      const tamanoComprimido = buffer.readUInt32LE(posicion + 20);
      const largoNombre = buffer.readUInt16LE(posicion + 28);
      const largoExtra = buffer.readUInt16LE(posicion + 30);
      const largoComentario = buffer.readUInt16LE(posicion + 32);
      const inicioLocal = buffer.readUInt32LE(posicion + 42);
      posicion += 46 + largoNombre + largoExtra + largoComentario;

      if (buffer.readUInt32LE(inicioLocal) !== FIRMA_LOCAL) return false;
      const inicioDatos = inicioLocal + 30 + buffer.readUInt16LE(inicioLocal + 26) + buffer.readUInt16LE(inicioLocal + 28);
      const datos = buffer.subarray(inicioDatos, inicioDatos + tamanoComprimido);
      if (datos.length !== tamanoComprimido) return false;

      let tamanoReal;
      if (metodo === 0) tamanoReal = tamanoComprimido; // guardado sin comprimir
      else if (metodo === 8) {
        // Si al descomprimir pasa del presupuesto que queda, Node lanza un error y se rechaza.
        tamanoReal = zlib.inflateRawSync(datos, { maxOutputLength: Math.max(1, presupuesto) }).length;
      } else return false; // otros métodos: un .xlsx normal no los usa

      presupuesto -= tamanoReal;
      if (presupuesto < 0) return false;
    }
    return true;
  } catch {
    return false; // lecturas fuera del archivo, datos dañados, presupuesto superado…
  }
}

module.exports = { revisarZip, MAX_DESCOMPRIMIDO, MAX_ENTRADAS };
