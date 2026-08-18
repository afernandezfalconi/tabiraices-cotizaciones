/**
 * Utilidades de criptografía y saneado.
 *
 * Portadas desde SOLUCIONESPUERTO/worker/src/index.js sin cambiar la lógica:
 * ese código ya está probado en producción. Si algo aquí necesita cambiar,
 * revisar primero si allá ya se resolvió.
 */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** Cadena hexadecimal aleatoria. Sirve para ids, salts y tokens. */
export const aleatorio = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
export const normalizar = (s) => (s ?? '').toString().trim().toLowerCase();
export const limpiar = (s, max = 500) => (s ?? '').toString().trim().slice(0, max);
/**
 * Comparación en tiempo constante para secretos y tokens.
 * Un `===` sobre hashes filtra información por el tiempo que tarda en fallar.
 */
export function iguales(a, b) {
    a = (a || '').trim();
    b = (b || '').trim();
    if (a.length !== b.length)
        return false;
    let d = 0;
    for (let i = 0; i < a.length; i++)
        d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
}
/**
 * PBKDF2-SHA256, 100.000 iteraciones. El salt es por usuario, así que dos
 * personas con la misma contraseña no comparten hash.
 */
export async function hashPassword(password, salt) {
    const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt: new TextEncoder().encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
    }, clave, 256);
    return hex(bits);
}
/**
 * Hash truncado de la IP para la bitácora: permite ver que dos accesos vienen
 * del mismo sitio sin almacenar la IP de nadie.
 */
export async function hashIp(ip, salt) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((ip || '') + (salt || '')));
    return hex(d).slice(0, 16);
}
