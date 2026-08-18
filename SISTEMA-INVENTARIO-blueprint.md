# TABIRAÍCES — Sistema de Inventario — Blueprint

> Generado por The Architect el 2026-08-14
> Archetype: Internal Tool with Backend Persistence

---

## 1. Project Overview

### Vision
Sistema centralizado de gestión de inventario para TABIRAÍCES que integra con el cotizador existente. Permite a admins y vendedores ver stock en tiempo real, crear cotizaciones que bloquean material por 24h (configurable), y automatiza la conversión de cotizaciones pagadas a ventas reales. Incluye auditoría completa de todos los cambios y cálculo de valor total del stock en tiempo real.

### Goals
- Unificar control de inventario (antes disperso en hojas de cálculo)
- Bloquear material automáticamente cuando se hace cotización (24h sin responsabilidad)
- Convertir holds en ventas reales solo cuando se marca pagada
- Auditar CADA cambio (quién, cuándo, qué)
- Compartir inventario entre admins y vendedores en campo via cloud
- Calcular valor total del stock en tiempo real

### Success Metrics
- Reducir sobreventa (material bloqueado correctamente)
- Aumentar eficiencia de vendedores (ven stock disponible instantáneamente)
- Auditoría 100% completa (cero cambios sin registro)
- Confiabilidad: sincronización cada 30s sin errores

---

## 2. Tech Stack

| Layer | Tecnología | Por qué |
|-------|-----------|---------|
| **Frontend** | HTML vanilla + JavaScript | Ya tienes funcionando en cotizador; extendemos sin frameworks |
| **Backend** | Cloudflare Worker | Mismo ecosistema que Pages; serverless; acceso a KV |
| **Persistencia** | Cloudflare KV | TTL nativo (perfecto para holds de 24h); global; sin costo adicional |
| **Sincronización** | Polling cada 30s | Confiable; bajo overhead; suficiente para inventario |
| **Auth** | sessionStorage (existente) | Ya funcionando en login.html; no cambiar |
| **Hosting** | Cloudflare Pages | Ya tienes; auto-deploy desde GitHub |

---

## 3. Directory Structure

```
tabiraices-merge/
├── web/
│   ├── index.html                          # Página pública (sin cambios)
│   ├── login.html                          # Login (sin cambios)
│   ├── app/
│   │   ├── index.html                      # Cotizador con módulos
│   │   ├── js/
│   │   │   ├── inventory-sync.js          # ⭐ Sincronización cada 30s con backend
│   │   │   ├── inventory-ui.js            # ⭐ Renderizar módulo inventario
│   │   │   └── holds-manager.js           # ⭐ Lógica de holds (bloqueos 24h)
│   │   └── css/
│   │       └── inventory.css              # Estilos del módulo
│   ├── landing.html                        # Landing read-only (sin cambios)
│   └── assets/                             # (sin cambios)
│
├── worker/
│   ├── src/
│   │   ├── index.ts                       # ⭐ Puntos de entrada del Worker
│   │   ├── routes/
│   │   │   ├── inventory.ts              # GET/POST inventario
│   │   │   ├── holds.ts                  # Crear/listar/actualizar holds
│   │   │   ├── audit.ts                  # Historial completo
│   │   │   └── settings.ts               # Configuración (Admin only)
│   │   ├── middleware/
│   │   │   ├── auth.ts                   # Verificar sesión + role
│   │   │   └── validation.ts             # Validar requests
│   │   ├── services/
│   │   │   ├── inventory-service.ts      # Lógica de inventario
│   │   │   ├── holds-service.ts          # Lógica de holds
│   │   │   └── audit-service.ts          # Registro de auditoría
│   │   └── types/
│   │       └── index.ts                  # TypeScript tipos compartidos
│   └── wrangler.toml                      # Configuración Cloudflare
│
└── .github/
    └── workflows/
        └── deploy.yml                     # Auto-deploy del Worker
```

---

## 4. Data Model

### Entities

**Producto (Inventory Item)**
| Field | Type | Notas |
|-------|------|-------|
| `id` | string (UUID) | Identificador único |
| `nombre` | string | e.g., "Bloques 10cm", "Postes" |
| `precio_costo` | number | Precio por unidad (importado) |
| `precio_venta` | number | Precio de venta por unidad |
| `cantidad_total` | number | Stock total en almacén |
| `cantidad_bloqueada` | number | Calculado: sum(holds activos) |
| `cantidad_disponible` | number | Calculado: cantidad_total - cantidad_bloqueada |
| `valor_total` | number | Calculado: cantidad_total * precio_costo |
| `creado_en` | timestamp | Cuándo se agregó el producto |
| `actualizado_en` | timestamp | Cuándo se sincronizó por última vez |

**Hold (Bloqueo de Material)**
| Field | Type | Notas |
|-------|------|-------|
| `id` | string (UUID) | Identificador único |
| `cotizacion_id` | string | Referencia a la cotización |
| `producto_id` | string | Qué producto se bloquea |
| `cantidad` | number | Cuánto se bloquea |
| `creado_por` | string (user_id) | Vendedor que hizo la cotización |
| `creado_en` | timestamp | Cuándo se hizo la cotización |
| `expira_en` | timestamp | Cuándo se libera (creado_en + hold_duracion_horas) |
| `estado` | enum | 'pendiente' \| 'pagada' \| 'expirada' \| 'liberada' |
| `notas` | string | Notas de la cotización |

