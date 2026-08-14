import { handleInventoryRequest } from './routes/inventory';
import { handleHoldsRequest } from './routes/holds';
import { handleAuditRequest } from './routes/audit';
import { handleSettingsRequest } from './routes/settings';

export interface Env {
  INVENTORY_KV: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-User-ID, X-User-Role',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Load settings for all routes
    let settings = await env.INVENTORY_KV.get('settings');
    const defaultSettings = {
      hold_duracion_horas: 24,
      alert_stock_bajo: 0,
    };
    const currentSettings = settings ? JSON.parse(settings) : defaultSettings;

    // Router
    try {
      if (pathname.startsWith('/api/inventory')) {
        return await handleInventoryRequest(request, env.INVENTORY_KV);
      }

      if (pathname.startsWith('/api/holds')) {
        return await handleHoldsRequest(request, env.INVENTORY_KV, currentSettings);
      }

      if (pathname.startsWith('/api/audit')) {
        return await handleAuditRequest(request, env.INVENTORY_KV);
      }

      if (pathname.startsWith('/api/settings')) {
        return await handleSettingsRequest(request, env.INVENTORY_KV);
      }

      // Health check
      if (pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ success: false, error: 'Internal server error' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
