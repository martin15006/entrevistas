---
pacto: entrevistas
---
# Diario · Entrevistas

> Evidencia de cada punto de control y de cada intento de sello. **No se lee para retomar**: lo
> pactado y el estado viven en el pacto (`2026-11-06-entrevistas.md`). Acá se busca cuando hace falta
> saber qué se probó y cómo.

## Tanda 1 · 2026-11-09 · PC-HU-04 parcial (sin base de datos)

Obligaciones: OB-01, OB-02, OB-03, OB-12 y OB-13, más la parte de OB-15 que no necesita base de datos.
PC-HU-04 no se cierra: faltan OB-14 (ruta, pantalla y guardado) y las pruebas que lo usan.

- **Suite:** `npm test` (`node --test "test/*.test.js"`) · **44 de 44** · no hay lint ni build todavía.
- **Instalación:** `npm install` con versiones exactas (express 5.3.0, ejs 7.0.1, @supabase/supabase-js 2.118.0, @supabase/ssr 0.12.7, las mismas de vigilancia_iso; exceljs 4.4.0). `npm audit` dio 2 moderadas por `uuid` 8.3.2 dentro de ExcelJS (GHSA-w5hq-g745-h8pq, solo `v3/v5/v6` con buffer; ExcelJS usa `v4()` sin argumentos, así que no era alcanzable). Igual se forzó `uuid` 11.1.1 con `overrides` → **0 vulnerabilidades**.
- **Criterio por criterio** (lo que se puede probar sin base de datos):
  - HU-04.1 · test `HU-04.1 · el resumen cuenta…`: 5 filas (día 0 Observación, día 1 UCI, día 2 Hosp. A, día 0 Quirófano, día 1 Hosp. D) → `{ pacientes: 5, paraRevisar: 3 }`. La pantalla del resumen es de OB-14.
  - HU-04.3 · test: texto plano, cabecera de `.xls` viejo (D0 CF 11 E0), zip roto y algo que no es Buffer → "El archivo debe ser el censo en Excel (.xlsx)." exacto.
  - HU-04.4 · tests: hoja de otra cosa → mensaje exacto; encabezados en la fila 10 se leen y en la 11 no (N y N+1).
  - HU-04.5 · test: "Generado el: 06/11/2026" → `2026-11-06`; sin esa línea → `null`. El selector de fecha es de OB-14.
  - HU-04.6 · test: exactamente 5 MB pasa el control de tamaño (cae después por no ser .xlsx); 5 MB + 1 byte → mensaje exacto.
  - HU-04.2 y HU-04.7 · pendientes (OB-14, con base de datos).
  - CB-04 · filas 9 (días vacío), 10 (sin cédula) y 12 (día −1) saltadas con su motivo.
  - CB-05 · la cédula repetida de la fila 8 se ignora y se toma la fila 4.
  - CB-06 · `'1.0'` → 1; `1`, `1.0`, `' 2 '` bien; `''`, `'abc'`, `-1`, `1.5` → se salta.
  - CB-07 · `Quirofano`, `QUIRÓFANO`, ` quirofano` y otras formas quedan fuera de los candidatos.
  - CB-08 · `'CAROLINA  PRUEBA   GÓMEZ'` → `'CAROLINA PRUEBA GÓMEZ'`; `'99.000.001.01'` → `'9900000101'`; `'CAMA 13 '` → `'CAMA 13'`.
  - RN-01 · día 0 y 1 sí, día 2 no; Quirófano nunca. RN-02 · misma cédula y fecha = misma estancia; otra fecha u otra cédula = otra.
  - RNF-01 · 300 filas en **1,3 s** (con el hilo aparte y la revisión del zip; antes de esas protecciones eran 0,11 s).
  - RNF-04 (lectura) · cada fila trae solo `fila, piso, cama, cedula, nombre, fechaIngreso, dias`; ni la entidad ni los médicos inventados aparecen en el resultado.
  - RNF-15 · 03:30 UTC del 7/11 = 22:30 del 6/11 en Colombia; igual con el proceso en hora de Tokio (y `getHours() = 12` prueba que el proceso de verdad estaba en Tokio); la medianoche de Colombia cambia el día.
- **Pruebas de las pruebas:** se rompió el código a propósito 7 veces y cada vez falló la prueba que tenía que fallar: tope de 5 MB (`>` → `>=`), candidato (`día 0 o 1` → `día ≤ 2`), filas para encabezados (10 → 11), revisión del zip desconectada, arreglo de la fecha imposible quitado, tope de filas corrido en 1 y tope de descompresión corrido en 1 byte. Los archivos se restauraron idénticos (`cmp`).
- **Cláusulas:**
  - CL-01 · se buscaron números de 7 a 10 cifras que no empiecen por 99 en todo el proyecto, la nota del cerebro y la memoria: ninguno (después del arreglo de abajo).
  - CL-02 · ver RNF-04. El archivo se lee en memoria y nunca se escribe al disco.
  - CL-06 · PYA quick (abajo). CL-08 · todo es gratuito. CL-09 · no se publicó nada. CL-10 · el `.gitignore` deja afuera `.env`, `node_modules/`, `*.xlsx/xls/pdf` y `datos-prueba/`.
  - CL-03, CL-04, CL-05 y CL-07 no aplican todavía (no hay rutas, llaves, vistas ni pantallas).
