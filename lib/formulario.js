'use strict';

// HU-09 · Arma la pantalla del formulario de una entrevista con lo que devuelve ver_entrevista()
// (database/10). No habla con la base: así se prueba sola (test/formulario.test.js).
// Tres casos:
//   'formulario' · la entrevista pendiente, para llenarla (HU-09.1 a 09.8);
//   'en_curso'   · otra persona la abrió hace menos de 15 minutos: se pregunta antes (HU-09.9);
//   'cerrada'    · ya no está pendiente (se guardó o salió): no hay nada que llenar.

const { esFechaIso, fechaCorta } = require('./fechas');
const { TIPOS_DE_DECLARACION, CAMPOS_DE_LA_ENTREVISTA, MAXIMOS } = require('./reglas');
const { MENSAJES } = require('./mensajes');

const texto = (valor) => (valor === null || valor === undefined ? '' : String(valor));

/** Lo que está escrito en cada campo: lo que se acaba de enviar (si volvió con errores) o lo guardado. */
function valoresDe(entrevista, enviados) {
  const valores = {};
  for (const nombre of CAMPOS_DE_LA_ENTREVISTA) {
    valores[nombre] = enviados ? texto(enviados[nombre]) : texto(entrevista[nombre]);
  }
  valores.placa_no_sabe = enviados ? enviados.placa_no_sabe === 'si' : entrevista.placa_no_sabe === true;
  if (valores.placa_no_sabe) valores.placa = ''; // CB-14
  return valores;
}

/**
 * @param entrevista lo que devuelve ver_entrevista() (no null)
 * @param igual      la persona eligió "Abrir igual" (HU-09.9)
 * @param enviados   lo que se envió, si el formulario vuelve con errores (sin JavaScript)
 * @param errores    { campo: clave de MENSAJES } (de validarEntrevista)
 * @param aviso      un mensaje arriba del formulario (por ejemplo CB-17, sin JavaScript)
 */
function armarFormulario(entrevista, { igual = false, enviados = null, errores = {}, aviso = null } = {}) {
  const id = entrevista.id;
  const vista = {
    id,
    accion: `/entrevistas/${encodeURIComponent(id)}`,
    // HU-09.1 · Los datos fijos del paciente, sin poder cambiarlos.
    paciente: {
      cama: texto(entrevista.cama),
      servicio: texto(entrevista.piso),
      nombre: texto(entrevista.nombre),
      cedula: texto(entrevista.cedula),
    },
    censo: esFechaIso(entrevista.censo_fecha) ? fechaCorta(entrevista.censo_fecha) : null, // RN-05: de qué censo es
    caso: 'formulario',
    mensaje: null,
    abrirIgual: `/entrevistas/${encodeURIComponent(id)}?igual=1`,
  };

  if (entrevista.estado !== 'pendiente') {
    return { ...vista, caso: 'cerrada', mensaje: MENSAJES.noPendiente };
  }
  // HU-09.9 · RN-13 · La base solo dice quién la está haciendo si es otra persona y no pasaron 15 minutos.
  if (entrevista.en_curso_por && !igual) {
    return { ...vista, caso: 'en_curso', mensaje: MENSAJES.haciendoEntrevista(entrevista.en_curso_por) };
  }

  const valores = valoresDe(entrevista, enviados);
  const conErrores = {};
  for (const [campo, clave] of Object.entries(errores ?? {})) {
    if (typeof MENSAJES[clave] === 'string') conErrores[campo] = MENSAJES[clave];
  }

  return {
    ...vista,
    igual, // HU-09.9 · la pantalla abre con "Abrir igual": la base le quita el "En curso" a la otra persona
    aviso,
    valores,
    errores: conErrores,
    // HU-09.2 · Los botones de la declaración, con el elegido marcado.
    tipos: TIPOS_DE_DECLARACION.map((t) => ({ ...t, id: `tipo-${t.valor.toLowerCase().replace(/[^a-z]/g, '')}`, elegido: t.valor === valores.tipo_declaracion })),
    // HU-09.6 · La fecha del accidente no puede ser posterior a hoy (el día lo dice la base).
    hoy: esFechaIso(entrevista.hoy) ? entrevista.hoy : '',
    maximos: MAXIMOS,
    // CB-12 · El contador del relato.
    contador: `${Array.from(valores.relato).length}/${MAXIMOS.relato}`,
    mensajes: {
      cambios: MENSAJES.cambiosSinGuardar,
      conexion: MENSAJES.noSeGuardo,
    },
  };
}

module.exports = { armarFormulario };
