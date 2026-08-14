import { AuditLog } from '../types';

export class AuditService {
  constructor(private kv: KVNamespace) {}

  async log(
    auditLog: Omit<AuditLog, 'id' | 'timestamp'>
  ): Promise<AuditLog> {
    const id = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const log: AuditLog = { ...auditLog, id, timestamp };
    const key = `audit:${timestamp}:${id}`;

    await this.kv.put(key, JSON.stringify(log));

    return log;
  }

  async getLogs(
    limit: number = 100,
    filters?: {
      tipo?: string;
      usuario_id?: string;
      producto_id?: string;
    }
  ): Promise<AuditLog[]> {
    try {
      const list = await this.kv.list({ prefix: 'audit:', limit: 1000 });
      const logs = await Promise.all(
        list.keys.map((key) => this.kv.get(key.name))
      );

      let result: AuditLog[] = logs
        .filter((l): l is string => l !== null)
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
    } catch (error) {
      console.error('Error getting audit logs:', error);
      return [];
    }
  }
}
