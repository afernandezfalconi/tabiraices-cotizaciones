/**
 * Utilidades de criptografía y saneado.
 *
 * Portadas desde SOLUCIONESPUERTO/worker/src/index.js sin cambiar la lógica:
 * ese código ya está probado en producción. Si algo aquí necesita cambiar,
 * revisar primero si allá ya se resolvió.
 */
/** Cadena hexadecimal aleatoria. Sirve para ids, salts y tokens. */
export declare const aleatorio: (bytes?: number) => string;
export declare const normalizar: (s: unknown) => string;
export declare const limpiar: (s: unknown, max?: number) => string;
/**
 * Comparación en tiempo constante para secretos y tokens.
 * Un `===` sobre hashes filtra información por el tiempo que tarda en fallar.
 */
export declare function iguales(a: string, b: string): boolean;
/**
 * PBKDF2-SHA256, 100.000 iteraciones. El salt es por usuario, así que dos
 * personas con la misma contraseña no comparten hash.
 */
export declare function hashPassword(password: string, salt: string): Promise<string>;
/**
 * Hash truncado de la IP para la bitácora: permite ver que dos accesos vienen
 * del mismo sitio sin almacenar la IP de nadie.
 */
export declare function hashIp(ip: string, salt: string): Promise<string>;
