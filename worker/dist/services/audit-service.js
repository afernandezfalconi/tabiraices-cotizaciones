export class AuditService {
    kv;
    constructor(kv) {
        this.kv = kv;
    }
    async log(auditLog) {
        const id = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();
        const log = { ...auditLog, id, timestamp };
        const key = `audit:${timestamp}:${id}`;
        await this.kv.put(key, JSON.stringify(log));
        return log;
    }
    async getLogs(limit = 100, filters) {
        try {
            const list = await this.kv.list({ prefix: 'audit:', limit: 1000 });
            const logs = await Promise.all(list.keys.map((key) => this.kv.get(key.name)));
            let result = logs
                .filter((l) => l !== null)
                .map((l) => JSON.parse(l));
            if (filters?.tipo) {
                result = result.filter((l) => l.tipo === filters.tipo);
            }
            if (filters?.usuario_id) {
                result = result.filter((l) => l.usuario_id === filters.usuario_id);
            }
            if (filters?.producto_id) {
                result = result.filter((l) => l.producto_id === filters.producto_id);
            }
            return result.reverse().slice(0, limit);
        }
        catch (error) {
            console.error('Error getting audit logs:', error);
            return [];
        }
    }
}
