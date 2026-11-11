# SRS · Entrevistas

> Versión 1.3 · **firmada** · 2026-11-06, con la enmienda 1 (CB-28, freno del login, 2026-11-09) y la enmienda 2 (HU-04.8 y 04.9, CB-29, 2026-11-11). Pacto: `docs/pactos/2026-11-06-entrevistas.md`.
> Las respuestas de las dudas D1 a D5 ya entraron aquí; el detalle de cada una está en la sección 4 del pacto.
> Cómo se prueba cada criterio va en el archivo del pacto.

## Índice

1. Visión general · 2. Roles y permisos · 3. Requerimientos funcionales · 4. Requerimientos no funcionales · 5. Arquitectura y restricciones · 6. Casos borde · Anexo A

### Glosario

| Término | Significado |
|---|---|
| **Censo** | El Excel "Censo Consolidado de Camas" que se descarga del sistema de la clínica. Tiene una sola hoja: la fila 1 dice "Censo Consolidado de Camas - Generado el: DD/MM/AAAA" y la fila 3 trae los encabezados (Piso, Cama Asignada, Identificación, Nombre, Edad, Fecha Ingreso, N° Admisión, Días, Entidad, Médicos / Especialistas, Siniestro, Consumo con siniestro). |
| **Día del censo** | La fecha de "Generado el" del censo. Cada censo subido es un día. |
| **Servicio** | La columna "Piso" del censo: Hospitalización A, B, C y D, UCI, Observación y Quirófano. |
| **Días** | La columna "Días" del censo: cuántos días lleva el paciente desde su fecha de ingreso. |
| **Candidato** | Un paciente del censo con día 0 o 1, de cualquier servicio menos Quirófano (RN-01). |
| **Revisión** | Cuando un usuario mira cada candidato (y lo verifica en el sistema de la clínica) y decide si se entrevista. |
| **Entrevistar (verde) / No entrevistar (rojo)** | Las dos decisiones de la revisión. Rojo se usa, por ejemplo, cuando el paciente no viene por accidente de tránsito. |
| **Estancia** | Una hospitalización de una persona: misma cédula y misma fecha de ingreso (RN-02). Si la persona vuelve a ingresar otro día, es otra estancia. |
| **Entrevista** | Los datos del accidente que se le preguntan al paciente o a su familiar. Hay una por estancia en verde. |
| **Estado de la entrevista** | **Pendiente** (falta hacerla), **Entrevistado** (guardada con los datos obligatorios) o **Salió** (el paciente se fue sin entrevista). |
| **Declaración** | Cómo pasó el accidente: un **tipo** (C/M, P/M, C/A, P/A, Peatón, Ciclista, Otro) y un **relato** corto. |
| **C/M · P/M · C/A · P/A** | Conductor de moto · Pasajero de moto · Conductor de automóvil · Pasajero de automóvil. |
| **Sistema de la clínica** | El software donde se verifica a cada paciente y adonde se pasan las entrevistas copiando y pegando. Este proyecto no se conecta con él. |
| **Administrador / Usuario** | Los dos roles (sección 2). |

## 1. Visión general del proyecto

### 1.1 Problema que resuelve

Hoy, cada día, se mira el censo, se buscan a mano los pacientes con día 0 y 1 de Observación, Piso y UCI, se verifica en el sistema de la clínica si vienen por accidente de tránsito y se arma una hoja impresa ("CENSO: OBSERVACIÓN - PISO Y UCI"). Las entrevistas se escriben a mano en esa hoja y después se pasan, también a mano, al sistema de la clínica. Es fácil entrevistar dos veces a la misma persona (con día 0 un día y con día 1 al siguiente), las hojas se pierden y no hay cómo buscar lo que se anotó.

### 1.2 Objetivo general

Que el equipo suba el censo en Excel, el sistema le saque los candidatos del día, el equipo decida en verde o rojo a quién se entrevista, haga las entrevistas desde el celular, las encuentre después por cédula o nombre para copiarlas al sistema de la clínica y descargue la hoja de cada día con el formato de siempre.

### 1.3 Objetivos medibles

| ID | Objetivo | Cómo se verifica |
|---|---|---|
| **O1** | Del archivo del censo a la lista de revisión en menos de 1 minuto. | Cronometrar subir y confirmar un censo de prueba. |
| **O2** | Ninguna estancia se entrevista dos veces. | RN-02 a RN-04, con sus pruebas. |
| **O3** | Una entrevista se llena desde un celular de 360 px sin hacer zoom ni desplazarse de lado. | CL-07 y RNF-09. |
| **O4** | Una entrevista se encuentra por cédula en menos de 10 segundos. | HU-13. |
| **O5** | La hoja descargada de un día trae las columnas, los títulos y el orden de la hoja impresa. | HU-15. |

### 1.4 Alcance del sistema

**Incluye:** inicio de sesión, cuentas con dos roles, subida del censo en Excel, filtro de candidatos, revisión en verde y rojo con memoria de lo ya decidido, lista de entrevistas por estado, formulario de entrevista para celular, "Salió", corrección de entrevistas, búsqueda por cédula o nombre, vista con botón de copiar por campo y descarga del Excel de un día.

**No incluye:** ver sección 3.N.

## 2. Roles y permisos de usuario

### 2.1 Roles

Son unas 4 personas y todas hacen el mismo trabajo. Cualquiera puede hacer cualquier entrevista.

- **Usuario:** sube el censo, revisa, entrevista, busca, corrige y descarga.
- **Administrador:** hace todo lo del usuario y, además, gestiona las cuentas. Así las cuentas no dependen de alguien que sepa entrar a Supabase (por ejemplo, cuando Martín termine su práctica).

### 2.2 Matriz de permisos

