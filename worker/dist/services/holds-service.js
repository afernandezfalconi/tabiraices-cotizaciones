export class HoldsService {
    kv;
    constructor(kv) {
        this.kv = kv;
    }
    async createHold(cotizacionId, productId, cantidad, createdBy, holdDurationHours = 24) {
        const holdId = `hold-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date();
        const expireAt = new Date(now.getTime() + holdDurationHours * 60 * 60 * 1000);
        const hold = {
            id: holdId,
            cotizacion_id: cotizacionId,
            producto_id: productId,
            cantidad,
            creado_por: createdBy,
            creado_en: now.toISOString(),
            expira_en: expireAt.toISOString(),
            estado: 'pendiente',
        };
        // Guardar con TTL
        const ttlSeconds = holdDurationHours * 60 * 60;
        await this.kv.put(`hold:${holdId}`, JSON.stringify(hold), {
            expirationTtl: ttlSeconds,
        });
        // Agregar a lista de activos
        const activeList = await this.kv.get('holds:active');
        const activeIds = activeList ? JSON.parse(activeList) : [];
        activeIds.push(holdId);
        await this.kv.put('holds:active', JSON.stringify(activeIds));
        return hold;
    }
    async getActiveHolds(userId) {
        try {
            const activeList = await this.kv.get('holds:active');
            if (!activeList)
                return [];
            const holdIds = JSON.parse(activeList);
            const holds = await Promise.all(holdIds.map((id) => this.kv.get(`hold:${id}`)));
            let result = holds
                .filter((h) => h !== null)
                .map((h) => JSON.parse(h));
            // Filtrar por usuario si se especifica
            if (userId) {
                result = result.filter((h) => h.creado_por === userId);
            }
            return result;
        }
        catch (error) {
            console.error('Error getting active holds:', error);
            return [];
        }
    }
    async getHold(holdId) {
        try {
            const holdData = await this.kv.get(`hold:${holdId}`);
            return holdData ? JSON.parse(holdData) : null;
        }
        catch (error) {
            console.error(`Error getting hold ${holdId}:`, error);
            return null;
        }
    }
    async convertToPaid(holdId) {
        const holdData = await this.kv.get(`hold:${holdId}`);
        if (!holdData)
            throw new Error('HOLD_NOT_FOUND');
        const hold = JSON.parse(holdData);
        if (hold.estado !== 'pendiente') {
            throw new Error('HOLD_NOT_PENDING');
        }
        hold.estado = 'pagada';
        await this.kv.put(`hold:${holdId}`, JSON.stringify(hold));
        return hold;
    }
    async releaseHold(holdId) {
        const holdData = await this.kv.get(`hold:${holdId}`);
        if (!holdData)
            throw new Error('HOLD_NOT_FOUND');
        const hold = JSON.parse(holdData);
        hold.estado = 'liberada';
        await this.kv.put(`hold:${holdId}`, JSON.stringify(hold));
        // Remover de lista activos
        const activeList = await this.kv.get('holds:active');
        if (activeList) {
            const activeIds = JSON.parse(activeList);
            const filtered = activeIds.filter((id) => id !== holdId);
            await this.kv.put('holds:active', JSON.stringify(filtered));
        }
        return hold;
    }
}
