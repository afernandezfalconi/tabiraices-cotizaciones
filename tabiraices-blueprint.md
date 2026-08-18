# TABIRÁ ICES — Blueprint de Endurecimiento y Gestión de Usuarios

> Generado por The Architect — 2026-08-17
> Arquetipo: Internal Tool / Dashboard (brownfield)
> Proyecto de referencia: `SOLUCIONESPUERTO/worker/src/index.js`

---

## 1. Resumen

### Qué es esto

TABIRÁ ICES es un cotizador web con inventario para una bloquera/inmobiliaria en Ventanilla, Colotepec, Oaxaca. Backend en Cloudflare Worker + KV, frontend HTML vanilla en Cloudflare Pages.

**Este blueprint NO es para construir el sistema de cero.** El sistema existe y funciona. Es para cerrar el agujero de seguridad que lo deja abierto al público y añadir gestión de usuarios dentro del módulo Centro.

### El problema

La autenticación es decorativa. Tres fallos encadenados dan acceso total a cualquiera:

1. `web/login.html` trae las credenciales en el cliente (`admin` / `12345678`), legibles con Ctrl+U.
2. `web/app/index.html` fuerza `sessionStorage.tabiraices_user_role = 'admin'` en cada carga, saltándose el login.
3. `worker/src/middleware/auth.ts` confía en el header `X-User-Role` que envía el cliente.

Verificado en producción: un `curl -H "X-User-Role: admin"` escribe en el inventario sin credencial alguna. Con `Access-Control-Allow-Origin: *`, además, desde cualquier sitio web.

### Objetivos

- Autenticación real con contraseñas hasheadas, imposibles de leer desde el cliente.
- Gestión de usuarios (crear, editar, desactivar, cambiar contraseña) dentro del módulo Centro.
- Autorización derivada del servidor, no del cliente.
- Cero pérdida del inventario, holds y auditoría existentes.

### Criterio de éxito

- `curl` con headers inventados devuelve `401`, no `200`.
- El código fuente del frontend no contiene ninguna contraseña.
- El dueño puede dar de alta un vendedor y darle una contraseña sin tocar código.
- El inventario actual (3 productos, $46,800) sigue intacto tras la migración.

---

## 2. Stack

Sin cambios de stack. Lo que ya hay funciona y está replicado en tres productos del mismo dueño.

| Capa | Tecnología | Por qué |
|---|---|---|
| Backend | Cloudflare Workers (TypeScript) | Ya desplegado; el dueño lo domina en 3 proyectos |
| Datos | Cloudflare KV | Ya en uso; suficiente para decenas de usuarios y miles de productos |
| Frontend | HTML vanilla + Pages | Sin build, sin dependencias, carga instantánea |
| Hash de contraseñas | PBKDF2 100k iteraciones + salt (WebCrypto) | Nativo del runtime; sin dependencias; ya probado en Soluciones Puerto |
| Sesiones | Token Bearer opaco en KV, TTL 7 días | Revocable al instante (un JWT no se puede revocar) |

**Rechazado explícitamente:** migrar a Next.js + Clerk + Vercel. Reescribiría un sistema en producción que ya funciona, introduciría un stack que el dueño no usa en ningún otro producto, y no resuelve nada que Cloudflare no resuelva ya.

---

## 3. Roles y permisos

Calcados de Soluciones Puerto, renombrados al vocabulario de TABIRÁ.

| Rol TABIRÁ | Equivale en SP | Puede |
|---|---|---|
| `DUENO` | SUPERADMIN | Todo, incluido crear/modificar otros DUENO y ADMIN |
| `ADMIN` | CEO | Todo lo operativo + gestionar VENDEDOR; **no** puede tocar cuentas DUENO/ADMIN ni ascender a nadie |
| `VENDEDOR` | TECNICO | Cotizar, apartar stock, ver su propio trabajo |

```js
const ROLES = {
  DUENO:    ['cotizar','ver_todas','ver_stock','ver_costos','inventario','ingreso','usuarios','bitacora','admins'],
  ADMIN:    ['cotizar','ver_todas','ver_stock','ver_costos','inventario','ingreso','usuarios','bitacora'],
  VENDEDOR: ['cotizar','apartar','ver_stock'],
};
const ROLES_ADMIN = ['DUENO','ADMIN']; // gestionarlos exige el permiso 'admins'
```

### El margen de utilidad no sale del Worker

El VENDEDOR ve stock y **precio público** (`precio_venta`), nunca `precio_costo` ni `valor_total` — ahí está el margen del negocio.

