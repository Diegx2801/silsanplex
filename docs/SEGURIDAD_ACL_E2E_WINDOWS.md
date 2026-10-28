# Protección NTFS del archivo E2E

Fecha: 22 de octubre de 2026. Alcance: archivo local `frontend/.env.e2e.local` y su escritura por el preparador. No se ejecutó el preparador ni ninguna operación Supabase, Docker, migración o Playwright.

## Corrección efectiva

Se restringió únicamente la DACL del archivo existente, sin cambiar propietario, contenido ni contraseñas. La comparación SHA-256 antes/después, realizada en memoria sin imprimir contenido ni hashes, confirmó contenido idéntico. El archivo continúa ignorado por Git.

Propietario real: `DESKTOP-UH74C9R\ADMIN`, SID `S-1-5-21-4082610142-3186492986-105409988-1001`; coincide con el usuario de ejecución. Se obtuvo mediante la API de seguridad de archivos de .NET y se contrastó con `whoami /user`.

| Principal | Antes | Después |
| --- | --- | --- |
| Propietario, SID terminado en 1001 | Acceso por las reglas heredadas | FullControl explícito |
| SYSTEM, S-1-5-18 | FullControl heredado | FullControl explícito |
| Administradores, S-1-5-32-544 | FullControl heredado | FullControl explícito |
| Usuarios, S-1-5-32-545 | ReadAndExecute/Synchronize heredado | Sin ACE |
| Usuarios autenticados, S-1-5-11 | Modify/Synchronize heredado | Sin ACE |

La DACL efectiva tiene exactamente tres ACE Allow, ninguna heredada y `AreAccessRulesProtected=True`. El propietario conserva FullControl. No se agregaron reglas Deny que pudieran bloquear accidentalmente al propietario por pertenecer también a otros grupos.

## Respaldo exclusivamente de metadatos

Antes de la modificación efectiva se guardó y validó:

- DACL en `C:\Users\ADMIN\AppData\Local\Temp\silsanplex-e2e-acl-before-20261022.txt`, creada con `icacls /save`.
- Ruta del archivo, SID propietario y ruta del respaldo en `C:\Users\ADMIN\AppData\Local\Temp\silsanplex-e2e-acl-before-20261022.owner.json`.

El respaldo DACL contiene solo el nombre relativo `frontend/.env.e2e.local` y SDDL, en UTF-16LE sin BOM; se comprobó que representa los permisos amplios originales. No se copió el archivo de credenciales ni se generó un respaldo de su contenido. Ambos metadatos quedan fuera del repositorio.

Solo para una reversión expresamente necesaria, `icacls . /restore <respaldo>` desde la raíz del repositorio interpreta esa ruta relativa. No se ejecutó: restauraría los permisos inseguros previos. El propietario no se cambió y su SID está documentado por separado.

## Prevención al regenerar

El preparador escribía mediante `writeFileSync(..., mode: 0o600)`. Esa opción no configura una DACL privada NTFS y tampoco restringe por sí misma una ACL existente. Se sustituyó únicamente la llamada de escritura por `writePrivateE2eFile`; no se modificaron las operaciones de usuarios, membresías o fixtures Supabase del preparador.

En Windows, el helper:

1. Rechaza destinos que no sean archivos regulares o que tengan múltiples enlaces. PowerShell rechaza además reparse points.
2. Resuelve el propietario del archivo existente; para uno nuevo usa el SID de la identidad de Windows actual.
3. Crea un directorio temporal adyacente mediante la sobrecarga .NET que aplica la DACL privada en la creación. Solo propietario, SYSTEM y Administradores pueden acceder; los archivos heredan esas reglas desde el primer byte.
4. Recibe el contenido por stdin, nunca como argumentos o variables de entorno. Escribe UTF-8 sin BOM dentro del directorio privado y aplica la DACL protegida al archivo temporal.
5. Para reemplazar un archivo existente, restringe primero su DACL y usa `File.Replace` sin archivo de backup. Para uno inexistente, mueve el archivo privado al destino. Verifica propietario y las tres ACE efectivas.
6. Elimina solamente el archivo y directorio temporales generados, sin borrados recursivos. Si falla, comunica un error y no recurre a una escritura insegura.