- **PYA quick · 98,6/100 (A):** feed 2026-10 (17 días), 0 coincidencias, 0 IOC; osv-scanner, trufflehog, zizmor y semgrep no están instalados (no corrieron). 5 agentes: vuln-scanner 100, threat-intel 100, secretos 100, dependencias 94, permisos no aplica (todavía no hay login).
  - Medio · bomba zip (dependencias y vulnerabilidades) → **arreglado** (ver abajo).
  - Bajo · ExcelJS 4.4.0 arrastra paquetes viejos o abandonados (unzipper → fstream, rimraf 2, glob 7, inflight) → queda anotado: `leerCenso` solo usa `xlsx.load` (JSZip), nunca el lector por streaming que usa unzipper; revisar `npm audit` en cada punto de control.
  - Info · una cédula **real** en un comentario de `lib/reglas.js` → **arreglado**.
  - Por debajo del umbral (vuln-scanner): filas infinitas (medio), fecha imposible (bajo) → **arreglados**.
- **Qué falló y cómo se arregló:**
  1. **Cédula real en un comentario.** Claude escribió como ejemplo un número del censo real en `lib/reglas.js`. Lo detectó el revisor de secretos; se cambió por `9900000001.0` y desde ahora cada punto de control busca cédulas que no empiecen por 99.
  2. **Rango de tildes ilegible.** El editor convirtió el rango de tildes (U+0300 a U+036F) en caracteres invisibles dentro del código; se cambió por `\p{M}` (cualquier marca), que se escribe solo con letras normales.
  3. **Archivos trucados (PYA).** `leerCenso` ahora abre el archivo en un hilo aparte (`lib/censo-trabajador.js`) con 256 MB y 15 s de tope; dentro, `lib/zip-seguro.js` descomprime cada parte de verdad con un tope total de 50 MB (`maxOutputLength`, sin creerle al tamaño que dice el zip); un archivo que dice tener más de 10.000 filas se rechaza sin recorrerlas (`findRow`/`findCell` no crean filas vacías); una fecha imposible ya no lanza `RangeError`. Todo sale con el mensaje de HU-04.3, sin textos nuevos.
  4. **Una prueba tumbó todo el proceso.** Con un tope de 2 MB, V8 no alcanza a crear el hilo y mata el proceso entero (FatalOOM). Un experimento mostró que con 16, 32 y 64 MB el hilo se cae solo (`ERR_WORKER_OUT_OF_MEMORY`) y el proceso sigue. La prueba usa ahora un "hilo glotón" (`test/ayudantes/trabajador-gloton.js`) con 32 MB.
  5. **La prueba de la bomba no demostraba nada.** 60 MB de ceros tampoco son XML válido, así que ExcelJS los rechazaba igual. Se agregó un censo válido con 60 MB escondidos en `xl/media/`, que ExcelJS sí aceptaría: solo lo frena la revisión del zip.
- **Otros:** `npm run censo-prueba -- --casos-borde` dejó un censo inventado de 56 filas en `datos-prueba/censo-prueba-2026-11-06.xlsx`. El servidor de prueba respondió 200 sin `x-powered-by` y se cerró solo.

## Tanda 2 · 2026-11-09 · base (sin PC-HU)

Obligaciones: OB-04 a OB-07, más los arreglos de la revisión PYA y la cláusula CL-11.