**Esto se filtra en el servidor, no en la pantalla.** Ocultar la columna con CSS o JS no sirve: el dato ya viajó y se lee en las herramientas del navegador. `GET /api/inventory` debe recortar la respuesta según el permiso `ver_costos`:

```js
function proyectarProducto(p, usuario) {
  const base = {
    id: p.id, nombre: p.nombre, precio_venta: p.precio_venta,
    cantidad_total: p.cantidad_total,
    cantidad_bloqueada: p.cantidad_bloqueada,
    cantidad_disponible: p.cantidad_disponible,
  };
  if (!puede(usuario, 'ver_costos')) return base;
  return { ...base, precio_costo: p.precio_costo, valor_total: p.valor_total,
           creado_en: p.creado_en, actualizado_en: p.actualizado_en };
}
```

Los totales agregados (`totals.valor_total`) tampoco se envían sin `ver_costos`.

⚠️ **Regresión a cuidar:** `web/app/js/inventory-module.js` pinta hoy las columnas "P. Costo" y "Valor Total". Para VENDEDOR esas columnas deben desaparecer del `<thead>`, o mostrarán `undefined`.

**Regla clave heredada de SP:** los permisos se recalculan desde el rol **en cada petición**, nunca se guardan en el registro del usuario. Agregar un permiso nuevo no obliga a migrar usuarios. (En LUNA GI esto causó un bug real con `permissions=193`.)

**Protecciones obligatorias:**
- Nadie se elimina ni se desactiva a sí mismo (evita quedarse fuera del sistema).
- Un ADMIN no puede crear, editar ni borrar cuentas DUENO/ADMIN.
- Cambiar la contraseña o desactivar una cuenta cierra todas sus sesiones abiertas.

---

## 4. Modelo de datos

### KV namespace nuevo: `TABIRA_USUARIOS`

No reutilizar `INVENTORY_KV`: separa el ciclo de vida de los datos y evita que un `list()` de inventario recorra usuarios.

| Clave | Valor | Metadata | TTL |
|---|---|---|---|
| `user:<id>` | `{id, usuario, nombre, salt, hash, rol, activo, creado}` | `{id, usuario, nombre, rol, activo}` | — |
| `idx:usuario:<usuario>` | `<id>` | — | — |
| `token:<token>` | `{userId, creado}` | — | 7 días |
| `intentos:<usuario>` | `{n, hasta}` | — | 15 min |

**El truco de la metadata:** listar usuarios lee sólo `list({prefix:'user:'})` y usa `k.metadata`. Sin la metadata harían falta N lecturas de KV para pintar la tabla. Copiar de SP.

El hash y el salt **nunca** salen del Worker. Ningún endpoint los devuelve.

### KV existentes — no tocar

`INVENTORY_KV` conserva `inventory:*`, holds y auditoría tal cual. La migración no los reescribe.

---

## 5. API

### Rutas nuevas

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/api/login` | público | Usuario+contraseña → token Bearer |
| POST | `/api/logout` | autenticado | Invalida el token actual |
| GET | `/api/yo` | autenticado | Datos del usuario en sesión + permisos |
| POST | `/api/password` | autenticado | Cambiar la propia contraseña (exige la actual) |
| GET | `/api/usuarios` | `usuarios` | Lista (desde metadata, sin hashes) |
| POST | `/api/usuarios` | `usuarios` | Crear |
| PUT | `/api/usuarios/:id` | `usuarios` | Editar nombre/rol/activo/contraseña |
| DELETE | `/api/usuarios/:id` | `usuarios` | Eliminar |

### Rutas existentes — cambio obligatorio

Todas migran de `X-User-ID`/`X-User-Role` a `Authorization: Bearer <token>`. `requireAuth` deja de leer headers de rol y pasa a resolver el token contra KV.

### Contratos clave

**POST /api/login**
```json
// entrada
{ "usuario": "juan", "password": "..." }
// salida 200
{ "ok": true, "data": { "token": "...", "usuario": "juan", "nombre": "Juan", "rol": "VENDEDOR", "permisos": ["cotizar","apartar"] } }
// salida 401 — mismo mensaje para usuario inexistente y contraseña mala (no filtrar cuáles existen)
{ "ok": false, "error": "Usuario o contraseña incorrectos", "codigo": "CREDENCIALES" }
// salida 429 tras 5 intentos fallidos
{ "ok": false, "error": "Demasiados intentos. Espera 15 minutos", "codigo": "BLOQUEADO" }
```

**POST /api/usuarios**
```json
{ "usuario": "maria", "nombre": "María López", "password": "min8chars", "rol": "VENDEDOR" }
```
Validaciones: usuario obligatorio y único, contraseña ≥ 8 caracteres, rol dentro de `ROLES`, y `puedeAdministrarRol()` antes de crear.

---

## 6. Frontend

### Estructura de archivos

**Borrar `index.html` de la raíz del repositorio.** Cloudflare Pages sirve desde `web/` (`destination_dir = "web/"`); la copia de la raíz es un fantasma que ya costó horas de depuración persiguiendo un caché inexistente. `web/` es la única fuente de verdad.

### Pantallas

| Ruta | Cambio |
|---|---|
| `web/login.html` | Quitar las credenciales del cliente. `POST /api/login`, guardar token en `sessionStorage`, redirigir |
| `web/app/index.html` | **Eliminar el auto-login.** Sin token válido → redirigir a `login.html` |
| Módulo Centro | Añadir pestaña "Usuarios" junto a "Crear Producto" y "Agregar Stock" |

### Panel de administración

Ya está montado correctamente: vive en `#admin-panel-host` fuera de `#app` y se mueve a `#admin-panel-slot` dentro del módulo Centro cuando el rol lo permite. **Mantener ese patrón** — cualquier HTML estático dentro de `#app` lo destruye `render()` con su `innerHTML =`.

