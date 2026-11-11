---
estado: aprobado   # borrador → aprobado. Una cláusula aprobada cambia solo con el OK explícito de Martín.
---

# Cláusulas · Entrevistas

> Reglas que no se negocian en este proyecto. Todo pacto se revisa contra ellas.
> Una cláusula aprobada cambia solo con el OK explícito de Martín, anotado en el historial.

| ID | Cláusula | Por qué | Origen |
|---|---|---|---|
| **CL-01** | Para desarrollar y probar solo se usan pacientes **inventados**. Los censos reales, la hoja escaneada y cualquier nombre o cédula real no entran al código, a las pruebas, al repositorio ni a las notas del cerebro. | Son datos de salud de personas reales: si se filtran por un descuido, no hay forma de arreglarlo. | SRS §4.2 · nueva (igual que CL-01 de vigilancia_iso) |
| **CL-02** | Del censo solo se guardan **servicio, cama, cédula, nombre, fecha de ingreso y días**. Nunca se guardan la edad del censo, la entidad, los médicos, el siniestro ni el consumo. El archivo del censo se lee en memoria y se descarta: no se guarda en el disco ni en la base de datos. | Martín: "solo tomemos los datos que salen, lo de siniestro no toquemos". Con datos de salud se guarda lo mínimo. | SRS §4.2 · decisión de Martín 2026-11-06 |
| **CL-03** | Los permisos se **validan en el servidor y en la base de datos** (RLS en todas las tablas), no solo ocultando botones. Además, lo que un rol no puede usar **tampoco se le muestra**: el usuario normal no ve ningún menú, botón ni pantalla de administrador. | Si no, un usuario podría entrar a "Usuarios" escribiendo la dirección a mano. Martín: "el usuario normal no puede ver la interfaz extra del usuario admin". | SRS §4.2 · nueva · ampliada por Martín 2026-11-06 |
| **CL-04** | Las consultas a la base usan parámetros (nunca texto pegado). Las contraseñas las guarda cifradas Supabase Auth. La llave secreta de Supabase vive solo en `.env`, en el servidor, y nunca llega al navegador. Todo formulario que cambia datos lleva un token anti-falsificación. | Evita la inyección de código, la filtración de contraseñas y que otra página envíe formularios a nombre de un usuario. | SRS §4.2 · nueva (igual que CL-06 de vigilancia_iso) |
| **CL-05** | Plantillas EJS: (1) salen solo de archivos de `views/`, nunca de texto que escribe una persona; (2) los datos se muestran siempre con `<%= %>`, y dentro de atributos van entre comillas; `<%- %>` solo para `include`; (3) nunca se ponen datos dentro de `<script>`, de atributos `on…` ni de CSS; (4) `res.render` recibe un objeto armado a mano con solo lo que la página muestra, nunca `req.body`, `req.query` ni filas completas. | Las fallas conocidas de EJS y el XSS aparecen por usarlo mal. | SRS §5.2 · nueva (igual que CL-07 de vigilancia_iso) |
| **CL-06** | Cada punto de control incluye una revisión rápida de seguridad del código tocado (PYA, con puntaje). Sus hallazgos se corrigen en la misma tanda o se anotan en el pacto. Antes del primer dato real se hace una auditoría completa (security-audit) y se corrigen todos sus hallazgos. | Datos de salud: la seguridad va antes que la velocidad. | SRS §4.2 · nueva (igual que CL-08 de vigilancia_iso) |
| **CL-07** | Todo se diseña **primero para celular**: cada pantalla se usa sin desplazamiento horizontal desde 360 px de ancho, los botones miden al menos 44 px de alto, y los campos numéricos abren el teclado numérico. También tiene que funcionar en tablet y en portátil. | Martín: "la mayoría es para hacerlo por el celular y tablet… que todo sea responsivo para cualquier dispositivo". | SRS §4.3 · decisión de Martín 2026-11-06 |
| **CL-08** | No se usan servicios de pago: todo el software y las herramientas son gratuitos o de código abierto. | No hay presupuesto conocido para el proyecto. | SRS §5.6 · nueva (inferido) |
| **CL-09** | No se publica nada en el hosting de la clínica ni se toca su infraestructura **hasta que Martín lo diga**. | Martín: "aca me proporcionan el hosting pero ya a lo ultimo me lo dan". | SRS §5.6 · decisión de Martín 2026-11-06 |
| **CL-10** | El código se versiona en un repositorio de **GitHub** que Martín crea más adelante, y él maneja git (Claude no corre comandos de git que escriban). El `.gitignore` deja afuera siempre `.env`, `node_modules/`, `.impeccable/` y cualquier `.xlsx`, `.xls` o `.pdf` que no sea de prueba inventado. | Que las llaves y los censos reales nunca terminen en GitHub (CL-01, CL-04). | decisión de Martín 2026-11-06 · regla global de git |
| **CL-11** | Cada cambio a la base va en un **archivo numerado nuevo** en `database/` (`01-esquema.sql`, `02-…`, `03-…`), que es el historial y se revisa solo. Al mismo tiempo se actualiza **`database/global.sql`**, la base completa en un solo archivo: para una base nueva o vacía se pega solo ese. `test/sql-global.test.js` comprueba que `global.sql` deje la base igual que aplicar los numerados en orden. | Si la base se borra o se pasa a otra (por ejemplo, al Supabase de la clínica), se copia un solo archivo y listo, sin adivinar el orden. | decisión de Martín 2026-11-09 |

## Stack fijo

Es el mismo de `vigilancia_iso`: Martín ya lo conoce y sus patrones de seguridad ya están probados.

- **Servidor y páginas:** Node.js con Express 5 y plantillas EJS 7, con CSS propio y JS simple para lo interactivo (botones verde y rojo, copiar, modal). Se desarrolla con Node 26 y, para el uso real, se pasa a una versión LTS.
- **Datos:** Supabase (PostgreSQL + Auth), usado **solo desde el servidor** con `@supabase/supabase-js` y `@supabase/ssr` (sesión en cookies). Las llaves van solo en `.env`.
- **Excel:** `ExcelJS`, para leer el censo y para armar la descarga.
- **Pruebas:** `node --test`, para la lectura del censo, las reglas, las validaciones, los permisos y el Excel de descarga. Lo visual se revisa en la ventana. Comandos: `npm run dev` y `npm test`.
- Cualquier otra librería se le pide a Martín antes de agregarla.

## Historial

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-11-06 | Primera versión (borrador) | Salen del SRS §4.2, §4.3, §5.2 y §5.6, de las decisiones de Martín en la conversación y de las cláusulas aprobadas de vigilancia_iso |
| 2026-11-06 | **Aprobadas por Martín: CL-01 a CL-10.** Se aprueban ya con CL-03 ampliada (el usuario normal no ve la interfaz del admin) y con CL-10 nueva (GitHub) | Martín: "se aprueban y para el guardado se guardara en el github que lo crearemos mas adelante para las versiones […] el usuario normal no puede ver la interfaz extra del usuario admin" |
| 2026-11-09 | **Se agrega CL-11** (archivos SQL numerados + `global.sql` siempre al día, con su prueba) | Pedido explícito de Martín: "cuando cree archivos de sql crea tanto los archivos para revisar y lo que se va a crear nuevo y a la vez ajusta un solo archivo como por ejemplo global que es el que tiene todo incluido asi si se llega a borrar la base de datos y se crea otra entonces se copia un solo archivo y ya" |

<!-- Al aprobar: agregar una fila "Aprobada por Martín" con fecha y pasar el estado a aprobado. -->
