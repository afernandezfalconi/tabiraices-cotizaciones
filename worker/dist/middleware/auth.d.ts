import { AuthContext } from '../types';
export declare function requireAuth(request: Request): Promise<AuthContext>;
export declare function requireAdmin(request: Request): Promise<AuthContext>;
