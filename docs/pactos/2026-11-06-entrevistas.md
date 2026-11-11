---
pacto: entrevistas
nivel: 2          # 1 = ficha · 2 = SRS
estado: en tandas # borrador → firmado (al firmar) → en tandas (1.ª tanda) → sellado (al sellar)
creado: 2026-11-06
firmado: 2026-11-06
---
# Pacto · Entrevistas

> **Dónde quedamos**
> 2026-11-11 · Última: enmiendas 2 y 3 firmadas (SRS 1.3); prueba en la ventana entrando a mano: HU-01.1-5, HU-01.4, HU-02.6, CB-28 y CB-29 ✅ → PC-HU-01 ✅
> Sigue: tanda 5: HU-05 y HU-06 (revisión por servicio, verde/rojo)
> Bloqueos: ninguno (enmiendas 2 y 3 firmadas el 2026-11-11)

## 1. Qué y por qué

**Pedido (textual), 2026-11-06:** "que se pueda subir el excel o pdf y que de una la pagina organize o filtre los pacientes para hacerle la entrevista y que se pueda hacer por ejemplo que saliera la lista en numero de camas o algo asi […] que tambien esten los modulos como de los que ya estan o ya le hicieron la entrevista y los que no estan la entrevistan, se puedan descargar el excel de observación ya hechos y tambien que se puedan visualizar cada entrevista para pasarlo al sistema en un copia y pegue" · "se clasifican todos los que estan en 0 y 1 y a esas personas se le hace las entrevista" · "que salgan 2 opciones una roja y otra verde que seria: verde (se hace entrevista) roja(no se hace entrevista) y se saca de la lista de entrevista" · "que se pueda despues buscar a los entrevistados por la cedula o nombre para revisar la informacion que obtuvo".

**Ver:** `docs/SRS.md` §1. Insumos revisados (no se guardan en el proyecto, CL-01): el censo consolidado en PDF (29/10/2026) y en Excel (06/11/2026), el formato "FORMATO ENTREVISTAS OBSERVACION PISO Y UCI" y una hoja de entrevistas llena y escaneada.

## 2. Historias

**Entran:** HU-01 a HU-15, CB-01 a CB-29 y RNF-01 a RNF-15 (`docs/SRS.md` versión 1.3; CB-28 entró con la enmienda 1, y HU-04.8, HU-04.9 y CB-29 con la enmienda 2). RNF-16 (copias de seguridad) se cumple antes del primer dato real y no forma parte del sello.

**Criterio de prueba (el mismo que Martín eligió en vigilancia_iso):** `[test]` (`node --test`) para la lectura del censo, las reglas, las validaciones, los permisos, los estados y el Excel. Lo que es solo cómo se ve se revisa en la ventana real, `[ventana]`, con una sesión ya cargada. `[Martín]` es lo que solo se puede probar en su celular o en Excel. Lo que exige escribir una contraseña en la pantalla lo prueba Claude en la ventana con SU cuenta de prueba, escribiendo el correo y la contraseña como una persona (enmienda 3, autorizada por Martín el 2026-11-11; antes era [Martín]).

| Criterio               | Cómo se prueba                                                             |
| ---------------------- | --------------------------------------------------------------------------- |
| HU-01.1,5              | [test + ventana]                                                            |
| HU-01.2-4 | [test + ventana] (Claude entra escribiendo correo y contraseña de su cuenta de prueba: enmienda 3) |
| HU-01.6                | [test]                                                                      |
| HU-02.1,11             | [test + ventana]                                                            |
| HU-02.2-10 | [test + ventana] (Claude, con su cuenta de admin de prueba: enmienda 3) |
| HU-03.1-3 | [test + ventana] (enmienda 3) |
| HU-04.1-9 | [test + ventana] |
| HU-05.1,3,4            | [ventana]                                                                   |
| HU-05.2,5              | [test + ventana]                                                            |
| HU-06.1                | [ventana]                                                                   |
| HU-06.2-5              | [test + ventana]                                                            |
| HU-07.1,2              | [test + ventana]                                                            |
| HU-07.3                | [test]                                                                      |
| HU-08.1,5              | [ventana]                                                                   |
| HU-08.2-4,6            | [test + ventana]                                                            |
| HU-09.1,2,8            | [ventana]                                                                   |
| HU-09.3                | [Martín] teclado numérico en su celular · [ventana] que no acepta letras |
| HU-09.4-7,9            | [test + ventana]                                                            |
| HU-10.1,2              | [test + ventana]                                                            |
| HU-11.1,2              | [test + ventana]                                                            |
| HU-12.1,2              | [test + ventana]                                                            |
| HU-12.3                | [test]                                                                      |
| HU-13.1-4              | [test + ventana]                                                            |
| HU-14.1,3,5            | [ventana]                                                                   |
| HU-14.2                | [ventana] · [Martín] copia y pega en su celular                           |
| HU-14.4                | [test]                                                                      |
| HU-15.1,2              | [ventana]                                                                   |
| HU-15.3-5              | [test]                                                                      |
| HU-15.6                | [Martín] abre el `.xlsx` en Excel y lo compara con la hoja impresa       |
| CB-01 · HU-09         | [ventana] (servidor apagado al guardar)                                     |
| CB-02 · HU-09         | [test + ventana]                                                            |
| CB-03 a CB-08 · HU-04 | [test] con censos inventados                                                |
| CB-09, CB-10 · HU-12  | [test]                                                                      |
| CB-11 · HU-06         | [test]                                                                      |
| CB-12 · HU-09         | [ventana]                                                                   |
| CB-13 · HU-09         | [test + ventana]                                                            |
| CB-14 · HU-09         | [ventana]                                                                   |
| CB-15 · HU-13         | [test]                                                                      |
| CB-16 · HU-06         | [test]                                                                      |
| CB-17 · HU-09         | [test]                                                                      |
| CB-18, CB-19 · HU-02  | [test]                                                                      |
| CB-20 · HU-14         | [test]                                                                      |
| CB-21 · HU-15         | [test]                                                                      |
| CB-22 · HU-14         | [ventana] abriendo por la IP de la red (sin HTTPS) · [Martín]             |
| CB-23 · —            | [ventana] (cambiar el ancho)                                                |
| CB-24 · —            | [test + ventana]                                                            |
| CB-25, CB-26 · HU-02  | [test]                                                                      |
| CB-27 · HU-08         | [test]                                                                      |
| CB-28 · HU-01 | [test + ventana] |
| CB-29 · HU-04 | [ventana] (servidor apagado al leer o guardar) |
| RNF-01, RNF-02         | [test] con datos inventados                                                 |
| RNF-03 a RNF-08        | [test]                                                                      |
| RNF-09, RNF-11         | [ventana] a 360, 768 y 1280 px                                              |
| RNF-10                 | [Martín]                                                                   |
| RNF-12                 | — (decisión de Martín, no se prueba)                                     |
| RNF-13                 | [ventana] · [Martín] en su celular                                        |
| RNF-14                 | [Martín] en Excel; LibreOffice si hay dónde abrirlo                       |
| RNF-15                 | [test] con otra zona horaria                                                |

