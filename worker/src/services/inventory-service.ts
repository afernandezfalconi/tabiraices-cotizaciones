import { Product } from '../types';

export class InventoryService {
  constructor(private kv: KVNamespace) {}

  async getProducts(): Promise<Product[]> {
    try {
      const index = await this.kv.get('inventory:index');
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

  async getProduct(id: string): Promise<Product | null> {
    try {
      const data = await this.kv.get(`inventory:${id}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error getting product ${id}:`, error);
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
}
