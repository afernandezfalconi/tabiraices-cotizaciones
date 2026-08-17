import { InventoryService } from '../services/inventory-service';
import { AuditService } from '../services/audit-service';
import { HoldsService } from '../services/holds-service';
import { requireAuth, requireAdmin } from '../middleware/auth';
export async function handleInventoryRequest(request, kv) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const inventoryService = new InventoryService(kv);
    const auditService = new AuditService(kv);
    const holdsService = new HoldsService(kv);
    try {
        // GET /api/inventory/init - Initialize KV (no auth required for testing) - MUST BE FIRST
        if (request.method === 'GET' && pathname === '/api/inventory/init') {
            try {
                await inventoryService.ensureInitialized();
                return new Response(JSON.stringify({ success: true, message: 'KV initialized successfully' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            catch (e) {
                return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }
        // GET /api/inventory/valor/total - MUST BE BEFORE /api/inventory/:id
        if (request.method === 'GET' && pathname === '/api/inventory/valor/total') {
            const auth = await requireAuth(request);
            const products = await inventoryService.getProducts();
            const totals = await inventoryService.calculateTotals();
            return new Response(JSON.stringify({
                success: true,
                data: {
                    valor_total_stock: totals.valor_total,
                    cantidad_total_items: totals.cantidad_total,
                    cantidad_bloqueada_total: totals.cantidad_bloqueada,
                    cantidad_disponible_total: totals.cantidad_disponible,
                    productos: products,
                },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // GET /api/inventory
        if (request.method === 'GET' && pathname === '/api/inventory') {
            const auth = await requireAuth(request);
            const products = await inventoryService.getProducts();
            const totals = await inventoryService.calculateTotals();
            const holds = await holdsService.getActiveHolds(auth.userRole === 'vendedor' ? auth.userID : undefined);
            const response = {
                success: true,
                data: {
                    products,
                    totals,
                    holds,
                    sync_time: new Date().toISOString(),
                },
            };
            return new Response(JSON.stringify(response), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // POST /api/inventory/crear (Admin only - Create new product)
        if (request.method === 'POST' &&
            pathname === '/api/inventory/crear') {
            const auth = await requireAdmin(request);
            const body = (await request.json());
            const { id, nombre, precio_costo, precio_venta, cantidad_inicial } = body;
            if (!id || !nombre || !precio_costo || !precio_venta) {
                throw new Error('MISSING_FIELDS');
            }
            await inventoryService.ensureInitialized();
            const existingProduct = await inventoryService.getProduct(id);
            if (existingProduct)
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
                usuario_id: auth.userID,
                producto_id: id,
                cantidad_antes: 0,
                cantidad_despues: newProduct.cantidad_total,
                detalles: { razon: 'Nuevo producto creado', nombre, precio_costo, precio_venta },
            });
            return new Response(JSON.stringify({ success: true, data: newProduct }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // POST /api/inventory/:id/ingreso (Admin only)
        if (request.method === 'POST' &&
            pathname.includes('/ingreso')) {
            const auth = await requireAdmin(request);
            const id = pathname.split('/')[3];
            const body = (await request.json());
            const { cantidad, notas } = body;
            if (!cantidad || cantidad <= 0)
                throw new Error('INVALID_QUANTITY');
            // Ensure KV is initialized before attempting to get product
            await inventoryService.ensureInitialized();
            const product = await inventoryService.getProduct(id);
            if (!product)
                throw new Error('PRODUCT_NOT_FOUND');
            const cantidadAntes = product.cantidad_total;
            const updated = await inventoryService.addStock(id, cantidad);
            await auditService.log({
                tipo: 'ingreso',
                usuario_id: auth.userID,
                producto_id: id,
                cantidad_antes: cantidadAntes,
                cantidad_despues: updated.cantidad_total,
                detalles: { razon: 'Ingreso manual', cantidad, notas },
            });
            return new Response(JSON.stringify({ success: true, data: updated }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // GET /api/inventory/:id
        if (request.method === 'GET' &&
            pathname.match(/^\/api\/inventory\/[^/]+$/) &&
            !pathname.includes('/ingreso')) {
            const auth = await requireAuth(request);
            const id = pathname.split('/').pop();
            if (!id)
                throw new Error('INVALID_PRODUCT_ID');
            const product = await inventoryService.getProduct(id);
            if (!product) {
                return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ success: true, data: product }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    catch (error) {
        console.error('Inventory route error:', error);
        const status = error.message === 'UNAUTHORIZED'
            ? 401
            : error.message === 'FORBIDDEN'
                ? 403
                : 400;
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