**Dudas:** D1 a D5 respondidas (sección 4). No queda ninguna abierta.

## 4. Aclaraciones y firma

| Fecha      | Duda                                                                                                                                                                                                                                                                                                                | Propuesta                                                                                                                                                                                 | Respuesta                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-06 | **D1** · ¿Se "aparta" un paciente al abrir su entrevista? Martín escribió "que cada paciente sea apartado al dar clic".                                                                                                                                                                                   | Sí: "En curso · [nombre]" por 15 minutos para los demás, sin bloquearlos.                                                                                                              | **Sí, "En curso"** (Martín). Entró al SRS 1.1: RN-13, HU-08.6, HU-09.9 y CB-27.                                                                                                                                                                                |
| 2026-11-06 | **D2** · ¿Qué datos son obligatorios para guardar la entrevista?                                                                                                                                                                                                                                           | Edad, fecha del accidente, lugar, tipo de declaración y relato.                                                                                                                          | **Los 5 básicos** (Martín). RN-10 queda igual.                                                                                                                                                                                                                  |
| 2026-11-06 | **D3** · ¿Qué tipos de declaración hay?                                                                                                                                                                                                                                                                   | C/M, P/M, C/A, P/A, Peatón, Ciclista y Otro.                                                                                                                                             | **Esos 7** (Martín). HU-09.2 queda igual.                                                                                                                                                                                                                        |
| 2026-11-06 | **Pedido de Martín al aprobar las cláusulas:** "el administrador cuando va a desactivar o borrar una cuenta necesita ingresar su contraseña de verificacion · para reactivar la cuenta tambien es necesario agregar la contraseña · el usuario normal no puede ver la interfaz extra del usuario admin" | HU-02 pide la contraseña del admin (alcance en D5), gana "Borrar" (cómo, en D4) y un criterio nuevo: el usuario no ve "Usuarios" en el menú.                                           | Firmado. Entró al SRS 1.1: RN-11, HU-02.2, 02.8, 02.10 y 02.11, CB-25 y CL-03 ampliada.                                                                                                                                                                                |
| 2026-11-06 | **D4** · ¿Cómo se borra una cuenta? Si se borra a alguien que ya hizo entrevistas, se pierde quién las hizo.                                                                                                                                                                                              | Borrar solo cuentas sin actividad; si ya trabajaron, solo se desactivan.                                                                                                                  | **Solo sin actividad** (Martín). Entró al SRS 1.1: RN-12, HU-02.8 y CB-26.                                                                                                                                                                                      |
| 2026-11-06 | **D5** · ¿Qué acciones de cuentas piden la contraseña del admin?                                                                                                                                                                                                                                          | Todas: crear, editar nombre o rol, desactivar, reactivar, borrar y restablecer contraseña.                                                                                               | **En todas** (Martín). Entró al SRS 1.1: RN-11.                                                                                                                                                                                                                 |
| 2026-11-06 | Decisión de Claude · HU-02 gana "Editar nombre y rol".                                                                                                                                                                                                                                                            | CB-18 ya hablaba de pasar un admin a Usuario y no había un criterio para eso. Además sirve para nombrar otro admin cuando Martín termine la práctica.                                 | Firmado con el pacto (HU-02.5)                                                                                                                                                                                                                                          |
| 2026-11-06 | Decisión de Claude · Identidad de la estancia (RN-02).                                                                                                                                                                                                                                                            | Cédula + fecha de ingreso, no el N° de admisión: entre el censo del 29/10 y el del 06/11 a 6 pacientes de estancia larga les cambió la admisión y la fecha de ingreso siguió igual. | Firmado con el pacto                                                                                                                                                                                                                                                    |
| 2026-11-06 | Decisión de Claude · Orden de las listas (RN-09).                                                                                                                                                                                                                                                                 | El mismo orden del censo, por servicio y por fila.                                                                                                                                        | Firmado con el pacto                                                                                                                                                                                                                                                    |
| 2026-11-06 | Decisión de Claude · Sesión (HU-01.6, RNF-07).                                                                                                                                                                                                                                                                   | Se cierra tras 8 horas sin uso (un turno).                                                                                                                                                | Firmado con el pacto                                                                                                                                                                                                                                                    |
| 2026-11-06 | Decisión de Claude · Servicios que entran (RN-01).                                                                                                                                                                                                                                                                | Todos menos Quirófano, así entra un servicio nuevo si la clínica lo agrega.                                                                                                            | Firmado con el pacto                                                                                                                                                                                                                                                    |
| 2026-11-06 | Decisión de Claude · Hoja descargada (HU-15).                                                                                                                                                                                                                                                                     | Columnas de la hoja impresa (Lugar / Residencia y Teléfono), no las del Excel de formato. "Salió" va en Lugar, como se hace a mano.                                                     | Firmado con el pacto                                                                                                                                                                                                                                                    |
| 2026-11-06 | Decisión de Claude · Pantalla de inicio (HU-01.2).                                                                                                                                                                                                                                                                | "Entrevistas", con un aviso si falta subir el censo de hoy.                                                                                                                               | Firmado con el pacto                                                                                                                                                                                                                                                    |
| 2026-11-06 | Decisión de Claude · Cambiar una decisión (RN-07).                                                                                                                                                                                                                                                               | Se puede mientras la entrevista no esté hecha; verde → rojo borra la entrevista pendiente.                                                                                              | Firmado con el pacto                                                                                                                                                                                                                                                    |
| 2026-11-06 | Pedido de Martín · Repositorio.                                                                                                                                                                                                                                                                                   | El código irá en GitHub (lo crea Martín más adelante): CL-10.                                                                                                                         | Aprobado con las cláusulas                                                                                                                                                                                                                                             |
| 2026-11-09 | La limpieza de pruebas (`limpiar_pruebas()`) viajaría a la base de la clínica con `global.sql` (PYA tanda 3). ¿Se separa lo de desarrollo ya (`database/solo-desarrollo/`)?                                                                                                                                | Ampliar CL-11 con una carpeta solo de desarrollo.                                                                                                                                         | **No por ahora** (Martín): "usemos las pruebas y todo en esta base de datos porque esta no esta relacionada ni nada a la que usan aca, ya a lo ultimo cuando finalizemos hacemos una limpieza de la base de datos total y listo". Queda como OB-48 en el cierre. |
| 2026-11-06 | ¿La carpeta `docs/` se sube a GitHub? En vigilancia_iso no se sube (el repositorio es público). No frena nada: se decide al crear el repositorio.                                                                                                                                                               | Si el repositorio es público, `docs/` va al `.gitignore`, como en vigilancia_iso.                                                                                                    | pendiente                                                                                                                                                                                                                                                               |
| 2026-11-11 | Tanda 5 · HU-05.3 y HU-05.5 no dicen qué pasa con un paciente sin decidir en un censo viejo que después se decidió en un censo **posterior** (por ejemplo, día 0 el 10/11 sin revisar y rojo el 11/11). | Aparece en "Ya revisados" del censo viejo con esa decisión y "Se decidió en el censo del …" (allá se cambia), y no cuenta como "sin revisar". Así nadie lo verifica dos veces. | **"Ya revisado"** (Martín, con botones, 2026-11-11). Es una aclaración de cómo se lee el criterio, no cambia el qué. Entró en `por_revisar()` (database/06). |
| 2026-11-11 | Tanda 5 · Textos que el SRS no tenía: "Todavía no hay censos. Sube el primero desde «Censo».", "No hay censo del DD/MM/AAAA. Elige otro día o súbelo desde «Censo».", "Ya se revisaron todos los pacientes de este censo.", "Se decidió en el censo del DD/MM/AAAA.", "🟢 [NOMBRE] pasó a «Ya revisados»." y, en HU-05.5, el singular "tiene 1 paciente sin revisar.". | Usarlos tal cual (están en `lib/mensajes.js`). No cambian el comportamiento: solo dicen algo en estados que el SRS no nombraba. | pendiente (OK de Martín; no frena nada) |

