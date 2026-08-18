import { hashIp, aleatorio } from '../lib/crypto';
/**
 * Bitácora de seguridad: logins, cambios de usuario, cambios de contraseña.
 * Separada de la auditoría de inventario, que vive en INVENTORY_KV.
 *
 * La IP se guarda hasheada y truncada: permite ver que dos accesos vienen del
 * mismo sitio sin almacenar la IP de nadie.
 */
export async function bitacora(kv, usuario, accion, detalle, ip, ipSalt) {
    try {
        const fecha = new Date().toISOString();
        const registro = {
            usuario: (usuario || '').toString().slice(0, 120),
            accion,
            detalle,
            ip_hash: await hashIp(ip, ipSalt || ''),
            fecha,
        };
        await kv.put(`log:${fecha}:${aleatorio(3)}`, JSON.stringify(registro), {
            metadata: registro,
            expirationTtl: 60 * 60 * 24 * 90, // 90 días
        });
    }
    catch {
        /* la bitácora nunca puede romper la operación que la invoca */
    }
}
export async function leerBitacora(kv, limite = 200) {
    const lista = await kv.list({ prefix: 'log:', limit: limite });
    return lista.keys.map((k) => k.metadata).filter(Boolean).reverse();
}