La pestaña Usuarios se añade como un tercer `<div id="tab-usuarios">` hermano de `tab-crear` y `tab-inventario`, con una tabla (usuario, nombre, rol, activo, acciones) y un formulario de alta.

### Estado

Token en `sessionStorage`. Toda llamada al Worker adjunta `Authorization: Bearer <token>`. Un `401` en cualquier respuesta limpia la sesión y redirige a login — un helper central `api()` que lo haga en un solo sitio.

---

## 7. Seguridad

### CORS

Sustituir `Access-Control-Allow-Origin: *` por lista blanca, como SP:

```js
const ORIGENES = [
  'https://tabiraices.pages.dev',
  'https://tabiraices.com',      // ajustar al dominio real cuando exista
  'http://localhost:8788',
];
```

Devolver cabeceras CORS **sólo** si el origen está en la lista.

### Contraseñas

- PBKDF2, SHA-256, 100.000 iteraciones, salt de 8 caracteres por usuario.
- Comparación en tiempo constante (`iguales()` de SP) — nunca `===` sobre hashes.
- Mínimo 8 caracteres.
- **La contraseña nunca viaja de vuelta al cliente, ni en logs, ni en la bitácora.**

### Rate limiting

5 intentos fallidos por usuario → bloqueo 15 minutos, en KV con TTL. Nota heredada de SP: KV es eventualmente consistente, así que el bloqueo tarda unos segundos en propagarse globalmente. Es aceptable contra fuerza bruta; no es un candado exacto.

### Bitácora

Extender la auditoría existente a: `login`, `login_fallido`, `login_bloqueado`, `usuario_crear`, `usuario_editar`, `usuario_eliminar`, `password_cambiar`. IP hasheada con `SHA-256(ip + IP_SALT)` truncada a 16 caracteres — permite detectar patrones sin almacenar la IP.

`IP_SALT` va como secreto del Worker: `wrangler secret put IP_SALT`. Nunca en `wrangler.toml`.

---

## 8. Orden de construcción

> El riesgo principal de esta migración es **quedarse fuera del sistema**: si se activa la autenticación antes de que exista un usuario, nadie puede entrar. El paso 3 existe para eso y no se puede saltar.

**Paso 1 — Crear el KV de usuarios**
```bash
cd worker
npx wrangler kv namespace create TABIRA_USUARIOS
```
Añadir el binding devuelto a `wrangler.toml`. No borrar el binding de `INVENTORY_KV`.

**Paso 2 — Portar las utilidades de criptografía**
Crear `worker/src/lib/crypto.ts` con `hashPassword`, `hashIp`, `aleatorio`, `iguales`, `normalizar`, `limpiar`, portadas desde `SOLUCIONESPUERTO/worker/src/index.js` (líneas ~85-115). Traducir a TypeScript, sin cambiar la lógica.

