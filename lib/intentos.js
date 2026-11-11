'use strict';

// CB-28 (enmienda 1): freno del login. Tras 5 contraseñas equivocadas para la misma cuenta,
// o 20 desde el mismo equipo, dentro de 15 minutos, se bloquea 15 minutos.
// Vive en la memoria del servidor (son 4 personas y un solo servidor).

const VENTANA_MS = 15 * 60 * 1000;
const BLOQUEO_MS = 15 * 60 * 1000;
const LIMITE_POR_CUENTA = 5;
const LIMITE_POR_EQUIPO = 20;
const MAXIMO_DE_CLAVES = 10000; // para que nadie llene la memoria inventando correos

function crearFreno({ reloj = Date.now } = {}) {
  const registros = new Map(); // clave → { fallos: [horas], bloqueadoHasta }

  function registro(clave) {
    let actual = registros.get(clave);
    if (!actual) {
      if (registros.size >= MAXIMO_DE_CLAVES) registros.delete(registros.keys().next().value); // el más viejo
      actual = { fallos: [], bloqueadoHasta: 0 };
      registros.set(clave, actual);
    }
    return actual;
  }

  const claves = ({ correo, equipo }) => [
    { clave: `cuenta:${correo}`, limite: LIMITE_POR_CUENTA },
    { clave: `equipo:${equipo}`, limite: LIMITE_POR_EQUIPO },
  ];

  /** ¿Está bloqueada esta cuenta o este equipo? */
  function estaFrenado(datos) {
    const ahora = reloj();
    return claves(datos).some(({ clave }) => (registros.get(clave)?.bloqueadoHasta ?? 0) > ahora);
  }

  /**
   * Anota un intento ANTES de preguntarle a Supabase (así, varios a la vez no se saltan el
   * límite). Devuelve una función para avisar cómo terminó: bien → se perdona ese intento.
   */
  function anotarIntento(datos) {
    const ahora = reloj();
    for (const { clave, limite } of claves(datos)) {
      const actual = registro(clave);
      actual.fallos = actual.fallos.filter((hora) => ahora - hora < VENTANA_MS);
      actual.fallos.push(ahora);
      if (actual.fallos.length >= limite) actual.bloqueadoHasta = ahora + BLOQUEO_MS;
    }
    return function terminar({ bien }) {
      if (!bien) return;
      registros.delete(`cuenta:${datos.correo}`); // entró: su cuenta queda en cero
      const equipo = registros.get(`equipo:${datos.equipo}`);
      if (equipo) {
        equipo.fallos.pop(); // ese intento no fue un fallo
        if (equipo.fallos.length < LIMITE_POR_EQUIPO) equipo.bloqueadoHasta = 0;
      }
    };
  }

  return { estaFrenado, anotarIntento };
}

module.exports = { crearFreno, LIMITE_POR_CUENTA, LIMITE_POR_EQUIPO, VENTANA_MS, BLOQUEO_MS };