**Firma:** Martín · 2026-11-06 ("Sí, firmamos"), con las prioridades del SRS 1.1 (§3.0): todo Must salvo HU-03 y HU-12, que son Should.

---

## 5. Obligaciones

**Plan corto:**

```
entrevistas/
├── server.js                 Express 5 + EJS 7, rutas y middlewares
├── package.json              scripts: dev, start, test, crear-admin, censo-prueba
├── .env.example · .gitignore (CL-10)
├── database/                 01-esquema.sql, 02-…sql (historial) y global.sql (todo junto, CL-11)
├── lib/
│   ├── censo.js              leerCenso(buffer): sin base de datos, se prueba sola
│   ├── reglas.js             candidato, estancia, estados, validaciones, normalizar
│   ├── fechas.js             hora de Colombia, formatos, día en letras
│   ├── excel.js              armarHojaDia(...) → .xlsx
│   ├── supabase.js           cliente por sesión, cliente admin y cliente desechable
│   └── datos.js              única puerta a la base (se reemplaza por una falsa en las pruebas)
├── middleware/               sesión e inactividad, soloAdmin, token anti-falsificación
├── routes/                   auth, usuarios, cuenta, censo, revision, entrevistas, buscar, descargar
├── views/                    plantillas EJS (layout con menú según el rol)
├── public/css/estilos.css    provisional, primero celular
├── public/js/                revision.js, entrevista.js, copiar.js, descargar.js, censo.js
├── scripts/                  crear-admin.js, censo-de-prueba.js
└── test/                     *.test.js con node --test
```

