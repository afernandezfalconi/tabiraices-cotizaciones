/**
 * Roles y permisos.
 *
 * DUENO  — el dueño del sistema. Único con 'admins', el permiso que habilita
 *          crear o modificar cuentas de nivel alto (DUENO y ADMIN).
 * ADMIN  — todo lo operativo y administra vendedores, pero no puede tocar a un
 *          DUENO ni a otro ADMIN, ni ascender a nadie a esos roles.
 * VENDEDOR — cotiza, aparta material y consulta stock. No ve costos.
 *
 * ⚠️ Los permisos se derivan del ROL en cada petición y NUNCA se guardan en el
 * registro del usuario. Persistirlos fue un bug real en LUNA GI (permissions=193):
 * agregar un permiso nuevo obligaba a migrar a todos los usuarios.
 */

export const ROLES = {
  DUENO: ['cotizar', 'apartar', 'ver_todas', 'ver_stock', 'ver_costos', 'inventario', 'ingreso', 'usuarios', 'bitacora', 'admins'],
  ADMIN: ['cotizar', 'apartar', 'ver_todas', 'ver_stock', 'ver_costos', 'inventario', 'ingreso', 'usuarios', 'bitacora'],
  VENDEDOR: ['cotizar', 'apartar', 'ver_stock'],
} as const;

export type Rol = keyof typeof ROLES;
export type Permiso = (typeof ROLES)[Rol][number];

/** Roles cuya gestión exige el permiso 'admins', es decir, ser DUENO. */
export const ROLES_ADMIN: Rol[] = ['DUENO', 'ADMIN'];

export const esRolValido = (r: unknown): r is Rol =>
  typeof r === 'string' && Object.prototype.hasOwnProperty.call(ROLES, r);

export interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  salt: string;
  hash: string;
  rol: Rol;
  activo: boolean;
  creado: string;
  /**
   * Generación de sesión. Sube al cambiar la contraseña o desactivar la cuenta,
   * y cualquier token emitido con una generación anterior deja de valer.
   *
   * ⚠️ Es lo que realmente cierra las sesiones. Barrerlas con kv.list() NO
   * funciona: KV es eventualmente consistente y los tokens recién creados no
   * aparecen en el listado. Medido: tras cambiar la contraseña, la sesión vieja
   * seguía respondiendo 200.
   */
  gen?: number;
}

/** Usuario en sesión: los permisos vienen recalculados, nunca del registro. */
export interface Sesion extends Omit<Usuario, 'salt' | 'hash'> {
  token: string;
  permisos: readonly string[];
}

export const puede = (usuario: Sesion | null, permiso: string): boolean =>
  !!usuario && usuario.permisos.includes(permiso);

/**
 * ¿Puede este usuario administrar cuentas de ese rol?
 * Tocar (o asignar) un rol de nivel alto exige el permiso 'admins'.
 */
export const puedeAdministrarRol = (usuario: Sesion | null, rol: string): boolean => {
  if (!usuario) return false;
  if (ROLES_ADMIN.includes(rol as Rol)) return puede(usuario, 'admins');
  return puede(usuario, 'usuarios');
};
