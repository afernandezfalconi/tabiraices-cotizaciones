var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/services/inventory-service.ts
var InventoryService = class {
  constructor(kv) {
    this.kv = kv;
  }
  async getProducts() {
    try {
      let index = await this.kv.get("inventory:index");
      if (!index) {
        await this.initializeDefaultProducts();
        index = await this.kv.get("inventory:index");
      }
      if (!index)
        return [];
      const ids = JSON.parse(index);
      const products = await Promise.all(
        ids.map((id) => this.kv.get(`inventory:${id}`))
      );
      return products.filter((p) => p !== null).map((p) => JSON.parse(p));
    } catch (error) {
      console.error("Error getting products:", error);
      return [];
    }
  }
  async initializeDefaultProducts() {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const defaultProducts = [
      {
        id: "prod-001",
        nombre: "Postes lineales 10x10",
        precio_costo: 250,
        precio_venta: 350,
        cantidad_total: 100,
        cantidad_bloqueada: 0,
        cantidad_disponible: 100,
        valor_total: 25e3,
        creado_en: now,
        actualizado_en: now
      },
      {
        id: "prod-002",
        nombre: "Postes esquineros 12x12",
        precio_costo: 250,
        precio_venta: 350,
        cantidad_total: 50,
        cantidad_bloqueada: 0,
        cantidad_disponible: 50,
        valor_total: 12500,
        creado_en: now,
        actualizado_en: now
      }
    ];
    for (const product of defaultProducts) {
      await this.kv.put(`inventory:${product.id}`, JSON.stringify(product));
    }
    await this.kv.put("inventory:index", JSON.stringify(defaultProducts.map((p) => p.id)));
  }
  async ensureInitialized() {
    const index = await this.kv.get("inventory:index");
    if (!index) {
      await this.initializeDefaultProducts();
    }
  }
  async getProduct(id) {
    try {
      let data = await this.kv.get(`inventory:${id}`);
      if (!data) {
        await this.initializeDefaultProducts();
        data = await this.kv.get(`inventory:${id}`);
      }
      return data ? JSON.parse(data) : null;
    } catch (error) {
      return null;
    }
  }
  async calculateTotals() {
    const products = await this.getProducts();
    return {
      valor_total: products.reduce((s, p) => s + p.valor_total, 0),
      cantidad_total: products.reduce((s, p) => s + p.cantidad_total, 0),
      cantidad_bloqueada: products.reduce((s, p) => s + p.cantidad_bloqueada, 0),
      cantidad_disponible: products.reduce((s, p) => s + p.cantidad_disponible, 0)
    };
  }
  async addStock(productId, quantity) {
    const product = await this.getProduct(productId);
    if (!product)
      throw new Error("PRODUCT_NOT_FOUND");
    product.cantidad_total += quantity;
    product.valor_total = product.cantidad_total * product.precio_costo;
    product.cantidad_disponible = product.cantidad_total - product.cantidad_bloqueada;
    product.actualizado_en = (/* @__PURE__ */ new Date()).toISOString();
    await this.kv.put(`inventory:${productId}`, JSON.stringify(product));
    return product;
  }
  async updateBlockedQuantity(productId, bloqueada) {
    const product = await this.getProduct(productId);
    if (!product)
      return null;
    product.cantidad_bloqueada = bloqueada;
    product.cantidad_disponible = product.cantidad_total - product.cantidad_bloqueada;
    product.actualizado_en = (/* @__PURE__ */ new Date()).toISOString();
    await this.kv.put(`inventory:${productId}`, JSON.stringify(product));
    return product;
  }
  async deductStock(productId, quantity) {
    const product = await this.getProduct(productId);
    if (!product)
      throw new Error("PRODUCT_NOT_FOUND");
    if (product.cantidad_total < quantity)
      throw new Error("INSUFFICIENT_STOCK");
    product.cantidad_total -= quantity;
    product.valor_total = product.cantidad_total * product.precio_costo;
    product.cantidad_disponible = product.cantidad_total - product.cantidad_bloqueada;
    product.actualizado_en = (/* @__PURE__ */ new Date()).toISOString();
    await this.kv.put(`inventory:${productId}`, JSON.stringify(product));
    return product;
  }
  async createProduct(data) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newProduct = {
      id: data.id,
      nombre: data.nombre,
      precio_costo: data.precio_costo,
      precio_venta: data.precio_venta,
      cantidad_total: data.cantidad_inicial || 0,
      cantidad_bloqueada: 0,
      cantidad_disponible: data.cantidad_inicial || 0,
      valor_total: (data.cantidad_inicial || 0) * data.precio_costo,
      creado_en: now,
      actualizado_en: now
    };
    await this.kv.put(`inventory:${data.id}`, JSON.stringify(newProduct));
    let index = await this.kv.get("inventory:index");
    const ids = index ? JSON.parse(index) : [];
    if (!ids.includes(data.id)) {
      ids.push(data.id);
      await this.kv.put("inventory:index", JSON.stringify(ids));
    }
    return newProduct;
  }
};
__name(InventoryService, "InventoryService");

