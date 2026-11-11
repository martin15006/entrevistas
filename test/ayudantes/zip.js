'use strict';

// Ayudante de pruebas: arma un .zip a mano, byte por byte, con módulos de Node.
// Sirve para fabricar archivos trucados (como una "bomba zip") que ExcelJS no fabricaría.

const zlib = require('node:zlib');

/** entradas: [{ nombre, datos (Buffer), comprimir = true }] → el .zip como Buffer. */
function crearZip(entradas) {
  const partes = [];
  const centrales = [];
  let desplazamiento = 0;

  for (const { nombre, datos, comprimir = true } of entradas) {
    const nombreBytes = Buffer.from(nombre, 'utf8');
    const contenido = comprimir ? zlib.deflateRawSync(datos) : datos;
    const crc = zlib.crc32(datos);
    const metodo = comprimir ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // firma del encabezado local
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(contenido.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nombreBytes.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // firma del directorio central
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(contenido.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nombreBytes.length, 28);
    central.writeUInt32LE(desplazamiento, 42);

    partes.push(local, nombreBytes, contenido);
    centrales.push(central, nombreBytes);
    desplazamiento += 30 + nombreBytes.length + contenido.length;
  }

  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); // firma del final
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);

  return Buffer.concat([...partes, directorio, fin]);
}

/** Lo contrario: saca las partes de un .zip normal → [{ nombre, datos }]. */
function leerEntradas(zip) {
  let fin = zip.length - 22;
  while (fin >= 0 && zip.readUInt32LE(fin) !== 0x06054b50) fin -= 1;
  const cantidad = zip.readUInt16LE(fin + 10);
  let posicion = zip.readUInt32LE(fin + 16);
  const entradas = [];
  for (let n = 0; n < cantidad; n += 1) {
    const metodo = zip.readUInt16LE(posicion + 10);
    const tamano = zip.readUInt32LE(posicion + 20);
    const largoNombre = zip.readUInt16LE(posicion + 28);
    const nombre = zip.toString('utf8', posicion + 46, posicion + 46 + largoNombre);
    const local = zip.readUInt32LE(posicion + 42);
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const datos = zip.subarray(inicio, inicio + tamano);
    entradas.push({ nombre, datos: metodo === 8 ? zlib.inflateRawSync(datos) : Buffer.from(datos) });
    posicion += 46 + largoNombre + zip.readUInt16LE(posicion + 30) + zip.readUInt16LE(posicion + 32);
  }
  return entradas;
}

module.exports = { crearZip, leerEntradas };