**Audit Log (Registro de Cambios)**
| Field | Type | Notas |
|-------|------|-------|
| `id` | string (UUID) | Identificador único |
| `tipo` | enum | 'ingreso' \| 'venta' \| 'hold_creado' \| 'hold_liberado' \| 'configuracion' |
| `usuario_id` | string | Quién hizo el cambio |
| `producto_id` | string (nullable) | Qué producto se afectó |
| `cantidad_antes` | number | Valor anterior |
| `cantidad_despues` | number | Valor nuevo |
| `detalles` | JSON | Datos contextuales (cotización_id, etc.) |
| `timestamp` | timestamp | Cuándo ocurrió |

**Settings (Configuración)**
| Field | Type | Notas |
|-------|------|-------|
| `hold_duracion_horas` | number | Default: 24; configurable por Admin |
| `alert_stock_bajo` | number | Opcional para futuro; default: 0 |
| `ultima_actualizacion` | timestamp | Cuándo cambió por última vez |

### Relationships
- **Producto ← Hold** (1:N) — Un producto puede tener múltiples holds activos
- **Cotización ← Hold** (1:1) — Cada hold es para una cotización específica
- **Usuario ← Audit** (1:N) — Un usuario tiene múltiples registros de auditoría
- **Settings** (Singleton) — Una sola configuración global

### Schema KV (Cloudflare)

```
Inventario:
  Key: "inventory:<productId>"
  Value: {
    id, nombre, precio_costo, precio_venta,
    cantidad_total, cantidad_bloqueada, cantidad_disponible,
    valor_total, creado_en, actualizado_en
  }

Holds:
  Key: "hold:<holdId>"
  Value: {
    id, cotizacion_id, producto_id, cantidad,
    creado_por, creado_en, expira_en,
    estado, notas
  }
  TTL: Configurado automáticamente en expira_en

Auditoría:
  Key: "audit:<timestamp>:<id>" (para ordenamiento)
  Value: {
    id, tipo, usuario_id, producto_id,
    cantidad_antes, cantidad_despues,
    detalles, timestamp
  }
  TTL: Indefinido (guardar todo)

Configuración:
  Key: "settings"
  Value: {
    hold_duracion_horas, alert_stock_bajo,
    ultima_actualizacion
  }

Metadata:
  Key: "inventory:index" → JSON con lista de todos los productIds
  Key: "holds:active" → JSON con lista de holdIds activos
```

---

## 5. API Design

### Routes Overview

| Método | Path | Descripción | Auth | Rol |
|--------|------|-------------|------|-----|
| `GET` | `/api/inventory` | Listar todos los productos con estado | Requerido | Admin, Vendedor |
| `GET` | `/api/inventory/:id` | Ver un producto específico | Requerido | Admin, Vendedor |
| `POST` | `/api/inventory/:id/ingreso` | Agregar stock manual | Requerido | Admin |
| `GET` | `/api/inventory/valor/total` | Valor total del stock (tiempo real) | Requerido | Admin |
| `POST` | `/api/holds` | Crear hold (desde cotización) | Requerido | Admin, Vendedor |
| `GET` | `/api/holds` | Listar holds activos del usuario | Requerido | Admin (ve todas), Vendedor (solo suyas) |
| `GET` | `/api/holds/:id` | Ver detalle de un hold | Requerido | Admin, propietario |
| `PATCH` | `/api/holds/:id/pagar` | Marcar como pagada (convierte a venta) | Requerido | Admin |
| `GET` | `/api/audit?limit=100&tipo=&usuario_id=` | Historial de cambios (con filtros) | Requerido | Admin |
| `GET` | `/api/settings` | Obtener configuración | Requerido | Admin |
| `PATCH` | `/api/settings` | Actualizar configuración | Requerido | Admin |

### Key Endpoints Detail

**POST /api/holds — Crear hold (Bloqueo de material)**
```javascript
Request:
{
  cotizacion_id: "0022",           // ID de cotización
  producto_id: "bloques-10cm",     // Qué producto
  cantidad: 100,                   // Cuánto se bloquea
  notas: "Proyecto Altamar"        // Contexto
}

Response:
{
  success: true,
  hold: {
    id: "hold-abc123",
    cotizacion_id: "0022",
    estado: "pendiente",
    creado_en: "2026-08-14T10:30:00Z",
    expira_en: "2026-08-15T10:30:00Z"   // +24h automático
  }
}

Errores:
- 400: Material insuficiente (cantidad_disponible < cantidad)
- 401: No autenticado
- 403: No es Admin ni Vendedor
```

