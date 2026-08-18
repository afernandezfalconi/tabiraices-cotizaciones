import { HoldsService } from '../services/holds-service';
import { InventoryService } from '../services/inventory-service';
import { AuditService } from '../services/audit-service';
import { requirePermiso, AuthError } from '../middleware/auth';
import { puede } from '../lib/roles';
import { ApiResponse } from '../types';

export async function handleHoldsRequest(
  request: Request,
  kv: KVNamespace,
  settings: any,
  usuariosKV: KVNamespace
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const holdsService = new HoldsService(kv);
  const inventoryService = new InventoryService(kv);
  const auditService = new AuditService(kv);

  try {
    // POST /api/holds (crear hold)
    if (request.method === 'POST' && pathname === '/api/holds') {
      const auth = await requirePermiso(request, usuariosKV, 'apartar');
      const body = (await request.json()) as any;
      const { cotizacion_id, producto_id, cantidad, notas } = body;

      if (!cotizacion_id || !producto_id || !cantidad || cantidad <= 0) {
        throw new Error('INVALID_HOLD_DATA');
      }

      const product = await inventoryService.getProduct(producto_id);
      if (!product) throw new Error('PRODUCT_NOT_FOUND');

      if (product.cantidad_disponible < cantidad) {
        throw new Error('INSUFFICIENT_AVAILABLE_STOCK');
      }

      const hold = await holdsService.createHold(
        cotizacion_id,
        producto_id,
        cantidad,
        auth.id, // el id, no el nombre: es contra esto que se filtra "mis holds"
        settings.hold_duracion_horas || 24
      );

      // Actualizar cantidad bloqueada
      const newBlockedQty = product.cantidad_bloqueada + cantidad;
      await inventoryService.updateBlockedQuantity(producto_id, newBlockedQty);

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
      const holds = await holdsService.getActiveHolds(
        puede(auth, 'ver_todas') ? undefined : auth.id
      );

      return new Response(JSON.stringify({ success: true, data: holds }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET /api/holds/:id
    if (request.method === 'GET' && pathname.match(/^\/api\/holds\/[^/]+$/)) {
      const auth = await requirePermiso(request, usuariosKV, 'apartar');
      const holdId = pathname.split('/').pop();
      if (!holdId) throw new Error('INVALID_HOLD_ID');

      const hold = await holdsService.getHold(holdId);
      if (!hold) {
        return new Response(
          JSON.stringify({ success: false, error: 'NOT_FOUND' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Vendedor solo ve sus holds
      if (!puede(auth, 'ver_todas') && hold.creado_por !== auth.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'FORBIDDEN' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
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
      if (!holdId) throw new Error('INVALID_HOLD_ID');

      const hold = await holdsService.getHold(holdId);
      if (!hold) throw new Error('HOLD_NOT_FOUND');
      if (hold.estado !== 'pendiente') throw new Error('HOLD_NOT_PENDING');

      // Convertir hold a pagada
      const updatedHold = await holdsService.convertToPaid(holdId);

      // Restar del inventario
      const product = await inventoryService.getProduct(hold.producto_id);
      if (!product) throw new Error('PRODUCT_NOT_FOUND');

      const updatedProduct = await inventoryService.deductStock(
        hold.producto_id,
        hold.cantidad
      );

      // Actualizar cantidad bloqueada (restar el hold)
      const newBlockedQty = Math.max(
        0,
        product.cantidad_bloqueada - hold.cantidad
      );
      await inventoryService.updateBlockedQuantity(
        hold.producto_id,
        newBlockedQty
      );

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

      return new Response(
        JSON.stringify({
          success: true,
          data: { hold: updatedHold, producto: updatedProduct },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error instanceof AuthError) throw error;
    console.error('Holds route error:', error);
    const status =
      error.message === 'UNAUTHORIZED'
        ? 401
        : error.message === 'FORBIDDEN'
          ? 403
          : 400;

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
