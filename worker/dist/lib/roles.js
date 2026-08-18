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
};
/** Roles cuya gestión exige el permiso 'admins', es decir, ser DUENO. */
export const ROLES_ADMIN = ['DUENO', 'ADMIN'];
export const esRolValido = (r) => typeof r === 'string' && Object.prototype.hasOwnProperty.call(ROLES, r);
export const puede = (usuario, permiso) => !!usuario && usuario.permisos.includes(permiso);
/**
 * ¿Puede este usuario administrar cuentas de ese rol?
 * Tocar (o asignar) un rol de nivel alto exige el permiso 'admins'.
 */
export const puedeAdministrarRol = (usuario, rol) => {
    if (!usuario)
        return false;
    if (ROLES_ADMIN.includes(rol))
        return puede(usuario, 'admins');
    return puede(usuario, 'usuarios');
};
