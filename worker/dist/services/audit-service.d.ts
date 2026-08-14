import { AuditLog } from '../types';
export declare class AuditService {
    private kv;
    constructor(kv: KVNamespace);
    log(auditLog: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog>;
    getLogs(limit?: number, filters?: {
        tipo?: string;
        usuario_id?: string;
        producto_id?: string;
    }): Promise<AuditLog[]>;
}