// src/services/audit-service.ts
var AuditService = class {
  constructor(kv) {
    this.kv = kv;
  }
  async log(auditLog) {
    const id = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const log = { ...auditLog, id, timestamp };
    const key = `audit:${timestamp}:${id}`;
    await this.kv.put(key, JSON.stringify(log));
    return log;
  }
  async getLogs(limit = 100, filters) {
    try {
      const list = await this.kv.list({ prefix: "audit:", limit: 1e3 });
      const logs = await Promise.all(
        list.keys.map((key) => this.kv.get(key.name))
      );
      let result = logs.filter((l) => l !== null).map((l) => JSON.parse(l));
      if (filters?.tipo) {
        result = result.filter((l) => l.tipo === filters.tipo);
      }
      if (filters?.usuario_id) {
        result = result.filter((l) => l.usuario_id === filters.usuario_id);
      }
      if (filters?.producto_id) {
        result = result.filter((l) => l.producto_id === filters.producto_id);
      }
      return result.reverse().slice(0, limit);
    } catch (error) {
      console.error("Error getting audit logs:", error);
      return [];
    }
  }
};
__name(AuditService, "AuditService");

// src/services/holds-service.ts
var HoldsService = class {
  constructor(kv) {
    this.kv = kv;
  }
  async createHold(cotizacionId, productId, cantidad, createdBy, holdDurationHours = 24) {
    const holdId = `hold-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = /* @__PURE__ */ new Date();
    const expireAt = new Date(now.getTime() + holdDurationHours * 60 * 60 * 1e3);
    const hold = {
      id: holdId,
      cotizacion_id: cotizacionId,
      producto_id: productId,
      cantidad,
      creado_por: createdBy,
      creado_en: now.toISOString(),
      expira_en: expireAt.toISOString(),
      estado: "pendiente"
    };
    const ttlSeconds = holdDurationHours * 60 * 60;
    await this.kv.put(`hold:${holdId}`, JSON.stringify(hold), {
      expirationTtl: ttlSeconds
    });
    const activeList = await this.kv.get("holds:active");
    const activeIds = activeList ? JSON.parse(activeList) : [];
    activeIds.push(holdId);
    await this.kv.put("holds:active", JSON.stringify(activeIds));
    return hold;
  }
  async getActiveHolds(userId) {
    try {
      const activeList = await this.kv.get("holds:active");
      if (!activeList)
        return [];
      const holdIds = JSON.parse(activeList);
      const holds = await Promise.all(
        holdIds.map((id) => this.kv.get(`hold:${id}`))
      );
      let result = holds.filter((h) => h !== null).map((h) => JSON.parse(h));
      if (userId) {
        result = result.filter((h) => h.creado_por === userId);
      }
      return result;
    } catch (error) {
      console.error("Error getting active holds:", error);
      return [];
    }
  }
  async getHold(holdId) {
    try {
      const holdData = await this.kv.get(`hold:${holdId}`);
      return holdData ? JSON.parse(holdData) : null;
    } catch (error) {
      console.error(`Error getting hold ${holdId}:`, error);
      return null;
    }
  }
  async convertToPaid(holdId) {
    const holdData = await this.kv.get(`hold:${holdId}`);
    if (!holdData)
      throw new Error("HOLD_NOT_FOUND");
    const hold = JSON.parse(holdData);
    if (hold.estado !== "pendiente") {
      throw new Error("HOLD_NOT_PENDING");
    }
    hold.estado = "pagada";
    await this.kv.put(`hold:${holdId}`, JSON.stringify(hold));
    return hold;
  }
  async releaseHold(holdId) {
    const holdData = await this.kv.get(`hold:${holdId}`);
    if (!holdData)
      throw new Error("HOLD_NOT_FOUND");
    const hold = JSON.parse(holdData);
    hold.estado = "liberada";
    await this.kv.put(`hold:${holdId}`, JSON.stringify(hold));
    const activeList = await this.kv.get("holds:active");
    if (activeList) {
      const activeIds = JSON.parse(activeList);
      const filtered = activeIds.filter((id) => id !== holdId);
      await this.kv.put("holds:active", JSON.stringify(filtered));
    }
    return hold;
  }
};
__name(HoldsService, "HoldsService");

// src/middleware/auth.ts
async function requireAuth(request) {
  const userID = request.headers.get("X-User-ID");
  const userRole = request.headers.get("X-User-Role");
  if (!userID || !userRole) {
    throw new Error("UNAUTHORIZED");
  }
  if (userRole !== "admin" && userRole !== "vendedor") {
    throw new Error("INVALID_ROLE");
  }
  return {
    userID,
    userRole
  };
}
__name(requireAuth, "requireAuth");
async function requireAdmin(request) {
  const auth = await requireAuth(request);
  if (auth.userRole !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return auth;
}
__name(requireAdmin, "requireAdmin");

// src/routes/inventory.ts
async function handleInventoryRequest(request, kv) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const inventoryService = new InventoryService(kv);
  const auditService = new AuditService(kv);
  const holdsService = new HoldsService(kv);
  try {
    if (request.method === "GET" && pathname === "/api/inventory/init") {
      try {
        await inventoryService.ensureInitialized();
        return new Response(
          JSON.stringify({ success: true, message: "KV initialized successfully" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    if (request.method === "GET" && pathname === "/api/inventory/valor/total") {
      const auth = await requireAuth(request);
      const products = await inventoryService.getProducts();
      const totals = await inventoryService.calculateTotals();
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            valor_total_stock: totals.valor_total,
            cantidad_total_items: totals.cantidad_total,
            cantidad_bloqueada_total: totals.cantidad_bloqueada,
            cantidad_disponible_total: totals.cantidad_disponible,
            productos: products
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (request.method === "GET" && pathname === "/api/inventory") {
      const auth = await requireAuth(request);
      const products = await inventoryService.getProducts();
      const totals = await inventoryService.calculateTotals();
      const holds = await holdsService.getActiveHolds(
        auth.userRole === "vendedor" ? auth.userID : void 0
      );
      const response = {
        success: true,
        data: {
          products,
          totals,
          holds,
          sync_time: (/* @__PURE__ */ new Date()).toISOString()
        }
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (request.method === "POST" && pathname === "/api/inventory/crear") {
      const auth = await requireAdmin(request);
      const body = await request.json();
      const { id, nombre, precio_costo, precio_venta, cantidad_inicial } = body;
      if (!id || !nombre || !precio_costo || !precio_venta) {
        throw new Error("MISSING_FIELDS");
      }
      await inventoryService.ensureInitialized();
      const existingProduct = await inventoryService.getProduct(id);
      if (existingProduct)
        throw new Error("PRODUCT_ALREADY_EXISTS");
      const newProduct = await inventoryService.createProduct({
        id,
        nombre,
        precio_costo: parseFloat(precio_costo),
        precio_venta: parseFloat(precio_venta),
        cantidad_inicial: parseInt(cantidad_inicial) || 0
      });
      await auditService.log({
        tipo: "configuracion",
        usuario_id: auth.userID,
        producto_id: id,
        cantidad_antes: 0,
        cantidad_despues: newProduct.cantidad_total,
        detalles: { razon: "Nuevo producto creado", nombre, precio_costo, precio_venta }
      });
      return new Response(JSON.stringify({ success: true, data: newProduct }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (request.method === "POST" && pathname.includes("/ingreso")) {
      const auth = await requireAdmin(request);
      const id = pathname.split("/")[3];
      const body = await request.json();
      const { cantidad, notas } = body;
      if (!cantidad || cantidad <= 0)
        throw new Error("INVALID_QUANTITY");
      await inventoryService.ensureInitialized();
      const product = await inventoryService.getProduct(id);
      if (!product)
        throw new Error("PRODUCT_NOT_FOUND");
      const cantidadAntes = product.cantidad_total;
      const updated = await inventoryService.addStock(id, cantidad);
      await auditService.log({
        tipo: "ingreso",
        usuario_id: auth.userID,
        producto_id: id,
        cantidad_antes: cantidadAntes,
        cantidad_despues: updated.cantidad_total,
        detalles: { razon: "Ingreso manual", cantidad, notas }
      });
      return new Response(JSON.stringify({ success: true, data: updated }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (request.method === "GET" && pathname.match(/^\/api\/inventory\/[^/]+$/) && !pathname.includes("/ingreso")) {
      const auth = await requireAuth(request);
      const id = pathname.split("/").pop();
      if (!id)
        throw new Error("INVALID_PRODUCT_ID");
      const product = await inventoryService.getProduct(id);
      if (!product) {
        return new Response(
          JSON.stringify({ success: false, error: "NOT_FOUND" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ success: true, data: product }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ success: false, error: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Inventory route error:", error);
    const status = error.message === "UNAUTHORIZED" ? 401 : error.message === "FORBIDDEN" ? 403 : 400;
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(handleInventoryRequest, "handleInventoryRequest");

// src/routes/holds.ts
async function handleHoldsRequest(request, kv, settings) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const holdsService = new HoldsService(kv);
  const inventoryService = new InventoryService(kv);
  const auditService = new AuditService(kv);
  try {
    if (request.method === "POST" && pathname === "/api/holds") {
      const auth = await requireAuth(request);
      const body = await request.json();
      const { cotizacion_id, producto_id, cantidad, notas } = body;
      if (!cotizacion_id || !producto_id || !cantidad || cantidad <= 0) {
        throw new Error("INVALID_HOLD_DATA");
      }
      const product = await inventoryService.getProduct(producto_id);
      if (!product)
        throw new Error("PRODUCT_NOT_FOUND");
      if (product.cantidad_disponible < cantidad) {
        throw new Error("INSUFFICIENT_AVAILABLE_STOCK");
      }
      const hold = await holdsService.createHold(
        cotizacion_id,
        producto_id,
        cantidad,
        auth.userID,
        settings.hold_duracion_horas || 24
      );
      const newBlockedQty = product.cantidad_bloqueada + cantidad;
      await inventoryService.updateBlockedQuantity(producto_id, newBlockedQty);
      await auditService.log({
        tipo: "hold_creado",
        usuario_id: auth.userID,
        producto_id,
        cantidad_antes: product.cantidad_bloqueada,
        cantidad_despues: newBlockedQty,
        detalles: {
          hold_id: hold.id,
          cotizacion_id,
          notas
        }
      });
      return new Response(JSON.stringify({ success: true, data: hold }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (request.method === "GET" && pathname === "/api/holds") {
      const auth = await requireAuth(request);
      const holds = await holdsService.getActiveHolds(
        auth.userRole === "vendedor" ? auth.userID : void 0
      );
      return new Response(JSON.stringify({ success: true, data: holds }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (request.method === "GET" && pathname.match(/^\/api\/holds\/[^/]+$/)) {
      const auth = await requireAuth(request);
      const holdId = pathname.split("/").pop();
      if (!holdId)
        throw new Error("INVALID_HOLD_ID");
      const hold = await holdsService.getHold(holdId);
      if (!hold) {
        return new Response(
          JSON.stringify({ success: false, error: "NOT_FOUND" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      if (auth.userRole === "vendedor" && hold.creado_por !== auth.userID) {
        return new Response(
          JSON.stringify({ success: false, error: "FORBIDDEN" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ success: true, data: hold }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (request.method === "PATCH" && pathname.includes("/pagar")) {
      const auth = await requireAdmin(request);
      const holdId = pathname.split("/")[3];
      if (!holdId)
        throw new Error("INVALID_HOLD_ID");
      const hold = await holdsService.getHold(holdId);
      if (!hold)
        throw new Error("HOLD_NOT_FOUND");
      if (hold.estado !== "pendiente")
        throw new Error("HOLD_NOT_PENDING");
      const updatedHold = await holdsService.convertToPaid(holdId);
      const product = await inventoryService.getProduct(hold.producto_id);
      if (!product)
        throw new Error("PRODUCT_NOT_FOUND");
      const updatedProduct = await inventoryService.deductStock(
        hold.producto_id,
        hold.cantidad
      );
      const newBlockedQty = Math.max(
        0,
        product.cantidad_bloqueada - hold.cantidad
      );
      await inventoryService.updateBlockedQuantity(
        hold.producto_id,
        newBlockedQty
      );
      await auditService.log({
        tipo: "venta",
        usuario_id: auth.userID,
        producto_id: hold.producto_id,
        cantidad_antes: product.cantidad_total,
        cantidad_despues: updatedProduct.cantidad_total,
        detalles: {
          hold_id: holdId,
          cotizacion_id: hold.cotizacion_id,
          razon: "Pago marcado"
        }
      });
      return new Response(
        JSON.stringify({
          success: true,
          data: { hold: updatedHold, producto: updatedProduct }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    return new Response(JSON.stringify({ success: false, error: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Holds route error:", error);
    const status = error.message === "UNAUTHORIZED" ? 401 : error.message === "FORBIDDEN" ? 403 : 400;
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(handleHoldsRequest, "handleHoldsRequest");

// src/routes/audit.ts
async function handleAuditRequest(request, kv) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const auditService = new AuditService(kv);
  try {
    if (request.method === "GET" && pathname === "/api/audit") {
      const auth = await requireAdmin(request);
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const tipo = url.searchParams.get("tipo") || void 0;
      const usuario_id = url.searchParams.get("usuario_id") || void 0;
      const producto_id = url.searchParams.get("producto_id") || void 0;
      const logs = await auditService.getLogs(limit, {
        tipo,
        usuario_id,
        producto_id
      });
      const response = {
        success: true,
        data: logs
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ success: false, error: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Audit route error:", error);
    const status = error.message === "UNAUTHORIZED" ? 401 : error.message === "FORBIDDEN" ? 403 : 400;
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(handleAuditRequest, "handleAuditRequest");

// src/routes/settings.ts
async function handleSettingsRequest(request, kv) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  try {
    if (request.method === "GET" && pathname === "/api/settings") {
      const auth = await requireAdmin(request);
      let settings = await kv.get("settings");
      if (!settings) {
        const defaultSettings = {
          hold_duracion_horas: 24,
          alert_stock_bajo: 0,
          ultima_actualizacion: (/* @__PURE__ */ new Date()).toISOString()
        };
        await kv.put("settings", JSON.stringify(defaultSettings));
        settings = JSON.stringify(defaultSettings);
      }
      const response = {
        success: true,
        data: JSON.parse(settings)
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (request.method === "PATCH" && pathname === "/api/settings") {
      const auth = await requireAdmin(request);
      const body = await request.json();
      let settings = await kv.get("settings");
      const currentSettings = settings ? JSON.parse(settings) : {
        hold_duracion_horas: 24,
        alert_stock_bajo: 0,
        ultima_actualizacion: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (body?.hold_duracion_horas !== void 0) {
        if (body.hold_duracion_horas < 1 || body.hold_duracion_horas > 240) {
          throw new Error("INVALID_HOLD_DURATION");
        }
        currentSettings.hold_duracion_horas = body.hold_duracion_horas;
      }
      if (body?.alert_stock_bajo !== void 0) {
        if (body.alert_stock_bajo < 0) {
          throw new Error("INVALID_ALERT_THRESHOLD");
        }
        currentSettings.alert_stock_bajo = body.alert_stock_bajo;
      }
      currentSettings.ultima_actualizacion = (/* @__PURE__ */ new Date()).toISOString();
      await kv.put("settings", JSON.stringify(currentSettings));
      const response = {
        success: true,
        data: currentSettings
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ success: false, error: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Settings route error:", error);
    const status = error.message === "UNAUTHORIZED" ? 401 : error.message === "FORBIDDEN" ? 403 : 400;
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(handleSettingsRequest, "handleSettingsRequest");

// src/index.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-User-ID, X-User-Role",
  "Access-Control-Max-Age": "86400"
};
function addCorsHeaders(response) {
  const newResponse = new Response(response.body, response);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });
  return newResponse;
}
__name(addCorsHeaders, "addCorsHeaders");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: CORS_HEADERS
      });
    }
    let settings = await env.INVENTORY_KV.get("settings");
    const defaultSettings = {
      hold_duracion_horas: 24,
      alert_stock_bajo: 0
    };
    const currentSettings = settings ? JSON.parse(settings) : defaultSettings;
    try {
      let response;
      if (pathname.startsWith("/api/inventory")) {
        response = await handleInventoryRequest(request, env.INVENTORY_KV);
      } else if (pathname.startsWith("/api/holds")) {
        response = await handleHoldsRequest(request, env.INVENTORY_KV, currentSettings);
      } else if (pathname.startsWith("/api/audit")) {
        response = await handleAuditRequest(request, env.INVENTORY_KV);
      } else if (pathname.startsWith("/api/settings")) {
        response = await handleSettingsRequest(request, env.INVENTORY_KV);
      } else if (pathname === "/health") {
        response = new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" }
        });
      } else {
        response = new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
      return addCorsHeaders(response);
    } catch (error) {
      console.error("Worker error:", error);
      const errorResponse = new Response(
        JSON.stringify({ success: false, error: "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
      return addCorsHeaders(errorResponse);
    }
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