**PATCH /api/holds/:id/pagar — Convertir hold a venta**
```javascript
Request:
{
  hold_id: "hold-abc123"
}

Lógica:
1. Verificar hold existe y es "pendiente"
2. Restar producto_id.cantidad_total -= cantidad
3. Cambiar hold.estado → "pagada"
4. Crear audit log (tipo: "venta")
5. Actualizar producto.valor_total en tiempo real

Response:
{
  success: true,
  producto: {
    id: "bloques-10cm",
    cantidad_total: 400,           // Restado
    cantidad_bloqueada: 200,       // Otro hold sigue activo
    cantidad_disponible: 200,
    valor_total: 12000             // Recalculado
  },
  hold: {
    id: "hold-abc123",
    estado: "pagada"
  }
}
```

**GET /api/inventory/valor/total — Valor total en tiempo real**
```javascript
Response:
{
  valor_total_stock: 45230.50,     // Suma de todos producto.valor_total
  cantidad_total_items: 1250,      // Suma de cantidad_total
  cantidad_bloqueada_total: 350,   // Suma de cantidad_bloqueada
  cantidad_disponible_total: 900,  // Suma de cantidad_disponible
  productos: [
    {
      id: "bloques-10cm",
      nombre: "Bloques 10cm",
      valor_total: 12000,
      cantidad_total: 500,
      precio_costo: 24
    }
    // ... más productos
  ]
}
```

**GET /api/audit?limit=100&tipo=venta&usuario_id=vendedor1**
```javascript
Response:
[
  {
    id: "audit-xyz",
    tipo: "venta",
    usuario_id: "vendedor1",
    producto_id: "bloques-10cm",
    cantidad_antes: 500,
    cantidad_despues: 400,
    detalles: {
      hold_id: "hold-abc123",
      cotizacion_id: "0022",
      razon: "Pago marcado"
    },
    timestamp: "2026-08-14T15:45:00Z"
  }
  // ... más registros
]
```

---

## 6. Frontend Architecture

### Pages / Rutas (Módulos en app/index.html)

| Módulo | Ruta (hash/tab) | Descripción |
|--------|-----------------|-------------|
| Nueva Cotización | `#nueva` | Cotizador existente (sin cambios) |
| Inventario | `#inventario` | ⭐ Ver productos, ingresar stock (Admin only) |
| Mis Cotizaciones | `#mis` | Ver holds/cotizaciones activas del vendedor |
| Centro | `#centro` | ⭐ Dashboard admin con auditoría y filtros |

### Component Hierarchy (Nuevos)

```
app/index.html
├── nav-inventory.js
│   └── Botones para cambiar entre módulos
│
├── modules/
│   ├── inventory-module.html
│   │   ├── inventory-table.js
│   │   │   └── Tabla de productos (cantidad, bloqueada, disponible, valor)
│   │   ├── inventory-add-stock.js
│   │   │   └── Formulario para ingresar stock (Admin only)
│   │   └── inventory-kpi.js
│   │       └── KPI: Valor total, cantidad total, % bloqueado
│   │
│   ├── centro-module.html
│   │   ├── centro-audit-filter.js
│   │   │   └── Filtros: usuario, tipo, rango fechas
│   │   ├── centro-audit-table.js
│   │   │   └── Tabla de auditoría (quién, cuándo, qué)
│   │   └── centro-holds-status.js
│   │       └── Estado de holds: cuántos en pendiente, cuántos por expirar
│   │
│   └── holds-monitor.js
│       └── Monitor silencioso cada 30s
│           ├── Sincronizar estado de holds
│           ├── Detectar expirados
│           └── Mostrar alertas (sin stock / proponer extensión)
```

### State Management

**localStorage:**
- `tabiraices_inventory_cache` — Caché local de inventario (TTL: 30s)
- `tabiraices_holds_local` — Holds creados localmente (antes de sincronizar)

**sessionStorage (existente):**
- `tabiraices_logged` — Sesión activa
- `tabiraices_user` — ID del usuario actual
- `tabiraices_user_role` — 'admin' | 'vendedor'

**Sincronización:**
```javascript
// Cada 30 segundos (no bloquea UI)
setInterval(async () => {
  const response = await fetch('/api/inventory');
  const data = await response.json();
  
  // Actualizar caché
  localStorage.setItem('tabiraices_inventory_cache', JSON.stringify(data));
  
  // Disparar evento
  window.dispatchEvent(new CustomEvent('inventory:updated', { detail: data }));
  
  // Verificar holds expirados
  checkExpiredHolds(data.holds);
}, 30000);
```

---

## 7. Design System

### Colors
| Rol | Hex | Uso |
|-----|-----|-----|
| Navy (Primario) | `#0D1B2A` | Headers, botones principales |
| Gold (Acento) | `#F5C010` | Botones activos, highlights |
| Success (Verde) | `#10B981` | Stock disponible, pagos completados |
| Warning (Amarillo) | `#FBBF24` | Holds a punto de expirar (< 2 horas) |
| Danger (Rojo) | `#EF4444` | Stock agotado, errores |
| Muted (Gris) | `#9CA3AF` | Texto secundario, borders |
| Surface | `#FFFFFF` | Cards, panels |
| Background | `#F9FAFB` | Page background |

### Typography
- **Headings:** Montserrat 800/900, uppercase, letter-spacing 1.5px
- **Body:** Montserrat 500/600, 14px, line-height 1.6
- **Labels:** Montserrat 700, 11px, uppercase, letter-spacing 0.8px

