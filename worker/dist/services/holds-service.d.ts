import { Hold } from '../types';
export declare class HoldsService {
    private kv;
    constructor(kv: KVNamespace);
    createHold(cotizacionId: string, productId: string, cantidad: number, createdBy: string, holdDurationHours?: number): Promise<Hold>;
    getActiveHolds(userId?: string): Promise<Hold[]>;
    getHold(holdId: string): Promise<Hold | null>;
    convertToPaid(holdId: string): Promise<Hold>;
    releaseHold(holdId: string): Promise<Hold>;
}
