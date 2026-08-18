import { UsersService } from '../services/users-service';
import { requireAuth, AuthError } from '../middleware/auth';
import { bitacora } from '../services/bitacora-service';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const ok = (data: any) => json({ success: true, data });
const err = (error: string, status = 400, codigo?: string) =>
  json({ success: false, error, codigo }, status);

export async function handleAuthRequest(
  request: Request,
  usuariosKV: KVNamespace,
  ipSalt?: string
): Promise<Response> {
  const url = new URL(request.url);
  const ruta = url.pathname;
  const metodo = request.method;
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const users = new UsersService(usuariosKV);

  const body: any = ['POST', 'PUT'].includes(metodo)
    ? await request.json().catch(() => ({}))
    : {};

  /* ---------------------------------------------------------------- login */
  if (ruta === '/api/login' && metodo === 'POST') {
    const r = await users.login(body.usuario, body.password);

    if (!r.ok) {
      if (r.codigo === 'BLOQUEADO') {
        await bitacora(usuariosKV, body.usuario, 'login_bloqueado', `faltan ${r.minutos} min`, ip, ipSalt);
        return err(`Demasiados intentos. Espera ${r.minutos} minutos`, 429, 'BLOQUEADO');
      }
      if (r.codigo === 'INACTIVO') {
        return err('Tu cuenta está desactivada. Contacta al administrador', 403, 'INACTIVO');
      }
      await bitacora(usuariosKV, body.usuario, 'login_fallido', '', ip, ipSalt);
      return err('Usuario o contraseña incorrectos', 401, 'CREDENCIALES');
    }

    await bitacora(usuariosKV, r.usuario.usuario, 'login', '', ip, ipSalt);
    return ok({
      token: r.token,
      usuario: r.usuario.usuario,
      nombre: r.usuario.nombre,
      rol: r.usuario.rol,
      permisos: r.permisos,
    });
  }

  /* --------------------------------------------------------------- logout */
  if (ruta === '/api/logout' && metodo === 'POST') {
    const sesion = await requireAuth(request, usuariosKV);
    await users.logout(sesion.token);
    return ok({ cerrada: true });
  }

  /* ------------------------------------------------------------------ yo */
  if (ruta === '/api/yo' && metodo === 'GET') {
    const s = await requireAuth(request, usuariosKV);
    return ok({ id: s.id, usuario: s.usuario, nombre: s.nombre, rol: s.rol, permisos: s.permisos });
  }

  /* ----------------------------------------------- cambiar propia password */
  if (ruta === '/api/password' && metodo === 'POST') {
    const s = await requireAuth(request, usuariosKV);
    try {
      await users.cambiarPasswordPropia(s.id, body.actual, body.nueva, s.token);
    } catch (e: any) {
      return err(e.message, 400, 'VALIDACION');
    }
    await bitacora(usuariosKV, s.usuario, 'password_cambiar', '', ip, ipSalt);
    return ok({ actualizada: true });
  }

  /*
   * NO existe endpoint de bootstrap, a propósito.
   *
   * La primera versión tenía uno, protegido por un token y un guardia
   * "¿ya hay usuarios?" resuelto con kv.list(). La prueba E2E lo tumbó: KV es
   * eventualmente consistente, así que en la ventana de propagación el guardia
   * no ve al usuario recién creado y deja crear DUEÑOS ilimitados.
   *
   * Un endpoint así es además una puerta trasera permanente si el token se
   * filtra. El primer DUEÑO se siembra con `worker/scripts/sembrar-dueno.mjs`,
   * que escribe en KV vía wrangler: sin endpoint, sin token, y sin que la
   * contraseña viaje por HTTP.
   */

  throw new AuthError('UNAUTHORIZED', 'Ruta no encontrada');
}
