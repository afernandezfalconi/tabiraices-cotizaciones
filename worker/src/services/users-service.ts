import { hashPassword, aleatorio, normalizar, limpiar, iguales } from '../lib/crypto';
import { ROLES, Rol, Usuario, Sesion, esRolValido } from '../lib/roles';

const TTL_TOKEN = 60 * 60 * 24 * 7; // 7 días
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

/** Lo que se expone al cliente. El hash y el salt nunca salen del Worker. */
export interface UsuarioPublico {
  id: string;
  usuario: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  creado?: string;
}

const publico = (u: Usuario): UsuarioPublico => ({
  id: u.id,
  usuario: u.usuario,
  nombre: u.nombre,
  rol: u.rol,
  activo: u.activo,
  creado: u.creado,
});

export class UsersService {
  constructor(private kv: KVNamespace) {}

  /* ---------------------------------------------------------------- sesión */

  /**
   * Resuelve el token Bearer a un usuario con permisos recalculados.
   * Devuelve null si no hay token, expiró, o la cuenta está desactivada.
   */
  async porToken(request: Request): Promise<Sesion | null> {
    const auth = request.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;

    const sesion = await this.kv.get<{ userId: string; gen?: number }>(`token:${token}`, 'json');
    if (!sesion) return null;

    const u = await this.kv.get<Usuario>(`user:${sesion.userId}`, 'json');
    if (!u || !u.activo) return null;

    // Token emitido antes del ultimo cambio de contrasena o desactivacion.
    if ((sesion.gen || 0) !== (u.gen || 0)) return null;

    const { salt: _s, hash: _h, ...resto } = u;
    return { ...resto, token, permisos: ROLES[u.rol] || [] };
  }

  async login(
    usuarioRaw: string,
    password: string
  ): Promise<
    | { ok: true; token: string; usuario: UsuarioPublico; permisos: readonly string[] }
    | { ok: false; codigo: 'CREDENCIALES' | 'BLOQUEADO' | 'INACTIVO'; minutos?: number }
  > {
    const nombreUsuario = normalizar(usuarioRaw);

    const bloqueo = await this.minutosBloqueado(nombreUsuario);
    if (bloqueo > 0) return { ok: false, codigo: 'BLOQUEADO', minutos: bloqueo };

    const id = await this.kv.get(`idx:usuario:${nombreUsuario}`);
    const u = id ? await this.kv.get<Usuario>(`user:${id}`, 'json') : null;

    // Mismo error para usuario inexistente y contraseña mala: no revelar
    // cuáles cuentas existen.
    if (!u) {
      await this.registrarFallo(nombreUsuario);
      return { ok: false, codigo: 'CREDENCIALES' };
    }
    if (!u.activo) return { ok: false, codigo: 'INACTIVO' };

    const hash = await hashPassword(password, u.salt);
    if (!iguales(hash, u.hash)) {
      await this.registrarFallo(nombreUsuario);
      return { ok: false, codigo: 'CREDENCIALES' };
    }

    await this.kv.delete(`intentos:${nombreUsuario}`);
    const token = aleatorio(32);
    await this.kv.put(
      `token:${token}`,
      JSON.stringify({ userId: u.id, gen: u.gen || 0, creado: new Date().toISOString() }),
      { expirationTtl: TTL_TOKEN }
    );

    return { ok: true, token, usuario: publico(u), permisos: ROLES[u.rol] || [] };
  }

  async logout(token: string): Promise<void> {
    await this.kv.delete(`token:${token}`);
  }

  /* -------------------------------------------------------------- intentos */

  /**
   * Límite de intentos de login.
   *
   * ⚠️ KV es eventualmente consistente: el bloqueo tarda unos segundos en
   * propagarse global. Frena la fuerza bruta, no es un candado exacto.
   */
  private async minutosBloqueado(usuario: string): Promise<number> {
    const r = await this.kv.get<{ n: number; hasta: string }>(`intentos:${usuario}`, 'json');
    if (!r || r.n < MAX_INTENTOS) return 0;
    const restan = new Date(r.hasta).getTime() - Date.now();
    return restan > 0 ? Math.ceil(restan / 60000) : 0;
  }

  private async registrarFallo(usuario: string): Promise<void> {
    try {
      const r = (await this.kv.get<{ n: number; hasta: string }>(`intentos:${usuario}`, 'json')) || { n: 0, hasta: '' };
      const n = r.n + 1;
      const hasta = new Date(Date.now() + BLOQUEO_MIN * 60000).toISOString();
      await this.kv.put(`intentos:${usuario}`, JSON.stringify({ n, hasta }), {
        expirationTtl: BLOQUEO_MIN * 60,
      });
    } catch {
      /* contar intentos no puede romper el login */
    }
  }

  /* -------------------------------------------------------------- usuarios */