**Cláusulas que aplican:**

- **CL-01:** los censos de prueba los genera `scripts/censo-de-prueba.js` con nombres y cédulas inventados. Los reales nunca se copian a la carpeta del proyecto.
- **CL-02:** `leerCenso` devuelve solo servicio, cama, cédula, nombre, fecha de ingreso y días. El archivo se lee de un `Buffer` en memoria y nunca se escribe al disco.
- **CL-03:** `soloAdmin` en el servidor, RLS en la base y el menú se arma según el rol.
- **CL-04:** solo `lib/supabase.js` conoce la llave secreta, y solo `lib/datos.js` habla con la base. Las contraseñas se comprueban con un cliente desechable y `signOut({ scope: 'local' })` (trampas de Supabase ya comprobadas).
- **CL-05:** en las vistas, `<%= %>` siempre. Los datos que necesita el JS del navegador van en atributos `data-*` entre comillas, nunca dentro de `<script>`.
- **CL-06:** PYA sobre el código tocado en cada punto de control.
- **CL-07:** CSS escrito primero para 360 px, botones de al menos 44 px e `inputmode="numeric"`.
- **CL-10:** el `.gitignore` se crea en OB-01, antes de cualquier otro archivo.

**Base**

- [X] OB-01 · base · Estructura del proyecto: `package.json` (express 5, ejs 7, @supabase/supabase-js, @supabase/ssr, exceljs), `server.js` mínimo, carpetas, `.gitignore` (CL-10) y `.env.example` sin valores.
- [X] OB-02 · base · `scripts/censo-de-prueba.js`: genera censos `.xlsx` inventados con la estructura real (título "Generado el", encabezados en la fila 3, los 7 servicios y días variados), con opciones para los casos borde: espacios dobles, cédula repetida, días vacío, quirófano escrito de varias formas, sin fecha y 300 filas.
- [X] OB-03 · RNF-15 · `lib/fechas.js`: "hoy" en hora de Colombia, DD/MM/AAAA, HH:MM y el día en letras ("VIERNES 6 DE NOVIEMBRE DEL 2026"), con pruebas en otra zona horaria.
- [X] OB-04 · RNF-03 · `database/01-esquema.sql` (+ `02-proteger-registros.sql` y `global.sql`): `perfiles`, `censos`, `estancias` (cédula + fecha de ingreso únicas, nombre normalizado para buscar), `candidatos` (único por censo y estancia) y `entrevistas` (una por estancia, con versión para CB-17 y columnas de "En curso"); RLS activo en todas, sin acceso anónimo, solo para cuentas activas.
- [X] OB-05 · RNF-05,06 · `lib/supabase.js` (cookies HttpOnly y SameSite=Lax, Secure con HTTPS) y `lib/datos.js` como única puerta a la base.
- [X] OB-06 · RNF-06,08 · `middleware/`: token anti-falsificación en todo POST, `Cache-Control: no-store` en las páginas con datos y registros sin nombres ni cédulas.
- [X] OB-07 · RNF-09,12 · Layout EJS primero para celular, con el menú según el rol y `estilos.css` provisional.
- [X] OB-08 · base · `scripts/crear-admin.js`: crea el primer administrador desde la terminal (la contraseña la escribe Martín, nunca queda en un archivo).

**HU-01 · Iniciar y cerrar sesión**

- [X] OB-09 · HU-01.1-5 · `routes/acceso.js` y `views/login.ejs`: redirección sin sesión, entrar, mensajes exactos, cuenta desactivada y cerrar sesión sin caché.
- [X] OB-10 · HU-01.6 · RNF-07 · Inactividad de 8 horas con una cookie de última actividad (atada a la cuenta), y el aviso al volver.
- [X] OB-11 · HU-01 · RNF-03 · `test/acceso.test.js` (+ `test-vivo/`): HU-01.1-6, y cada ruta del sistema sin sesión responde con la redirección a "Iniciar sesión" (todo cerrado por defecto).
- [X] OB-47 · CB-28 · Freno del login (enmienda 1): `lib/intentos.js` en `routes/acceso.js`, con sus pruebas.
- [x] **PC-HU-01** · suite completa + HU-01.1-6 + CB-28 + RNF-03, 07 + cláusulas que aplican + PYA · ✅ 2026-11-11: HU-01.4 y CB-28 vistos en la ventana, con Claude entrando a mano (enmienda 3; diario).

**HU-04 · Subir el censo del día**

- [X] OB-12 · HU-04.3-6 · `lib/censo.js` `leerCenso(buffer)`: busca los encabezados en las primeras 10 filas, lee "Generado el", limpia según las reglas de datos y devuelve las filas, las saltadas y las repetidas (CB-04 a CB-08).
- [X] OB-13 · HU-04 · RN-01, RN-02 · `lib/reglas.js`: `esCandidato`, `claveEstancia` y `normalizar`.
- [X] OB-14 · HU-04.1,2,7 · `routes/censo.js`, `views/censo.ejs` y `public/js/censo.js`: subir (cuerpo crudo de hasta 5 MB), resumen, "Confirmar" o "Cancelar", y guardar censo, estancias y candidatos solo con los datos de CL-02 (CB-03), con `database/05-guardar-censo.sql`.
- [X] OB-15 · HU-04 · CB-03 a CB-08 · RNF-01, RNF-04 · `test/censo.test.js`, `test/resumen-censo.test.js` y `test/censo-rutas.test.js` con censos inventados (+ `test-vivo/`): lectura, mensajes, 300 filas en menos de 3 s y que no se guarda nada fuera de CL-02.
- [X] **PC-HU-04** · suite completa + HU-04.1-7 + CB-03 a CB-08 + RNF-01, 04 + cláusulas + PYA · ✅ tanda 4 (diario).