**Paso 3 — Sembrar el primer DUEÑO (crítico)**
Endpoint temporal `POST /api/bootstrap`, protegido por un secreto de Worker:
- Si ya existe algún `user:*`, responde 403 y no hace nada.
- Si no, crea el DUEÑO con el usuario y contraseña que reciba.
```bash
npx wrangler secret put BOOTSTRAP_TOKEN
```
Ejecutarlo una vez, verificar que el login funciona, y **borrar el endpoint en el paso 9**.

**Paso 4 — Autenticación en el backend**
Reescribir `worker/src/middleware/auth.ts`:
- `usuarioPorToken(env, request)` — lee `Authorization: Bearer`, resuelve `token:<t>` → `user:<id>`, verifica `activo`, recalcula permisos desde `ROLES[rol]`.
- `requireAuth` / `requirePermiso(permiso)` reemplazan a `requireAuth` / `requireAdmin`.
- Rechazar con 401 si no hay token válido, 403 si falta el permiso.

**Paso 5 — Endpoints de sesión**
`POST /api/login` (con rate limiting), `POST /api/logout`, `GET /api/yo`, `POST /api/password`.

**Paso 6 — CRUD de usuarios**
`worker/src/routes/usuarios.ts` calcado de SP (líneas ~582-645), incluidas las tres protecciones: no auto-eliminarse, `puedeAdministrarRol()`, y cierre de sesiones al cambiar contraseña o desactivar.

**Paso 7 — Blindar las rutas existentes**
Cambiar cada `requireAdmin(request)` por `requirePermiso(request, 'inventario')` o el permiso que corresponda en `inventory.ts`, `holds.ts`, `audit.ts`, `settings.ts`. Aplicar la lista blanca de CORS en `index.ts`.

**Paso 7b — Recortar costos en la respuesta**
Aplicar `proyectarProducto()` en `GET /api/inventory` y en cualquier endpoint que devuelva productos. Sin `ver_costos` no salen `precio_costo`, `valor_total` ni `totals.valor_total`. Verificar con el token de un VENDEDOR:
```bash
curl -s -H "Authorization: Bearer $TOKEN_VENDEDOR" \
  https://tabiraices-inventory-api.lindero-coti.workers.dev/api/inventory | grep -c precio_costo
# debe imprimir 0
```

**Paso 8 — Frontend**
1. `web/login.html`: borrar `CREDENTIALS`, llamar a `/api/login`, guardar token.
2. `web/app/index.html`: borrar el auto-login de las líneas ~283-285; sin token → `location.href = '../login.html'`.
3. Helper `api()` que adjunte el Bearer y maneje el 401 global.
4. Pestaña "Usuarios" en el panel de Centro.
5. Borrar `index.html` de la raíz del repositorio.

**Paso 9 — Cierre**
Eliminar `/api/bootstrap` y su secreto. Verificar con `curl` que las rutas responden 401 sin token.

**Paso 10 — Verificación (no se entrega sin esto)**
```bash
# Debe devolver 401, no 200
curl -s -o /dev/null -w "%{http_code}" \
  https://tabiraices-inventory-api.lindero-coti.workers.dev/api/inventory

# Debe devolver 401 (el header falsificado ya no sirve)
curl -s -o /dev/null -w "%{http_code}" -H "X-User-Role: admin" \
  https://tabiraices-inventory-api.lindero-coti.workers.dev/api/inventory

# El frontend no debe contener ninguna contraseña
grep -rn "12345678\|password.*=.*'" web/*.html web/app/*.html
```
Más: un VENDEDOR no ve la pestaña Usuarios; un ADMIN no puede crear un DUEÑO; el inventario sigue mostrando 3 productos.

---

## 9. Variables y secretos

| Nombre | Tipo | Para qué |
|---|---|---|
| `TABIRA_USUARIOS` | KV binding | Usuarios, tokens, intentos |
| `INVENTORY_KV` | KV binding | Ya existe — inventario, holds, auditoría |
| `IP_SALT` | secreto | Sal para hashear IPs en la bitácora |
| `BOOTSTRAP_TOKEN` | secreto | Temporal; borrar tras el paso 9 |

```bash
npx wrangler secret put IP_SALT
npx wrangler secret put BOOTSTRAP_TOKEN
```

Ningún secreto va en `wrangler.toml` (se commitea). Ninguna contraseña va en el frontend.

---

## 10. Pruebas

| Nivel | Qué |
|---|---|
| Manual con `curl` | Las tres verificaciones del paso 10 |
| Flujo E2E | login → crear vendedor → login como vendedor → verificar que no ve Usuarios → cambiar su contraseña como admin → verificar que su sesión se cerró |
| Regresión | Inventario, holds y cotizaciones siguen funcionando tras el cambio de auth |