| Acción | Usuario | Administrador |
|---|---|---|
| Subir el censo y revisar candidatos | ✅ | ✅ |
| Ver, llenar y corregir entrevistas; marcar "Salió" | ✅ | ✅ |
| Buscar, ver y copiar entrevistas | ✅ | ✅ |
| Descargar el Excel de un día | ✅ | ✅ |
| Cambiar su propia contraseña | ✅ | ✅ |
| Ver el menú "Usuarios" y los botones de administración | — (no se le muestran) | ✅ |
| Crear, editar, desactivar, reactivar y borrar cuentas, y restablecer contraseñas (siempre confirmando con su contraseña, RN-11) | — | ✅ |

## 3. Requerimientos funcionales

### 3.0 Resumen

| HU | Título | Módulo | Prioridad |
|---|---|---|---|
| HU-01 | Iniciar y cerrar sesión | F1 Acceso y cuentas | Must |
| HU-02 | Gestionar cuentas | F1 Acceso y cuentas | Must |
| HU-03 | Cambiar mi contraseña | F1 Acceso y cuentas | Should |
| HU-04 | Subir el censo del día | F2 Censo y revisión | Must |
| HU-05 | Ver los candidatos por servicio | F2 Censo y revisión | Must |
| HU-06 | Decidir en verde o rojo | F2 Censo y revisión | Must |
| HU-07 | Recordar un rojo anterior | F2 Censo y revisión | Must |
| HU-08 | Ver las entrevistas por estado | F3 Entrevistas | Must |
| HU-09 | Llenar la entrevista | F3 Entrevistas | Must |
| HU-10 | Marcar que el paciente salió | F3 Entrevistas | Must |
| HU-11 | Corregir una entrevista guardada | F3 Entrevistas | Must |
| HU-12 | Pendientes al día con el último censo | F3 Entrevistas | Should |
| HU-13 | Buscar por cédula o nombre | F4 Consulta y descarga | Must |
| HU-14 | Ver una entrevista y copiar sus campos | F4 Consulta y descarga | Must |
| HU-15 | Descargar el Excel de un día | F4 Consulta y descarga | Must |

### Reglas de datos

- **Cédula:** se guarda tal como viene del censo, sin espacios ni puntos. Puede traer letras (pasaportes).
- **Nombre:** se guarda en mayúsculas, sin espacios dobles ni al principio o al final.
- **Edad (entrevista):** número entero de 0 a 120. No se copia del censo: se escribe.
- **Fecha del accidente:** DD/MM/AAAA, que exista y que no sea posterior a hoy. **Hora del accidente:** HH:MM.
- **Teléfono:** solo números, de 7 a 10 dígitos.
- **Placa:** letras y números, hasta 7 caracteres; se guarda en mayúsculas y sin espacios. Si no se sabe, se marca "No sabe".
- **Relato:** hasta 500 caracteres.
- **Fechas y horas** del sistema: hora de Colombia (America/Bogota). Se muestran como DD/MM/AAAA y HH:MM.

### Reglas de negocio

| ID | Regla |
|---|---|
| **RN-01** | **Candidato:** fila del censo con Días igual a 0 o 1 y cuyo servicio no es Quirófano (sin importar mayúsculas ni tildes). |
| **RN-02** | **Estancia:** misma cédula y misma fecha de ingreso son la misma estancia. Otra fecha de ingreso es otra estancia (otro accidente), y se revisa y se entrevista de nuevo. No se usa el N° de admisión: en los censos reales cambia en estancias largas sin que haya un ingreso nuevo. |
| **RN-03** | Una estancia que ya tiene entrevista (en cualquier estado) no vuelve a "Por revisar": aparece en "Ya revisados". |
| **RN-04** | Una estancia que se marcó en rojo en un censo anterior vuelve a "Por revisar" cuando aparece como candidata, con el aviso de HU-07. |
| **RN-05** | Verde crea la entrevista de esa estancia en estado Pendiente, ligada al día del censo en que se decidió. Rojo no crea entrevista. |
| **RN-06** | Estados: Pendiente → Entrevistado (al guardar con los datos obligatorios) o Salió. Salió puede volver a Pendiente ("Deshacer"). Entrevistado no vuelve a Pendiente; se corrige (HU-11). |
| **RN-07** | Una decisión se puede cambiar mientras la entrevista no esté en Entrevistado. Pasar de verde a rojo borra la entrevista Pendiente o Salió de esa estancia. |
| **RN-08** | Cada decisión, entrevista, cambio de estado y corrección guarda quién lo hizo y cuándo. |
| **RN-09** | Los candidatos y los pendientes se muestran agrupados por servicio, en el orden del censo, y dentro de cada servicio en el orden de las filas del censo. |
| **RN-10** | Los datos obligatorios para pasar a Entrevistado son: edad, fecha del accidente, lugar del accidente, tipo de declaración y relato. Los demás son opcionales. |
| **RN-11** | Toda acción sobre cuentas (crear, editar, desactivar, reactivar, borrar y restablecer contraseña) pide la contraseña del administrador que la hace. 5 contraseñas equivocadas seguidas en 15 minutos cierran su sesión con "Demasiados intentos. Vuelve a iniciar sesión." |
| **RN-12** | Una cuenta se puede borrar solo si nunca subió un censo, nunca decidió un candidato y nunca hizo, corrigió ni marcó una entrevista. Si no, solo se desactiva, para no perder quién hizo cada cosa. |
| **RN-13** | **En curso:** al abrir una entrevista pendiente queda "En curso · [nombre]" para los demás, hasta que se guarde, se marque "Salió", se salga del formulario o pasen 15 minutos. No bloquea: otra persona puede abrirla igual, con aviso. |

### 3.1 Módulo Acceso y cuentas (F1)

#### HU-01 · Iniciar y cerrar sesión · **Must**

> Como **usuario**, quiero entrar con mi correo y mi contraseña para que solo el personal autorizado vea los datos de los pacientes.

**Criterios de aceptación**

