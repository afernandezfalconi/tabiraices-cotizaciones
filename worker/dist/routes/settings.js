import { requireAdmin } from '../middleware/auth';
export async function handleSettingsRequest(request, kv) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    try {
        // GET /api/settings
        if (request.method === 'GET' && pathname === '/api/settings') {
            const auth = await requireAdmin(request);
            let settings = await kv.get('settings');
            if (!settings) {
                const defaultSettings = {
                    hold_duracion_horas: 24,
                    alert_stock_bajo: 0,
                    ultima_actualizacion: new Date().toISOString(),
                };
                await kv.put('settings', JSON.stringify(defaultSettings));
                settings = JSON.stringify(defaultSettings);
            }
            const response = {
                success: true,
                data: JSON.parse(settings),
            };
            return new Response(JSON.stringify(response), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        // PATCH /api/settings
        if (request.method === 'PATCH' && pathname === '/api/settings') {
            const auth = await requireAdmin(request);
            const body = (await request.json());
            let settings = await kv.get('settings');
            const currentSettings = settings
                ? JSON.parse(settings)
                : {
                    hold_duracion_horas: 24,
                    alert_stock_bajo: 0,
                    ultima_actualizacion: new Date().toISOString(),
                };
            // Actualizar solo los campos permitidos
            if (body?.hold_duracion_horas !== undefined) {
                if (body.hold_duracion_horas < 1 || body.hold_duracion_horas > 240) {
                    throw new Error('INVALID_HOLD_DURATION');
                }
                currentSettings.hold_duracion_horas = body.hold_duracion_horas;
            }
            if (body?.alert_stock_bajo !== undefined) {
                if (body.alert_stock_bajo < 0) {
                    throw new Error('INVALID_ALERT_THRESHOLD');
                }
                currentSettings.alert_stock_bajo = body.alert_stock_bajo;
            }
            currentSettings.ultima_actualizacion = new Date().toISOString();
            await kv.put('settings', JSON.stringify(currentSettings));
            const response = {
                success: true,
                data: currentSettings,
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
    }
    catch (error) {
        console.error('Settings route error:', error);
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