Soluciones Puerto tiene 69/69 + 29/29 pruebas E2E; conviene portar ese enfoque cuando esta migración esté estable.

---

## 11. Reglas No Negociables

1. **Ninguna contraseña, hash o salt en el frontend, ni en logs, ni en la bitácora.**
2. **El rol se deriva del token en el servidor.** Ningún endpoint vuelve a confiar en un header de rol.
3. **Los permisos se recalculan desde `ROLES[rol]` en cada petición**, jamás se persisten en el registro del usuario.
4. **Nadie puede eliminar ni desactivar su propia cuenta.**
5. **Sólo un DUEÑO administra cuentas DUENO/ADMIN.**
6. **Cambiar contraseña o desactivar una cuenta cierra sus sesiones.**
7. **Usar Edit/Write para HTML/JS, nunca `sed`** — en Windows corrompe UTF-8.
8. **Validar todo JS con `node --check` antes de desplegar.**
9. **`web/` es la única fuente de verdad del frontend.** Pages ignora la raíz.
10. **Nada de HTML estático dentro de `#app`** — `render()` lo destruye. UI persistente va fuera y se monta en su slot.
11. **No desplegar el paso 4 sin haber completado el paso 3**, o nadie podrá entrar al sistema.
12. **El margen no sale del Worker.** `precio_costo` y `valor_total` se recortan en el servidor para quien no tenga `ver_costos`. Ocultarlo en la pantalla no es seguridad.

---

## 12. CLAUDE.md para el proyecto

```markdown
# TABIRÁ ICES

Cotizador web + inventario para bloquera/inmobiliaria en Ventanilla, Colotepec, Puerto Escondido, Oaxaca.

## Arquitectura

| Pieza | Dónde |
|---|---|
| Backend | `worker/` — Cloudflare Worker TypeScript (`tabiraices-inventory-api`) |
| Datos | Cloudflare KV: `INVENTORY_KV` (inventario/holds/auditoría), `TABIRA_USUARIOS` (usuarios/tokens) |
| Frontend | `web/` — HTML vanilla en Cloudflare Pages |
| Cotizador | `web/app/index.html` |
| Módulos | `web/app/js/inventory-module.js`, `centro-module.js` |

## Reglas críticas

1. **Pages sirve desde `web/`.** Editar fuera de `web/` no tiene efecto, aunque el deploy diga "Success". No existe caché que purgar: si un cambio no se ve, revisar el Build output directory y el JS, en ese orden.
2. **Nada de HTML estático dentro de `#app`.** `render()` hace `app.innerHTML = ...` y lo borra. La UI persistente vive fuera y se monta en su slot (ver `#admin-panel-host` → `#admin-panel-slot`).
3. **Usar Edit/Write para HTML/JS**, nunca `sed` — en Windows corrompe UTF-8.
4. **Validar con `node --check`** antes de desplegar.
5. **El rol viene del token, verificado en el servidor.** Nunca confiar en headers del cliente.
6. **Mobile-first** — la mayoría de los usuarios entra desde el celular.

## Roles

`DUENO` (todo) > `ADMIN` (operativo + vendedores) > `VENDEDOR` (cotizar y apartar).
Permisos recalculados desde el rol en cada petición, nunca persistidos.

## Diagnóstico rápido

Cuando un cambio "no se ve", comparar las tres capas antes de suponer nada:
\`\`\`bash
grep -c PATRON web/app/index.html                    # local
git show main:web/app/index.html | grep -c PATRON    # GitHub
curl -s https://tabiraices.pages.dev/app/ | grep -c PATRON  # producción
\`\`\`
Si producción ya lo trae, el fallo está en el JS, no en el despliegue.

## Datos del negocio

| Dato | Valor |
|---|---|
| Nombre | TABIRÁ ICES |
| Ubicación | Ventanilla, Colotepec, Oaxaca |
| Productos | Bloques, tabicones, postes para cercar (lineales 10x10, esquineros 12x12) |
| Servicios | Venta de material, retroexcavadora, inmobiliaria |
```

---

## 13. Referencia

| Qué | Dónde |
|---|---|
| Implementación completa a copiar | `SOLUCIONESPUERTO/worker/src/index.js` |
| UI de gestión de usuarios | `SOLUCIONESPUERTO/app/admin.html`, `COTIZADORES/LUNA_GI/admin.html` |
| Bug a no repetir | Permisos persistidos (`permissions=193` en LUNA GI) |
