import { AuditService } from '../services/audit-service';
import { requirePermiso, AuthError } from '../middleware/auth';
import { ApiResponse } from '../types';

export async function handleAuditRequest(
  request: Request,
  kv: KVNamespace,
  usuariosKV: KVNamespace
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const auditService = new AuditService(kv);

  try {
    // GET /api/audit
    if (request.method === 'GET' && pathname === '/api/audit') {
      const auth = await requirePermiso(request, usuariosKV, 'bitacora');

      const limit = parseInt(url.searchParams.get('limit') || '100');
      const tipo = url.searchParams.get('tipo') || undefined;
      const usuario_id = url.searchParams.get('usuario_id') || undefined;
      const producto_id = url.searchParams.get('producto_id') || undefined;

      const logs = await auditService.getLogs(limit, {
        tipo,
        usuario_id,
        producto_id,
      });

      const response: ApiResponse = {
        success: true,
        data: logs,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'NOT_FOUND' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error instanceof AuthError) throw error;
    console.error('Audit route error:', error);
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