**HU-05 · Ver los candidatos por servicio**

- [ ] OB-16 · HU-05.1-5 · `routes/revision.js` y `views/revision.ejs`: censo más reciente con selector, grupos con conteo en el orden de RN-09, "Ya revisados" plegado, censo sin candidatos y aviso de censos con pendientes.
- [ ] OB-17 · HU-05.2,5 · Pruebas de orden, agrupación y aviso.
- [ ] **PC-HU-05** · suite completa + HU-05.1-5 + cláusulas + PYA

**HU-06 · Decidir en verde o rojo**

- [ ] OB-18 · HU-06.1-3 · Botones "Entrevistar" y "No entrevistar" que deciden sin recargar (`public/js/revision.js`), guardando quién y cuándo (RN-08). Verde crea la entrevista Pendiente (RN-05).
- [ ] OB-19 · HU-06.4 · RN-07 · CB-11 · "Cambiar decisión", con el rechazo si la entrevista ya está hecha (también si se envía a mano).
- [ ] OB-20 · HU-06.5 · CB-16, CB-24 · La decisión se guarda solo si nadie decidió antes (gana el primero), y el botón se desactiva mientras guarda.
- [ ] OB-21 · HU-06 · Pruebas de HU-06.2-5, CB-11 y CB-16.
- [ ] **PC-HU-06** · suite completa + HU-06.1-5 + CB-11, 16, 24 + cláusulas + PYA

**HU-07 · Recordar un rojo anterior**

- [ ] OB-22 · HU-07.1-3 · RN-03, RN-04 · El aviso del rojo anterior por estancia; las estancias con entrevista van directo a "Ya revisados". Con pruebas.
- [ ] **PC-HU-07** · suite completa + HU-07.1-3 + cláusulas + PYA

**HU-08 · Ver las entrevistas por estado**

- [ ] OB-23 · HU-08.1-5 · `routes/entrevistas.js` y sus vistas: pestañas con conteo, grupos, "Desde el [fecha]", selector de día y aviso de que falta el censo de hoy.
- [ ] OB-24 · HU-08.6 · RN-13 · CB-27 · "En curso · [nombre]" en la lista, que vence a los 15 minutos.
- [ ] OB-25 · HU-08 · Pruebas de HU-08.2-4, 6 y CB-27.
- [ ] **PC-HU-08** · suite completa + HU-08.1-6 + CB-27 + cláusulas + PYA

**HU-09 · Llenar la entrevista**

- [ ] OB-26 · HU-09.1-3,8 · `views/entrevista-form.ejs` y `public/js/entrevista.js`: datos fijos arriba, campos en orden, `inputmode="numeric"`, solo números al pegar (CB-13), botones de tipo, contador del relato (CB-12), "No sabe" (CB-14) y confirmación de salir sin guardar.
- [ ] OB-27 · HU-09.4-7 · RN-10 · `validarEntrevista` en `lib/reglas.js` y guardado en el servidor, que pasa a Entrevistado.
- [ ] OB-28 · HU-09.9 · RN-13 · Marcar "En curso" al abrir, el aviso "está haciendo esta entrevista" y liberarlo al guardar o al salir.
- [ ] OB-29 · CB-01, CB-02, CB-17, CB-24 · Guardar con `fetch`: sin conexión, sesión vencida (se reintenta después de entrar en otra pestaña), versión (gana el primero) y doble toque.
- [ ] OB-30 · HU-09 · Pruebas de HU-09.4-7, 9, CB-02, CB-13 y CB-17.
- [ ] **PC-HU-09** · suite completa + HU-09.1-9 + CB-01, 02, 12, 13, 14, 17, 24 + cláusulas + PYA

**HU-10 · Marcar que el paciente salió**

- [ ] OB-31 · HU-10.1,2 · "Salió" con confirmación dentro de la página y "Deshacer", con pruebas.
- [ ] **PC-HU-10** · suite completa + HU-10.1-2 + cláusulas + PYA

**HU-11 · Corregir una entrevista guardada**

- [ ] OB-32 · HU-11.1,2 · "Corregir" con las mismas validaciones, y quién la hizo y quién la corrigió. Con pruebas.
- [ ] **PC-HU-11** · suite completa + HU-11.1-2 + cláusulas + PYA

**HU-13 · Buscar por cédula o nombre**

- [ ] OB-33 · HU-13.1-4 · CB-15 · RNF-02 · `routes/buscar.js`: cédula por inicio y nombre normalizado (sin tildes ni ñ), escapando `%` y `_`. Pruebas con 2.000 entrevistas inventadas.
- [ ] **PC-HU-13** · suite completa + HU-13.1-4 + CB-15 + RNF-02 + cláusulas + PYA

**HU-14 · Ver una entrevista y copiar sus campos**

