import { handleInventoryRequest } from './routes/inventory';
import { handleHoldsRequest } from './routes/holds';
import { handleAuditRequest } from './routes/audit';
import { handleSettingsRequest } from './routes/settings';
import { InventoryService } from './services/inventory-service';
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-ID, X-User-Role',
    'Access-Control-Max-Age': '86400',
};
function addCorsHeaders(response) {
    const newResponse = new Response(response.body, response);
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        newResponse.headers.set(key, value);
    });
    return newResponse;
}
export default {
    async fetch(request, env) {
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
            let response;
            // Ultra-simple debug: just check if KV works at all
            if (pathname === '/test-kv') {
                try {
                    await env.INVENTORY_KV.put('test-key', 'test-value');
                    const val = await env.INVENTORY_KV.get('test-key');
                    return addCorsHeaders(new Response(JSON.stringify({
                        success: true,
                        kv_works: val === 'test-value',
                        message: 'KV is accessible',
                        timestamp: new Date().toISOString()
                    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                }
                catch (e) {
                    return addCorsHeaders(new Response(JSON.stringify({
                        success: false,
                        error: e.message,
                        message: 'KV error'
                    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
                }
            }
            // Initialize endpoint - NO handleInventoryRequest, direct at index level
            if (pathname === '/api/init') {
                console.log('DIRECT INIT ENDPOINT REACHED in index.ts');
                try {
                    const inventoryService = new InventoryService(env.INVENTORY_KV);
                    await inventoryService.ensureInitialized();
                    return addCorsHeaders(new Response(JSON.stringify({
                        success: true,
                        message: 'KV initialized from index.ts'
                    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                }
                catch (e) {
                    console.error('INIT ERROR:', e);
                    return addCorsHeaders(new Response(JSON.stringify({
                        success: false,
                        error: e.message
                    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
                }
            }
            // DEBUG endpoint - test KV initialization
            if (pathname === '/api/kv-init' || pathname.startsWith('/api/kv-init')) {
                const inventoryService = new InventoryService(env.INVENTORY_KV);
                try {
                    const product = await inventoryService.getProduct('prod-001');
                    return addCorsHeaders(new Response(JSON.stringify({
                        success: true,
                        data: product,
                        message: 'Product found or initialized'
                    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                }
                catch (e) {
                    return addCorsHeaders(new Response(JSON.stringify({
                        success: false,
                        error: e.message
                    }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
                }
            }
            if (pathname.startsWith('/api/inventory')) {
                response = await handleInventoryRequest(request, env.INVENTORY_KV);
            }
            else if (pathname.startsWith('/api/holds')) {
                response = await handleHoldsRequest(request, env.INVENTORY_KV, currentSettings);
            }
            else if (pathname.startsWith('/api/audit')) {
                response = await handleAuditRequest(request, env.INVENTORY_KV);
            }
            else if (pathname.startsWith('/api/settings')) {
                response = await handleSettingsRequest(request, env.INVENTORY_KV);
            }
            else if (pathname === '/health') {
                // Health check
                response = new Response(JSON.stringify({ status: 'ok' }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            else {
                response = new Response(JSON.stringify({ error: 'Not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return addCorsHeaders(response);
        }
        catch (error) {
            console.error('Worker error:', error);
            const errorResponse = new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
            return addCorsHeaders(errorResponse);
        }
    },
};
