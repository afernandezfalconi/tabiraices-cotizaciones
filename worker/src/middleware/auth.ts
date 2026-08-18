import { UsersService } from '../services/users-service';
import { Sesion, puede } from '../lib/roles';

/**
 * Autenticación por token Bearer.
 *
 * ⚠️ El rol JAMÁS se lee de un header. Antes este archivo confiaba en
 * `X-User-Role`, lo que permitía a cualquiera declararse admin con un curl.
 * Ahora el rol sale del registro en KV, resuelto desde el token.
 */

export class AuthError extends Error {
  constructor(
    public codigo: 'UNAUTHORIZED' | 'FORBIDDEN',
    mensaje: string
  ) {
    super(mensaje);
  }
}

export async function requireAuth(request: Request, kv: KVNamespace): Promise<Sesion> {
  const sesion = await new UsersService(kv).porToken(request);
  if (!sesion) throw new AuthError('UNAUTHORIZED', 'Sesión no válida o expirada');
  return sesion;
}

export async function requirePermiso(
  request: Request,
  kv: KVNamespace,
  permiso: string
): Promise<Sesion> {
  const sesion = await requireAuth(request, kv);
  if (!puede(sesion, permiso)) {
    throw new AuthError('FORBIDDEN', 'No tienes permiso para esta acción');
  }
  return sesion;
}
