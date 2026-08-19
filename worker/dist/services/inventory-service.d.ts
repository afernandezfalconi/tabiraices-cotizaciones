import { Product } from '../types';
export declare class InventoryService {
    private kv;
    constructor(kv: KVNamespace);
    getProducts(): Promise<Product[]>;
    private initializeDefaultProducts;
    ensureInitialized(): Promise<void>;
    getProduct(id: string): Promise<Product | null>;
    calculateTotals(): Promise<{
        valor_total: number;
        cantidad_total: number;
        cantidad_bloqueada: number;
        cantidad_disponible: number;
    }>;
    addStock(productId: string, quantity: number): Promise<Product>;
    /**
     * Recalcula `cantidad_bloqueada` sumando los apartados pendientes.
     *
     * ⚠️ NO usar sumas y restas sobre el valor guardado. KV es eventualmente
     * consistente: si la lectura viene desfasada, el delta se pierde para
     * siempre. Pasó de verdad — cancelar un apartado devolvía 200 y el material
     * seguía bloqueado.
     *
     * El bloqueo es estado DERIVADO de los apartados vigentes, no un contador
     * independiente. Recalcularlo es idempotente: si una escritura se pierde, la
     * siguiente operación lo corrige sola.
     */
    recalcularBloqueado(productId: string, apartadosPendientes: {
        producto_id: string;
        cantidad: number;
        estado: string;
    }[]): Promise<Product | null>;
    updateBlockedQuantity(productId: string, bloqueada: number): Promise<Product | null>;
    deductStock(productId: string, quantity: number): Promise<Product>;
    createProduct(data: {
        id: string;
        nombre: string;
        precio_costo: number;
        precio_venta: number;
        cantidad_inicial: number;
    }): Promise<Product>;
}
