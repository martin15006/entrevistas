'use strict';

// OB-08 · El script del primer administrador, con un Supabase de mentira.

const test = require('node:test');
const assert = require('node:assert/strict');
const { revisarDatos, crearPrimerAdmin } = require('../scripts/crear-admin');

/** Cliente de administración de mentira: cuenta admins, crea y borra cuentas, guarda perfiles. */
function adminFalso({ adminsActivos = 0, correoExiste = false, perfilFalla = false } = {}) {
  const registro = { creadas: [], borradas: [], perfiles: [] };
  const cliente = {
    from() {
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        then: (resolver) => resolver({ count: adminsActivos, error: null }),
        insert: async (fila) => {
          if (perfilFalla) return { error: { code: '23505' } };
          registro.perfiles.push(fila);
          return { error: null };
        },
      };
      return consulta;
    },
    auth: {
      admin: {
        async createUser({ email }) {
          if (correoExiste) return { data: null, error: { code: 'email_exists', status: 422 } };
          registro.creadas.push(email);
          return { data: { user: { id: 'id-nuevo' } }, error: null };
        },
        async deleteUser(id) {
          registro.borradas.push(id);
          return { error: null };
        },
      },
    },
  };
  return { cliente, registro };
}

const DATOS = { nombre: 'TST ADMIN PRUEBA', correo: 'admin@prueba.test', contrasena: 'clave-larga-123' };

test('OB-08 · revisa los datos antes de crear: contraseña de 8 sirve, de 7 no', () => {
  const bien = { ...DATOS, repetida: DATOS.contrasena };
  assert.equal(revisarDatos(bien), null);
  assert.equal(revisarDatos({ ...bien, contrasena: '12345678', repetida: '12345678' }), null);
  assert.match(revisarDatos({ ...bien, contrasena: '1234567', repetida: '1234567' }), /entre 8 y 200/);
  assert.match(revisarDatos({ ...bien, repetida: 'otra-cosa-123' }), /no coinciden/);
  assert.match(revisarDatos({ ...bien, correo: 'sin-arroba' }), /correo válido/);
  assert.match(revisarDatos({ ...bien, nombre: '' }), /nombre es obligatorio/);
});

test('OB-08 · crea la cuenta y su perfil de administrador activo, sin mostrar la contraseña', async () => {
  const { cliente, registro } = adminFalso();
  const resultado = await crearPrimerAdmin(cliente, DATOS);
  assert.equal(resultado.ok, true);
  assert.deepEqual(registro.perfiles, [{ id: 'id-nuevo', nombre: DATOS.nombre, correo: DATOS.correo, rol: 'administrador', activo: true }]);
  assert.ok(!resultado.mensaje.includes(DATOS.contrasena));
});

test('OB-08 · si ya hay un administrador activo, no crea otro', async () => {
  const { cliente, registro } = adminFalso({ adminsActivos: 1 });
  const resultado = await crearPrimerAdmin(cliente, DATOS);
  assert.equal(resultado.ok, false);
  assert.match(resultado.mensaje, /Ya hay un administrador activo/);
  assert.deepEqual(registro.creadas, []);
});

test('OB-08 · si el perfil no se puede guardar, la cuenta recién creada se deshace', async () => {
  const { cliente, registro } = adminFalso({ perfilFalla: true });
  const resultado = await crearPrimerAdmin(cliente, DATOS);
  assert.equal(resultado.ok, false);
  assert.deepEqual(registro.borradas, ['id-nuevo']);
});

test('OB-08 · HU-02.4 · un correo que ya tiene cuenta no se repite', async () => {
  const { cliente } = adminFalso({ correoExiste: true });
  const resultado = await crearPrimerAdmin(cliente, DATOS);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.mensaje, 'Ya existe una cuenta con ese correo.');
});
