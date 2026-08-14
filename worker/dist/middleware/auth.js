export async function requireAuth(request) {
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
        userRole: userRole,
    };
}
export async function requireAdmin(request) {
    const auth = await requireAuth(request);
    if (auth.userRole !== 'admin') {
        throw new Error('FORBIDDEN');
    }
    return auth;
}
