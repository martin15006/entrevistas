'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { armarEntrevistas } = require('../lib/entrevistas');

const VISTAS = path.join(__dirname, '..', 'views');
const render = (vista, datos) => ejs.renderFile(path.join(VISTAS, vista), datos);

function todasLasVistas(carpeta = VISTAS) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return todasLasVistas(ruta);
    return entrada.name.endsWith('.ejs') ? [ruta] : [];
  });
}

test('CL-03 · HU-02.11 · el usuario normal no ve "Usuarios" en el menú; el administrador sí', async () => {
  // La pantalla de inicio (Entrevistas, HU-08) vacía: aquí solo importa el menú.
  const vista = armarEntrevistas(null, { hoy: '2026-11-12', ahora: Date.now() });
  const usuario = await render('entrevistas.ejs', { cuenta: { nombre: 'ANA PRUEBA', rol: 'usuario' }, csrf: 't', vista });
  assert.ok(usuario.includes('href="/entrevistas"'));
  assert.ok(!usuario.includes('/usuarios'));
  assert.ok(!usuario.includes('Usuarios'));

  const admin = await render('entrevistas.ejs', { cuenta: { nombre: 'LUIS PRUEBA', rol: 'administrador' }, csrf: 't', vista });
  assert.ok(admin.includes('href="/usuarios"'));
});

test('base · sin sesión no aparece el menú', async () => {
  const html = await render('login.ejs', { cuenta: null, csrf: 't' });
  assert.ok(!html.includes('Cerrar sesión'));
  assert.ok(!html.includes('href="/entrevistas"'));
});

test('CL-05 · lo que se muestra sale escapado (no se puede meter código en la página)', async () => {
  const html = await render('error.ejs', { mensaje: '<script>alert(1)</script>', csrf: '"><img src=x onerror=alert(1)>' });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(!html.includes('<img src=x'));
});

test('CL-05 · las vistas no usan la etiqueta sin escapar salvo para include, ni código ni estilos en línea', () => {
  const vistas = todasLasVistas();
  assert.ok(vistas.length >= 4);
  for (const ruta of vistas) {
    const texto = fs.readFileSync(ruta, 'utf8');
    const nombre = path.relative(VISTAS, ruta);
    for (const coincidencia of texto.matchAll(/<%-\s*([^%]*)/g)) {
      assert.match(coincidencia[1], /^include\(/, `${nombre}: <%- solo para include`);
    }
    assert.doesNotMatch(texto, /<script(?![^>]*\ssrc=)[^>]*>/, `${nombre}: <script> en línea`);
    assert.doesNotMatch(texto, /\sstyle\s*=/, `${nombre}: style="" en línea`);
    assert.doesNotMatch(texto, /\son[a-z]+\s*=/, `${nombre}: atributo on…= en línea`);
  }
});

test('CL-07 · las páginas dicen su idioma y se adaptan al ancho del celular', async () => {
  const html = await render('login.ejs', { cuenta: null, csrf: 't' });
  assert.ok(html.includes('<html lang="es">'));
  assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
});
