'use strict';

// Enmienda 4 · El lector del "XML Spreadsheet 2003" (el .xls que exporta el sistema de la clínica).
// Aquí se prueba solo cómo arma la hoja; las reglas del censo se prueban en test/censo.test.js.
// Todo es inventado (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { hojaDesdeXml, pareceXmlSpreadsheet, pareceXlsViejo, ErrorXml } = require('../lib/censo-xml');

const libro = (hojas, { declaracion = '<?xml version="1.0" encoding="UTF-8"?>' } = {}) => Buffer.from(
  `${declaracion}\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">${hojas}</Workbook>`,
);
const hoja = (filas, nombre = 'Censo') => `<Worksheet ss:Name="${nombre}"><Table>${filas}</Table></Worksheet>`;

/** Todas las celdas de la hoja como { fila: { columna: valor } }. */
function celdas(h) {
  const resultado = {};
  for (let numero = 1; numero <= h.rowCount; numero += 1) {
    const fila = h.findRow(numero);
    if (!fila) continue;
    resultado[numero] = {};
    fila.eachCell((celda, columna) => { resultado[numero][columna] = celda.value; });
  }
  return resultado;
}

test('base · enmienda 4 · tipos de dato: texto, número, fecha y hora, sí/no y error', () => {
  const h = hojaDesdeXml(libro(hoja('<Row>'
    + '<Cell><Data ss:Type="String">UCI</Data></Cell>'
    + '<Cell><Data ss:Type="Number">1</Data></Cell>'
    + '<Cell><Data ss:Type="DateTime">2026-11-06T00:00:00.000</Data></Cell>'
    + '<Cell><Data ss:Type="Boolean">1</Data></Cell>'
    + '<Cell><Data ss:Type="Error">#N/A</Data></Cell>'
    + '<Cell><Data ss:Type="Number">no es número</Data></Cell>'
    + '</Row>')));
  assert.deepEqual(celdas(h), { 1: { 1: 'UCI', 2: 1, 3: '2026-11-06', 4: true, 6: 'no es número' } });
  assert.equal(h.findRow(1).findCell(5), undefined, 'el error de Excel queda vacío');
  assert.equal(h.findRow(2), undefined);
});

test('base · enmienda 4 · ss:Index salta columnas y filas; MergeAcross corre la columna siguiente', () => {
  const h = hojaDesdeXml(libro(hoja(
    '<Row><Cell ss:MergeAcross="2"><Data ss:Type="String">Título</Data></Cell><Cell><Data ss:Type="String">D</Data></Cell></Row>'
    + '<Row ss:Index="4"><Cell ss:Index="3"><Data ss:Type="String">C</Data></Cell><Cell><Data ss:Type="String">D</Data></Cell></Row>'
    + '<Row><Cell/><Cell><Data ss:Type="String">B</Data></Cell></Row>',
  )));
  assert.deepEqual(celdas(h), { 1: { 1: 'Título', 4: 'D' }, 4: { 3: 'C', 4: 'D' }, 5: { 2: 'B' } });
  assert.equal(h.rowCount, 5);
});

test('base · enmienda 4 · solo la primera hoja; los comentarios de las celdas no cuentan', () => {
  const h = hojaDesdeXml(libro(
    hoja('<Row><Cell><Data ss:Type="String">bien</Data><Comment><ss:Data><B>nota</B></ss:Data></Comment></Cell></Row>')
    + hoja('<Row><Cell><Data ss:Type="String">otra hoja</Data></Cell></Row>', 'Otra'),
  ));
  assert.deepEqual(celdas(h), { 1: { 1: 'bien' } });
});

test('base · enmienda 4 · texto con formato, entidades de XML, CDATA y nombres con prefijo', () => {
  const h = hojaDesdeXml(libro(hoja(
    '<ss:Row><ss:Cell><ss:Data ss:Type="String"><html:B>MUÑOZ</html:B> &amp; PEÑA &#209;</ss:Data></ss:Cell>'
    + '<ss:Cell><ss:Data ss:Type="String"><![CDATA[<a & b>]]></ss:Data></ss:Cell></ss:Row>',
  )));
  assert.deepEqual(celdas(h), { 1: { 1: 'MUÑOZ & PEÑA Ñ', 2: '<a & b>' } });
});

test('base · enmienda 4 · un archivo en Latin-1 (Windows-1252) también se lee con sus tildes', () => {
  const texto = libro(hoja('<Row><Cell><Data ss:Type="String">Observación PEÑA</Data></Cell></Row>'),
    { declaracion: '<?xml version="1.0" encoding="ISO-8859-1"?>' }).toString('utf8');
  const h = hojaDesdeXml(Buffer.from(texto, 'latin1'));
  assert.deepEqual(celdas(h), { 1: { 1: 'Observación PEÑA' } });
});