- **Suite:** `npm test` · **80 de 80**.
- **Supabase real:** Martín creó el proyecto (São Paulo, llaves nuevas, registro de cuentas apagado) y aplicó `01-esquema.sql` y `02-proteger-registros.sql`. `npm run revisar-env`: todo ✅. `npm run revisar-base`: las 5 tablas existen; un visitante sin sesión recibe 42501 (permiso negado) en las 5 y en `es_cuenta_activa`; `cerrar_sesiones` la usa solo el servidor.
- **Ventana** (navegador-visible, servidor real con el `.env`): inicio a 360 px sin desplazamiento lateral y letra base de 16 px; la página "No encontramos esa página." con su botón de 44 px de alto, que lleva al inicio; a 1280 px el contenido queda en una columna de 768 px. Por API (no se ve en la ventana): CSP sin `unsafe-inline`, `nosniff`, `no-store`, cookie del token `HttpOnly; SameSite=Lax`, y un POST sin token da 403.
- **Criterio por criterio (lo que esta tanda puede probar):**
  - RNF-03 · el esquema: RLS en las 5 tablas y ninguna política para `anon` (lectura del archivo) + `revisar-base` contra la base real.
  - RNF-05 · nada en `public/` ni `views/` nombra las llaves; solo `lib/supabase.js` y `lib/configuracion.js` las manejan.
  - RNF-06 · sin token → 403 con "El formulario venció. Recarga la página e inténtalo de nuevo."; con el token de su cookie pasa (campo `_csrf` o cabecera `X-CSRF-Token`); un token cruzado o una cookie alterada → 403; cookie `HttpOnly; SameSite=Lax`, y con HTTPS `__Host-…; Secure; Path=/`, sin `Domain`, más HSTS.
  - RNF-07 · las cookies de Supabase quedan en máximo 8 h (400 días → 8 h; 8 h + 1 s → 8 h; 3600 s se respeta; `maxAge` 0 se respeta para borrarlas).
  - RNF-08 · un error con una cédula en su texto y en sus detalles: el registro trae solo "23505 (409)", y la página solo "Algo salió mal. Inténtalo de nuevo en un momento.".
  - HU-01.5 (parte) · `/` y las páginas de error salen con `Cache-Control: no-store`.
  - HU-02.11 (parte) y CL-03 · el menú no muestra "Usuarios" al rol Usuario y sí al Administrador.
  - CL-05 · `<%-` solo para `include`; ni `<script>` ni `style=""` ni `on…=` en línea; lo que se muestra sale escapado.
- **Pruebas de las pruebas:** 5 roturas a propósito (quitar el chequeo del token, mostrar "Usuarios" a todos, anotar el texto del error, quitar el RLS de una tabla, quitar el `no-store`), y cada una hizo fallar su prueba. Además, un simulacro de `03-…sql` con una columna nueva sin actualizar `global.sql` hizo fallar la prueba de CL-11.
- **PYA quick · 96,2/100 (A):** feed 2026-10 (17 días), 0 coincidencias, 0 IOC, `npm audit` 0. vuln-scanner 100, dependencias 100, amenazas 100, secretos 100 (1 info: `*.pem`/`*.key` en `.gitignore` → agregado), permisos 82: 4 medios y 1 bajo.
  - Medio · "hecha por" se podía falsificar desde la base y una entrevista hecha se podía borrar en dos pasos → **arreglado** con los guardias de `02-proteger-registros.sql`.
  - Medio · cerrar las sesiones de alguien no invalidaba su token hasta 1 hora → **arreglado**: `es_cuenta_activa()` exige que la sesión del token exista en `auth.sessions`.
  - Medio · cookies de Supabase de 400 días → **arreglado**: máximo 8 h. La inactividad de 8 h va en OB-10.
  - Bajo · token anti-falsificación sin `__Host-` → **arreglado** con HTTPS; ligarlo a la sesión va en la tanda del login (Hallazgos).
  - Por debajo del umbral (vuln-scanner): los compañeros veían el correo de los demás → **arreglado** con permisos por columna; las páginas de error sin `no-store` → **arreglado**.
- **Qué falló y cómo se arregló:**
  1. **El comando de la `CLAVE_FIRMA` era para bash y la terminal de Martín es PowerShell.** Al `.env` fue a parar el texto del comando, y la primera vez quedó pegado a la llave secreta. Un script de un solo uso lo arregló sin mostrar valores; desde ahí, la memoria `reference_terminal_powershell`.
  2. **El revisor de secretos imprimió las líneas de las llaves** en su registro (su grep tocó el `.env`). Martín creó una llave secreta nueva y borró la vieja; `revisar-env` confirmó que la nueva funciona.
  3. **El servidor quedó vivo después de detener la tarea:** en Windows, detener `npm start` deja el `node` hijo. Se cerró por su PID (comprobado que era `node … server.js`).
  4. **Un comentario EJS con `%>` adentro** habría cerrado el comentario antes de tiempo; se reescribió antes de probar.
  5. **Mi prueba de control de CL-11 falló por `$$`:** en un texto de reemplazo de JavaScript, `$$` significa un solo `$`. Se usa una función como reemplazo.
- **Pendiente para la tanda del login:** probar en vivo, con cuentas de prueba, que los guardias de la base frenan firmar a nombre de otro y devolver o borrar una entrevista hecha. *(Hecho en la tanda 3.)*

## Tanda 3 · 2026-11-09 · PC-HU-01

Obligaciones: OB-08 a OB-11 y OB-47 (enmienda 1), más `database/03` y `04`, el hilo del censo reutilizable y los arreglos de la revisión PYA.