  /**
   * Lista desde la metadata de las claves: evita N lecturas de KV.
   *
   * ⚠️ `kv.list()` es eventualmente consistente, así que un usuario recién
   * creado puede tardar unos segundos en aparecer aquí. NO se intentó arreglar
   * con un índice en una sola clave: eso introduce una carrera
   * lectura-modificación-escritura que llegó a BORRAR usuarios de la lista.
   * La frescura se resuelve en el cliente, que ya sabe a quién acaba de crear.
   */
  async listar(): Promise<UsuarioPublico[]> {
    const lista = await this.kv.list<UsuarioPublico>({ prefix: 'user:', limit: 200 });
    return lista.keys.map((k) => k.metadata).filter((m): m is UsuarioPublico => !!m);
  }

  async porId(id: string): Promise<Usuario | null> {
    return this.kv.get<Usuario>(`user:${id}`, 'json');
  }

  async existeAlguno(): Promise<boolean> {
    const lista = await this.kv.list({ prefix: 'user:', limit: 1 });
    return lista.keys.length > 0;
  }

  async crear(datos: {
    usuario: string;
    nombre?: string;
    password: string;
    rol?: string;
  }): Promise<UsuarioPublico> {
    const usuario = normalizar(datos.usuario);
    const password = (datos.password || '').toString();

    if (!usuario) throw new Error('El usuario es obligatorio');
    if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
    if (await this.kv.get(`idx:usuario:${usuario}`)) throw new Error('Ese usuario ya existe');

    const id = aleatorio(8);
    const salt = aleatorio(8);
    const registro: Usuario = {
      id,
      usuario,
      nombre: limpiar(datos.nombre, 120) || usuario,
      salt,
      hash: await hashPassword(password, salt),
      rol: esRolValido(datos.rol) ? datos.rol : 'VENDEDOR',
      activo: true,
      gen: 0,
      creado: new Date().toISOString(),
    };

    await this.kv.put(`user:${id}`, JSON.stringify(registro), { metadata: publico(registro) });
    await this.kv.put(`idx:usuario:${usuario}`, id);
    return publico(registro);
  }

  async actualizar(
    id: string,
    cambios: { nombre?: string; rol?: string; activo?: boolean; password?: string }
  ): Promise<UsuarioPublico | null> {
    const u = await this.porId(id);
    if (!u) return null;

    if (cambios.password) {
      if (cambios.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
      u.salt = aleatorio(8);
      u.hash = await hashPassword(cambios.password, u.salt);
      u.gen = (u.gen || 0) + 1; // esto es lo que invalida los tokens vigentes
      await this.cerrarSesiones(id); // limpieza best-effort de las claves viejas
    }
    if (cambios.nombre) u.nombre = limpiar(cambios.nombre, 120);
    if (esRolValido(cambios.rol)) u.rol = cambios.rol;
    if (typeof cambios.activo === 'boolean') {
      u.activo = cambios.activo;
      if (!u.activo) {
        u.gen = (u.gen || 0) + 1;
        await this.cerrarSesiones(id);
      }
    }

    await this.kv.put(`user:${id}`, JSON.stringify(u), { metadata: publico(u) });
    return publico(u);
  }

  async eliminar(id: string): Promise<boolean> {
    const u = await this.porId(id);
    if (!u) return false;
    await this.kv.delete(`user:${id}`);
    await this.kv.delete(`idx:usuario:${u.usuario}`);
    await this.cerrarSesiones(id);
    return true;
  }

  /** Cambio de contraseña propio: exige la actual y conserva la sesión en curso. */
  async cambiarPasswordPropia(id: string, actual: string, nueva: string, tokenActual: string): Promise<void> {
    const u = await this.porId(id);
    if (!u) throw new Error('Usuario no encontrado');
    if (!iguales(await hashPassword(actual, u.salt), u.hash)) {
      throw new Error('La contraseña actual no es correcta');
    }
    if ((nueva || '').length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');

    u.salt = aleatorio(8);
    u.hash = await hashPassword(nueva, u.salt);
    u.gen = (u.gen || 0) + 1;
    await this.kv.put(`user:${id}`, JSON.stringify(u), { metadata: publico(u) });
    // La sesion en curso se reemite con la generacion nueva para no expulsar
    // a quien acaba de cambiar su propia contrasena.
    await this.kv.put(
      `token:${tokenActual}`,
      JSON.stringify({ userId: id, gen: u.gen, creado: new Date().toISOString() }),
      { expirationTtl: TTL_TOKEN }
    );
    await this.cerrarSesiones(id, tokenActual);
  }

  /** Cierra las sesiones del usuario. `conservar` deja viva esa sola. */
  private async cerrarSesiones(userId: string, conservar?: string): Promise<void> {
    const lista = await this.kv.list({ prefix: 'token:', limit: 1000 });
    for (const k of lista.keys) {
      if (conservar && k.name === `token:${conservar}`) continue;
      const s = await this.kv.get<{ userId: string }>(k.name, 'json');
      if (s && s.userId === userId) await this.kv.delete(k.name);
    }
  }
}