- [ ] OB-34 · HU-14.1,3-5 · CB-20 · `views/entrevista-ver.ejs`: campos con "Copiar", "—" en los vacíos, formatos de fecha, hora y declaración, quién y cuándo, y "No encontramos esa entrevista."
- [ ] OB-35 · HU-14.2 · CB-22 · `public/js/copiar.js`: portapapeles, método antiguo y "Mantén presionado para copiar."
- [ ] OB-36 · HU-14 · Pruebas de HU-14.4 y CB-20.
- [ ] **PC-HU-14** · suite completa + HU-14.1-5 + CB-20, 22 + cláusulas + PYA

**HU-15 · Descargar el Excel de un día**

- [ ] OB-37 · HU-15.3-6 · CB-21 · RNF-14 · `lib/excel.js` `armarHojaDia`: títulos, día en letras, encabezados, una fila por paciente en verde, formatos de Entrevistado, Salió y Pendiente, horizontal y ajustada a carta.
- [ ] OB-38 · HU-15.1,2 · Ventana "¿Qué día quieres descargar?", vista previa y "Descargar" (`public/js/descargar.js` y `routes/descargar.js`).
- [ ] OB-39 · HU-15 · Pruebas que leen el `.xlsx` generado con ExcelJS y lo comparan con HU-15.3-5 y CB-21.
- [ ] **PC-HU-15** · suite completa + HU-15.1-6 + CB-21 + RNF-14 ⏳ hasta que Martín lo abra en Excel + cláusulas + PYA

**HU-02 · Gestionar cuentas**

- [ ] OB-40 · HU-02.1,11 · `routes/usuarios.js` y sus vistas: la lista, `soloAdmin` con "No tienes permiso para ver esta página." y el menú sin "Usuarios" para el rol Usuario (CL-03).
- [ ] OB-41 · HU-02.2,10 · RN-11 · CB-25 · Confirmar con la contraseña del admin (cliente desechable) y límite de 5 intentos en 15 minutos.
- [ ] OB-42 · HU-02.3-9 · RN-12 · CB-18, CB-19, CB-26 · Crear, editar, desactivar (cerrando sus sesiones), reactivar, borrar solo sin actividad y restablecer contraseña.
- [ ] OB-43 · HU-02 · Pruebas de HU-02.1-11 y CB-18, 19, 25 y 26.
- [ ] **PC-HU-02** · suite completa + HU-02.1-11 + CB-18, 19, 25, 26 + cláusulas + PYA

**HU-03 · Cambiar mi contraseña (Should)**

- [ ] OB-44 · HU-03.1-3 · `routes/cuenta.js` "Mi cuenta", con cliente desechable para comprobar la contraseña actual. Con pruebas.
- [ ] **PC-HU-03** · suite completa + HU-03.1-3 + cláusulas + PYA

**HU-12 · Pendientes al día con el último censo (Should)**

- [ ] OB-45 · HU-12.1-3 · CB-09, CB-10 · Al confirmar el censo más reciente, actualizar la cama y el servicio de los pendientes que siguen, o marcar "No está en el censo", sin guardar a nadie más. Con pruebas.
- [ ] **PC-HU-12** · suite completa + HU-12.1-3 + CB-09, 10 + cláusulas + PYA

**Cierre**

- [ ] OB-48 · CL-06 · RNF-16 · Antes del primer dato real (decisión de Martín, 2026-11-09): quitar `limpiar_pruebas()` y el desvío del guardia de entrevistas (SQL numerado nuevo + `global.sql`), para que no viajen a la base de la clínica, y vaciar la base de pruebas. Incluye borrar las cuentas de prueba de Claude (`claude-admin` y `claude-usuario @prueba.test`) y la de desarrollo de Martín, borrar `.env.pruebas` y quitar `ENTORNO=desarrollo` del `.env` que vaya a la clínica.
- [ ] OB-46 · CB-23 · RNF-09, 11, 13 · Recorrido completo en la ventana a 360, 768 y 1280 px, girando la pantalla, y lista para que Martín lo pruebe en su celular (RNF-10, RNF-13).

**Revisión antes de construir:** pasó, con estos hallazgos:

- Cada historia Must tiene obligaciones y su punto de control; cada caso borde (CB-01 a CB-27) y cada RNF de los criterios de terminado (RNF-01 a RNF-15, salvo RNF-12, que es una decisión) los cita al menos una obligación. RN-01 a RN-13 existen en el SRS 1.1. No quedan dudas abiertas ni choques con las cláusulas.
- Lo que puede salir mal y ya quedó cubierto: un censo de un día viejo (CB-09), dos personas a la vez (CB-16, CB-17, RN-13), sesión vencida a mitad de una entrevista (CB-02) y portapapeles sin HTTPS (CB-22).
- Cómo se abre la ventana: `npm run dev` → `http://localhost:3000`, con navegador-visible y la sesión ya cargada (Claude no escribe contraseñas). Lo que necesita contraseña queda `[Martín]`.

## 6. Tandas