- **Suite:** `npm test` · **113 de 113**, estable en varias corridas seguidas. `npm run test:vivo` (contra el Supabase de desarrollo) · **12 de 12**.
- **Criterio por criterio:**
  - HU-01.1 · test: sin sesión, `/entrevistas`, `/` y cualquier otra ruta llevan a `/login` (la prueba saca las rutas GET de la propia app). Ventana: se abrió `http://localhost:3000/` y llegó sola al login.
  - HU-01.2 · test (Supabase falso) + en vivo (Supabase real, cuenta `tst-` con contraseña al azar) + **Martín**: entró en la ventana con `martin@prueba.test` y llegó a "Entrevistas" con su nombre; el menú de admin muestra "Usuarios".
  - HU-01.3 · test: correo inexistente y contraseña equivocada dan el mismo "Correo o contraseña incorrectos.", la contraseña nunca vuelve a la página y el correo se conserva; vacíos o demasiado largos no se le preguntan a Supabase (200 caracteres sí, 201 no). En vivo con el Supabase real. **Martín** lo vio en la ventana con una contraseña equivocada.
  - HU-01.4 · test: cuenta desactivada y cuenta sin perfil → "Tu cuenta está desactivada. Habla con el administrador." y la sesión se cierra (signOut `local`). En vivo con el Supabase real. ⏳ **[Martín]** verlo en la ventana: se hace en la tanda de HU-02, cuando pueda desactivar una cuenta desde "Usuarios".
  - HU-01.5 · test: "Cerrar sesión" vuelve al login, `signOut({ scope: 'local' })` (no en todos los equipos), `no-store` en las páginas. Ventana: después de salir, el botón "atrás" se quedó en el login, sin el nombre ni el menú. En vivo con el Supabase real.
  - HU-01.6 · test con el reloj de la app: a las 8 h − 1 ms sigue adentro; a las 8 h exactas sale con "Tu sesión se cerró por inactividad.". La marca es de la cuenta: la de Ana no sirve con la sesión de Luis.
  - CB-28 · tests: 5 equivocadas → la 6.ª (aunque sea la correcta) da 429 con el mensaje y no llega a Supabase; otra cuenta sigue entrando; a los 15 minutos vuelve a entrar; 4 equivocadas + la correcta entra y la cuenta queda en cero; 20 equivocadas desde el mismo equipo frenan al equipo.
  - RNF-03 · todo pide sesión por defecto (una ruta inventada lleva al login sin sesión y da 404 con sesión); guardia de admin probada (Usuario 403 con "No tienes permiso para ver esta página.", Administrador pasa). En vivo: una cuenta desactivada con sesión no ve datos.
  - RNF-07 · en vivo: las cookies de Supabase llegan con `HttpOnly` y `Max-Age=28800` (8 horas). Ventana: `document.cookie` da vacío (ninguna cookie se puede leer desde la página).
  - CL-07 / RNF-09 · ventana a 390 px: sin desplazamiento lateral, campos y botones de 44 px, letra de 16 px en los campos.
- **Guardias de la base, en vivo:** firmar a nombre de otro (censo, decisión, entrevista) → la base pone el id de quien lo hace; una entrevista nace pendiente; sin los 5 datos no hay "entrevistado" (23514); "hecha por" y "corregida por" correctos; volver a pendiente (23514) y borrar (ni con la llave secreta, 23514) no se puede; `cerrar_sesiones` saca al instante; los compañeros no ven el correo (42501).
- **Pruebas de las pruebas:** 6 roturas del login (inactividad, cuenta activa, signOut global, dejar entrar a una desactivada, no renovar el token, avisos sin `hasOwn`) y 6 de los arreglos PYA (freno, marca sin cuenta, sin "todo cerrado", guardia de admin abierta, sin respaldo al cerrar sesión, red sin HTTPS): todas detectadas. Archivos restaurados idénticos.
- **Cláusulas:** CL-01 (ninguna cédula real; los únicos números son contraseñas de prueba de 7 y 8 caracteres), CL-03 (todo cerrado por defecto, guardia de rol, RLS en vivo), CL-04 (la contraseña del admin nunca se muestra ni se guarda), CL-05, CL-06 (PYA), CL-07, CL-10 y CL-11 (`03` y `04` con `global.sql` al día, comprobado por la prueba).
- **PYA quick · 97,1/100 (A):** feed 2026-10, 0 coincidencias, 0 IOC, `npm audit` 0. vuln 100, dependencias 100, amenazas 100, secretos 100 (esta vez sin tocar el `.env`), permisos 86.
  - Medio · login sin freno → **CB-28** (enmienda 1, firmada por Martín).
  - Medio · marca de actividad sin dueño → **atada a la cuenta**.
  - Medio (amenazas) / Bajo (permisos) · `limpiar_pruebas()` viajaría a producción con `global.sql` → Martín decidió dejarla en esta base de desarrollo y limpiar todo al final → **OB-48** en el cierre.
  - Medio (vuln) · cookies sin cifrar si se abre a la red sin HTTPS → **el servidor no arranca así** (salvo `ACEPTO_RED_SIN_HTTPS=si`).
  - Bajo · si Supabase falla al cerrar sesión → **respaldo**: `cerrar_sesiones` con la llave del servidor y borrado de las cookies `sb-`.
  - Bajo · el hilo del censo sin "red" mientras espera → **listeners permanentes** de `error` y `exit`.
  - Bajo · cookies de Supabase sin `__Host-` → **con `__Host-` al publicar**.
  - Bajo · `leerCenso` aceptaba la ruta de un script → **`leerCenso(buffer)` sin opciones**; `leerCensoParaPruebas` solo acepta `test/ayudantes/`.
  - Info · rutas sin puerta por defecto → **todo cerrado por defecto** + `requiereRol`.
  - Queda anotado: Supabase no vence sola una sesión inactiva en el servidor (Hallazgos).
