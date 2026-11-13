'use strict';

// CL-12 · Los estilos van en capas: base.css, componentes.css y uno por pantalla en paginas/.
// Estas pruebas vigilan que la estructura no se desordene con el tiempo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const RAIZ = path.join(__dirname, '..');
const VISTAS = path.join(RAIZ, 'views');
const CSS = path.join(RAIZ, 'public', 'css');
const PAGINAS = path.join(CSS, 'paginas');

/** Las vistas principales (las pantallas): views/*.ejs, sin las partes. */
const pantallas = () => fs.readdirSync(VISTAS).filter((f) => f.endsWith('.ejs'));

/** Lo que declara una vista en estilos: […] al incluir el encabezado. */
function estilosDeclarados(vista) {
  const texto = fs.readFileSync(path.join(VISTAS, vista), 'utf8');
  const llamada = /include\('partes\/arriba',\s*\{[^}]*estilos:\s*\[([^\]]*)\]/.exec(texto);
  if (!llamada) return null;
  return [...llamada[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** El texto de una vista con todas las partes que incluye (sin el encabezado ni el pie comunes). */
function textoConSusPartes(archivo, vistos = new Set()) {
  if (vistos.has(archivo)) return '';
  vistos.add(archivo);
  const texto = fs.readFileSync(archivo, 'utf8');
  let total = texto;
  for (const [, nombre] of texto.matchAll(/include\('([^']+)'/g)) {
    if (nombre === 'partes/arriba' || nombre === 'partes/abajo') continue;
    total += textoConSusPartes(path.resolve(path.dirname(archivo), `${nombre}.ejs`), vistos);
  }
  return total;
}

/** Las clases que nombra un CSS en sus selectores (sin comentarios ni declaraciones). */
function clasesDe(css) {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectores = sinComentarios.replace(/\{[^{}]*\}/g, ' ').replace(/@media[^{]*\{/g, ' ');
  return [...new Set([...selectores.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]))];
}

const aparece = (clase, texto) => new RegExp(`(^|[^\\w-])${clase}($|[^\\w-])`).test(texto);

test('CL-12 · cada pantalla declara su archivo de estilos y ese archivo existe', () => {
  for (const vista of pantallas()) {
    const estilos = estilosDeclarados(vista);
    assert.ok(estilos && estilos.length > 0, `${vista} no declara estilos: [...] en partes/arriba`);
    for (const hoja of estilos) {
      assert.match(hoja, /^[a-z-]+$/, `${vista}: nombre raro "${hoja}"`);
      assert.ok(fs.existsSync(path.join(PAGINAS, `${hoja}.css`)), `${vista}: falta public/css/paginas/${hoja}.css`);
    }
  }
});

test('CL-12 · no sobra ningún archivo: en public/css solo hay base, componentes y paginas/ usados por alguna vista', () => {
  assert.deepEqual(fs.readdirSync(CSS).sort(), ['base.css', 'componentes.css', 'paginas']);
  const usados = new Set(pantallas().flatMap((v) => estilosDeclarados(v) ?? []));
  for (const archivo of fs.readdirSync(PAGINAS)) {
    assert.ok(archivo.endsWith('.css'), archivo);
    assert.ok(usados.has(archivo.replace(/\.css$/, '')), `paginas/${archivo} no lo usa ninguna vista`);
  }
});

test('CL-12 · la página carga base, componentes y la suya, en ese orden', async () => {
  const html = await ejs.renderFile(path.join(VISTAS, 'login.ejs'), { csrf: 't', cuenta: null });
  const enlaces = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(enlaces, ['/css/base.css', '/css/componentes.css', '/css/paginas/login.css']);
});

test('CL-12 · cada archivo de pantalla solo estiliza clases de SU pantalla', () => {
  for (const vista of pantallas()) {
    const texto = textoConSusPartes(path.join(VISTAS, vista));
    for (const hoja of estilosDeclarados(vista)) {
      for (const clase of clasesDe(fs.readFileSync(path.join(PAGINAS, `${hoja}.css`), 'utf8'))) {
        assert.ok(aparece(clase, texto), `paginas/${hoja}.css usa .${clase}, que no está en ${vista} ni en sus partes`);
      }
    }
  }
});

test('CL-12 · base.css no tiene clases, y cada clase de componentes.css la usa alguna pantalla', () => {
  assert.deepEqual(clasesDe(fs.readFileSync(path.join(CSS, 'base.css'), 'utf8')), []);
  const todas = [...pantallas().map((v) => textoConSusPartes(path.join(VISTAS, v))),
    fs.readFileSync(path.join(VISTAS, 'partes', 'arriba.ejs'), 'utf8')].join('\n');
  for (const clase of clasesDe(fs.readFileSync(path.join(CSS, 'componentes.css'), 'utf8'))) {
    assert.ok(aparece(clase, todas), `componentes.css usa .${clase}, que ninguna vista usa`);
  }
});

test('base · la prueba de CL-12 de verdad nota una clase de otra pantalla', () => {
  // Si alguien pone .resumen (de censo) en el archivo de revisión, la prueba anterior lo atrapa.
  const texto = textoConSusPartes(path.join(VISTAS, 'revision.ejs'));
  assert.equal(aparece('resumen', texto), false);
  assert.equal(aparece('candidato__cama', texto), true);
  assert.deepEqual(clasesDe('.a > .b-c:hover, .d::before { color: red; } @media (x) { .e { margin: 0 } }').sort(), ['a', 'b-c', 'd', 'e']);
});
