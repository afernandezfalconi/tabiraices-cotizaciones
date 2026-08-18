/**
 * Bitácora de seguridad: logins, cambios de usuario, cambios de contraseña.
 * Separada de la auditoría de inventario, que vive en INVENTORY_KV.
 *
 * La IP se guarda hasheada y truncada: permite ver que dos accesos vienen del
 * mismo sitio sin almacenar la IP de nadie.
 */
export declare function bitacora(kv: KVNamespace, usuario: string, accion: string, detalle: string, ip: string, ipSalt?: string): Promise<void>;
export declare function leerBitacora(kv: KVNamespace, limite?: number): Promise<any[]>;