1. **Dado** que no he iniciado sesión, **cuando** abro cualquier página del sistema, **entonces** me lleva a "Iniciar sesión".
2. **Dado** una cuenta activa, **cuando** escribo el correo y la contraseña correctos, **entonces** entro a "Entrevistas".
3. **Dado** un correo que no existe o una contraseña equivocada, **cuando** toco "Entrar", **entonces** veo "Correo o contraseña incorrectos." (el mismo mensaje en los dos casos).
4. **Dado** una cuenta desactivada, **cuando** intento entrar, **entonces** veo "Tu cuenta está desactivada. Habla con el administrador."
5. **Dado** que estoy dentro, **cuando** toco "Cerrar sesión", **entonces** vuelvo a "Iniciar sesión", y el botón "atrás" del navegador no muestra datos de pacientes.
6. **Dado** que pasaron 8 horas sin usar el sistema, **cuando** hago cualquier acción, **entonces** me lleva a "Iniciar sesión" con el aviso "Tu sesión se cerró por inactividad."

#### HU-02 · Gestionar cuentas · **Must**

> Como **administrador**, quiero crear, editar, desactivar, reactivar y borrar cuentas, y restablecer contraseñas, para controlar quién entra sin depender de Supabase.

**Criterios de aceptación**

1. **Dado** que soy administrador, **cuando** abro "Usuarios", **entonces** veo cada cuenta con nombre, correo, rol (Administrador o Usuario) y estado (Activa o Desactivada).
2. **Dado** cualquier acción sobre una cuenta (crear, editar, desactivar, reactivar, borrar o restablecer contraseña), **cuando** la confirmo, **entonces** la página me pide "Escribe tu contraseña para confirmar", y no se hace nada hasta que la escribo bien (RN-11).
3. **Dado** el formulario "Nueva cuenta" con nombre, correo, rol y una contraseña temporal de al menos 8 caracteres, **cuando** confirmo con mi contraseña, **entonces** veo "Cuenta creada." y la persona puede entrar con esa contraseña temporal.
4. **Dado** un correo que ya tiene cuenta, **cuando** toco "Crear", **entonces** veo "Ya existe una cuenta con ese correo." y no se crea nada.
5. **Dado** una cuenta, **cuando** cambio su nombre o su rol y confirmo con mi contraseña, **entonces** veo "Cambios guardados."
6. **Dado** una cuenta activa, **cuando** toco "Desactivar", **entonces** la página pregunta "¿Desactivar la cuenta de [nombre]? No podrá entrar hasta que la reactives.", y al confirmar con mi contraseña esa persona ya no puede entrar (HU-01.4). Si tenía una sesión abierta, en su siguiente acción sale con ese mismo mensaje.
7. **Dado** una cuenta desactivada, **cuando** toco "Reactivar" y confirmo con mi contraseña, **entonces** vuelve a poder entrar con su contraseña de antes.
8. **Dado** una cuenta sin actividad (RN-12), **cuando** toco "Borrar", **entonces** la página pregunta "¿Borrar la cuenta de [nombre]? Esto no se puede deshacer.", y al confirmar con mi contraseña veo "Cuenta borrada." En una cuenta con actividad el botón "Borrar" no aparece, y si el formulario se envía igual, el servidor responde "Esta cuenta ya tiene revisiones o entrevistas: desactívala en vez de borrarla."
9. **Dado** cualquier cuenta, **cuando** escribo una contraseña temporal nueva y confirmo con mi contraseña, **entonces** veo "Contraseña cambiada. Dásela a [nombre] en persona."
10. **Dado** que escribo mal mi contraseña al confirmar, **cuando** toco "Confirmar", **entonces** veo "Tu contraseña no es correcta. No se hizo ningún cambio."
11. **Dado** que soy usuario (no administrador), **cuando** veo el menú, **entonces** no aparece "Usuarios" ni ningún botón de administración; y si abro la dirección de "Usuarios" o envío uno de sus formularios, veo "No tienes permiso para ver esta página." y no cambia nada.

#### HU-03 · Cambiar mi contraseña · **Should**

> Como **usuario**, quiero cambiar mi contraseña para dejar de usar la temporal que me dio el administrador.

**Criterios de aceptación**

1. **Dado** "Mi cuenta", **cuando** escribo la contraseña actual correcta y una nueva de al menos 8 caracteres dos veces, **entonces** veo "Contraseña cambiada."
2. **Dado** una contraseña actual equivocada, **cuando** toco "Cambiar", **entonces** veo "La contraseña actual no es correcta."
3. **Dado** que las dos contraseñas nuevas no coinciden, **cuando** toco "Cambiar", **entonces** veo "Las contraseñas nuevas no coinciden."

### 3.2 Módulo Censo y revisión (F2)

#### HU-04 · Subir el censo del día · **Must**

> Como **usuario**, quiero subir el Excel del censo para que el sistema saque solo a los pacientes con día 0 o 1.

**Criterios de aceptación**

1. **Dado** el censo en `.xlsx`, **cuando** lo elijo en "Censo" y toco "Leer censo", **entonces** veo un resumen antes de guardar, por ejemplo "Censo del 06/11/2026 · 47 pacientes · 12 para revisar", con los botones "Confirmar" y "Cancelar".
2. **Dado** el resumen, **cuando** toco "Confirmar", **entonces** se guardan los candidatos (RN-01, solo con los datos de CL-02) y paso a la revisión de ese día. Si toco "Cancelar", no se guarda nada.
3. **Dado** un archivo que no es `.xlsx`, **cuando** toco "Leer censo", **entonces** veo "El archivo debe ser el censo en Excel (.xlsx)."
4. **Dado** un `.xlsx` en cuyas primeras 10 filas no están los encabezados Piso, Cama Asignada, Identificación, Nombre, Fecha Ingreso y Días, **cuando** toco "Leer censo", **entonces** veo "Este archivo no parece el censo consolidado: no encontré las columnas Piso, Cama Asignada, Identificación, Nombre, Fecha Ingreso y Días."
5. **Dado** un censo sin la fecha "Generado el" en la fila 1, **cuando** veo el resumen, **entonces** dice "No encontré la fecha del censo. Elígela:" con un selector de fecha que trae la fecha de hoy. Si la fecha elegida no existe o es posterior a hoy, el resumen dice "Elige una fecha del censo que exista y que no sea posterior a hoy." y no se puede guardar. (Enmienda 2.)
6. **Dado** un archivo de más de 5 MB, **cuando** toco "Leer censo", **entonces** veo "El archivo pesa más de 5 MB. El censo normal pesa mucho menos: revisa que sea el archivo correcto."
7. **Dado** que ya se subió un censo de ese mismo día, **cuando** veo el resumen, **entonces** dice "Ya hay un censo del 06/11/2026. Se agregarán solo los pacientes nuevos; lo que ya se revisó se conserva."
8. **Dado** un censo cuya fecha "Generado el" es posterior a hoy, **cuando** toco "Leer censo" o "Confirmar", **entonces** veo "La fecha del censo (12/11/2026) es posterior a hoy. Revisa que sea el archivo correcto." y no se guarda nada. (Enmienda 2.)
9. **Dado** que no elegí ningún archivo, **cuando** toco "Leer censo", **entonces** veo "Elige el archivo del censo." (Enmienda 2.)

