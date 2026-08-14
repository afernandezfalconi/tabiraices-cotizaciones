import { AuthContext } from '../types';

export async function requireAuth(request: Request): Promise<AuthContext> {
  const userID = request.headers.get('X-User-ID');
  const userRole = request.headers.get('X-User-Role');

  if (!userID || !userRole) {
    throw new Error('UNAUTHORIZED');
  }

  if (userRole !== 'admin' && userRole !== 'vendedor') {
    throw new Error('INVALID_ROLE');
  }

  return {
    userID,
    userRole: userRole as 'admin' | 'vendedor',
  };
}

export async function requireAdmin(request: Request): Promise<AuthContext> {
  const auth = await requireAuth(request);

  if (auth.userRole !== 'admin') {
    throw new Error('FORBIDDEN');
  }

  return auth;
}
