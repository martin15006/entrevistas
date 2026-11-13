'use strict';

// HU-09 · Las reglas del formulario (validarEntrevista, lib/reglas.js) y la pantalla armada con lo
// que devuelve ver_entrevista() (armarFormulario, lib/formulario.js). Sin base ni servidor.
// Todos los pacientes son inventados (CL-01).

const test = require('node:test');
const assert = require('node:assert/strict');
const { validarEntrevista, TIPOS_DE_DECLARACION, CAMPOS_DE_LA_ENTREVISTA, soloNumeros, limpiarPlaca, limpiarEscrito } = require('../lib/reglas');
const { armarFormulario } = require('../lib/formulario');

const HOY = '2026-11-12';
const completa = (extra = {}) => ({
  edad: '34', fecha_accidente: '2026-11-11', hora_accidente: '18:40', lugar: 'Calle 10 con carrera 5',
  direccion: 'Barrio Prueba', telefono: '3001234567', tipo_declaracion: 'C/M', relato: 'Venía en la moto y lo cerraron.',
  placa: 'abc 12d', ...extra,
});

test('HU-09.2 · los campos y los 7 tipos de declaración, en el orden del SRS (D3)', () => {
  assert.deepEqual(CAMPOS_DE_LA_ENTREVISTA, [
    'edad', 'fecha_accidente', 'hora_accidente', 'lugar', 'direccion', 'telefono', 'tipo_declaracion', 'relato', 'placa',
  ]);
  assert.deepEqual(TIPOS_DE_DECLARACION.map((t) => t.texto), ['C/M', 'P/M', 'C/A', 'P/A', 'Peatón', 'Ciclista', 'Otro']);
  assert.deepEqual(TIPOS_DE_DECLARACION.map((t) => t.valor), ['C/M', 'P/M', 'C/A', 'P/A', 'PEATON', 'CICLISTA', 'OTRO'], 'como los guarda la base');
});

test('HU-09.4 · RN-10 · con los 5 obligatorios se puede guardar, y los opcionales vacíos quedan en null', () => {
  const { datos, primero } = validarEntrevista({
    edad: '0', fecha_accidente: HOY, lugar: ' Vía  al mar ', tipo_declaracion: 'PEATON', relato: 'Lo atropellaron.',
  }, HOY);
  assert.equal(primero, null);
  assert.deepEqual(datos, {
    edad: 0, fecha_accidente: HOY, hora_accidente: null, lugar: 'Vía al mar', direccion: null, telefono: null,
    tipo_declaracion: 'PEATON', relato: 'Lo atropellaron.', placa: null, placa_no_sabe: false,
  });
});

test('HU-09.5 · cada obligatorio que falta dice "Falta este dato." y se baja al PRIMERO', () => {
  const { errores, primero, datos } = validarEntrevista({ telefono: '3001234567', relato: '   ' }, HOY);
  assert.equal(datos, null, 'no se guarda nada');
  assert.deepEqual(errores, {
    edad: 'faltaDato', fecha_accidente: 'faltaDato', lugar: 'faltaDato', tipo_declaracion: 'faltaDato', relato: 'faltaDato',
  });
  assert.equal(primero, 'edad');
  assert.equal(validarEntrevista(completa({ lugar: '', relato: '' }), HOY).primero, 'lugar', 'en el orden del formulario');
});

test('HU-09.6 · los datos fuera de las reglas, cada uno con su texto', () => {
  const casos = [
    [{ edad: '121' }, 'edad', 'edadFuera'],
    [{ edad: '120' }, 'edad', null],
    [{ telefono: '123456' }, 'telefono', 'telefonoFuera'],
    [{ telefono: '12345678901' }, 'telefono', 'telefonoFuera'],
    [{ telefono: '1234567' }, 'telefono', null],
    [{ fecha_accidente: '2026-11-13' }, 'fecha_accidente', 'fechaAccidenteFutura'],
    [{ fecha_accidente: HOY }, 'fecha_accidente', null],
    [{ fecha_accidente: '2026-02-30' }, 'fecha_accidente', 'faltaDato'],
    [{ placa: 'ABCD1234' }, 'placa', 'placaFuera'],
    [{ placa: 'AB*12' }, 'placa', 'placaFuera'],
    [{ placa: 'ñu123' }, 'placa', 'placaFuera'],
  ];
  for (const [cambio, campo, esperado] of casos) {
    const { errores } = validarEntrevista(completa(cambio), HOY);
    assert.equal(errores[campo] ?? null, esperado, JSON.stringify(cambio));
  }
});

test('HU-09.7 · CB-13 · la placa queda en mayúsculas sin espacios, y Edad y Teléfono solo con números', () => {
  assert.equal(limpiarPlaca('abc 12d'), 'ABC12D');
  assert.equal(limpiarPlaca(' xyz-987 '), 'XYZ987');
  assert.equal(soloNumeros('300 123-45 67'), '3001234567');
  const { datos } = validarEntrevista(completa({ edad: '3 4 años', telefono: 'tel: 300 123 4567' }), HOY);
  assert.deepEqual([datos.edad, datos.telefono, datos.placa], [34, '3001234567', 'ABC12D']);
});

