import { Rol, Usuario, Sesion } from '../lib/roles';
/** Lo que se expone al cliente. El hash y el salt nunca salen del Worker. */
export interface UsuarioPublico {
    id: string;
    usuario: string;
    nombre: string;
    rol: Rol;
    activo: boolean;
    creado?: string;
}
export declare class UsersService {
    private kv;
    constructor(kv: KVNamespace);
    /**
     * Resuelve el token Bearer a un usuario con permisos recalculados.
     * Devuelve null si no hay token, expiró, o la cuenta está desactivada.
     */
    porToken(request: Request): Promise<Sesion | null>;
    login(usuarioRaw: string, password: string): Promise<{
        ok: true;
        token: string;
        usuario: UsuarioPublico;
        permisos: readonly string[];
    } | {
        ok: false;
        codigo: 'CREDENCIALES' | 'BLOQUEADO' | 'INACTIVO';
        minutos?: number;
    }>;
    logout(token: string): Promise<void>;
    /**
     * Límite de intentos de login.
     *
     * ⚠️ KV es eventualmente consistente: el bloqueo tarda unos segundos en
     * propagarse global. Frena la fuerza bruta, no es un candado exacto.
     */
    private minutosBloqueado;
    private registrarFallo;
    /**
     * Lista desde la metadata de las claves: evita N lecturas de KV.
     *
     * ⚠️ `kv.list()` es eventualmente consistente, así que un usuario recién
     * creado puede tardar unos segundos en aparecer aquí. NO se intentó arreglar
     * con un índice en una sola clave: eso introduce una carrera
     * lectura-modificación-escritura que llegó a BORRAR usuarios de la lista.
     * La frescura se resuelve en el cliente, que ya sabe a quién acaba de crear.
     */
    listar(): Promise<UsuarioPublico[]>;
    porId(id: string): Promise<Usuario | null>;
    existeAlguno(): Promise<boolean>;
    crear(datos: {
        usuario: string;
        nombre?: string;
        password: string;
        rol?: string;
    }): Promise<UsuarioPublico>;
    actualizar(id: string, cambios: {
        nombre?: string;
        rol?: string;
        activo?: boolean;
        password?: string;
    }): Promise<UsuarioPublico | null>;
    eliminar(id: string): Promise<boolean>;
    /** Cambio de contraseña propio: exige la actual y conserva la sesión en curso. */
    cambiarPasswordPropia(id: string, actual: string, nueva: string, tokenActual: string): Promise<void>;
    /** Cierra las sesiones del usuario. `conservar` deja viva esa sola. */
    private cerrarSesiones;
}