### Spacing & Layout
- Base: 4px
- Scale: 4, 8, 12, 16, 24, 32, 48, 64px
- Border radius: 8px (standard), 12px (cards), 50% (avatars)
- Max width: 1040px
- Shadows: subtle (0 2px 8px rgba(0,0,0,0.05)) — admin tool, no drama

### Component Style
- **Aesthetic:** Clean, minimal, professional — admin tools prioritize function
- **Tabla:** Striped rows, hover highlight, compacta (12px padding)
- **Alerts:** Inline badges (colored), no popups (keep focus)
- **Modales:** Confirm antes de cambios críticos (ingreso stock, marcar pagada)

---

## 8. Authentication & Authorization

### Auth Flow
1. Usuario abre cotizador → Verifica sessionStorage `tabiraices_logged`
2. Si no hay sesión → Redirige a login.html
3. Login verifica credenciales → Establece sessionStorage (`tabiraices_logged`, `tabiraices_user`)
4. Frontend agrega `X-User-ID` header en todas las requests al Worker

### Protected Routes
- `/api/inventory` → Requiere sesión
- `/api/inventory/:id/ingreso` → Requiere rol Admin
- `/api/settings` → Requiere rol Admin
- `/api/audit` → Requiere rol Admin (ver auditoría completa)
- Vendedores ven solo sus holds en `/api/holds`

### Roles & Permissions

| Rol | Permisos |
|-----|----------|
| **Admin** | Ver inventario completo, ingresar stock, ver auditoría completa, cambiar configuración, ver holds de todos, marcar pagadas |
| **Vendedor** | Ver inventario disponible, crear cotizaciones (genera holds), ver solo sus holds activos |

### Session Management
```javascript
// Middleware en Worker
export async function requireAuth(request) {
  const userID = request.headers.get('X-User-ID');
  const role = request.headers.get('X-User-Role');
  
  if (!userID || !role) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  return { userID, role };
}

export async function requireAdmin(request) {
  const { userID, role } = await requireAuth(request);
  if (role !== 'admin') {
    return new Response('Forbidden', { status: 403 });
  }
  return { userID, role };
}
```

---

## 9. Build Order

**INSTRUCCIONES CRÍTICAS:** Ejecuta estos pasos en orden. Cada paso depende del anterior. No saltes pasos.

### Paso 1: Crear estructura del Worker
**Deliverable:** Carpeta `worker/` con archivos base TypeScript

```bash
cd tabiraices-merge/worker

# 1.1 Inicializar Wrangler
npm init -y
npm install --save-dev wrangler typescript @types/node

# 1.2 Crear estructura
mkdir -p src/{routes,middleware,services,types}
touch src/index.ts src/types/index.ts wrangler.toml

# 1.3 Crear archivos base vacíos
touch src/routes/{inventory.ts,holds.ts,audit.ts,settings.ts}
touch src/middleware/{auth.ts,validation.ts}
touch src/services/{inventory-service.ts,holds-service.ts,audit-service.ts}
```

**wrangler.toml:**
```toml
name = "tabiraices-inventory-api"
main = "src/index.ts"
type = "service"

[env.production]
name = "tabiraices-inventory-api"

[[kv_namespaces]]
binding = "INVENTORY_KV"
id = "{ID_AQUI}"

[build]
command = "npm run build"
cwd = "."
```

### Paso 2: Implementar tipos TypeScript
**Deliverable:** `src/types/index.ts` con todas las interfaces

```typescript
// src/types/index.ts
export interface Product {
  id: string;
  nombre: string;
  precio_costo: number;
  precio_venta: number;
  cantidad_total: number;
  cantidad_bloqueada: number;
  cantidad_disponible: number;
  valor_total: number;
  creado_en: string;
  actualizado_en: string;
}

export interface Hold {
  id: string;
  cotizacion_id: string;
  producto_id: string;
  cantidad: number;
  creado_por: string;
  creado_en: string;
  expira_en: string;
  estado: 'pendiente' | 'pagada' | 'expirada' | 'liberada';
  notas?: string;
}

export interface AuditLog {
  id: string;
  tipo: 'ingreso' | 'venta' | 'hold_creado' | 'hold_liberado' | 'configuracion';
  usuario_id: string;
  producto_id?: string;
  cantidad_antes: number;
  cantidad_despues: number;
  detalles: Record<string, any>;
  timestamp: string;
}

export interface Settings {
  hold_duracion_horas: number;
  alert_stock_bajo: number;
  ultima_actualizacion: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### Paso 3: Implementar middleware de autenticación
**Deliverable:** `src/middleware/auth.ts` funcional

```typescript
// src/middleware/auth.ts
export async function requireAuth(request: Request) {
  const userID = request.headers.get('X-User-ID');
  const userRole = request.headers.get('X-User-Role');
  
  if (!userID || !userRole) {
    throw new Error('UNAUTHORIZED');
  }
  
  return { userID, userRole };
}

export async function requireAdmin(request: Request) {
  const { userID, userRole } = await requireAuth(request);
  if (userRole !== 'admin') {
    throw new Error('FORBIDDEN');
  }
  return { userID, userRole };
}
```

### Paso 4: Implementar inventory-service
**Deliverable:** `src/services/inventory-service.ts` con lógica de productos

```typescript
// src/services/inventory-service.ts
import { Product } from '../types';

