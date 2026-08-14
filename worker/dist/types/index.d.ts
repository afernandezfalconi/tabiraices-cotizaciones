export interface Product {
    id: string;
    nombre: string;
    precio_costo: number;
    precio_venta: number;
    cantidad_total: number;
    cantidad_bloqueada: number;
    cantidad_disponible: number;
    valor_total: number;
    creado_en: string;
    actualizado_en: string;
}
export interface Hold {
    id: string;
    cotizacion_id: string;
    producto_id: string;
    cantidad: number;
    creado_por: string;
    creado_en: string;
    expira_en: string;
    estado: 'pendiente' | 'pagada' | 'expirada' | 'liberada';
    notas?: string;
}
export interface AuditLog {
    id: string;
    tipo: 'ingreso' | 'venta' | 'hold_creado' | 'hold_liberado' | 'configuracion';
    usuario_id: string;
    producto_id?: string;
    cantidad_antes: number;
    cantidad_despues: number;
    detalles: Record<string, any>;
    timestamp: string;
}
export interface Settings {
    hold_duracion_horas: number;
    alert_stock_bajo: number;
    ultima_actualizacion: string;
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}
export interface AuthContext {
    userID: string;
    userRole: 'admin' | 'vendedor';
}
