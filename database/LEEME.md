# Base de datos de Entrevistas

Regla del proyecto: **CL-11** (`docs/clausulas.md`).

| Archivo | Para qué sirve | Cuándo se pega en el SQL Editor de Supabase |
|---|---|---|
| `global.sql` | **La base completa** en un solo archivo. | En una base **nueva o vacía** (si se borró, o al pasar al Supabase de la clínica). Se pega entero y se corre una vez. |
| `01-esquema.sql` | Historial: las tablas, el RLS y las políticas. | Ya aplicado (2026-11-09). |
| `02-proteger-registros.sql` | Historial: los guardias (triggers) que ponen quién hizo cada cosa y protegen las entrevistas hechas. | Ya aplicado (2026-11-09). |
| `03-limpiar-pruebas.sql` | Historial: `limpiar_pruebas()`, que borra lo creado por las cuentas de prueba (para `npm run test:vivo`). Solo la usa el servidor. | Ya aplicado (2026-11-09). |
| `04-limpiar-solo-pruebas-automaticas.sql` | Historial: la limpieza solo toca las cuentas `tst-…@prueba.test` de las pruebas automáticas; las cuentas de desarrollo de las personas (`martin@prueba.test`, etc.) no se tocan. | Ya aplicado (2026-11-09). |
| `05-guardar-censo.sql` | Historial: `guardar_censo()`, que guarda el censo del día, sus estancias y sus candidatos en un solo paso (HU-04). Corre con los permisos de quien la llama. | Pendiente de aplicar. |

> Cuentas: las de desarrollo de las personas usan `…@prueba.test` (ese dominio nunca recibe correos). Las pruebas automáticas crean y borran cuentas `tst-…@prueba.test`: **no uses ese prefijo para una cuenta tuya**.

## Cómo se hace un cambio

1. Se crea el siguiente archivo numerado (`03-…sql`) con **solo el cambio**. Ese se revisa y se pega en la base que ya existe.
2. Se actualiza `global.sql` para que incluya el cambio, escrito ya en su forma final.
3. `npm test` comprueba que `global.sql` deje la base igual que aplicar `01`, `02`, `03`… en orden. Si falta algo, falla.
4. Después de pegar cualquiera de los dos, `npm run revisar-base` comprueba la base real.

## Qué NO hacer

- No pegar `global.sql` en una base que ya tiene tablas: falla con "already exists".
- No cambiar un archivo numerado que ya se aplicó: el cambio va en uno nuevo.