#### HU-05 · Ver los candidatos por servicio · **Must**

> Como **usuario**, quiero ver los candidatos agrupados por servicio para revisarlos uno por uno.

**Criterios de aceptación**

1. **Dado** que hay censos subidos, **cuando** abro "Revisión", **entonces** veo el censo más reciente, con un selector para elegir otro día.
2. **Dado** un censo con candidatos, **cuando** lo veo, **entonces** la sección "Por revisar" los agrupa por servicio (RN-09) con un conteo por grupo ("Observación · 9"), y cada candidato muestra cama, nombre, cédula y "Día 0" o "Día 1".
3. **Dado** candidatos ya decididos, **cuando** veo el censo, **entonces** aparecen abajo, en "Ya revisados (N)", plegados, cada uno con 🟢 o 🔴, quién decidió y a qué hora.
4. **Dado** un censo sin candidatos, **cuando** lo abro, **entonces** veo "Este censo no tiene pacientes con día 0 o 1 para revisar."
5. **Dado** que un censo anterior tiene candidatos sin decidir, **cuando** abro "Revisión", **entonces** veo el aviso "El censo del [fecha] tiene [N] pacientes sin revisar." con un enlace a ese día.

#### HU-06 · Decidir en verde o rojo · **Must**

> Como **usuario**, quiero marcar a cada candidato en verde o en rojo, después de verificarlo en el sistema de la clínica, para que solo los de accidente de tránsito pasen a entrevista.

**Criterios de aceptación**

1. **Dado** un candidato en "Por revisar", **cuando** lo veo, **entonces** tiene un botón verde "Entrevistar" y uno rojo "No entrevistar".
2. **Dado** un candidato, **cuando** toco "Entrevistar", **entonces**, sin recargar la página, pasa a "Ya revisados" con 🟢 y aparece en Entrevistas › Pendientes (RN-05).
3. **Dado** un candidato, **cuando** toco "No entrevistar", **entonces**, sin recargar la página, pasa a "Ya revisados" con 🔴 y no aparece en Entrevistas.
4. **Dado** un candidato en "Ya revisados", **cuando** toco "Cambiar decisión", **entonces** puedo pasarlo al otro color según RN-07. Si su entrevista ya está en Entrevistado, veo "Este paciente ya tiene la entrevista hecha." y no cambia nada.
5. **Dado** que otro usuario decidió sobre ese mismo candidato un momento antes, **cuando** toco un botón, **entonces** veo "[Nombre] ya revisó a este paciente." y la lista se actualiza con su decisión.

#### HU-07 · Recordar un rojo anterior · **Must**

> Como **usuario**, quiero que, si un paciente ya se marcó en rojo, el sistema me lo recuerde cuando vuelva a salir en otro censo, para no verificarlo dos veces sin saberlo.

**Criterios de aceptación**

1. **Dado** una estancia marcada en rojo en un censo anterior, **cuando** aparece como candidata en un censo nuevo, **entonces** sale en "Por revisar" con el aviso "El [fecha] se marcó como NO entrevistar (por [nombre])."
2. **Dado** ese aviso, **cuando** toco "Entrevistar" o "No entrevistar", **entonces** funciona igual que en HU-06.
3. **Dado** la misma cédula con otra fecha de ingreso (otra estancia, RN-02), **cuando** aparece como candidata, **entonces** no muestra el aviso.

### 3.3 Módulo Entrevistas (F3)

#### HU-08 · Ver las entrevistas por estado · **Must**

> Como **usuario**, quiero ver a quién falta entrevistar, a quién ya se entrevistó y quién salió, para organizar la ronda.

**Criterios de aceptación**

1. **Dado** que entro al sistema, **cuando** abro "Entrevistas", **entonces** veo las pestañas "Pendientes (N)", "Entrevistados" y "Salieron", con "Pendientes" abierta.
2. **Dado** entrevistas pendientes, **cuando** veo "Pendientes", **entonces** aparecen agrupadas por servicio (RN-09) con cama, nombre y cédula, y las que vienen de un censo anterior dicen "Desde el [fecha]".
3. **Dado** "Entrevistados" o "Salieron", **cuando** las abro, **entonces** veo las del censo más reciente, con un selector para elegir otro día.
4. **Dado** que todavía no se ha subido el censo de hoy (hora de Colombia), **cuando** abro "Entrevistas", **entonces** veo el aviso "Todavía no se ha subido el censo de hoy." con el botón "Subir censo".
5. **Dado** una entrevista pendiente, **cuando** la toco, **entonces** se abre su formulario (HU-09).
6. **Dado** una entrevista pendiente que otra persona abrió hace menos de 15 minutos (RN-13), **cuando** veo "Pendientes", **entonces** su fila dice "En curso · [nombre]".

#### HU-09 · Llenar la entrevista · **Must**

> Como **usuario**, quiero llenar la entrevista desde el celular al lado de la cama para no escribir en papel y volver a pasarlo.

**Criterios de aceptación**