test('base · CL-06 · lo trucado se rechaza: DOCTYPE, entidades desconocidas, índices fuera de rango, celdas enormes', () => {
  const malos = [
    '<?xml version="1.0"?><!DOCTYPE Workbook><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"/>',
    libro(hoja('<Row><Cell><Data ss:Type="String">&desconocida;</Data></Cell></Row>')).toString(),
    libro(hoja('<Row><Cell ss:Index="0"><Data ss:Type="String">x</Data></Cell></Row>')).toString(),
    libro(hoja('<Row><Cell ss:Index="16385"><Data ss:Type="String">x</Data></Cell></Row>')).toString(),
    libro(hoja('<Row ss:Index="1048577"><Cell><Data ss:Type="String">x</Data></Cell></Row>')).toString(),
    libro(hoja('<Row><Cell ss:MergeAcross="-1"><Data ss:Type="String">x</Data></Cell></Row>')).toString(),
    libro(hoja(`<Row><Cell><Data ss:Type="String">${'a'.repeat(32_768)}</Data></Cell></Row>`)).toString(),
    '<?xml version="1.0"?><Otra xmlns="urn:schemas-microsoft-com:office:spreadsheet"/>',
    libro(hoja('<Row><Cell><Data ss:Type="String">sin cerrar</Data></Cell>')).toString(),
  ];
  for (const xml of malos) assert.throws(() => hojaDesdeXml(Buffer.from(xml)), (error) => error instanceof Error, xml.slice(0, 80));
  assert.throws(() => hojaDesdeXml(Buffer.from(malos[0])), ErrorXml);
  // 32.767 caracteres (lo máximo de Excel) sí entra.
  const justo = hojaDesdeXml(libro(hoja(`<Row><Cell><Data ss:Type="String">${'a'.repeat(32_767)}</Data></Cell></Row>`)));
  assert.equal(justo.findRow(1).findCell(1).value.length, 32_767);
});

test('base · enmienda 4 · se reconoce el XML 2003 y el .xls binario viejo por sus primeros bytes', () => {
  assert.equal(pareceXmlSpreadsheet(libro(hoja(''))), true);
  assert.equal(pareceXmlSpreadsheet(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), libro(hoja(''))])), true, 'con BOM');
  assert.equal(pareceXmlSpreadsheet(Buffer.from('<?xml version="1.0"?><nota/>')), false);
  assert.equal(pareceXmlSpreadsheet(Buffer.from('<html><table></table></html>')), false);
  assert.equal(pareceXmlSpreadsheet(Buffer.from('PK\u0003\u0004')), false);
  assert.equal(pareceXlsViejo(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])), true);
  assert.equal(pareceXlsViejo(Buffer.from([0xd0, 0xcf, 0x11])), false);
});

test('base · CL-06 · el lector frena por su cuenta después de 10.000 filas con datos (antes de armar la hoja)', () => {
  const filas = (cantidad) => '<Row><Cell><Data ss:Type="String">a</Data></Cell></Row>'.repeat(cantidad);
  assert.equal(hojaDesdeXml(libro(hoja(filas(10_000)))).rowCount, 10_000);
  assert.throws(() => hojaDesdeXml(libro(hoja(filas(10_001)))), ErrorXml);
});

test('CB-04 · PYA enmienda 4 · un número vacío queda vacío (no 0), y solo se leen números como los de Excel', () => {
  const h = hojaDesdeXml(libro(hoja('<Row>'
    + '<Cell><Data ss:Type="Number"></Data></Cell>'
    + '<Cell><Data ss:Type="Number">   </Data></Cell>'
    + '<Cell><Data ss:Type="Number"> 7 </Data></Cell>'
    + '<Cell><Data ss:Type="Number">1.5E-2</Data></Cell>'
    + '<Cell><Data ss:Type="Number">-3</Data></Cell>'
    + '<Cell><Data ss:Type="Number">0x1F</Data></Cell>'
    + '<Cell><Data ss:Type="Number">0b11</Data></Cell>'
    + '</Row>')));
  assert.deepEqual(celdas(h), { 1: { 3: 7, 4: 0.015, 5: -3, 6: '0x1F', 7: '0b11' } }, 'las vacías no están: "Días" vacío se salta como en el .xlsx');
});

test('base · PYA enmienda 4 · un comentario dentro del dato no se cuela, y un dato fuera de una celda no cuenta', () => {
  const h = hojaDesdeXml(libro(hoja(
    '<Row><Cell><Data ss:Type="String">UCI<Comment><Data ss:Type="String">nota</Data></Comment></Data></Cell></Row>'
    + '<Row><Cell ss:MergeAcross="5"><Data ss:Type="String">A</Data></Cell><Data ss:Type="String">suelto</Data></Row>',
  )));
  assert.deepEqual(celdas(h), { 1: { 1: 'UCI' }, 2: { 1: 'A' } });
});

test('base · CL-06 · PYA enmienda 4 · tope de etiquetas una dentro de otra (64), y miles de atributos no rompen nada', () => {
  const anidar = (cantidad) => `${'<b>'.repeat(cantidad)}x${'</b>'.repeat(cantidad)}`;
  // Workbook › Worksheet › Table › Row › Cell › Data son 6: con 58 de formato adentro llega a 64 justo.
  const justo = hojaDesdeXml(libro(hoja(`<Row><Cell><Data ss:Type="String">${anidar(58)}</Data></Cell></Row>`)));
  assert.equal(justo.findRow(1).findCell(1).value, 'x');
  assert.throws(() => hojaDesdeXml(libro(hoja(`<Row><Cell><Data ss:Type="String">${anidar(59)}</Data></Cell></Row>`))), ErrorXml);
  assert.throws(() => hojaDesdeXml(libro(hoja(`<Row><Cell><Data ss:Type="String">${anidar(100_000)}</Data></Cell></Row>`))), ErrorXml);

  const muchos = Array.from({ length: 5000 }, (_, i) => ` a${i}=""`).join('');
  const h = hojaDesdeXml(libro(hoja(`<Row><Cell${muchos} ss:Index="3"><Data ss:Type="String">C</Data></Cell></Row>`)));
  assert.deepEqual(celdas(h), { 1: { 3: 'C' } });
});
