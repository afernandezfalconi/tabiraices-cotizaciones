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
  async recalcularBloqueado(
    productId: string,
    apartadosPendientes: { producto_id: string; cantidad: number; estado: string }[]
  ): Promise<Product | null> {
    const bloqueada = apartadosPendientes
      .filter((h) => h.producto_id === productId && h.estado === 'pendiente')
      .reduce((s, h) => s + (h.cantidad || 0), 0);
    return this.updateBlockedQuantity(productId, bloqueada);
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

  /**
   * Corrige los datos de un producto ya dado de alta.
   *
   * ⚠️ Ajustar `cantidad_total` aquí NO es lo mismo que un ingreso: un ingreso
   * es material que llegó, esto es una corrección de conteo. La ruta las
   * registra en la bitácora con tipos distintos, o el historial diría que
   * entró material que nunca llegó.
   */
  async editarProducto(
    id: string,
    cambios: {
      nombre?: string;
      precio_costo?: number;
      precio_venta?: number;
      cantidad_total?: number;
    }
  ): Promise<Product> {
    const p = await this.getProduct(id);
    if (!p) throw new Error('PRODUCT_NOT_FOUND');

    if (cambios.nombre !== undefined) {
      const nombre = String(cambios.nombre).trim();
      if (!nombre) throw new Error('NOMBRE_VACIO');
      p.nombre = nombre.slice(0, 120);
    }
    if (cambios.precio_costo !== undefined) {
      const v = Number(cambios.precio_costo);
      if (!Number.isFinite(v) || v < 0) throw new Error('PRECIO_INVALIDO');
      p.precio_costo = v;
    }
    if (cambios.precio_venta !== undefined) {
      const v = Number(cambios.precio_venta);
      if (!Number.isFinite(v) || v < 0) throw new Error('PRECIO_INVALIDO');
      p.precio_venta = v;
    }
    if (cambios.cantidad_total !== undefined) {
      const v = Number(cambios.cantidad_total);
      if (!Number.isFinite(v) || v < 0) throw new Error('CANTIDAD_INVALIDA');
      // No se puede dejar el total por debajo de lo ya apartado: el material
      // comprometido con un cliente quedaría en disponible negativo.
      if (v < p.cantidad_bloqueada) throw new Error('MENOR_QUE_APARTADO');
      p.cantidad_total = v;
    }

    p.valor_total = p.cantidad_total * p.precio_costo;
    p.cantidad_disponible = p.cantidad_total - p.cantidad_bloqueada;
    p.actualizado_en = new Date().toISOString();

    await this.kv.put(`inventory:${id}`, JSON.stringify(p));
    return p;
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
