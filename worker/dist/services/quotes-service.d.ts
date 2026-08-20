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
    /** Sólo de entrada: pide al servidor que asigne folio. No se persiste. */
    nueva?: boolean;
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
export declare const totalDe: (c: {
    items: Item[];
    ivaRate?: number;
}) => number;
export declare class QuotesService {
    private kv;
    constructor(kv: KVNamespace);
    porId(id: string): Promise<Cotizacion | null>;
    /**
     * Lista desde la metadata de las claves.
     *
     * ⚠️ `kv.list()` es eventualmente consistente: una cotización recién creada
     * puede tardar segundos en aparecer. NO se resuelve con un índice en una sola
     * clave — se intentó con los usuarios y la carrera lectura-modificación-
     * escritura llegó a borrar registros. El cliente fusiona lo que acaba de crear.
     */
    listar(soloDe?: string): Promise<CotizacionResumen[]>;
    /**
     * Igual que `listar` pero con las cotizaciones completas.
     *
     * El cotizador necesita los renglones para pintar el formulario y la vista
     * previa. Son N lecturas en vez de una, pero para el volumen de un negocio
     * así (cientos de cotizaciones) es preferible a complicar el frontend con
     * cargas parciales.
     */
    listarCompletas(soloDe?: string): Promise<Cotizacion[]>;
    /**
     * Siguiente folio disponible, con el formato 0001 que usa el negocio.
     *
     * ⚠️ Arrancaba en 20 —heredado del código viejo, donde las dos cotizaciones
     * de ejemplo eran #0021 y #0022—, así que la primera cotización real salía
     * numerada #0021. Sin cotizaciones, la primera es #0001.
     */
    siguienteFolio(): Promise<string>;
    /**
     * Primer folio libre de verdad.
     *
     * ⚠️ `siguienteFolio()` se apoya en `kv.list()`, que es eventualmente
     * consistente: tras crear la #0001 seguía proponiendo 0001. Con dos
     * vendedores cotizando a la vez, ambos recibían el mismo folio y el segundo
     * SOBRESCRIBÍA al primero. Aquí se sondea la clave concreta con `get`, que sí
     * refleja lo recién escrito, hasta dar con una libre.
     */
    private folioLibre;
    guardar(datos: Partial<Cotizacion>, autor: {
        id: string;
        nombre: string;
    }): Promise<Cotizacion>;
    eliminar(id: string): Promise<boolean>;
    /**
     * Devuelve el token de la landing de esta cotización, creándolo si no existe.
     *
     * Calcado de `generateLandingToken` de LINDERO.COTI: reutiliza el enlace ya
     * publicado para no multiplicar links, comprueba que el apuntador siga siendo
     * coherente, y refresca la vigencia al reutilizarlo.
     */
    tokenDeLanding(id: string): Promise<string>;
    /** Resuelve un token público a su cotización. La landing no guarda copias. */
    porToken(token: string): Promise<Cotizacion | null>;
}
