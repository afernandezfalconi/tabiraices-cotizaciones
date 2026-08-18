import { Sesion } from '../lib/roles';
/**
 * Autenticación por token Bearer.
 *
 * ⚠️ El rol JAMÁS se lee de un header. Antes este archivo confiaba en
 * `X-User-Role`, lo que permitía a cualquiera declararse admin con un curl.
 * Ahora el rol sale del registro en KV, resuelto desde el token.
 */
export declare class AuthError extends Error {
    codigo: 'UNAUTHORIZED' | 'FORBIDDEN';
    constructor(codigo: 'UNAUTHORIZED' | 'FORBIDDEN', mensaje: string);
}
export declare function requireAuth(request: Request, kv: KVNamespace): Promise<Sesion>;
export declare function requirePermiso(request: Request, kv: KVNamespace, permiso: string): Promise<Sesion>;