- **Qué falló y cómo se arregló:**
  1. **El comando de cmd.** Martín usa cmd: se le dieron los comandos con `cd /d "…" && …` y quedó en la memoria.
  2. **RNF-01 rozaba los 3 s.** Medido: leer el archivo 0,1 s, revisar el zip 4 ms, **cargar ExcelJS en cada hilo nuevo 1,7 s**. Ahora el hilo se reutiliza y el segundo censo tarda 73 ms.
  3. **Una prueba intermitente** (2 de 3 corridas): cortaba el tiempo a 1 ms y, con el hilo ya caliente, a veces el archivo ganaba la carrera. Se reescribió con un hilo "dormido" que nunca contesta y con un censo de 2.000 filas.
  4. **La limpieza trataba como de prueba la cuenta de Martín** (`martin@prueba.test`): no se borró nada suyo (no tenía datos), pero se corrigió con `04` (solo `tst-…`) y una prueba en vivo que lo vigila.
  5. **Dos pruebas mías** esperaban comportamientos viejos: `/` ahora lleva directo al login, y "Cerrar sesión" sin abrir antes una página usaba el token de antes de entrar (lo rechazó: la protección funcionando).
- **Apagado:** el servidor se levantó con `node` directo y se apagó con la tarea (puerto 3000 libre); la ventana se cerró.

## Tanda 4 · 2026-11-10 · PC-HU-04

Obligaciones: OB-14 y OB-15, más `database/05-guardar-censo.sql` y el script de sesiones de prueba de Claude.

- **Suite:** `npm test` · **145 de 145**, estable en varias corridas. `npm run test:vivo` · **15 de 15**. `npm run revisar-base` · todo ✅ (incluye `guardar_censo`: existe, sin cuenta activa da 42501, un visitante no la puede usar).
- **Diseño:** "Leer censo" manda el archivo crudo (`express.raw`, tope de 5 MB al recibirlo, sin cuerpos comprimidos) y el servidor responde el resumen sin guardar nada; "Confirmar" manda el mismo archivo otra vez y recién ahí se guarda con `guardar_censo()` (censo + estancias + candidatos en una sola transacción, con los permisos de quien llama). El archivo nunca se escribe en el disco ni en la base (CL-02). Sin librerías nuevas.
- **Criterio por criterio:**
  - HU-04.1 · test: la línea "Censo del 06/11/2026 · 47 pacientes · N para revisar" (singular "1 paciente"), Quirófano no cuenta. Ventana: "Censo del 10/11/2026 · 52 pacientes · 13 para revisar" con un censo inventado.
  - HU-04.2 · test: leer no llama a la base; guardar llama una vez, solo con candidatos, y lleva a `/revision?dia=…`. En vivo: el flujo HTTP completo contra Supabase. Ventana: "Cancelar" volvió todo al principio y en la base **no** había censo del 10/11; "Confirmar" llevó a "Revisión del censo del 10/11/2026" con 13, y la base tenía 13 candidatos.
  - HU-04.3 · test (texto, vacío) + ventana (un `.xlsx` que en realidad es texto): "El archivo debe ser el censo en Excel (.xlsx)." y se puede elegir otro.
  - HU-04.4 · test: un `.xlsx` de otra cosa → mensaje exacto.
  - HU-04.5 · test: sin "Generado el", el resumen pide la fecha; hoy sirve, mañana no, una fecha que no existe no; con fecha en el archivo, la elegida se ignora; la página trae el selector con `value` y `max` = hoy. Ventana: el selector apareció con hoy, avisó que ya había censo del 10/11; al teclear 09/11 el aviso desapareció, y "Confirmar" guardó el censo del 09/11 (2 candidatos).
  - HU-04.6 · test: 5 MB exactos pasan el tope (y se rechazan por no ser .xlsx); 5 MB + 1 byte → 413 con el mensaje exacto, en leer y en guardar.
  - HU-04.7 · test + en vivo + ventana: "Ya hay un censo del … Se agregarán solo los pacientes nuevos; lo que ya se revisó se conserva."
  - CB-03 · en vivo: la segunda vez `guardar_censo` agrega solo el paciente nuevo, `ya_estaban` = 2 y la decisión "no_entrevistar" que ya existía sigue igual.
  - CB-04 · test: "3 filas no se pudieron leer (filas 9, 10 y 12).", singular, y más de 10 se cortan ("… y N más"). Nuevo: una cédula de más de 20 caracteres se salta (20 entra, 21 no); nombre, cama y piso se recortan al largo de la base.
  - CB-05 · test: "Una cédula aparece 2 veces; se tomó la fila 4." (uno por cédula, con el número de veces).
  - CB-06 a CB-08 · los del lector (tanda 1), siguen en verde.
  - RNF-01 · test HTTP: 300 filas al resumen en menos de 3 s (con el lector precalentado, como lo deja `server.js`).
  - RNF-04 · test: a la base solo llegan `cedula, fecha_ingreso, nombre, nombre_busqueda, piso, cama, dias, orden`, y ni la entidad ni los médicos inventados. En vivo: la fila de `estancias` solo tiene esas columnas.
  - RNF-09 / CL-07 · ventana a 360 y 390 px (ver "Qué falló").