1. **Dado** una entrevista pendiente, **cuando** la abro, **entonces** veo arriba, sin poder cambiarlos, la cama, el servicio, el nombre y la cédula.
2. **Dado** el formulario, **cuando** lo recorro, **entonces** tiene, en este orden: Edad, Fecha del accidente, Hora del accidente, Lugar del accidente, Dirección de residencia, Teléfono, Declaración (botones C/M, P/M, C/A, P/A, Peatón, Ciclista y Otro, más el campo "Relato") y Placa (con la casilla "No sabe").
3. **Dado** un celular, **cuando** toco Edad o Teléfono, **entonces** se abre el teclado numérico, y esos campos no aceptan letras.
4. **Dado** los datos obligatorios llenos (RN-10), **cuando** toco "Guardar entrevista", **entonces** pasa a Entrevistado, veo "Entrevista guardada." y vuelvo a "Pendientes".
5. **Dado** que falta un dato obligatorio, **cuando** toco "Guardar entrevista", **entonces** no se guarda, cada campo que falta dice "Falta este dato.", la página baja al primero de ellos y todo lo escrito sigue ahí.
6. **Dado** un dato fuera de las reglas, **cuando** toco "Guardar entrevista", **entonces** veo en ese campo "La edad debe estar entre 0 y 120.", "El teléfono debe tener entre 7 y 10 números.", "La fecha del accidente no puede ser posterior a hoy." o "La placa tiene hasta 7 letras o números.", según el caso.
7. **Dado** una placa escrita como "abc 12d", **cuando** se guarda, **entonces** queda "ABC12D".
8. **Dado** cambios sin guardar, **cuando** toco "Volver", **entonces** la página pregunta "Tienes cambios sin guardar. ¿Salir sin guardar?" con los botones "Seguir editando" y "Salir sin guardar".
9. **Dado** una entrevista "En curso" por otra persona (RN-13), **cuando** la abro, **entonces** veo "[nombre] está haciendo esta entrevista. ¿Abrirla igual?" con los botones "Abrir igual" y "Volver".

#### HU-10 · Marcar que el paciente salió · **Must**

> Como **usuario**, quiero marcar que un paciente se fue sin entrevista para que no siga apareciendo como pendiente.

**Criterios de aceptación**

1. **Dado** una entrevista pendiente, **cuando** toco "Salió" (en la lista o en el formulario), **entonces** la página pide confirmar con "¿Marcar que [nombre] salió sin entrevista?", y al confirmar pasa a "Salieron".
2. **Dado** una entrevista en "Salieron", **cuando** toco "Deshacer", **entonces** vuelve a "Pendientes".

#### HU-11 · Corregir una entrevista guardada · **Must**

> Como **usuario**, quiero corregir una entrevista ya guardada para arreglar un dato que se anotó mal.

**Criterios de aceptación**

1. **Dado** una entrevista en Entrevistado, **cuando** toco "Corregir", **entonces** se abre el formulario con sus datos, y al guardar con las mismas validaciones de HU-09 veo "Cambios guardados."
2. **Dado** una entrevista corregida, **cuando** la veo (HU-14), **entonces** dice "Hecha por [nombre] el [fecha hora] · Corregida por [nombre] el [fecha hora]".

#### HU-12 · Pendientes al día con el último censo · **Should**

> Como **usuario**, quiero que los pendientes de días anteriores muestren su cama actual para encontrarlos aunque los hayan cambiado de cama.

**Criterios de aceptación**

1. **Dado** una entrevista pendiente de un censo anterior, **cuando** se confirma un censo más reciente donde está esa estancia, **entonces** su fila muestra "Ahora en [cama] · [servicio]".
2. **Dado** una entrevista pendiente de un censo anterior, **cuando** se confirma un censo más reciente donde ya no está esa estancia, **entonces** su fila muestra "No está en el censo del [fecha]. ¿Salió?" con el botón "Salió".
3. **Dado** cualquier censo, **cuando** se actualizan los pendientes, **entonces** no se guarda nada de los pacientes del censo que no tienen entrevista pendiente (CL-02).

### 3.4 Módulo Consulta y descarga (F4)

#### HU-13 · Buscar por cédula o nombre · **Must**

> Como **usuario**, quiero buscar una entrevista por cédula o nombre para revisar lo que se anotó y pasarlo al sistema de la clínica.

**Criterios de aceptación**

1. **Dado** "Buscar", **cuando** escribo al menos 3 caracteres, **entonces** veo las entrevistas (en cualquier estado) cuya cédula empieza por lo escrito o cuyo nombre lo contiene, sin importar mayúsculas, tildes ni la ñ.
2. **Dado** resultados, **cuando** los veo, **entonces** cada uno muestra nombre, cédula, estado, cama y día del censo, del más reciente al más antiguo.
3. **Dado** que no hay coincidencias, **cuando** busco, **entonces** veo "No hay entrevistas con «[texto]»."
4. **Dado** menos de 3 caracteres, **cuando** busco, **entonces** veo "Escribe al menos 3 letras o números."

#### HU-14 · Ver una entrevista y copiar sus campos · **Must**

> Como **usuario**, quiero ver una entrevista con un botón de copiar en cada campo para pasarla al sistema de la clínica sin volver a escribirla.

**Criterios de aceptación**

1. **Dado** una entrevista, **cuando** la abro, **entonces** veo cada campo con su nombre, su valor y un botón "Copiar".
2. **Dado** un campo, **cuando** toco "Copiar", **entonces** su valor queda en el portapapeles y el botón dice "Copiado" durante 2 segundos.
3. **Dado** un campo vacío, **cuando** veo la entrevista, **entonces** muestra "—" y no tiene botón "Copiar".
4. **Dado** la fecha y la hora del accidente, **cuando** las copio, **entonces** salen como "DD/MM/AAAA" y "HH:MM". La declaración se copia como "C/M - [relato]".
5. **Dado** una entrevista, **cuando** la veo, **entonces** muestra su estado y quién la hizo y cuándo (HU-11.2).

