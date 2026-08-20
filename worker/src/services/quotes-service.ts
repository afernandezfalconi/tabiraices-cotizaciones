import { aleatorio, limpiar } from '../lib/crypto';

/**
 * Cotizaciones en KV.
 *
 * Antes vivían en el `localStorage` del navegador. Eso causaba tres problemas
 * reales: los enlaces compartidos se veían vacíos para el cliente (la cotización
 * sólo existía en la máquina de quien la creó), los datos no seguían al usuario
 * a otro dispositivo, y bastaba limpiar el navegador para perderlo todo.
 */

const COTI = 'coti:';
const LANDING = 'landing:';
const LANDING_REV = 'landing-folio:';
const TTL_LANDING = 30 * 24 * 3600; // 30 días, igual que LINDERO.COTI

export interface Item {
  desc: string;
  unit: number | string;
  qty: number | string;
}

export interface Cotizacion {
  id: string;
  client: string;
  project: string;
  location: string;
  payment: string;
  date: string;
  status: 'pending' | 'sent' | 'paid' | 'cancelled';
  ivaRate: number;
  items: Item[];
  comprobante?: string;
  creado_por: string;
  creado_por_nombre: string;
  creado_en: string;
  actualizado_en: string;
}

/** Lo que se guarda en la metadata de la clave, para listar sin N lecturas. */
export interface CotizacionResumen {
  id: string;
  client: string;
  project: string;
  date: string;
  status: string;
  total: number;
  creado_por: string;
}

export const totalDe = (c: { items: Item[]; ivaRate?: number }): number => {
  const sub = (c.items || []).reduce(
    (s, i) => s + (parseFloat(String(i.unit)) || 0) * (parseFloat(String(i.qty)) || 0),
    0
  );
  return sub * (1 + (Number(c.ivaRate) || 0) / 100);
};

const resumen = (c: Cotizacion): CotizacionResumen => ({
  id: c.id,
  client: c.client,
  project: c.project,
  date: c.date,
  status: c.status,
  total: totalDe(c),
  creado_por: c.creado_por,
});

export class QuotesService {
  constructor(private kv: KVNamespace) {}

  async porId(id: string): Promise<Cotizacion | null> {
    return this.kv.get<Cotizacion>(`${COTI}${id}`, 'json');
  }

  /**
   * Lista desde la metadata de las claves.
   *
   * ⚠️ `kv.list()` es eventualmente consistente: una cotización recién creada
   * puede tardar segundos en aparecer. NO se resuelve con un índice en una sola
   * clave — se intentó con los usuarios y la carrera lectura-modificación-
   * escritura llegó a borrar registros. El cliente fusiona lo que acaba de crear.
   */
  async listar(soloDe?: string): Promise<CotizacionResumen[]> {
    const lista = await this.kv.list<CotizacionResumen>({ prefix: COTI, limit: 500 });
    let items = lista.keys
      .map((k) => k.metadata)
      .filter((m): m is CotizacionResumen => !!m);
    if (soloDe) items = items.filter((c) => c.creado_por === soloDe);
    return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  /**
   * Igual que `listar` pero con las cotizaciones completas.
   *
   * El cotizador necesita los renglones para pintar el formulario y la vista
   * previa. Son N lecturas en vez de una, pero para el volumen de un negocio
   * así (cientos de cotizaciones) es preferible a complicar el frontend con
   * cargas parciales.
   */
  async listarCompletas(soloDe?: string): Promise<Cotizacion[]> {
    const lista = await this.kv.list({ prefix: COTI, limit: 500 });
    const docs = await Promise.all(
      lista.keys.map((k) => this.kv.get<Cotizacion>(k.name, 'json'))
    );
    let items = docs.filter((c): c is Cotizacion => !!c);
    if (soloDe) items = items.filter((c) => c.creado_por === soloDe);
    return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  /**
   * Siguiente folio disponible, con el formato 0001 que usa el negocio.
   *
   * ⚠️ Arrancaba en 20 —heredado del código viejo, donde las dos cotizaciones
   * de ejemplo eran #0021 y #0022—, así que la primera cotización real salía
   * numerada #0021. Sin cotizaciones, la primera es #0001.
   */
  async siguienteFolio(): Promise<string> {
    const lista = await this.kv.list({ prefix: COTI, limit: 500 });
    const numeros = lista.keys
      .map((k) => parseInt(k.name.slice(COTI.length), 10))
      .filter((n) => Number.isFinite(n));
    const max = numeros.length ? Math.max(...numeros) : 0;
    return String(max + 1).padStart(4, '0');
  }

  async guardar(
    datos: Partial<Cotizacion>,
    autor: { id: string; nombre: string }
  ): Promise<Cotizacion> {
    const id = datos.id || (await this.siguienteFolio());
    const previa = await this.porId(id);
    const ahora = new Date().toISOString();

    const registro: Cotizacion = {
      id,
      client: limpiar(datos.client, 160),
      project: limpiar(datos.project, 160),
      location: limpiar(datos.location, 200),
      payment: limpiar(datos.payment, 80),
      date: datos.date || ahora.split('T')[0],
      status: (datos.status as Cotizacion['status']) || 'pending',
      ivaRate: Number(datos.ivaRate) || 0,
      items: Array.isArray(datos.items) ? datos.items.slice(0, 100) : [],
      comprobante: datos.comprobante,
      creado_por: previa?.creado_por || autor.id,
      creado_por_nombre: previa?.creado_por_nombre || autor.nombre,
      creado_en: previa?.creado_en || ahora,
      actualizado_en: ahora,
    };

    await this.kv.put(`${COTI}${id}`, JSON.stringify(registro), {
      metadata: resumen(registro),
    });
    return registro;
  }

  async eliminar(id: string): Promise<boolean> {
    const c = await this.porId(id);
    if (!c) return false;
    await this.kv.delete(`${COTI}${id}`);
    const token = await this.kv.get(`${LANDING_REV}${id}`);
    if (token) {
      await this.kv.delete(`${LANDING}${token}`);
      await this.kv.delete(`${LANDING_REV}${id}`);
    }
    return true;
  }

  /**
   * Devuelve el token de la landing de esta cotización, creándolo si no existe.
   *
   * Calcado de `generateLandingToken` de LINDERO.COTI: reutiliza el enlace ya
   * publicado para no multiplicar links, comprueba que el apuntador siga siendo
   * coherente, y refresca la vigencia al reutilizarlo.
   */
  async tokenDeLanding(id: string): Promise<string> {
    const previo = await this.kv.get(`${LANDING_REV}${id}`);
    if (previo) {
      const apunta = await this.kv.get(`${LANDING}${previo}`);
      if (apunta === id) {
        await this.kv.put(`${LANDING}${previo}`, id, { expirationTtl: TTL_LANDING });
        await this.kv.put(`${LANDING_REV}${id}`, previo, { expirationTtl: TTL_LANDING });
        return previo;
      }
    }
    const token = aleatorio(16);
    await this.kv.put(`${LANDING}${token}`, id, { expirationTtl: TTL_LANDING });
    await this.kv.put(`${LANDING_REV}${id}`, token, { expirationTtl: TTL_LANDING });
    return token;
  }

  /** Resuelve un token público a su cotización. La landing no guarda copias. */
  async porToken(token: string): Promise<Cotizacion | null> {
    const id = await this.kv.get(`${LANDING}${token}`);
    if (!id) return null;
    return this.porId(id);
  }
}
