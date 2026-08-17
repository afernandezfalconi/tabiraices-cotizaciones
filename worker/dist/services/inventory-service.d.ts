import { Product } from '../types';
export declare class InventoryService {
    private kv;
    constructor(kv: KVNamespace);
    getProducts(): Promise<Product[]>;
    private initializeDefaultProducts;
    getProduct(id: string): Promise<Product | null>;
    calculateTotals(): Promise<{
        valor_total: number;
        cantidad_total: number;
        cantidad_bloqueada: number;
        cantidad_disponible: number;
    }>;
    addStock(productId: string, quantity: number): Promise<Product>;
    updateBlockedQuantity(productId: string, bloqueada: number): Promise<Product | null>;
    deductStock(productId: string, quantity: number): Promise<Product>;
}