export class InventoryService {
  constructor(private kv: KVNamespace) {}

  async getProducts(): Promise<Product[]> {
    const index = await this.kv.get('inventory:index');
    if (!index) return [];
    
    const ids = JSON.parse(index);
    const products = await Promise.all(
      ids.map((id: string) => this.kv.get(`inventory:${id}`))
    );
    
    return products.filter(Boolean).map((p: string) => JSON.parse(p));
  }

  async getProduct(id: string): Promise<Product | null> {
    const data = await this.kv.get(`inventory:${id}`);
    return data ? JSON.parse(data) : null;
  }

  async calculateTotals(): Promise<{
    valor_total: number;
    cantidad_total: number;
    cantidad_bloqueada: number;
  }> {
    const products = await this.getProducts();
    return {
      valor_total: products.reduce((s, p) => s + p.valor_total, 0),
      cantidad_total: products.reduce((s, p) => s + p.cantidad_total, 0),
      cantidad_bloqueada: products.reduce((s, p) => s + p.cantidad_bloqueada, 0),
    };
  }

  async addStock(productId: string, quantity: number, userId: string) {
    const product = await this.getProduct(productId);
    if (!product) throw new Error('PRODUCT_NOT_FOUND');
    
    product.cantidad_total += quantity;
    product.valor_total = product.cantidad_total * product.precio_costo;
    product.cantidad_disponible = product.cantidad_total - product.cantidad_bloqueada;
    product.actualizado_en = new Date().toISOString();
    
    await this.kv.put(`inventory:${productId}`, JSON.stringify(product));
    
    return product;
  }
}
```

### Paso 5: Implementar holds-service
**Deliverable:** `src/services/holds-service.ts` con lógica de bloqueos

```typescript
// src/services/holds-service.ts
import { Hold } from '../types';

export class HoldsService {
  constructor(private kv: KVNamespace) {}

