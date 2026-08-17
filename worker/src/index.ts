import { handleInventoryRequest } from './routes/inventory';
import { handleHoldsRequest } from './routes/holds';
import { handleAuditRequest } from './routes/audit';
import { handleSettingsRequest } from './routes/settings';
import { InventoryService } from './services/inventory-service';

export interface Env {
  INVENTORY_KV: KVNamespace;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-ID, X-User-Role',
  'Access-Control-Max-Age': '86400',
};

function addCorsHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });
  return newResponse;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: CORS_HEADERS,
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
      let response: Response;


      if (pathname.startsWith('/api/inventory')) {
        response = await handleInventoryRequest(request, env.INVENTORY_KV);
      } else if (pathname.startsWith('/api/holds')) {
        response = await handleHoldsRequest(request, env.INVENTORY_KV, currentSettings);
      } else if (pathname.startsWith('/api/audit')) {
        response = await handleAuditRequest(request, env.INVENTORY_KV);
      } else if (pathname.startsWith('/api/settings')) {
        response = await handleSettingsRequest(request, env.INVENTORY_KV);
      } else if (pathname === '/health') {
        // Health check
        response = new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return addCorsHeaders(response);
    } catch (error: any) {
      console.error('Worker error:', error);
      const errorResponse = new Response(
        JSON.stringify({ success: false, error: 'Internal server error' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      return addCorsHeaders(errorResponse);
    }
  },
};