No se solicita elevación ni se cambia propietario. La escritura de una DACL no intenta reasignar el mismo propietario, lo que exigiría innecesariamente WRITE_OWNER. Se usa .NET directamente, sin depender de los cmdlets del módulo PowerShell.Security. El reemplazo utiliza reflexión para pasar un null real al argumento de backup de `File.Replace` en Windows PowerShell; no se crea ninguna copia del contenido secreto.

Fuera de Windows se conserva la escritura con permisos POSIX 0600, restringiendo también el archivo si ya existe. Esa rama no se presenta como validada por esta ejecución Windows.

## Archivos modificados

- `backend/scripts/prepare-local-e2e.ts`: importa y usa la escritura privada; resto del flujo intacto.
- `backend/scripts/lib/private-e2e-file.ts`: interfaz TypeScript, validación del destino y ejecución Windows sin revelar entradas.
- `backend/scripts/lib/private-e2e-file.ps1`: manipulación/verificación de DACL y escritura privada.
- `backend/scripts/lib/private-e2e-file.test.ts`: pruebas reales de filesystem con contenido ficticio.
- Este informe.

La búsqueda de escritores de `.env.e2e.local` en los scripts identificó al preparador habitual como el escritor existente. El runner aislado 2C-3 no guarda credenciales en ese archivo y no se modificó.

## Validación ejecutada

| Comando o verificación | Resultado |
| --- | --- |
| `node --import tsx --test scripts/lib/private-e2e-file.test.ts`, desde backend | PASS, 4/4 pruebas reales NTFS, 0 omitidas |
| `npm run typecheck:scripts`, desde backend | PASS |
| Oxlint con `--deny-warnings` sobre los tres TypeScript afectados | PASS |
| `git diff --check` | PASS |
| `icacls frontend/.env.e2e.local` y modo inspect del helper | Tres ACE explícitas FullControl, herencia deshabilitada, propietario original |
| Hash del contenido real antes/después de restringir | Igual; sin mostrar valores |

Las pruebas usan directorios temporales con espacios y contenido ficticio. Cubren creación, reemplazo, UTF-8, conservación del propietario, restricción repetida de una ACL deliberadamente amplia, regeneración posterior, recreación después de borrar un archivo ficticio y rechazo de directorios/enlaces duros sin modificar contenido. Verifican los SID y ACE efectivos; no usan contraseñas de otros usuarios ni cuentas reales para impersonación.

Durante el desarrollo se corrigieron un problema de conversión de null en Windows PowerShell y la compatibilidad CommonJS del helper. El archivo real se corrigió con la DACL respaldada y las pruebas finales aprobadas; no se ejecutó una regeneración con sus credenciales reales.

## Riesgos residuales y rotación

La ACL anterior permitía lectura a otros usuarios locales; restringirla no revoca una copia que ya pudiera existir. No se investigó ni se afirma una extracción. Se recomienda una rotación posterior, autorizada y exclusivamente de las cuatro identidades referenciadas por `E2E_ADMIN`, `E2E_MEMBER`, `E2E_RECOVERY` y `E2E_REPAIRS`, especialmente si el equipo tuvo otros usuarios locales. No se imprimieron sus contraseñas ni se intentó autenticar con ellas. No corresponde cambiar por esta acción permisos funcionales ni contraseñas de usuarios empresariales ajenos.

No se rotaron credenciales. Propietario, administradores y SYSTEM mantienen acceso por diseño. La garantía de regeneración aplica al preparador corregido; una herramienta externa que escriba el archivo por otra vía debe respetar la misma política. No se amplió el alcance a ACL de todo el repositorio ni a otras configuraciones.

Esto resuelve el punto ACL del informe 2C-5; no resuelve sus otros requisitos pendientes de publicación y despliegue.

## Git y límites

HEAD conservado `8dc0b1a27f9fd39246515a95f058806aa2a6360a`, once commits locales por delante y cero por detrás de la referencia local `origin/main`. Índice vacío. Los cambios nuevos son únicamente los cinco archivos enumerados; `.codex/`, `output/`, respaldos de permisos y archivo de credenciales no se añadieron al índice. Sin commit ni push, fetch, cambios de datos, Docker, migraciones o nuevas fases.