  async createHold(
    cotizacionId: string,
    productId: string,
    cantidad: number,
    createdBy: string,
    holdDurationHours: number = 24
  ): Promise<Hold> {
    const holdId = `hold-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const expireAt = new Date(now.getTime() + holdDurationHours * 60 * 60 * 1000);
    
    const hold: Hold = {
      id: holdId,
      cotizacion_id: cotizacionId,
      producto_id: productId,
      cantidad,
      creado_por: createdBy,
      creado_en: now.toISOString(),
      expira_en: expireAt.toISOString(),
      estado: 'pendiente',
    };
    
    // Guardar con TTL
    const ttlSeconds = holdDurationHours * 60 * 60;
    await this.kv.put(`hold:${holdId}`, JSON.stringify(hold), { expirationTtl: ttlSeconds });
    
    // Agregar a lista de activos
    const activeList = await this.kv.get('holds:active');
    const activeIds = activeList ? JSON.parse(activeList) : [];
    activeIds.push(holdId);
    await this.kv.put('holds:active', JSON.stringify(activeIds));
    
    return hold;
  }

  async getActiveHolds(userId?: string): Promise<Hold[]> {
    const activeList = await this.kv.get('holds:active');
    if (!activeList) return [];
    
    const holdIds = JSON.parse(activeList);
    const holds = await Promise.all(
      holdIds.map((id: string) => this.kv.get(`hold:${id}`))
    );
    
    let result = holds.filter(Boolean).map((h: string) => JSON.parse(h));
    
    // Filtrar por usuario si se especifica
    if (userId) {
      result = result.filter((h: Hold) => h.creado_por === userId);
    }
    
    return result;
  }

  async convertToPaid(holdId: string): Promise<Hold> {
    const holdData = await this.kv.get(`hold:${holdId}`);
    if (!holdData) throw new Error('HOLD_NOT_FOUND');
    
    const hold: Hold = JSON.parse(holdData);
    hold.estado = 'pagada';
    
    await this.kv.put(`hold:${holdId}`, JSON.stringify(hold));
    return hold;
  }
}
```

### Paso 6: Implementar audit-service
**Deliverable:** `src/services/audit-service.ts` con registro de cambios

```typescript
// src/services/audit-service.ts
import { AuditLog } from '../types';

export class AuditService {
  constructor(private kv: KVNamespace) {}

  async log(auditLog: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    const id = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    const log: AuditLog = { ...auditLog, id, timestamp };
    const key = `audit:${timestamp}:${id}`;
    
    await this.kv.put(key, JSON.stringify(log));
    
    return log;
  }

  async getLogs(limit: number = 100, filters?: {
    tipo?: string;
    usuario_id?: string;
    producto_id?: string;
  }): Promise<AuditLog[]> {
    // Nota: KV no tiene queries complejas. En producción,
    // usar Workers Analytics Engine o backend Postgres.
    // Por ahora, retornar últimos N registros.
    
    const list = await this.kv.list({ prefix: 'audit:' });
    const logs = await Promise.all(
      list.keys.slice(-limit).map((key) => this.kv.get(key.name))
    );
    
    let result: AuditLog[] = logs.filter(Boolean).map((l: string) => JSON.parse(l));
    
    if (filters?.tipo) result = result.filter((l) => l.tipo === filters.tipo);
    if (filters?.usuario_id) result = result.filter((l) => l.usuario_id === filters.usuario_id);
    if (filters?.producto_id) result = result.filter((l) => l.producto_id === filters.producto_id);
    
    return result.reverse().slice(0, limit);
  }
}
```

### Paso 7: Implementar rutas del API (inventory.ts)
**Deliverable:** GET/POST `/api/inventory` funcionales

```typescript
// src/routes/inventory.ts
import { InventoryService } from '../services/inventory-service';
import { AuditService } from '../services/audit-service';
import { requireAuth, requireAdmin } from '../middleware/auth';

export async function handleInventoryRequest(
  request: Request,
  kv: KVNamespace
): Promise<Response> {
  const { pathname, search } = new URL(request.url);
  const inventoryService = new InventoryService(kv);
  const auditService = new AuditService(kv);
  
  try {
    // GET /api/inventory
    if (request.method === 'GET' && pathname === '/api/inventory') {
      const { userID } = await requireAuth(request);
      const products = await inventoryService.getProducts();
      const totals = await inventoryService.calculateTotals();
      
      return new Response(JSON.stringify({
        success: true,
        products,
        totals,
        sync_time: new Date().toISOString()
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    
    // GET /api/inventory/:id
    if (request.method === 'GET' && pathname.startsWith('/api/inventory/') && !pathname.includes('/ingreso')) {
      const { userID } = await requireAuth(request);
      const id = pathname.split('/').pop();
      const product = await inventoryService.getProduct(id);
      
      if (!product) {
        return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), { status: 404 });
      }
      
      return new Response(JSON.stringify({ success: true, product }), { status: 200 });
    }
    
    // POST /api/inventory/:id/ingreso (Admin only)
    if (request.method === 'POST' && pathname.includes('/ingreso')) {
      const { userID } = await requireAdmin(request);
      const id = pathname.split('/')[3];
      const { cantidad } = await request.json();
      
      const updated = await inventoryService.addStock(id, cantidad, userID);
      
      await auditService.log({
        tipo: 'ingreso',
        usuario_id: userID,
        producto_id: id,
        cantidad_antes: updated.cantidad_total - cantidad,
        cantidad_despues: updated.cantidad_total,
        detalles: { razon: 'Ingreso manual', cantidad }
      });
      
      return new Response(JSON.stringify({ success: true, product: updated }), { status: 200 });
    }
    
    return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), { status: 404 });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 400 });
  }
}
```

### Paso 8: Implementar rutas del API (holds.ts)
**Deliverable:** POST/GET/PATCH `/api/holds` funcionales

### Paso 9: Implementar rutas del API (audit.ts)
**Deliverable:** GET `/api/audit` con filtros funcional

### Paso 10: Implementar rutas del API (settings.ts)
**Deliverable:** GET/PATCH `/api/settings` funcionales

### Paso 11: Crear punto de entrada (index.ts)
**Deliverable:** Worker router centralizadoque coordina todas las rutas

### Paso 12: Frontend - Crear módulo de inventario (inventory-module.html)
**Deliverable:** 
- Tabla de productos (cantidad, bloqueada, disponible, valor)
- Formulario para ingresar stock (Admin only)
- KPI cards con valor total en tiempo real

```html
<!-- web/app/inventory-module.html -->
<div id="inventory-module" class="page">
  <!-- KPI Cards -->
  <div class="stats">
    <div class="sc">
      <div class="sl">Valor Total Stock</div>
      <div class="sv gold" id="kpi-valor-total">$0.00</div>
    </div>
    <div class="sc">
      <div class="sl">Cantidad Total</div>
      <div class="sv" id="kpi-cantidad-total">0</div>
    </div>
    <div class="sc">
      <div class="sl">Bloqueado</div>
      <div class="sv" id="kpi-cantidad-bloqueada">0</div>
    </div>
    <div class="sc">
      <div class="sl">Disponible</div>
      <div class="sv" id="kpi-cantidad-disponible">0</div>
    </div>
  </div>
  
  <!-- Tabla de Productos -->
  <table class="ptbl">
    <thead>
      <tr>
        <th>Producto</th>
        <th>Precio Costo</th>
        <th>Total</th>
        <th>Bloqueado</th>
        <th>Disponible</th>
        <th>Valor Total</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody id="inventory-table-body">
      <!-- Rellenado por inventory-sync.js -->
    </tbody>
  </table>
  
  <!-- Formulario Ingreso (Admin only) -->
  <div id="ingreso-form" style="display:none;">
    <div class="page">
      <h3>Agregar Stock</h3>
      <form onsubmit="handleIngresoSubmit(event)">
        <select id="ingreso-producto" required>
          <option value="">Seleccionar producto...</option>
        </select>
        <input type="number" id="ingreso-cantidad" placeholder="Cantidad" required min="1" />
        <button type="submit" class="btn bg">Agregar Stock</button>
      </form>
    </div>
  </div>
</div>
```

### Paso 13: Frontend - Crear sincronización (inventory-sync.js)
**Deliverable:** Polling cada 30s que sincroniza con backend

```javascript
// web/app/js/inventory-sync.js
let inventorySyncInterval;

export function startInventorySync() {
  // Sincronizar inmediatamente
  syncInventory();
  
  // Luego cada 30 segundos
  inventorySyncInterval = setInterval(syncInventory, 30000);
  
  // Limpiar al unload
  window.addEventListener('unload', () => clearInterval(inventorySyncInterval));
}

async function syncInventory() {
  try {
    const userId = sessionStorage.getItem('tabiraices_user');
    const userRole = sessionStorage.getItem('tabiraices_user_role') || 'vendedor';
    
    const response = await fetch('/api/inventory', {
      headers: {
        'X-User-ID': userId,
        'X-User-Role': userRole
      }
    });
    
    if (!response.ok) throw new Error('Sync failed');
    
    const data = await response.json();
    localStorage.setItem('tabiraices_inventory_cache', JSON.stringify(data));
    
    // Disparar evento para actualizar UI
    window.dispatchEvent(new CustomEvent('inventory:updated', { detail: data }));
    
    // Renderizar tabla
    renderInventoryTable(data.products);
    updateKPIs(data.totals);
    
    // Verificar holds expirados
    checkExpiredHolds(data.holds);
  } catch (error) {
    console.error('Inventory sync error:', error);
  }
}

function renderInventoryTable(products) {
  const tbody = document.getElementById('inventory-table-body');
  tbody.innerHTML = products.map(p => `
    <tr>
      <td>${p.nombre}</td>
      <td>$${p.precio_costo}</td>
      <td>${p.cantidad_total}</td>
      <td><span style="color: var(--warning)">${p.cantidad_bloqueada}</span></td>
      <td><span style="color: var(--success)">${p.cantidad_disponible}</span></td>
      <td>$${p.valor_total.toFixed(2)}</td>
      <td>
        ${userRole === 'admin' ? `<button onclick="openIngresoForm('${p.id}')">+ Agregar</button>` : ''}
      </td>
    </tr>
  `).join('');
}

function updateKPIs(totals) {
  document.getElementById('kpi-valor-total').textContent = `$${totals.valor_total.toFixed(2)}`;
  document.getElementById('kpi-cantidad-total').textContent = totals.cantidad_total;
  document.getElementById('kpi-cantidad-bloqueada').textContent = totals.cantidad_bloqueada;
  document.getElementById('kpi-cantidad-disponible').textContent = totals.cantidad_disponible;
}
```

### Paso 14: Frontend - Crear monitor de holds (holds-manager.js)
**Deliverable:** Detecta holds expirados, muestra alertas, propone extensión

### Paso 15: Frontend - Crear módulo Centro (centro-module.html)
**Deliverable:** Dashboard admin con auditoría filtrable y estado de holds

### Paso 16: Actualizar app/index.html con nuevos módulos
**Deliverable:** Agregar tabs de navegación para inventario/centro

### Paso 17: Deploy del Worker a Cloudflare
**Deliverable:** Worker live en `api.tabiraices.pages.dev/api`

```bash
cd worker
npm run build
wrangler deploy
```

### Paso 18: Actualizar landing.html y cotizador con aviso legal 24h
**Deliverable:**
- Landing muestra: "Reservado por 24 horas sin responsabilidad de la empresa"
- Cotizador incluye hold_id en datos

### Paso 19: Testing completo
**Deliverable:** Verificar:
- ✅ Cotización genera hold de 24h
- ✅ Inventario se sincroniza cada 30s
- ✅ Valor total es tiempo real
- ✅ Hold expirado muestra alerta
- ✅ Marcar pagada resta del stock
- ✅ Auditoría registra todo
- ✅ Admin ve todas, vendedor ve solo suyas

### Paso 20: Deploy a producción
**Deliverable:**
- Push a main → GitHub Actions deploy automático
- Verificar en `https://tabiraices.pages.dev`

---

## 10. Environment Setup

### Prerequisites
- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Cuenta Cloudflare activa (con proyecto Pages existente)

### Environment Variables

| Variable | Descripción | Dónde obtener |
|----------|-------------|--------------|
| `CLOUDFLARE_API_TOKEN` | Token para CI/CD | Cloudflare > Account > API Tokens > Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | ID de tu cuenta | Cloudflare dashboard > Overview > Account ID |
| `CLOUDFLARE_DATABASE_ID` | ID de KV namespace | Cloudflare > Workers > KV > Crear namespace |

### Initial Setup Commands

```bash
# Clonar/navegar al repo
cd tabiraices-merge

# Instalar dependencias del Worker
cd worker
npm install
npm run build

# Probar localmente
wrangler dev

# Deploy a producción
wrangler deploy

# Verificar worker está vivo
curl https://api.tabiraices.pages.dev/api/inventory \
  -H "X-User-ID: test" \
  -H "X-User-Role: admin"
```

---

## 11. Dependencies

### Worker (Backend)

| Paquete | Propósito | Versión |
|---------|-----------|---------|
| `wrangler` | Cloudflare CLI | ^3.x |
| `typescript` | Lenguaje | ^5.x |
| `@cloudflare/workers-types` | TypeScript types para KV | ^4.x |

### Frontend

Dependencias que ya tienes + nuevas:
- JavaScript vanilla (no agregar frameworks)
- localStorage API (nativo)
- fetch API (nativo)

No agregar jQuery, React, Vue, etc.

---

## 12. CLAUDE.md (para el builder)

```markdown
# TABIRAÍCES — Sistema de Inventario

Sistema cloud de gestión de inventario integrado con cotizador. Bloquea material 24h en cotizaciones, sincroniza cada 30s, audita todo.

## Commands

- `cd worker && npm install` — Setup del Worker
- `cd worker && npm run build` — Build TypeScript
- `cd worker && wrangler dev` — Correr localmente
- `cd worker && wrangler deploy` — Deploy a producción

## Tech Stack

Cloudflare Worker (TypeScript) + Cloudflare KV (persistencia) + Frontend HTML vanilla + Polling 30s

## Architecture

### Backend
- **Worker API:** `/api/inventory`, `/api/holds`, `/api/audit`, `/api/settings`
- **KV Storage:** Productos, holds (con TTL), auditoría, configuración
- **Auth:** sessionStorage verificado via headers X-User-ID, X-User-Role

### Frontend
- **Módulos:** #nueva (existente), #inventario (NEW), #mis (existente), #centro (NEW)
- **Sync:** `inventory-sync.js` — polling cada 30s, dispara evento `inventory:updated`
- **Hold logic:** `holds-manager.js` — detecta expirados, muestra alertas

### Data Flow
```
Frontend crea cotización
  → POST /api/holds (crea hold de 24h en KV)
  → KV establece TTL automático
  → Auditoría registra "hold_creado"
  
Frontend sincroniza cada 30s
  → GET /api/inventory (estado actual)
  → Detecta holds expirados
  → Si expirado + sin stock → Alerta
  → Si expirado + hay stock → Propone extender
  
Admin marca pagada
  → PATCH /api/holds/:id/pagar
  → Resta producto.cantidad_total
  → Auditoría registra "venta"
  → KV actualiza valor total
```

## Key Patterns

1. **Todos los cambios en KV = Auditoría:** Cada `kv.put()` tiene un `auditService.log()`
2. **TTL para holds:** `await kv.put(key, value, { expirationTtl: 86400 })`
3. **Sincronización frontend:** `setInterval(syncInventory, 30000)` + event dispatch
4. **Rol-based access:** Check `X-User-Role` header en middleware antes de retornar datos

## Code Organization

- `src/index.ts` — Router principal
- `src/routes/*.ts` — Endpoints específicos (inventory, holds, audit, settings)
- `src/services/*.ts` — Lógica de negocio (no tocar KV directamente)
- `src/middleware/*.ts` — Auth y validación
- `src/types/index.ts` — Tipos TypeScript compartidos

## Design System

**Colors:** Navy (#0D1B2A), Gold (#F5C010), Success (#10B981), Warning (#FBBF24), Danger (#EF4444)
**Typography:** Montserrat 500/700/800, uppercase labels
**Spacing:** Base 4px, scale: 4, 8, 12, 16, 24, 32, 48, 64
**Aesthetic:** Clean admin tool, function > form, minimal animations

## Reglas No Negociables

1. **Auditoría completa:** TODA modificación de inventario = log en KV con usuario + timestamp
2. **Hold TTL es nativo:** No usar JavaScript timers; dejar que KV auto-expire los holds
3. **Sincronización cada 30s:** No WebSocket, no polling más frecuente
4. **Frontend = localStorage caché:** Nunca hacer fetch síncrono; siempre async + event-driven
5. **Roles en headers:** Frontend agrega X-User-ID, X-User-Role; backend verifica siempre

## Environment

- `CLOUDFLARE_API_TOKEN` — Token para CI/CD (GitHub Actions)
- `CLOUDFLARE_ACCOUNT_ID` — ID de cuenta Cloudflare
- `CLOUDFLARE_DATABASE_ID` — ID de KV namespace

## Deployment

```bash
# Local
wrangler dev

# Production (auto via GitHub Actions)
git push origin main
# → .github/workflows/deploy.yml ejecuta wrangler deploy
```

---
```

---

## ✅ Resumen Final

**Arquitectura:**
- Frontend existente + 2 módulos nuevos (Inventario, Centro)
- Worker TypeScript con 4 rutas principales
- KV con schema simplificado pero potente
- Auditoría completa (todo guardado)
- Sincronización cada 30s (confiable, bajo overhead)

**Lógica de Holds:**
- Cotización crea hold → Material bloqueado 24h
- Hold expira automáticamente en KV
- Si expirado + sin stock → Alerta
- Si expirado + hay stock → Pregunta extender
- Pago convierte hold → Venta real (resta stock)

**Seguridad:**
- Role-based access (Admin vs Vendedor)
- Auditoría completa (100% trazabilidad)
- Datos en Cloudflare (mismo CDN que el sitio)

**Build Order:** 20 pasos claros desde cero hasta deploy

¿Confirmado para proceder al build? 🚀