#### HU-15 · Descargar el Excel de un día · **Must**

> Como **usuario**, quiero elegir un día y descargar su hoja de entrevistas con el formato de la hoja impresa para entregarla o archivarla.

**Criterios de aceptación**

1. **Dado** "Entrevistas", **cuando** toco "Descargar Excel", **entonces** se abre una ventana "¿Qué día quieres descargar?" con los días de censo que tienen pacientes en verde, del más reciente al más antiguo.
2. **Dado** esa ventana, **cuando** elijo un día, **entonces** veo una vista previa de la hoja y el botón "Descargar".
3. **Dado** la vista previa, **cuando** toco "Descargar", **entonces** baja el archivo `entrevistas-AAAA-MM-DD.xlsx` con: fila 1 "CENSO: OBSERVACION - PISO Y UCI"; fila 2 el día en letras, como "VIERNES 6 DE NOVIEMBRE DEL 2026"; fila 3 los encabezados Num. Cama, Identificación, Nombre del Paciente, Edad, Fecha-Accidente, Lugar, Residencia y Teléfono, Declaración y Placa; y una fila por cada paciente en verde de ese día, en el orden de RN-09.
4. **Dado** un paciente Entrevistado, **cuando** sale en la hoja, **entonces** Fecha-Accidente dice "DD/MM/AAAA HH:MM", Residencia y Teléfono dice "[dirección] · [teléfono]", Declaración dice "C/M - [relato]" y Placa dice la placa o "No sabe".
5. **Dado** un paciente que Salió, **cuando** sale en la hoja, **entonces** la columna Lugar dice "Salió" y el resto de los datos de la entrevista va vacío. Un paciente Pendiente sale solo con cama, identificación y nombre.
6. **Dado** el archivo, **cuando** se abre en Excel, **entonces** abre sin avisos de reparación, con las tildes y la ñ bien escritas, y está listo para imprimir en horizontal, ajustado al ancho de una hoja carta.

### 3.N Won't have (descartado en esta versión)

- **Subir el censo en PDF.** Martín: "estoy hablando para que solo sea excel". El PDF parte los nombres y las fechas en varias líneas.
- **Las hojas 2 y 3 del formato** (información a familiares y seguimiento del 1 al 31). Martín: "solo la entrevista".
- **Quirófano** como servicio para entrevistar.
- **Usar entidad, siniestro, médicos o consumo** del censo (CL-02).
- **Conexión automática con el sistema de la clínica:** se pasa copiando y pegando (HU-14).
- **Trabajar sin conexión** ni guardar entrevistas en el celular.
- **Borrar entrevistas o censos** desde la aplicación.
- **"Copiar todo"** en un solo botón. Se puede agregar después si hace falta.
- **El diseño visual definitivo:** se define al final (decisión de Martín, 2026-11-06).

## 4. Requerimientos no funcionales

### 4.1 Rendimiento y tiempos de respuesta

| ID | Qué se exige | Cómo se mide |
|---|---|---|
| **RNF-01** | Leer un censo de hasta 300 filas y mostrar el resumen en menos de 3 segundos. | Prueba con un censo inventado de 300 filas, en el PC de desarrollo. |
| **RNF-02** | Las listas y la búsqueda responden en menos de 2 segundos con 2.000 entrevistas guardadas. | Prueba con 2.000 entrevistas inventadas. |

### 4.2 Seguridad y privacidad de datos

| ID | Qué se exige | Cómo se mide |
|---|---|---|
| **RNF-03** | Ninguna página ni ruta de datos responde sin sesión iniciada, y los permisos se validan en el servidor y con RLS (CL-03). | Pruebas de cada ruta sin sesión y con rol Usuario. |
| **RNF-04** | Solo se guardan los datos del censo de CL-02, y el archivo del censo no se guarda en el disco ni en la base. | Prueba que revisa lo guardado después de subir un censo. |
| **RNF-05** | El navegador nunca recibe llaves de Supabase: todo pasa por el servidor (CL-04). | Revisión del HTML y del JS que llegan al navegador. |
| **RNF-06** | Las cookies de sesión son `HttpOnly` y `SameSite=Lax` (y `Secure` al publicar con HTTPS), y los formularios que cambian datos llevan token anti-falsificación. | Prueba de un envío sin token y revisión de las cabeceras. |
| **RNF-07** | La sesión se cierra después de 8 horas sin uso (HU-01.6). | Prueba con el reloj adelantado. |
| **RNF-08** | Los registros del servidor no incluyen nombres, cédulas ni datos de las entrevistas. | Revisión de los registros después de un recorrido completo. |

### 4.3 Usabilidad y diseño UX/UI

| ID | Qué se exige | Cómo se mide |
|---|---|---|
| **RNF-09** | Cada pantalla funciona desde 360 px de ancho sin desplazamiento horizontal (salvo la vista previa del Excel, que se desplaza dentro de su ventana), con botones de al menos 44 px de alto (CL-07). | Ventana a 360, 768 y 1280 px. |
| **RNF-10** | Edad y Teléfono abren el teclado numérico en el celular. | Martín lo prueba en su celular. |
| **RNF-11** | Las confirmaciones ("Desactivar", "Salió", "Salir sin guardar") se muestran dentro de la página, no con ventanas del navegador. | Ventana. |
| **RNF-12** | El diseño es sencillo y provisional hasta el pase de diseño del final. | Decisión de Martín, 2026-11-06. |

### 4.4 Escalabilidad y disponibilidad

| ID | Qué se exige | Cómo se mide |
|---|---|---|
| **RNF-13** | Funciona en Chrome para Android, Safari para iPhone (versiones de los últimos 2 años) y Chrome o Edge de escritorio. | Ventana + celular de Martín. |
| **RNF-14** | El Excel descargado abre sin errores en Excel y en LibreOffice. | Abrir el archivo en los dos. |
| **RNF-15** | "Hoy" y todas las horas se calculan con la hora de Colombia, aunque el servidor esté en otra zona. | Prueba con otra zona horaria. |
| **RNF-16** | Antes de usar datos reales hay copias de seguridad de la base (el plan gratuito de Supabase no las hace a diario). | Se decide con la clínica antes del primer dato real (sección 5.6). |