| # | Fecha         | Obligaciones                                                        | Punto de control                                                                                  | Commit sugerido                                                                                       |
| - | ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1 | 2026-11-09    | OB-01 a OB-03, OB-12, OB-13 (+ parte de OB-15)                      | PC-HU-04 ⏳ falta OB-14 · lo demás sin base ✅ · 44/44 · PYA 98,6/A                           | `Tanda 1: estructura, censos inventados, fechas y lectura segura del censo`                         |
| 2 | 2026-11-09    | OB-04 a OB-07 (+ arreglos PYA y CL-11)                              | Sin PC-HU (es base) · 80/80 · ventana ✅ · `revisar-env` y `revisar-base` ✅ · PYA 96,2/A | `Tanda 2: base de datos con RLS y guardias, sesión, seguridad común y esqueleto de pantallas`     |
| 3 | 2026-11-09    | OB-08 a OB-11, OB-47 (+ SQL 03 y 04, arreglos PYA)                  | PC-HU-01 ⏳ solo HU-01.4 [Martín] · 113/113 · en vivo 12/12 · ventana ✅ · PYA 97,1/A        | `Tanda 3: login, cierre de sesión, inactividad, freno de intentos, primer admin y pruebas en vivo` |
| 4 | 2026-11-10/11 | OB-14, OB-15 (+ SQL 05, sesiones de prueba de Claude, arreglos PYA) | PC-HU-04 ✅ · 152/152 · en vivo 15/15 · ventana ✅ · PYA 100/A · enmienda 2: firma pendiente | `Tanda 4: subir el censo (leer, resumen, confirmar), guardar_censo y sesiones de prueba`            |

**Hallazgos**

- Tanda 1 · Para OB-14: `leerCenso` ya abre el archivo en un hilo aparte con revisión del zip (50 MB descomprimidos), tope de 10.000 filas, 256 MB y 15 s; lo trucado sale con el mensaje de HU-04.3. La ruta solo llama a `leerCenso`, pero **también** limita el cuerpo a 5 MB al recibirlo (`express.raw({ limit: '5mb' })`), porque `leerCenso` mide el tamaño con el archivo ya en memoria (PYA).
- Tanda 1 · `leerCenso` salta también las filas con la fecha de ingreso vacía o no válida (RN-02 la necesita) y las informa como en CB-04 ("fecha de ingreso vacía o no válida").
- Tanda 1 · Para OB-05, OB-09 y OB-40 (PYA, permisos): el rol se lee de `perfiles` con RLS, nunca de `user_metadata` (el usuario lo puede cambiar); la sesión se valida con `getUser()`/`getClaims()`, no con `getSession()`; todo va detrás del login salvo `/login`; no usar `HOST=0.0.0.0` antes de tener login.
- Tanda 1 · CL-01: en cada punto de control se buscan números de 7 a 10 cifras que no empiecen por 99 (en esta tanda se coló una cédula real en un comentario; ya corregida).
- Tanda 1 · ExcelJS 4.4.0 arrastra paquetes viejos (`uuid` forzado a 11.1.1 con `overrides`). Usar solo `xlsx.load`, nunca el lector por streaming, y revisar `npm audit` en cada punto de control.
- Tanda 1 · `npm test` corre solo `test/*.test.js`: lo de `test/ayudantes/` no son pruebas (uno es un hilo que gasta memoria sin parar).
- Tanda 2 · La base: `database/01` a `04` (ya aplicados, en orden) y `global.sql` para una base nueva (CL-11, ver `database/LEEME.md`). Los guardias de `02` ponen ellos mismos quién hizo cada cosa (RN-08), no dejan que una entrevista hecha vuelva atrás ni se borre (RN-06, CB-11), suben la `version` (CB-17) y exigen que la sesión del token siga existiendo. El servidor igual pone los `…_por`, pero la base manda. **Probados en vivo en la tanda 3** (`npm run test:vivo`, 12/12).
- Tanda 2 · Para OB-09/OB-10 (PYA): validar la sesión con `getUser()` (pregunta a Supabase si la sesión existe), no con `getClaims()` ni `getSession()`; ligar el token anti-falsificación a la sesión y renovarlo al entrar y al salir; poner `trust proxy` antes de limitar intentos por IP. Las cookies de Supabase ya duran máximo 8 horas (`ajustarOpcionesCookie`).
- Tanda 2 · Los compañeros ya no ven el correo de los demás (permiso por columnas en `perfiles`): leer siempre columnas con nombre, nunca `select('*')` con la sesión de una persona. HSTS va sin `includeSubDomains` a propósito: no sabemos qué otros subdominios tiene el hosting de la clínica.
- Tanda 2 · Levantar el servidor en segundo plano con `node --env-file-if-exists=.env server.js`, no con `npm start`: en Windows, detener npm deja vivo al `node` hijo (pasó en esta tanda; se cerró por su PID).
- Tanda 2 · CL-06: al lanzar el revisor de secretos con un `.env` real presente, pedirle que lo EXCLUYA de sus búsquedas. En esta tanda su grep imprimió las líneas de las llaves en su registro → Martín rota la llave secreta.
- Tanda 3 · **Todo pide sesión por defecto** (`app.use(requiereSesion)` después de `/login` y `/salir`): una ruta nueva queda cerrada aunque nadie se acuerde de pedirla. Las rutas de administrador (HU-02) llevan además `requiereRol('administrador')`, que ya existe y está probada.
- Tanda 3 · Para OB-14 (subir el censo): usar `leerCenso(buffer)`, que no acepta opciones. `leerCensoParaPruebas` es solo para las pruebas y solo acepta hilos de `test/ayudantes/`. El hilo del censo se reutiliza (ExcelJS tarda ~1,7 s en cargarse) y `server.js` lo precalienta al arrancar.
- Tanda 3 · Cuentas: `martin@prueba.test` es el admin de desarrollo de Martín. Las pruebas en vivo crean y borran cuentas `tst-…@prueba.test`; ese prefijo no se usa para una cuenta de una persona (`limpiar_pruebas()` solo toca esas).
- Tanda 3 · Riesgo que queda (PYA, permisos): Supabase no vence solo una sesión inactiva en el servidor. Si alguien copia la cookie de otra persona, nuestra puerta lo frena (la marca de actividad está atada a la cuenta y vence a las 8 h), pero esa sesión sigue existiendo en Supabase hasta que se cierre. Opciones si hace falta más: el "timeout de inactividad" de Supabase (plan pago) o un trabajo que llame a `cerrar_sesiones`. Anotado; no frena nada.
- Tanda 3 · Al publicar detrás del hosting: `PROXIES=1` (o los que haya) en el `.env`, para que el freno del login vea el equipo de verdad y no el del proxy. Y `NODE_ENV=production` con HTTPS: si no, el servidor no arranca con un `HOST` de red (salvo `ACEPTO_RED_SIN_HTTPS=si` para una prueba corta, por ejemplo CB-22).
- Tanda 3 · Comandos para Martín: los usa en **cmd** (`cd /d "…" && …`), no en bash ni PowerShell.
- Tanda 4 · Para HU-05 (revisión): `/revision?dia=` es provisional (solo el conteo). Los candidatos ya están en `candidatos` con `orden` = fila del censo (RN-09); la pantalla de verdad se arma sobre `lib/datos.js` (con la sesión de la persona).
- Tanda 4 · Para OB-45 (HU-12): `guardar_censo` recibe SOLO candidatos. HU-12 necesita además las filas de las estancias con entrevista pendiente (para actualizar su cama), sin guardar a nadie más: habrá que ampliar la función (SQL nuevo + `global.sql`) o hacer una segunda llamada.
- Tanda 4 · Para probar en la ventana sin Martín: `node --env-file=.env scripts/sesion-de-prueba.js <admin|usuario> <archivo>` con el servidor encendido, y `agent-browser state load` + `open`. Solo con `ENTORNO=desarrollo`; nunca se escriben contraseñas en la ventana. Lo que exige teclear la contraseña del admin (RN-11) sigue siendo [Martín].
- Tanda 4 · Riesgos anotados (PYA, por debajo de su umbral): varias subidas grandes a la vez quedan en cola en memoria (son 4 personas, con sesión); `mode 0o600` no tiene efecto en Windows (las claves de prueba están en la misma carpeta que el `.env`).
- 2026-11-09 · Proyecto de Supabase `entrevistas` creado por Martín (São Paulo, llaves nuevas `sb_publishable_`/`sb_secret_`). `npm run revisar-env` (`scripts/revisar-env.js`) comprueba el `.env` sin mostrar las llaves, que ambas funcionen y que el registro de cuentas esté apagado. Usarlo antes de cada tanda con base de datos y al pasar al hosting.
- Firma · **Bloqueo para la tanda 2 en adelante:** hace falta un proyecto de Supabase. El plan gratuito permite 2 proyectos activos por cuenta, y vigilancia_iso ya usa uno. Martín lo crea (región São Paulo, la más cercana) y copia las llaves en `.env` él mismo; las llaves nunca pasan por el chat. La tanda 1 (OB-01 a OB-03, OB-12, OB-13 y la parte de OB-15 que no usa la base) no lo necesita.

