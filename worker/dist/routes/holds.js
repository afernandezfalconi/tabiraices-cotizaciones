import { HoldsService } from '../services/holds-service';
import { InventoryService } from '../services/inventory-service';
import { AuditService } from '../services/audit-service';
import { requirePermiso, AuthError } from '../middleware/auth';
import { puede } from '../lib/roles';
export async function handleHoldsRequest(request, kv, settings, usuariosKV) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const holdsService = new HoldsService(kv);
    const inventoryService = new InventoryService(kv);
    const auditService = new AuditService(kv);
    try {
        // POST /api/holds (crear hold)
        if (request.method === 'POST' && pathname === '/api/holds') {
            const auth = await requirePermiso(request, usuariosKV, 'apartar');
            const body = (await request.json());
            const { cotizacion_id, producto_id, cantidad, notas } = body;
            if (!cotizacion_id || !producto_id || !cantidad || cantidad <= 0) {
                throw new Error('INVALID_HOLD_DATA');
            }
            const product = await inventoryService.getProduct(producto_id);
            if (!product)
                throw new Error('PRODUCT_NOT_FOUND');
            if (product.cantidad_disponible < cantidad) {
                throw new Error('INSUFFICIENT_AVAILABLE_STOCK');
            }
            const hold = await holdsService.createHold(cotizacion_id, producto_id, cantidad, auth.id, // el id, no el nombre: es contra esto que se filtra "mis holds"
            settings.hold_duracion_horas || 24);
            // Actualizar cantidad bloqueada
            // Recalcular desde los apartados vigentes en vez de sumar sobre el valor
            // guardado: una lectura desfasada de KV perdería el incremento.
            const activos = await holdsService.getActiveHolds();
            const trasCrear = await inventoryService.recalcularBloqueado(producto_id, activos);
            const newBlockedQty = trasCrear ? trasCrear.cantidad_bloqueada : product.cantidad_bloqueada;
            // Auditoría
            await auditService.log({
                tipo: 'hold_creado',
                usuario_id: auth.usuario,
                producto_id,
                cantidad_antes: product.cantidad_bloqueada,
                cantidad_despues: newBlockedQty,
                detalles: {
                    hold_id: hold.id,
                    cotizacion_id,
                    notas,
                },
            });
            return new Response(JSON.stringify({ success: true, data: hold }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // GET /api/holds
        if (request.method === 'GET' && pathname === '/api/holds') {
            const auth = await requirePermiso(request, usuariosKV, 'apartar');
            const holds = await holdsService.getActiveHolds(puede(auth, 'ver_todas') ? undefined : auth.id);
            return new Response(JSON.stringify({ success: true, data: holds }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // GET /api/holds/:id
        if (request.method === 'GET' && pathname.match(/^\/api\/holds\/[^/]+$/)) {
            const auth = await requirePermiso(request, usuariosKV, 'apartar');
            const holdId = pathname.split('/').pop();
            if (!holdId)
                throw new Error('INVALID_HOLD_ID');
            const hold = await holdsService.getHold(holdId);
            if (!hold) {
                return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }
            // Vendedor solo ve sus holds
            if (!puede(auth, 'ver_todas') && hold.creado_por !== auth.id) {
                return new Response(JSON.stringify({ success: false, error: 'FORBIDDEN' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ success: true, data: hold }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // PATCH /api/holds/:id/pagar
        if (request.method === 'PATCH' && pathname.includes('/pagar')) {
            const auth = await requirePermiso(request, usuariosKV, 'inventario');
            const holdId = pathname.split('/')[3];
            if (!holdId)
                throw new Error('INVALID_HOLD_ID');
            const hold = await holdsService.getHold(holdId);
            if (!hold)
                throw new Error('HOLD_NOT_FOUND');
            if (hold.estado !== 'pendiente')
                throw new Error('HOLD_NOT_PENDING');
            // Convertir hold a pagada
            const updatedHold = await holdsService.convertToPaid(holdId);
            // Restar del inventario
            const product = await inventoryService.getProduct(hold.producto_id);
            if (!product)
                throw new Error('PRODUCT_NOT_FOUND');
            const updatedProduct = await inventoryService.deductStock(hold.producto_id, hold.cantidad);
            // Actualizar cantidad bloqueada (restar el hold)
            const activosTrasPago = await holdsService.getActiveHolds();
            await inventoryService.recalcularBloqueado(hold.producto_id, activosTrasPago);
            // Auditoría
            await auditService.log({
                tipo: 'venta',
                usuario_id: auth.usuario,
                producto_id: hold.producto_id,
                cantidad_antes: product.cantidad_total,
                cantidad_despues: updatedProduct.cantidad_total,
                detalles: {
                    hold_id: holdId,
                    cotizacion_id: hold.cotizacion_id,
                    razon: 'Pago marcado',
                },
            });
            return new Response(JSON.stringify({
                success: true,
                data: { hold: updatedHold, producto: updatedProduct },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // PATCH /api/holds/:id/cancelar — el cliente se arrepintió.
        //
        // Sin esto el material quedaba bloqueado 24 h hasta que expirara el TTL, sin
        // forma de soltarlo. `releaseHold()` marcaba el apartado como liberado pero
        // NO devolvía `cantidad_bloqueada`, así que el stock seguía sin aparecer
        // como disponible: por eso la devolución se hace aquí.
        if (request.method === 'PATCH' && pathname.includes('/cancelar')) {
            const auth = await requirePermiso(request, usuariosKV, 'apartar');
            const holdId = pathname.split('/')[3];
            if (!holdId)
                throw new Error('INVALID_HOLD_ID');
            const hold = await holdsService.getHold(holdId);
            if (!hold)
                throw new Error('HOLD_NOT_FOUND');
            // Un vendedor sólo cancela lo suyo; quien tiene 'ver_todas' cancela todo.
            if (!puede(auth, 'ver_todas') && hold.creado_por !== auth.id) {
                return new Response(JSON.stringify({ success: false, error: 'FORBIDDEN' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            if (hold.estado !== 'pendiente')
                throw new Error('HOLD_NOT_PENDING');
            const updatedHold = await holdsService.releaseHold(holdId);
            const product = await inventoryService.getProduct(hold.producto_id);
            if (!product)
                throw new Error('PRODUCT_NOT_FOUND');
            const bloqueadaAntes = product.cantidad_bloqueada;
            const activosTrasCancelar = await holdsService.getActiveHolds();
            const updatedProduct = await inventoryService.recalcularBloqueado(hold.producto_id, activosTrasCancelar);
            const nuevaBloqueada = updatedProduct ? updatedProduct.cantidad_bloqueada : bloqueadaAntes;
            await auditService.log({
                tipo: 'hold_liberado',
                usuario_id: auth.usuario,
                producto_id: hold.producto_id,
                cantidad_antes: bloqueadaAntes,
                cantidad_despues: nuevaBloqueada,
                detalles: {
                    hold_id: holdId,
                    cotizacion_id: hold.cotizacion_id,
                    cantidad_liberada: hold.cantidad,
                    razon: 'Cotización cancelada',
                },
            });
            return new Response(JSON.stringify({ success: true, data: { hold: updatedHold, producto: updatedProduct } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    catch (error) {
        if (error instanceof AuthError)
            throw error;
        console.error('Holds route error:', error);
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