## 5. Arquitectura técnica y restricciones

### 5.1 Decisión de arquitectura

El servidor arma las páginas (Express + EJS) y es el único que habla con Supabase. El navegador solo recibe HTML y un poco de JS para lo interactivo (verde y rojo sin recargar, copiar, la ventana de descarga). Así la base nunca queda expuesta al navegador, y es la misma forma de trabajo de `vigilancia_iso`.

Flujo diario: **subir censo → resumen → confirmar → revisión (verde / rojo) → pendientes → entrevista → buscar y copiar → descargar el día.**

### 5.2 Stack tecnológico

Node.js con Express 5 y EJS 7; Supabase (PostgreSQL + Auth) con `@supabase/supabase-js` y `@supabase/ssr`; `ExcelJS` para leer el censo y armar la descarga; `node --test` para las pruebas. Detalle y reglas en `docs/clausulas.md` (Stack fijo, CL-05).

### 5.3 Componentes

- **Lectura del censo:** una función sin base de datos que recibe el archivo y devuelve la fecha y las filas limpias (servicio, cama, cédula, nombre, fecha de ingreso, días). Se prueba sola.
- **Reglas:** quién es candidato, qué es la misma estancia, qué estado sigue a cuál, validaciones de la entrevista. Funciones puras, con pruebas.
- **Rutas:** acceso, cuentas, censo, revisión, entrevistas, búsqueda y descarga.
- **Armado del Excel:** una función que recibe las filas de un día y devuelve el `.xlsx`.

### 5.4 Modelo de datos

| Tabla | Qué guarda |
|---|---|
| `perfiles` | Una fila por cuenta de Supabase Auth: nombre, rol (administrador o usuario) y si está activa. |
| `censos` | Un día de censo: fecha (única), quién lo subió y cuándo. |
| `estancias` | Cédula, fecha de ingreso (únicas juntas, RN-02) y nombre. |
| `candidatos` | Una estancia en un censo: servicio, cama, días, orden en el archivo y decisión (sin decidir, entrevistar o no entrevistar), con quién y cuándo. Única por censo y estancia. |
| `entrevistas` | Una por estancia en verde: estado, los datos de la entrevista, el censo donde se decidió, la cama y el servicio actuales (HU-12), y quién y cuándo la hizo, la corrigió o marcó que salió. |

RLS activo en todas las tablas: sin acceso para visitantes y solo para cuentas activas. Las operaciones de cuentas (HU-02) usan la llave secreta, solo en el servidor.

### 5.5 Servicios de terceros e integraciones

- **Supabase:** base de datos y cuentas. Plan gratuito mientras se desarrolla.
- **Ninguna integración** con el sistema de la clínica.

### 5.6 Restricciones

- **Hosting:** lo da la clínica al final (CL-09). Debe correr Node.js LTS y tener HTTPS (el botón "Copiar" del navegador necesita HTTPS; ver CB-22).
- **Datos reales:** solo después de la auditoría completa (CL-06), de que la clínica confirme la autorización por escrito y de decidir las copias de seguridad (RNF-16). Mientras tanto, solo datos inventados (CL-01).
- **Supabase gratis:** permite 2 proyectos activos por cuenta y pausa un proyecto tras 7 días sin uso.
- **PC de desarrollo:** modesto (8 GB de RAM); no se instala Supabase local ni Docker.
- **Git:** lo maneja Martín. Claude no corre comandos de git que escriban.

## 6. Casos borde y excepciones

### 6.1 Conexión

| ID | Qué pasa si… | Cómo se comporta |
|---|---|---|
| **CB-01** | Se cae la conexión al guardar una entrevista. | Muestra "No se pudo guardar. Revisa la conexión e inténtalo de nuevo." y todo lo escrito sigue en el formulario. |
| **CB-02** | La sesión venció mientras se llenaba una entrevista. | Al guardar, muestra "Tu sesión se cerró. Toca «Iniciar sesión» (se abre en otra pestaña), entra y vuelve a tocar Guardar: lo que escribiste sigue aquí." Al volver a guardar, se guarda. |

### 6.2 Almacenamiento y datos

| ID | Qué pasa si… | Cómo se comporta |
|---|---|---|
| **CB-03** | Se sube dos veces el censo del mismo día. | Solo agrega los candidatos nuevos; las decisiones y las entrevistas existentes no cambian (HU-04.7). |
| **CB-04** | Una fila del censo no tiene cédula, o su "Días" está vacío o no es un número. | La salta, y el resumen dice "[N] filas no se pudieron leer (filas 14 y 30)." |
| **CB-05** | La misma cédula aparece dos veces en un censo. | Toma la primera fila, y el resumen dice "Una cédula aparece 2 veces; se tomó la fila [N]." |
| **CB-06** | "Días" viene como 1.0 o como texto "1". | Lo toma como 1. Si es negativo, salta la fila (CB-04). |
| **CB-07** | El servicio viene como "Quirofano", "QUIRÓFANO" o con espacios. | Igual se excluye (RN-01). |
| **CB-08** | Nombre con espacios dobles, cédula con puntos o cama con espacios al final (pasa en el censo real). | Se limpian según las reglas de datos. |
| **CB-09** | Se sube un censo de un día anterior al más reciente. | Se guarda como su día, pero no cambia la cama actual de los pendientes (HU-12 usa solo el censo más reciente). |
| **CB-10** | Un pendiente aparece en el censo nuevo con otra fecha de ingreso. | Es otra estancia (RN-02): sale como candidato nuevo, y el pendiente viejo muestra "No está en el censo…" (HU-12.2). |
| **CB-11** | Se intenta pasar a rojo un candidato cuya entrevista ya está en Entrevistado. | Se rechaza (HU-06.4), también si se envía el formulario a mano. |

### 6.3 Entrada de datos

