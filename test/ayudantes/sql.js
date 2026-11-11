'use strict';

// Ayudante de pruebas: lee archivos .sql y arma "cómo queda la base" después de aplicarlos
// en orden (tablas con sus columnas, RLS, índices, políticas, funciones, guardias y permisos).
// Sirve para comprobar que database/global.sql dé lo mismo que los archivos numerados (CL-11).
// Si aparece una sentencia que no sabe leer, falla a propósito: así nada se escapa sin revisar.

const espacios = (texto) => texto.replace(/\s+/g, ' ').trim();

/** Quita los comentarios "--" (en este proyecto no hay "--" dentro de textos entre comillas). */
function quitarComentarios(sql) {
  return sql.split('\n').map((linea) => linea.replace(/--.*$/, '')).join('\n');
}

/** Corta el SQL en sentencias por ";", sin cortar dentro de los cuerpos $$ … $$ de las funciones. */
function sentencias(sql) {
  const resultado = [];
  let actual = '';
  let dentroDeCuerpo = false;
  for (let i = 0; i < sql.length; i += 1) {
    if (sql.startsWith('$$', i)) {
      dentroDeCuerpo = !dentroDeCuerpo;
      actual += '$$';
      i += 1;
    } else if (sql[i] === ';' && !dentroDeCuerpo) {
      if (actual.trim()) resultado.push(espacios(actual));
      actual = '';
    } else {
      actual += sql[i];
    }
  }
  if (actual.trim()) resultado.push(espacios(actual));
  return resultado;
}

/** Parte por las comas de primer nivel (no las que van dentro de paréntesis). */
function partirPorComas(texto) {
  const partes = [];
  let profundidad = 0;
  let actual = '';
  for (const caracter of texto) {
    if (caracter === '(') profundidad += 1;
    if (caracter === ')') profundidad -= 1;
    if (caracter === ',' && profundidad === 0) {
      partes.push(actual.trim());
      actual = '';
    } else {
      actual += caracter;
    }
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

const NO_SON_COLUMNAS = new Set(['check', 'unique', 'primary', 'constraint', 'foreign', 'exclude']);

/** Columnas de un "create table": { nombre: 'definición' }, más las reglas de la tabla. */
function columnasDe(cuerpo) {
  const columnas = {};
  const reglas = [];
  for (const parte of partirPorComas(cuerpo)) {
    const primera = parte.split(' ')[0].toLowerCase();
    if (NO_SON_COLUMNAS.has(primera)) reglas.push(parte);
    else columnas[primera] = parte;
  }
  return { columnas, reglas };
}

function aplicar(estado, sentencia) {
  let m;
  if ((m = /^create table public\.(\w+) \((.*)\)$/i.exec(sentencia))) {
    estado.tablas[m[1]] = columnasDe(m[2]);
  } else if ((m = /^alter table public\.(\w+) add column (?:if not exists )?(\w+) (.*)$/i.exec(sentencia))) {
    estado.tablas[m[1]].columnas[m[2].toLowerCase()] = `${m[2]} ${m[3]}`;
  } else if ((m = /^alter table public\.(\w+) drop column (?:if exists )?(\w+)/i.exec(sentencia))) {
    delete estado.tablas[m[1]].columnas[m[2].toLowerCase()];
  } else if ((m = /^alter table public\.(\w+) add (constraint \w+ .*)$/i.exec(sentencia))) {
    // Una regla agregada después queda igual que si estuviera al final del "create table".
    estado.tablas[m[1]].reglas.push(m[2]);
  } else if ((m = /^drop function (?:if exists )?public\.(\w+)\(([^)]*)\)$/i.exec(sentencia))) {
    // Se va la función y también los permisos de esa firma (sus grant y revoke ya no existen).
    delete estado.funciones[m[1]];
    const firma = `function public.${m[1]}(${m[2]})`;
    for (const permiso of [...estado.permisos]) if (permiso.includes(firma)) estado.permisos.delete(permiso);
  } else if ((m = /^alter table public\.(\w+) enable row level security$/i.exec(sentencia))) {
    estado.rls.add(m[1]);
  } else if (/^create (unique )?index /i.test(sentencia)) {
    estado.indices.add(sentencia);
  } else if ((m = /^create policy "([^"]+)" on public\.(\w+)/i.exec(sentencia))) {
    estado.politicas[`${m[2]}: ${m[1]}`] = sentencia;
  } else if ((m = /^drop policy (?:if exists )?"([^"]+)" on public\.(\w+)/i.exec(sentencia))) {
    delete estado.politicas[`${m[2]}: ${m[1]}`];
  } else if ((m = /^create (?:or replace )?function public\.(\w+)\(/i.exec(sentencia))) {
    estado.funciones[m[1]] = sentencia; // la última versión es la que queda
  } else if ((m = /^create trigger (\w+) .* on public\.(\w+) /i.exec(sentencia))) {
    estado.guardias[`${m[2]}: ${m[1]}`] = sentencia;
  } else if ((m = /^drop trigger (?:if exists )?(\w+) on public\.(\w+)/i.exec(sentencia))) {
    delete estado.guardias[`${m[2]}: ${m[1]}`];
  } else if (/^(grant|revoke|alter default privileges)\b/i.test(sentencia)) {
    estado.permisos.add(sentencia);
  } else {
    throw new Error(`La prueba no sabe leer esta sentencia (agrégala al ayudante): ${sentencia.slice(0, 100)}`);
  }
}

/** Aplica los textos SQL en orden y devuelve el estado final, listo para comparar. */
function estadoDeLaBase(textos) {
  const estado = {
    tablas: {}, rls: new Set(), indices: new Set(), politicas: {}, funciones: {}, guardias: {}, permisos: new Set(),
  };
  for (const texto of textos) {
    for (const sentencia of sentencias(quitarComentarios(texto))) aplicar(estado, sentencia);
  }
  return {
    ...estado,
    rls: [...estado.rls].sort(),
    indices: [...estado.indices].sort(),
    permisos: [...estado.permisos].sort(),
  };
}

module.exports = { estadoDeLaBase, sentencias, quitarComentarios };