## 8. Enmiendas

| N | Fecha      | Qué cambió                                                                                                                                                                                                                                                                                                                                                                                                          | Motivo (pedido textual)                                                                                                                                                                                                         | Obligaciones afectadas             | Firma                 |
| - | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------- |
| 1 | 2026-11-09 | Entra CB-28 (HU-01): freno del login, 5 contraseñas equivocadas por cuenta o 20 por equipo en 15 minutos, bloqueo de 15 minutos con "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." SRS 1.2.                                                                                                                                                                                                         | La revisión PYA de la tanda 3 encontró que el login no tenía freno. Martín: "Sí, con esos números (Recomendado)".                                                                                                         | OB-47 (nueva, hecha en la tanda 3) | Martín · 2026-11-09 |
| 2 | 2026-11-11 | HU-04 gana un criterio: un censo cuya fecha "Generado el" es posterior a hoy se rechaza con "La fecha del censo (DD/MM/AAAA) es posterior a hoy. Revisa que sea el archivo correcto." Y entran 3 textos que el SRS no tenía: "Elige el archivo del censo.", "Elige una fecha del censo que exista y que no sea posterior a hoy." y "No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo." | Dos revisores PYA de la tanda 4 marcaron que un archivo con fecha futura permitía crear antes el censo de un día que no ha llegado. Se construyó junto con los arreglos de la revisión: si Martín no lo aprueba, se quita. | OB-14 (ya hecha)                   | Martín · 2026-11-11 ("si apruebo la enmienda 2"). SRS 1.3 |
| 3 | 2026-11-11 | Cambia solo **cómo se prueba**: lo que exige escribir una contraseña en la pantalla (HU-01.2-4, HU-02.2-10, HU-03.1-3) pasa de [Martín] a [test + ventana]. Claude entra escribiendo el correo y la contraseña de SU cuenta de prueba (`claude-*@prueba.test`, contraseña al azar en `.env.pruebas`), en la app que corre en localhost, como lo haría una persona. Nunca la contraseña de Martín ni la de otra persona, nunca en el chat ni en la pantalla. | Martín: "en las pruebas necesito ver que usted ingrese normal como si fuera yo así mismo hará las pruebas … yo le doy authorizacion … yo estaré monitoreándolo". | Ninguna (cambia cómo se prueba) | OK de Martín · 2026-11-11 |