| ID | Qué pasa si… | Cómo se comporta |
|---|---|---|
| **CB-12** | El relato pasa de 500 caracteres. | No deja escribir más y muestra el contador "500/500". |
| **CB-13** | En Edad o Teléfono se pega texto con letras o espacios. | Se quedan solo los números. |
| **CB-14** | Se marca "No sabe" en la placa con una placa ya escrita. | Se borra la placa y el campo queda bloqueado mientras "No sabe" esté marcada. |
| **CB-15** | La búsqueda trae caracteres especiales (`%`, `_`, comillas). | Se buscan como texto normal, sin errores. |

### 6.4 Interacción

| ID | Qué pasa si… | Cómo se comporta |
|---|---|---|
| **CB-16** | Dos usuarios deciden sobre el mismo candidato a la vez. | Gana el primero; el segundo ve HU-06.5. |
| **CB-17** | Dos usuarios guardan la misma entrevista a la vez. | Gana el primero; el segundo ve "[Nombre] guardó esta entrevista hace un momento. Recarga para ver sus datos." y no pisa nada. |
| **CB-18** | Se intenta desactivar al último administrador activo o pasarlo a Usuario. | Se rechaza con "Debe quedar al menos un administrador activo." |
| **CB-19** | Un administrador intenta desactivarse o borrarse a sí mismo. | Los botones no aparecen en su fila y el servidor lo rechaza con "No puedes desactivar ni borrar tu propia cuenta." |
| **CB-20** | Se abre la dirección de una entrevista que no existe. | Muestra "No encontramos esa entrevista." |
| **CB-21** | Se descarga un día cuyos pacientes en verde siguen todos pendientes. | El Excel sale igual, con solo cama, identificación y nombre (HU-15.5). |

### 6.5 Dispositivo y navegador

| ID | Qué pasa si… | Cómo se comporta |
|---|---|---|
| **CB-22** | El navegador no deja usar el portapapeles (página sin HTTPS o celular antiguo). | "Copiar" usa el método antiguo del navegador; si tampoco funciona, selecciona el texto y muestra "Mantén presionado para copiar." |
| **CB-23** | Se gira el celular o la tablet. | La pantalla se reacomoda sin perder lo escrito. |
| **CB-24** | Se toca dos veces seguidas "Guardar entrevista", "Entrevistar" o "No entrevistar". | Se procesa una sola vez (el botón se desactiva mientras guarda). |

### 6.6 Cuentas y "En curso"

| ID | Qué pasa si… | Cómo se comporta |
|---|---|---|
| **CB-25** | El administrador escribe mal su contraseña 5 veces seguidas en 15 minutos. | Se cierra su sesión con "Demasiados intentos. Vuelve a iniciar sesión." y no se hace ningún cambio (RN-11). |
| **CB-26** | Se envía a mano el formulario de borrar para una cuenta con actividad. | Se rechaza con el mensaje de HU-02.8 y la cuenta no cambia (RN-12). |
| **CB-27** | Alguien abre una entrevista y deja el celular sin guardar ni salir. | A los 15 minutos el "En curso" desaparece para los demás (RN-13). |

### 6.7 Inicio de sesión

| ID | Qué pasa si… | Cómo se comporta |
|---|---|---|
| **CB-28** | Se escriben 5 contraseñas equivocadas seguidas para la misma cuenta, o 20 desde el mismo equipo, dentro de 15 minutos (HU-01). | Esa cuenta o ese equipo se frena 15 minutos con "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.", aunque luego se escriba la contraseña correcta, y no se le pregunta a Supabase. Entrar bien deja la cuenta en cero. (Enmienda 1.) |
| **CB-29** | Se cae la conexión al leer o guardar el censo (HU-04). | Muestra "No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo." y el archivo elegido sigue ahí. (Enmienda 2.) |

## Anexo A: criterios de terminado

- [ ] Las historias **Must** cumplen todos sus criterios de aceptación.
- [ ] Los casos borde de las historias Must y los de todo el proyecto dan ✅. Los de historias Should (CB-09 y CB-10, de HU-12) se reportan, pero no frenan el cierre.
- [ ] Los RNF-01 a RNF-15 dan ✅ (RNF-16 se cumple antes del primer dato real, no al sellar).
- [ ] La revisión de seguridad de cada punto de control está hecha (CL-06).
- [ ] Lo que ya funcionaba sigue igual: suite completa en verde y recorrido en ventana de las pantallas tocadas.

### Historial de versiones

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-11-06 | Primera versión del documento, a partir de la conversación con Martín, el censo en Excel, el censo en PDF, el formato de entrevistas y la hoja escaneada. |
| 1.1 | 2026-11-06 | **Firmada.** Entran las respuestas de la letra chica: D1 "En curso" (RN-13, HU-08.6, HU-09.9, CB-27); D2 y D3 sin cambios; D4 borrar solo cuentas sin actividad (RN-12, HU-02.8, CB-26); D5 contraseña del admin en toda acción sobre cuentas (RN-11, HU-02.2 y 02.10, CB-25); editar nombre y rol (HU-02.5); el usuario no ve nada de administración (HU-02.11, CL-03). HU-02 se renumera (2 a 11). |
| 1.2 | 2026-11-09 | **Enmienda 1, firmada por Martín** ("Sí, con esos números"): entra CB-28, el freno de intentos del login (5 por cuenta o 20 por equipo en 15 minutos, bloqueo de 15 minutos y su mensaje). Sale de la revisión de seguridad (PYA) de la tanda 3. |
| 1.3 | 2026-11-11 | **Enmienda 2, firmada por Martín** ("si apruebo la enmienda 2"): HU-04.8 (un censo con fecha posterior a hoy se rechaza), HU-04.9 (sin archivo elegido), el texto de la fecha elegida que no sirve en HU-04.5 y CB-29 (sin conexión al leer o guardar el censo). Sale de la revisión de seguridad (PYA) de la tanda 4. |

<!-- Al firmar el pacto, las respuestas de la letra chica entran acá como una versión nueva. -->
