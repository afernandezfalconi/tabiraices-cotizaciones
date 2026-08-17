export class InventoryService {
    kv;
    constructor(kv) {
        this.kv = kv;
    }
    async getProducts() {
        try {
            let index = await this.kv.get('inventory:index');
            if (!index) {
                // Inicializar KV con datos de prueba automáticamente
                await this.initializeDefaultProducts();
                index = await this.kv.get('inventory:index');
            }
            if (!index)
                return [];
            const ids = JSON.parse(index);
            const products = await Promise.all(ids.map((id) => this.kv.get(`inventory:${id}`)));
            return products
                .filter((p) => p !== null)
                .map((p) => JSON.parse(p));
        }
        catch (error) {
            console.error('Error getting products:', error);
            return [];
        }
    }
    async initializeDefaultProducts() {
        console.log('initializeDefaultProducts: START');
        const now = new Date().toISOString();
        const defaultProducts = [
            {
                id: 'prod-001',
                nombre: 'Postes lineales 10x10',
                precio_costo: 250,
                precio_venta: 350,
                cantidad_total: 100,
                cantidad_bloqueada: 0,
                cantidad_disponible: 100,
                valor_total: 25000,
                creado_en: now,
                actualizado_en: now
            },
            {
                id: 'prod-002',
                nombre: 'Postes esquineros 12x12',
                precio_costo: 250,
                precio_venta: 350,
                cantidad_total: 50,
                cantidad_bloqueada: 0,
                cantidad_disponible: 50,
                valor_total: 12500,
                creado_en: now,
                actualizado_en: now
            }
        ];
        try {
            for (const product of defaultProducts) {
                await this.kv.put(`inventory:${product.id}`, JSON.stringify(product));
                console.log(`initializeDefaultProducts: saved ${product.id}`);
            }
            await this.kv.put('inventory:index', JSON.stringify(defaultProducts.map(p => p.id)));
            console.log('initializeDefaultProducts: saved index');
        }
        catch (e) {
            console.error('initializeDefaultProducts: ERROR', e);
            throw e;
        }
    }
    async ensureInitialized() {
        const index = await this.kv.get('inventory:index');
        if (!index) {
            await this.initializeDefaultProducts();
        }
    }
    async getProduct(id) {
        try {
            let data = await this.kv.get(`inventory:${id}`);
            console.log(`getProduct(${id}): first attempt =`, data ? 'found' : 'not found');
            if (!data) {
                console.log(`getProduct(${id}): initializing...`);
                await this.initializeDefaultProducts();
                data = await this.kv.get(`inventory:${id}`);
                console.log(`getProduct(${id}): after init =`, data ? 'found' : 'still not found');
            }
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            console.error(`Error getting product ${id}:`, error);
            return null;
        }
    }
    async calculateTotals() {
        const products = await this.getProducts();
        return {
            valor_total: products.reduce((s, p) => s + p.valor_total, 0),
            cantidad_total: products.reduce((s, p) => s + p.cantidad_total, 0),
            cantidad_bloqueada: products.reduce((s, p) => s + p.cantidad_bloqueada, 0),
            cantidad_disponible: products.reduce((s, p) => s + p.cantidad_disponible, 0),
        };
    }
    async addStock(productId, quantity) {
        const product = await this.getProduct(productId);
        if (!product)
            throw new Error('PRODUCT_NOT_FOUND');
        product.cantidad_total += quantity;
        product.valor_total = product.cantidad_total * product.precio_costo;
        product.cantidad_disponible =
            product.cantidad_total - product.cantidad_bloqueada;
        product.actualizado_en = new Date().toISOString();
        await this.kv.put(`inventory:${productId}`, JSON.stringify(product));
        return product;
    }
    async updateBlockedQuantity(productId, bloqueada) {
        const product = await this.getProduct(productId);
        if (!product)
            return null;
        product.cantidad_bloqueada = bloqueada;
        product.cantidad_disponible =
            product.cantidad_total - product.cantidad_bloqueada;
        product.actualizado_en = new Date().toISOString();
        await this.kv.put(`inventory:${productId}`, JSON.stringify(product));
        return product;
    }
    async deductStock(productId, quantity) {
        const product = await this.getProduct(productId);
        if (!product)
            throw new Error('PRODUCT_NOT_FOUND');
        if (product.cantidad_total < quantity)
            throw new Error('INSUFFICIENT_STOCK');
        product.cantidad_total -= quantity;
        product.valor_total = product.cantidad_total * product.precio_costo;
        product.cantidad_disponible =
            product.cantidad_total - product.cantidad_bloqueada;
        product.actualizado_en = new Date().toISOString();
        await this.kv.put(`inventory:${productId}`, JSON.stringify(product));
        return product;
    }
}