- **Pruebas de las pruebas:** 9 roturas (leer que guarda, guardar a todos, mandar la edad, sin tope de 5 MB, fechas futuras, sin aviso de "ya existe", preferir la fecha elegida, `guardar_censo` con permisos de dueño, no saltar cédulas largas): todas detectadas.
- **Qué falló y cómo se arregló:**
  1. **La página se pasaba de lado a 390 px.** El selector de archivo tiene un ancho mínimo propio y la grilla se estiraba para que cupiera (406 px). Arreglo: `grid-template-columns: minmax(0, 1fr)` en las grillas y `width: 100%; min-width: 0` en los campos. Medido: 360 y 390 px sin desplazamiento.
  2. **Al teclear la fecha se perdían teclas** (quedaba 01/11 en vez de 09/11): cada parte completa de la fecha avisa un cambio, y el campo se bloqueaba mientras se pedía el resumen. Arreglo: el campo ya no se bloquea, el resumen se pide 400 ms después de la última tecla y solo se pinta el más reciente.
- **Sesiones de prueba de Claude (pedido de Martín):** `scripts/sesion-de-prueba.js` crea `claude-admin@prueba.test` y `claude-usuario@prueba.test` con contraseñas al azar (solo en `.env.pruebas`, que git ignora), entra con el login real y deja un archivo de sesión para `agent-browser state load`. Probado en la ventana: el usuario no ve "Usuarios" y el admin sí, sin escribir ninguna contraseña. Los archivos de sesión se borraron al terminar.
- **Datos que quedaron en la base de desarrollo** (inventados, a nombre de `martin@prueba.test`): censos del 10/11 (13 candidatos) y del 09/11 (2). Se van en la limpieza final (OB-48).
- **PYA quick · 100/100 (A)** (2026-11-11; tres revisores se cortaron por el límite de uso el 10/11 y se retomaron donde quedaron). Feed 2026-10, 0 coincidencias, 0 IOC, `npm audit` 0. Ningún revisor dejó hallazgos de su nivel; las observaciones menores se arreglaron o se anotaron:
  - Bajo (vuln, amenazas) · la redirección del JavaScript se podía engañar con `/\otro-sitio` → **arreglado**: se arma la URL y se compara el origen.
  - Info (vuln) · el nombre para buscar podía pasar de 200 al quitar las tildes (sílabas coreanas), y `.slice` podía partir un carácter especial → **arreglado**: `recortar()` por caracteres, y el nombre para buscar se recorta después de normalizar.
  - Bajo (vuln, permisos) · un archivo con fecha futura se aceptaba → **arreglado** con el mismo criterio de la fecha elegida (enmienda 2, firma pendiente).
  - Bajo/Medio (permisos) · el script de sesiones confiaba en el correo: si alguien hubiera creado antes `claude-admin@prueba.test`, el script lo volvía admin → **arreglado**: solo toca una cuenta si su id está guardado o si entra con la contraseña al azar que el script generó; se niega si el registro de cuentas está encendido.
  - Bajo/Medio (permisos) · el script y las pruebas en vivo se podían correr contra la base de la clínica → **arreglado**: solo con `ENTORNO=desarrollo` en el `.env` (se agregó al `.env` de Martín y a `.env.example`; `revisar-env` lo muestra).
  - Bajo (amenazas, vuln) · las cuentas `claude-*` quedan activas hasta la limpieza final → anotado en **OB-48**.
  - Anotados en Hallazgos: subidas grandes simultáneas en cola; `mode 0o600` sin efecto en Windows.
- **Después de los arreglos:** `npm test` **152 de 152**; 4 roturas nuevas detectadas (fecha futura, nombre para buscar sin recortar, cualquier entorno, adoptar cuentas ajenas). Una de las roturas salió "no detectada" la primera vez: el patrón de búsqueda tenía un paréntesis, que para `--test-name-pattern` es una expresión regular mal escrita y no corrió ninguna prueba; repetida con otro patrón, la prueba sí falló. `npm run test:vivo` **15 de 15**. El script reconoció las cuentas `claude-*` entrando con su contraseña y guardó sus ids.
- **Ventana, entrando como CLAUDE USUARIO PRUEBA** (sesión cargada, sin teclear contraseña): el censo con fecha de mañana dio "La fecha del censo (12/11/2026) es posterior a hoy. Revisa que sea el archivo correcto."; el censo del 10/11 otra vez avisó "Ya hay un censo…", y Confirmar llevó a la revisión con los mismos 13 (no se duplicó nada). Se cerró la sesión con el botón de la app, se apagó todo y se borró el archivo de sesión.

