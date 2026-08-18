import { UsersService } from '../services/users-service';
import { puede } from '../lib/roles';
/**
 * Autenticación por token Bearer.
 *
 * ⚠️ El rol JAMÁS se lee de un header. Antes este archivo confiaba en
 * `X-User-Role`, lo que permitía a cualquiera declararse admin con un curl.
 * Ahora el rol sale del registro en KV, resuelto desde el token.
 */
export class AuthError extends Error {
    codigo;
    constructor(codigo, mensaje) {
        super(mensaje);
        this.codigo = codigo;
    }
}
export async function requireAuth(request, kv) {
    const sesion = await new UsersService(kv).porToken(request);
    if (!sesion)
        throw new AuthError('UNAUTHORIZED', 'Sesión no válida o expirada');
    return sesion;
}
export async function requirePermiso(request, kv, permiso) {
    const sesion = await requireAuth(request, kv);
    if (!puede(sesion, permiso)) {
        throw new AuthError('FORBIDDEN', 'No tienes permiso para esta acción');
    }
    return sesion;
}
