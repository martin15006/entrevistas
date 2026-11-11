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

  // HU-02.11 · lo que no es para su rol
  sinPermiso: 'No tienes permiso para ver esta página.',

  // CB-02 · la sesión venció mientras se llenaba algo (las pantallas que guardan con fetch)
  sesionVencida: 'Tu sesión se cerró. Toca «Iniciar sesión» (se abre en otra pestaña), entra y vuelve a tocar Guardar: lo que escribiste sigue aquí.',
};

module.exports = { MENSAJES };
