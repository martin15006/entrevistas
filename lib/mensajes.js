'use strict';

// Textos que ve la persona. Los de cada historia van con el texto exacto del SRS.

const MENSAJES = {
  // Generales
  formularioVencido: 'El formulario venció. Recarga la página e inténtalo de nuevo.',
  noEncontrada: 'No encontramos esa página.',
  solicitudMala: 'No pudimos leer lo que enviaste. Recarga la página e inténtalo de nuevo.',
  inesperado: 'Algo salió mal. Inténtalo de nuevo en un momento.',

  // HU-01 · Iniciar y cerrar sesión
  credencialesIncorrectas: 'Correo o contraseña incorrectos.', // HU-01.3
  cuentaDesactivada: 'Tu cuenta está desactivada. Habla con el administrador.', // HU-01.4 y HU-02.6
  inactividad: 'Tu sesión se cerró por inactividad.', // HU-01.6
  demasiadosIntentos: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.', // CB-28 (enmienda 1)

  // HU-04 · Subir el censo (los de errores del archivo están en lib/censo.js)
  censoSinArchivo: 'Elige el archivo del censo.',
  censoFechaNoValida: 'Elige una fecha del censo que exista y que no sea posterior a hoy.',
  censoFechaFutura: (fecha) => `La fecha del censo (${fecha}) es posterior a hoy. Revisa que sea el archivo correcto.`,
  sinConexion: 'No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.',

  // HU-05 · Ver los candidatos por servicio
  censoSinCandidatos: 'Este censo no tiene pacientes con día 0 o 1 para revisar.', // HU-05.4
  censoConPendientes: (fecha, cantidad) => (cantidad === 1 // HU-05.5
    ? `El censo del ${fecha} tiene 1 paciente sin revisar.`
    : `El censo del ${fecha} tiene ${cantidad} pacientes sin revisar.`),
  // Textos que el SRS no tenía (tanda 5, pendientes del OK de Martín: ver el pacto, Aclaraciones)
  sinCensos: 'Todavía no hay censos. Sube el primero desde «Censo».',
  censoNoExiste: (fecha) => `No hay censo del ${fecha}. Elige otro día o súbelo desde «Censo».`,
  todosRevisados: 'Ya se revisaron todos los pacientes de este censo.',
  decididoEnOtroCenso: (fecha) => `Se decidió en el censo del ${fecha}.`,
  pasoARevisados: 'pasó a «Ya revisados».', // va después del color y el nombre: "🟢 ANA PRUEBA pasó a…"

  // HU-07 · Recordar un rojo anterior (la fecha es la del censo donde se marcó: Martín, 2026-11-12)
  rojoAnterior: (fecha, nombre) => `El ${fecha} se marcó como NO entrevistar (por ${nombre || 'otra persona'}).`,

  // HU-06 · Decidir en verde o rojo
  yaRevisado: (nombre) => `${nombre || 'Otra persona'} ya revisó a este paciente.`, // HU-06.5
  entrevistaHecha: 'Este paciente ya tiene la entrevista hecha.', // HU-06.4

  // HU-08 · Ver las entrevistas por estado
  faltaCensoDeHoy: 'Todavía no se ha subido el censo de hoy.', // HU-08.4
  desdeEl: (fecha) => `Desde el ${fecha}`, // HU-08.2
  enCurso: (nombre) => `En curso · ${nombre || 'otra persona'}`, // HU-08.6
  // Textos que el SRS no tenía (tanda 8, OK de Martín 2026-11-13); los dos últimos, de la enmienda 5
  sinPendientes: 'No hay entrevistas pendientes.',
  sinEntrevistados: 'Todavía no hay entrevistas hechas este día.', // HU-08.3 (enmienda 5)
  sinSalieron: 'Ningún paciente salió este día.', // HU-08.3 (enmienda 5)
  censoDel: (fecha) => `Censo del ${fecha}`, // HU-08.3 (enmienda 5): cada fila dice su censo

  // HU-09 · Llenar la entrevista
  entrevistaGuardada: 'Entrevista guardada.', // HU-09.4
  faltaDato: 'Falta este dato.', // HU-09.5
  edadFuera: 'La edad debe estar entre 0 y 120.', // HU-09.6
  telefonoFuera: 'El teléfono debe tener entre 7 y 10 números.', // HU-09.6
  fechaAccidenteFutura: 'La fecha del accidente no puede ser posterior a hoy.', // HU-09.6
  placaFuera: 'La placa tiene hasta 7 letras o números.', // HU-09.6
  cambiosSinGuardar: 'Tienes cambios sin guardar. ¿Salir sin guardar?', // HU-09.8
  haciendoEntrevista: (nombre) => `${nombre || 'Otra persona'} está haciendo esta entrevista. ¿Abrirla igual?`, // HU-09.9
  noSeGuardo: 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.', // CB-01
  guardadaPorOtro: (nombre) => `${nombre || 'Otra persona'} guardó esta entrevista hace un momento. Recarga para ver sus datos.`, // CB-17
  entrevistaNoExiste: 'No encontramos esa entrevista.', // CB-20
  // Textos que el SRS no tenía (tanda 9, pendientes del OK de Martín: ver el pacto, Aclaraciones)
  noPendiente: 'Esta entrevista ya no está pendiente.',
  salioPorOtro: (nombre) => `${nombre || 'Otra persona'} marcó que este paciente salió. No se guardó: lo escrito sigue aquí.`,
  entrevistaBorrada: 'Esta entrevista ya no existe: alguien la marcó como «No entrevistar».',

  // HU-02.11 · lo que no es para su rol
  sinPermiso: 'No tienes permiso para ver esta página.',

  // CB-02 · la sesión venció mientras se llenaba algo (las pantallas que guardan con fetch)
  sesionVencida: 'Tu sesión se cerró. Toca «Iniciar sesión» (se abre en otra pestaña), entra y vuelve a tocar Guardar: lo que escribiste sigue aquí.',
};

module.exports = { MENSAJES };