## Ventana entrando a mano · 2026-11-11 · PC-HU-01 (enmienda 3)

Martín autorizó que Claude entre escribiendo el correo y la contraseña de SU cuenta de prueba, como una persona, y lo miró en vivo. La contraseña se tomó de `.env.pruebas` dentro del comando (`"$(grep '^CLAUDE_USUARIO_CONTRASENA=' .env.pruebas | cut -d= -f2-)"`): nunca apareció en el chat ni en la pantalla. Ventana de 390 px.

- HU-01.1 · `/` sin sesión → "Iniciar sesión".
- HU-01.3 · `claude-usuario@prueba.test` + una contraseña equivocada → "Correo o contraseña incorrectos.", el correo se conserva y la contraseña se borra.
- HU-01.2 · con la contraseña correcta → "Entrevistas", "Hola, CLAUDE USUARIO PRUEBA.", menú sin "Usuarios", sin desplazamiento lateral.
- HU-01.5 · "Cerrar sesión" → login; el botón "atrás" se quedó en el login, sin nombre ni menú.
- HU-01.4 · cuenta desactivada en la base (la pantalla "Usuarios" aún no existe; se hizo con un script de un solo uso, ya borrado) → con la contraseña correcta: "Tu cuenta está desactivada. Habla con el administrador." y `/entrevistas` lleva al login (no quedó sesión).
- HU-02.6 · adentro, desactivada en la base, y un clic en "Censo" → `/login?motivo=desactivada` con el mensaje. La cuenta se reactivó.
- CB-28 · 5 contraseñas equivocadas → "Correo o contraseña incorrectos." las 5 veces; la 6.ª, la correcta → "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.". La cuenta de admin, en el mismo momento, entró bien y vio "Usuarios" (el freno es por cuenta). Al reiniciar el servidor, el freno (en memoria) se liberó.
- CB-29 · como admin en "Subir censo", con un archivo elegido y el servidor apagado → "No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.", el archivo sigue elegido y "Leer censo" queda activo.
- **Cierre:** se encendió el servidor otra vez, se cerró la sesión del admin con el botón, se cerró la ventana y se apagó todo. `npm test` 152/152.
- **Regla nueva escrita:** `~/.claude/CLAUDE.md`, la skill `navegador-visible` (sección "Escribir el login con una cuenta de prueba de Claude") y la memoria `feedback_cuentas_de_prueba_de_claude`.

## Tanda 5 · 2026-11-11 · PC-HU-05 y PC-HU-06

