import { handleInventoryRequest } from './routes/inventory';
import { handleHoldsRequest } from './routes/holds';
import { handleAuditRequest } from './routes/audit';
import { handleSettingsRequest } from './routes/settings';
import { handleAuthRequest } from './routes/auth';
import { handleUsuariosRequest } from './routes/usuarios';
import { handleQuotesRequest } from './routes/quotes';
import { AuthError } from './middleware/auth';
/**
 * Orígenes autorizados. Antes esto era '*', lo que permitía a cualquier web
 * llamar a la API con la sesión del usuario.
 */
const ORIGENES = [
    'https://tabiraices.pages.dev',
    'https://tabiraices.com',
    'https://www.tabiraices.com',
    'http://localhost:8788',
    'http://127.0.0.1:8788',
];
function cors(origen) {
    if (!origen || !ORIGENES.includes(origen))
        return {};
    return {
        'Access-Control-Allow-Origin': origen,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}
function addCorsHeaders(response, origen) {
    const nueva = new Response(response.body, response);
    Object.entries(cors(origen)).forEach(([k, v]) => nueva.headers.set(k, v));
    return nueva;
}
const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        const origen = request.headers.get('Origin');
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: cors(origen) });
        }
        try {
            let response;
            if (pathname.startsWith('/landing/') || pathname.startsWith('/api/cotizaciones')) {
                // La landing es pública a propósito: es el enlace que se manda al
                // cliente. handleQuotesRequest exige sesión en todo lo demás.
                response = await handleQuotesRequest(request, env.INVENTORY_KV, env.TABIRA_USUARIOS);
            }
            else if (pathname === '/api/login' ||
                pathname === '/api/logout' ||
                pathname === '/api/yo' ||
                pathname === '/api/password') {
                response = await handleAuthRequest(request, env.TABIRA_USUARIOS, env.IP_SALT);
            }
            else if (pathname.startsWith('/api/usuarios') || pathname === '/api/bitacora') {
                response = await handleUsuariosRequest(request, env.TABIRA_USUARIOS, env.IP_SALT);
            }
            else if (pathname.startsWith('/api/inventory')) {
                response = await handleInventoryRequest(request, env.INVENTORY_KV, env.TABIRA_USUARIOS);
            }
            else if (pathname.startsWith('/api/holds')) {
                const settings = await env.INVENTORY_KV.get('settings');
                const currentSettings = settings
                    ? JSON.parse(settings)
                    : { hold_duracion_horas: 24, alert_stock_bajo: 0 };
                response = await handleHoldsRequest(request, env.INVENTORY_KV, currentSettings, env.TABIRA_USUARIOS);
            }
            else if (pathname.startsWith('/api/audit')) {
                response = await handleAuditRequest(request, env.INVENTORY_KV, env.TABIRA_USUARIOS);
            }
            else if (pathname.startsWith('/api/settings')) {
                response = await handleSettingsRequest(request, env.INVENTORY_KV, env.TABIRA_USUARIOS);
            }
            else if (pathname === '/health') {
                response = json({ status: 'ok' });
            }
            else {
                response = json({ success: false, error: 'Not found' }, 404);
            }
            return addCorsHeaders(response, origen);
        }
        catch (error) {
            if (error instanceof AuthError) {
                const status = error.codigo === 'UNAUTHORIZED' ? 401 : 403;
                return addCorsHeaders(json({ success: false, error: error.message, codigo: error.codigo }, status), origen);
            }
            console.error('Worker error:', error);
            return addCorsHeaders(json({ success: false, error: 'Internal server error' }, 500), origen);
        }
    },
};