test('RN-10 · PYA tanda 9 · lugar, dirección y relato sin invisibles ni espacios de más (la base hace lo mismo)', () => {
  const c = (codigo) => String.fromCharCode(codigo);
  assert.equal(limpiarEscrito(`a ${c(0x200b)} b`), 'a b', 'un invisible entre espacios no deja dos');
  assert.equal(limpiarEscrito('\t\n '), '');
  assert.equal(limpiarEscrito(`${c(0xa0)}Calle${c(0xa0)}${c(0xa0)}10${c(0xfeff)}`), 'Calle 10');
  assert.equal(limpiarEscrito(`a${c(0x202e)}b`), 'ab', 'sin marcas que dan vuelta el texto');
  assert.equal(limpiarEscrito(' Vino\r\n\r\nen  moto ', { variasLineas: true }), 'Vino\n\nen moto', 'el relato conserva sus saltos');
  assert.equal(limpiarEscrito(null), '');
  const { errores } = validarEntrevista(completa({ lugar: `${c(0x200b)}\t`, relato: `\n${c(0x200d)}\n` }), HOY);
  assert.deepEqual([errores.lugar, errores.relato], ['faltaDato', 'faltaDato']);
});

test('CB-14 · con "No sabe", la placa no se guarda aunque venga escrita', () => {
  const { datos } = validarEntrevista(completa({ placa: 'ABC123', placa_no_sabe: 'si' }), HOY);
  assert.deepEqual([datos.placa, datos.placa_no_sabe], [null, true]);
  assert.equal(validarEntrevista(completa({ placa: 'ABCD12345', placa_no_sabe: 'si' }), HOY).primero, null, 'ni se revisa');
});

test('CB-12 · el relato hasta 500, contando un salto de línea como uno (el navegador lo manda como \\r\\n)', () => {
  const quinientos = `${'a'.repeat(249)}\r\n${'b'.repeat(250)}`; // 500 en la pantalla, 501 si se cuenta el \r
  const { datos } = validarEntrevista(completa({ relato: quinientos }), HOY);
  assert.equal(Array.from(datos.relato).length, 500);
  assert.equal(validarEntrevista(completa({ relato: 'x'.repeat(501) }), HOY).malo, true);
});

test('base · lo que el formulario no puede mandar no lo escribió una persona: se rechaza entero', () => {
  for (const cambio of [
    { edad: ['1', '2'] }, { tipo_declaracion: 'MOTO' }, { hora_accidente: '25:00' }, { hora_accidente: '6pm' },
    { lugar: 'x'.repeat(201) }, { direccion: 'x'.repeat(201) }, { placa_no_sabe: { a: 1 } },
  ]) {
    assert.deepEqual(validarEntrevista(completa(cambio), HOY), { malo: true }, JSON.stringify(cambio));
  }
  assert.equal(validarEntrevista(null, HOY).primero, 'edad', 'sin nada: faltan todos');
});

// --- armarFormulario ---

const pendiente = (extra = {}) => ({
  id: 1001, estado: 'pendiente', hoy: HOY, piso: 'UCI', cama: 'Cama 3', cedula: '990000003', nombre: 'PACIENTE 3 PRUEBA',
  censo_fecha: '2026-11-11', edad: null, fecha_accidente: null, hora_accidente: null, lugar: null, direccion: null,
  telefono: null, tipo_declaracion: null, relato: null, placa: null, placa_no_sabe: false, en_curso_por: null, ...extra,
});

test('HU-09.1 · arriba, fijos: cama, servicio, nombre y cédula (y de qué censo es)', () => {
  const v = armarFormulario(pendiente());
  assert.equal(v.caso, 'formulario');
  assert.deepEqual(v.paciente, { cama: 'Cama 3', servicio: 'UCI', nombre: 'PACIENTE 3 PRUEBA', cedula: '990000003' });
  assert.equal(v.censo, '11/11/2026');
  assert.equal(v.accion, '/entrevistas/1001');
  assert.equal(v.hoy, HOY, 'para que el calendario no deje elegir un día posterior');
  assert.equal(v.contador, '0/500');
});

test('HU-09.9 · si otra persona la está haciendo, primero se pregunta; con "Abrir igual", el formulario', () => {
  const ocupada = pendiente({ en_curso_por: 'BETO PRUEBA' });
  const aviso = armarFormulario(ocupada);
  assert.equal(aviso.caso, 'en_curso');
  assert.equal(aviso.mensaje, 'BETO PRUEBA está haciendo esta entrevista. ¿Abrirla igual?');
  assert.equal(aviso.abrirIgual, '/entrevistas/1001?igual=1');
  assert.equal(armarFormulario(ocupada, { igual: true }).caso, 'formulario');
});

test('base · una entrevista que ya no está pendiente no se llena', () => {
  for (const estado of ['entrevistado', 'salio']) {
    const v = armarFormulario(pendiente({ estado }));
    assert.deepEqual([v.caso, v.mensaje], ['cerrada', 'Esta entrevista ya no está pendiente.']);
  }
});

test('HU-09.5 · al volver con errores (sin JavaScript), todo lo escrito sigue ahí, con su texto bajo cada campo', () => {
  const enviados = completa({ edad: '', placa_no_sabe: 'si', relato: 'Hola' });
  const v = armarFormulario(pendiente(), { igual: true, enviados, errores: { edad: 'faltaDato', telefono: 'telefonoFuera' } });
  assert.equal(v.valores.lugar, 'Calle 10 con carrera 5');
  assert.equal(v.valores.placa, '', 'CB-14: con "No sabe", la placa vacía');
  assert.equal(v.valores.placa_no_sabe, true);
  assert.deepEqual(v.errores, { edad: 'Falta este dato.', telefono: 'El teléfono debe tener entre 7 y 10 números.' });
  assert.deepEqual(v.tipos.filter((t) => t.elegido).map((t) => t.valor), ['C/M']);
  assert.equal(v.contador, '4/500');
  assert.equal(new Set(v.tipos.map((t) => t.id)).size, 7, 'cada botón con su id');
});
