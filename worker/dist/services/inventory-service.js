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
        for (const product of defaultProducts) {
            await this.kv.put(`inventory:${product.id}`, JSON.stringify(product));
        }
        await this.kv.put('inventory:index', JSON.stringify(defaultProducts.map(p => p.id)));
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
            if (!data) {
                await this.initializeDefaultProducts();
                data = await this.kv.get(`inventory:${id}`);
            }
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
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
    async recalcularBloqueado(productId, apartadosPendientes) {
        const bloqueada = apartadosPendientes
            .filter((h) => h.producto_id === productId && h.estado === 'pendiente')
            .reduce((s, h) => s + (h.cantidad || 0), 0);
        return this.updateBlockedQuantity(productId, bloqueada);
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
    async createProduct(data) {
        const now = new Date().toISOString();
        const newProduct = {
            id: data.id,
            nombre: data.nombre,
            precio_costo: data.precio_costo,
            precio_venta: data.precio_venta,
            cantidad_total: data.cantidad_inicial || 0,
            cantidad_bloqueada: 0,
            cantidad_disponible: data.cantidad_inicial || 0,
            valor_total: (data.cantidad_inicial || 0) * data.precio_costo,
            creado_en: now,
            actualizado_en: now,
        };
        // Save new product
        await this.kv.put(`inventory:${data.id}`, JSON.stringify(newProduct));
        // Update index
        let index = await this.kv.get('inventory:index');
        const ids = index ? JSON.parse(index) : [];
        if (!ids.includes(data.id)) {
            ids.push(data.id);
            await this.kv.put('inventory:index', JSON.stringify(ids));
        }
        return newProduct;
    }
}
