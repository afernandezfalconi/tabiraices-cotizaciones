import { UsersService } from '../services/users-service';
import { requirePermiso } from '../middleware/auth';
import { puedeAdministrarRol, esRolValido } from '../lib/roles';
import { bitacora, leerBitacora } from '../services/bitacora-service';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const ok = (data: any) => json({ success: true, data });
const err = (error: string, status = 400, codigo?: string) =>
  json({ success: false, error, codigo }, status);

export async function handleUsuariosRequest(
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

  /* -------------------------------------------------------------- bitácora */
  if (ruta === '/api/bitacora' && metodo === 'GET') {
    await requirePermiso(request, usuariosKV, 'bitacora');
    return ok({ items: await leerBitacora(usuariosKV) });
  }

  /* ---------------------------------------------------------------- listar */
  if (ruta === '/api/usuarios' && metodo === 'GET') {
    await requirePermiso(request, usuariosKV, 'usuarios');
    return ok({ items: await users.listar() });
  }

  /* ----------------------------------------------------------------- crear */
  if (ruta === '/api/usuarios' && metodo === 'POST') {
    const yo = await requirePermiso(request, usuariosKV, 'usuarios');

    const rolPedido = esRolValido(body.rol) ? body.rol : 'VENDEDOR';
    if (!puedeAdministrarRol(yo, rolPedido)) {
      return err('Solo un ADMIN puede crear cuentas de ADMIN o DUEÑO', 403, 'PERMISO');
    }

    try {
      const nuevo = await users.crear({ ...body, rol: rolPedido });
      await bitacora(usuariosKV, yo.usuario, 'usuario_crear', nuevo.usuario, ip, ipSalt);
      return ok(nuevo);
    } catch (e: any) {
      return err(e.message, 400, 'VALIDACION');
    }
  }

  /* ------------------------------------------------------- editar/eliminar */
  if (ruta.startsWith('/api/usuarios/') && ['PUT', 'DELETE'].includes(metodo)) {
    const yo = await requirePermiso(request, usuariosKV, 'usuarios');
    const id = ruta.split('/').pop() as string;

    const objetivo = await users.porId(id);
    if (!objetivo) return err('Usuario no encontrado', 404, 'NO_ENCONTRADO');

    // Tocar una cuenta de nivel alto exige 'admins'; ascender a una también.
    if (!puedeAdministrarRol(yo, objetivo.rol)) {
      return err('Solo un ADMIN puede administrar cuentas de ADMIN o DUEÑO', 403, 'PERMISO');
    }
    if (body.rol && esRolValido(body.rol) && !puedeAdministrarRol(yo, body.rol)) {
      return err('Solo un ADMIN puede asignar ese rol', 403, 'PERMISO');
    }
    // Nadie se elimina ni se desactiva a sí mismo: evita quedarse fuera.
    if (objetivo.id === yo.id && (metodo === 'DELETE' || body.activo === false)) {
      return err('No puedes eliminar ni desactivar tu propia cuenta', 400, 'VALIDACION');
    }

    if (metodo === 'DELETE') {
      await users.eliminar(id);
      await bitacora(usuariosKV, yo.usuario, 'usuario_eliminar', objetivo.usuario, ip, ipSalt);
      return ok({ eliminado: true });
    }

    try {
      const actualizado = await users.actualizar(id, body);
      await bitacora(usuariosKV, yo.usuario, 'usuario_editar', objetivo.usuario, ip, ipSalt);
      return ok(actualizado);
    } catch (e: any) {
      return err(e.message, 400, 'VALIDACION');
    }
  }

  return err('Ruta no encontrada', 404, 'NO_ENCONTRADA');
}
