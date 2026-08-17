import { Product } from '../types';

export class InventoryService {
  constructor(private kv: KVNamespace) {}

  async getProducts(): Promise<Product[]> {
    try {
      let index = await this.kv.get('inventory:index');
      if (!index) {
        // Inicializar KV con datos de prueba automáticamente
        await this.initializeDefaultProducts();
        index = await this.kv.get('inventory:index');
      }

      if (!index) return [];

      const ids = JSON.parse(index);
      const products = await Promise.all(
        ids.map((id: string) => this.kv.get(`inventory:${id}`))
      );

      return products
        .filter((p): p is string => p !== null)
        .map((p) => JSON.parse(p));
    } catch (error) {
      console.error('Error getting products:', error);
      return [];
    }
  }

  private async initializeDefaultProducts(): Promise<void> {
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

  async ensureInitialized(): Promise<void> {
    const index = await this.kv.get('inventory:index');
    if (!index) {
      await this.initializeDefaultProducts();
    }
  }

  async getProduct(id: string): Promise<Product | null> {
    try {
      let data = await this.kv.get(`inventory:${id}`);
      if (!data) {
        await this.initializeDefaultProducts();
        data = await this.kv.get(`inventory:${id}`);
      }
      return data ? JSON.parse(data) : null;
    } catch (error) {
      return null;
    }
  }

  async calculateTotals(): Promise<{
    valor_total: number;
    cantidad_total: number;
    cantidad_bloqueada: number;
    cantidad_disponible: number;
  }> {
    const products = await this.getProducts();
    return {
      valor_total: products.reduce((s, p) => s + p.valor_total, 0),
      cantidad_total: products.reduce((s, p) => s + p.cantidad_total, 0),
      cantidad_bloqueada: products.reduce((s, p) => s + p.cantidad_bloqueada, 0),
      cantidad_disponible: products.reduce((s, p) => s + p.cantidad_disponible, 0),
    };
  }

  async addStock(
    productId: string,
    quantity: number
  ): Promise<Product> {
    const product = await this.getProduct(productId);
    if (!product) throw new Error('PRODUCT_NOT_FOUND');

    product.cantidad_total += quantity;
    product.valor_total = product.cantidad_total * product.precio_costo;
    product.cantidad_disponible =
      product.cantidad_total - product.cantidad_bloqueada;
    product.actualizado_en = new Date().toISOString();

    await this.kv.put(`inventory:${productId}`, JSON.stringify(product));

    return product;
  }

  async updateBlockedQuantity(
    productId: string,
    bloqueada: number
  ): Promise<Product | null> {
    const product = await this.getProduct(productId);
    if (!product) return null;

    product.cantidad_bloqueada = bloqueada;
    product.cantidad_disponible =
      product.cantidad_total - product.cantidad_bloqueada;
    product.actualizado_en = new Date().toISOString();

    await this.kv.put(`inventory:${productId}`, JSON.stringify(product));
    return product;
  }

  async deductStock(productId: string, quantity: number): Promise<Product> {
    const product = await this.getProduct(productId);
    if (!product) throw new Error('PRODUCT_NOT_FOUND');
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

  async createProduct(data: {
    id: string;
    nombre: string;
    precio_costo: number;
    precio_venta: number;
    cantidad_inicial: number;
  }): Promise<Product> {
    const now = new Date().toISOString();
    const newProduct: Product = {
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