- **Aclaración antes de construir (Martín, con botones):** un paciente sin decidir en un censo viejo que después se decidió en un censo posterior aparece en "Ya revisados" del viejo, con esa decisión y "Se decidió en el censo del …", y no cuenta en el aviso de HU-05.5. Así nadie lo verifica dos veces.
- **Diseño:** `database/06-revision.sql` (+ `global.sql`, CL-11): `por_revisar()` (la regla, en un solo lugar), `revision_del_censo()` (toda la pantalla en una consulta; los pendientes de días anteriores se cuentan en la base porque Supabase corta en 1.000 filas) y `decidir_candidato()` (pone en fila las decisiones del mismo paciente con `for update` sobre la estancia y compara con lo que la pantalla mostraba: gana el primero, CB-16). Las tres con `security invoker`. El guardia de candidatos ya no deja que una decisión vuelva a "sin decidir". Martín lo pegó; `npm run revisar-base` ✅ (sección 5 nueva).
- **Pantalla:** `lib/revision.js` (pura) arma grupos, conteos y textos; `views/revision.ejs` + `partes/revision-lista.ejs` + `partes/decidir.ejs`; cada botón es un formulario de verdad (sin JavaScript recarga la página), y `public/js/revision.js` decide sin recargar: manda la decisión, pide otra vez la página y cambia solo `#revision-lista`. Botones desactivados mientras guarda (CB-24) y 700 ms quietos después de cambiar la lista, para que un doble toque no decida por el paciente que queda bajo el dedo. "Revisión" entró al menú (HU-05.1).
- **Pruebas:** `npm test` 183/183 (152 de antes, menos 1 de la página provisional, más 32 nuevas: `test/revision.test.js` 12, `test/revision-rutas.test.js` 17 y 3 en `base.test.js`); `npm run test:vivo` 23/23 (8 nuevas: verde, rojo, cambiar, entrevista hecha, dos personas A LA VEZ con `Promise.all`, doble toque a la vez, la regla de la base con dos censos, cuenta desactivada y visitante, y que una decisión no vuelve a "sin decidir"). Las pruebas en vivo nuevas van ANTES de la que cierra las sesiones de "ana" (si no, "ana" ya no está activa: pasó en la primera corrida).
- **Pruebas de las pruebas:** 13 roturas a propósito, 13 detectadas. Una ("Ya revisados" abierto en vez de plegado) no se detectaba: se reforzó la prueba y ya la detecta.
- **Ventana (navegador-visible), entrando a mano como CLAUDE USUARIO PRUEBA** (correo y contraseña escritos; la contraseña tomada de `.env.pruebas` dentro del comando). El puerto 3000 lo tenía otra app de Martín ("Hojas"), así que entrevistas corrió en el **3100**. Datos de apoyo por API con claude-admin (script de un solo uso, ya borrado): un censo del 01/11 sin candidatos y uno del 02/11 con un paciente entrevistado y otro sin decidir.
  - HU-05.1 · "Revisión" en el menú → censo del 10/11 (el más reciente) con el selector (10/11, 09/11, 02/11, 01/11); con el selector se fue al 02/11 y al 01/11.
  - HU-05.5 · "El censo del 09/11/2026 tiene 2 pacientes sin revisar." y "El censo del 02/11/2026 tiene 1 paciente sin revisar."; el enlace llevó al 09/11 con sus 2.
  - HU-05.2 · grupos con conteo ("Observacion · 5"…), cada uno con cama, nombre, cédula y "Día 0/1".
  - HU-06.2 · "Entrevistar" en LUIS ENSAYO INVENTADO → sin recargar (una marca puesta en la página siguió), "🟢 LUIS ENSAYO INVENTADO pasó a «Ya revisados».", "Ya revisados (1)" plegado, el foco al paciente siguiente; por API, su entrevista quedó **pendiente**.
  - **Falla encontrada en la ventana:** al decidir al primero de "Observacion", el grupo saltó al 4.º lugar (el orden de los servicios se calculaba solo con los que quedaban). **Arreglo:** el orden de los servicios sale de todo el censo (`ordenDeServicios`), con su prueba (y su rotura detectada). Recargado: "Observacion · 4" volvió al primer lugar.
  - HU-06.3 · "No entrevistar" en CAMILA MUESTRA MUESTRA → sin recargar, 🔴; por API, sin entrevista.
  - HU-05.3 · "Ya revisados (2)" al abrirlo: "🟢 Entrevistar · CLAUDE USUARIO PRUEBA · 11/11/2026 15:33" y "🔴 No entrevistar · … 15:35" (con la fecha, porque el censo es del 10/11).
  - HU-06.4 · "Cambiar decisión" en LUIS → "No entrevistar" → 🔴 con la hora nueva, "Ya revisados" siguió abierto; por API, la entrevista Pendiente se borró. En el 02/11, "Cambiar decisión" del entrevistado mostró "Este paciente ya tiene la entrevista hecha." y ningún botón.
  - HU-06.5 · claude-admin marcó en rojo por API a CAROLINA PRUEBA GÓMEZ mientras la ventana la mostraba sin decidir; "Entrevistar" en la ventana → "CLAUDE ADMIN PRUEBA ya revisó a este paciente." (aviso abajo, `role="alert"`) y la lista se actualizó con su 🔴; no se creó entrevista.
  - CB-24 · doble clic en "Entrevistar" de DIAS TEXTO PRUEBA → una sola decisión y una sola entrevista; FECHA EXCEL PRUEBA, que quedó debajo, siguió sin decidir.
  - HU-05.4 · el 01/11: "Este censo no tiene pacientes con día 0 o 1 para revisar."
  - RNF-09 · CB-23 · a 360×740, girado a 740×360, 768 y 1280 px: sin desplazamiento de lado (también con todo lo plegado abierto); lo más bajo que se toca mide 44 px.
  - Sin conexión · con el servidor apagado, "Entrevistar" → "No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.", los botones quedan activos y el paciente sigue en "Por revisar".
  - RNF-08 · los registros del servidor de toda la prueba: solo "Entrevistas en http://localhost:3100", ni nombres ni cédulas.
  - Cierre: "Cerrar sesión" con el botón → login, y `/revision` sin sesión lleva al login. Ventana cerrada, servidor apagado, scripts temporales borrados.
- **Datos que quedaron en la base de desarrollo** (inventados): decisiones de claude-usuario y claude-admin en el censo del 10/11 (LUIS 🔴, CAMILA 🔴, CAROLINA 🔴, DIAS 🟢 con su Pendiente) y los censos del 01/11 (vacío) y del 02/11 (uno entrevistado, uno sin decidir), subidos por claude-admin. Se van en la limpieza final (OB-48). Ojo para OB-48: la entrevista hecha del 02/11 no se borra con un `delete` común (el guardia la protege).
