import { InventoryService } from '../services/inventory-service';
import { AuditService } from '../services/audit-service';
import { HoldsService } from '../services/holds-service';
import { requirePermiso, AuthError } from '../middleware/auth';
import { puede } from '../lib/roles';
/**
 * Recorta el margen del negocio para quien no tenga 'ver_costos'.
 *
 * ⚠️ Esto DEBE pasar en el servidor. Ocultar la columna en la pantalla no es
 * seguridad: el dato ya viajó y se lee en las herramientas del navegador.
 */
function proyectarProducto(p, usuario) {
    const base = {
        id: p.id,
        nombre: p.nombre,
        precio_venta: p.precio_venta,
        cantidad_total: p.cantidad_total,
        cantidad_bloqueada: p.cantidad_bloqueada,
        cantidad_disponible: p.cantidad_disponible,
    };
    if (!puede(usuario, 'ver_costos'))
        return base;
    return {
        ...base,
        precio_costo: p.precio_costo,
        valor_total: p.valor_total,
        creado_en: p.creado_en,
        actualizado_en: p.actualizado_en,
    };
}
const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
export async function handleInventoryRequest(request, kv, usuariosKV) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const inventoryService = new InventoryService(kv);
    const auditService = new AuditService(kv);
    const holdsService = new HoldsService(kv);
    try {
        // GET /api/inventory/valor/total — antes que el patrón genérico /:id
        if (request.method === 'GET' && pathname === '/api/inventory/valor/total') {
            const yo = await requirePermiso(request, usuariosKV, 'ver_costos');
            const products = await inventoryService.getProducts();
            const totals = await inventoryService.calculateTotals();
            return json({
                success: true,
                data: {
                    valor_total_stock: totals.valor_total,
                    cantidad_total_items: totals.cantidad_total,
                    cantidad_bloqueada_total: totals.cantidad_bloqueada,
                    cantidad_disponible_total: totals.cantidad_disponible,
                    productos: products.map((p) => proyectarProducto(p, yo)),
                },
            });
        }
        // GET /api/inventory
        if (request.method === 'GET' && pathname === '/api/inventory') {
            const yo = await requirePermiso(request, usuariosKV, 'ver_stock');
            const products = await inventoryService.getProducts();
            const totals = await inventoryService.calculateTotals();
            const holds = await holdsService.getActiveHolds(puede(yo, 'ver_todas') ? undefined : yo.id);
            // El valor total del inventario también es información de margen.
            const totalsVisibles = puede(yo, 'ver_costos')
                ? totals
                : {
                    cantidad_total: totals.cantidad_total,
                    cantidad_bloqueada: totals.cantidad_bloqueada,
                    cantidad_disponible: totals.cantidad_disponible,
                };
            const response = {
                success: true,
                data: {
                    products: products.map((p) => proyectarProducto(p, yo)),
                    totals: totalsVisibles,
                    holds,
                    sync_time: new Date().toISOString(),
                },
            };
            return json(response);
        }
        // POST /api/inventory/crear
        if (request.method === 'POST' && pathname === '/api/inventory/crear') {
            const yo = await requirePermiso(request, usuariosKV, 'inventario');
            const body = (await request.json());
            const { id, nombre, precio_costo, precio_venta, cantidad_inicial } = body;
            if (!id || !nombre || !precio_costo || !precio_venta)
                throw new Error('MISSING_FIELDS');
            await inventoryService.ensureInitialized();
            if (await inventoryService.getProduct(id))
                throw new Error('PRODUCT_ALREADY_EXISTS');
            const newProduct = await inventoryService.createProduct({
                id,
                nombre,
                precio_costo: parseFloat(precio_costo),
                precio_venta: parseFloat(precio_venta),
                cantidad_inicial: parseInt(cantidad_inicial) || 0,
            });
            await auditService.log({
                tipo: 'configuracion',
                usuario_id: yo.usuario,
                producto_id: id,
                cantidad_antes: 0,
                cantidad_despues: newProduct.cantidad_total,
                detalles: { razon: 'Nuevo producto creado', nombre, precio_costo, precio_venta },
            });
            return json({ success: true, data: newProduct }, 201);
        }
        // POST /api/inventory/:id/ingreso
        if (request.method === 'POST' && pathname.includes('/ingreso')) {
            const yo = await requirePermiso(request, usuariosKV, 'ingreso');
            const id = pathname.split('/')[3];
            const body = (await request.json());
            const { cantidad, notas } = body;
            if (!cantidad || cantidad <= 0)
                throw new Error('INVALID_QUANTITY');
            await inventoryService.ensureInitialized();
            const product = await inventoryService.getProduct(id);
            if (!product)
                throw new Error('PRODUCT_NOT_FOUND');
            const cantidadAntes = product.cantidad_total;
            const updated = await inventoryService.addStock(id, cantidad);
            await auditService.log({
                tipo: 'ingreso',
                usuario_id: yo.usuario,
                producto_id: id,
                cantidad_antes: cantidadAntes,
                cantidad_despues: updated.cantidad_total,
                detalles: { razon: 'Ingreso manual', cantidad, notas },
            });
            return json({ success: true, data: updated });
        }
        // GET /api/inventory/:id
        if (request.method === 'GET' &&
            pathname.match(/^\/api\/inventory\/[^/]+$/) &&
            !pathname.includes('/ingreso')) {
            const yo = await requirePermiso(request, usuariosKV, 'ver_stock');
            const id = pathname.split('/').pop();
            if (!id)
                throw new Error('INVALID_PRODUCT_ID');
            const product = await inventoryService.getProduct(id);
            if (!product)
                return json({ success: false, error: 'NOT_FOUND' }, 404);
            return json({ success: true, data: proyectarProducto(product, yo) });
        }
        return json({ success: false, error: 'NOT_FOUND' }, 404);
    }
    catch (error) {
        // Los errores de sesión los traduce el enrutador principal.
        if (error instanceof AuthError)
            throw error;
        console.error('Inventory route error:', error);
        return json({ success: false, error: error.message }, 400);
    }
}
