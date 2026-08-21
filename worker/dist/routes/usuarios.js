import { UsersService } from '../services/users-service';
import { requirePermiso } from '../middleware/auth';
import { puede, puedeAdministrarRol, esRolValido, ROLES_ADMIN } from '../lib/roles';
import { bitacora, leerBitacora } from '../services/bitacora-service';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
const ok = (data) => json({ success: true, data });
const err = (error, status = 400, codigo) => json({ success: false, error, codigo }, status);
export async function handleUsuariosRequest(request, usuariosKV, ipSalt) {
    const url = new URL(request.url);
    const ruta = url.pathname;
    const metodo = request.method;
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const users = new UsersService(usuariosKV);
    const body = ['POST', 'PUT'].includes(metodo)
        ? await request.json().catch(() => ({}))
        : {};
    /* -------------------------------------------------------------- bitácora */
    if (ruta === '/api/bitacora' && metodo === 'GET') {
        await requirePermiso(request, usuariosKV, 'bitacora');
        return ok({ items: await leerBitacora(usuariosKV) });
    }
    /**
     * Actividad completa — sólo ADMIN.
     *
     * Exige el permiso 'admins', que ningún otro rol tiene: ni el DUEÑO ni los
     * vendedores pueden consultarla, ni siquiera llamando al endpoint a mano.
     * Ocultar la pestaña en la pantalla no basta: sin esta comprobación,
     * cualquiera con sesión podría leerla desde la consola del navegador.
     */
    if (ruta === '/api/actividad' && metodo === 'GET') {
        const yo = await requirePermiso(request, usuariosKV, 'admins');
        const registros = await leerBitacora(usuariosKV, 400);
        const desde = url.searchParams.get('usuario');
        const items = desde
            ? registros.filter((r) => r && r.usuario === desde)
            : registros;
        // Resumen por usuario: quién usa la herramienta y cuánto.
        const porUsuario = {};
        for (const r of registros) {
            if (!r || !r.usuario)
                continue;
            const u = (porUsuario[r.usuario] ||= {
                usuario: r.usuario,
                accesos: 0,
                cotizaciones: 0,
                compartidas: 0,
                vistasDelCliente: 0,
                movimientosInventario: 0,
                total: 0,
                ultimo: null,
            });
            u.total++;
            if (!u.ultimo || r.fecha > u.ultimo)
                u.ultimo = r.fecha;
            if (r.accion === 'login')
                u.accesos++;
            else if (r.accion === 'cotizacion_crear')
                u.cotizaciones++;
            else if (r.accion === 'cotizacion_compartir')
                u.compartidas++;
            else if (r.accion === 'landing_vista')
                u.vistasDelCliente++;
            else if (r.accion.startsWith('usuario_') || r.accion === 'password_cambiar')
                u.movimientosInventario++;
        }
        return ok({
            items,
            resumen: Object.values(porUsuario).sort((a, b) => (b.ultimo || '').localeCompare(a.ultimo || '')),
            consultadoPor: yo.usuario,
        });
    }
    /* ---------------------------------------------------------------- listar */
    if (ruta === '/api/usuarios' && metodo === 'GET') {
        const yo = await requirePermiso(request, usuariosKV, 'usuarios');
        const todos = await users.listar();
        /**
         * Quien no puede administrar cuentas de nivel alto tampoco las ve.
         *
         * El DUEÑO veía la cuenta del ADMIN en su panel con botones de "Contraseña"
         * y "Desactivar" que sólo devolvían un error. No tiene por qué saber que
         * esa cuenta existe. Su propia cuenta sí la ve, para cambiar su contraseña.
         *
         * ⚠️ El filtro va aquí y no en la pantalla: ocultarla en el HTML dejaría la
         * lista completa a un `fetch` desde la consola del navegador.
         */
        const items = puede(yo, 'admins')
            ? todos
            : todos.filter((u) => u.id === yo.id || !ROLES_ADMIN.includes(u.rol));
        return ok({ items });
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
        }
        catch (e) {
            return err(e.message, 400, 'VALIDACION');
        }
    }
    /* ------------------------------------------------------- editar/eliminar */
    if (ruta.startsWith('/api/usuarios/') && ['PUT', 'DELETE'].includes(metodo)) {
        const yo = await requirePermiso(request, usuariosKV, 'usuarios');
        const id = ruta.split('/').pop();
        const objetivo = await users.porId(id);
        if (!objetivo)
            return err('Usuario no encontrado', 404, 'NO_ENCONTRADO');
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
        }
        catch (e) {
            return err(e.message, 400, 'VALIDACION');
        }
    }
    return err('Ruta no encontrada', 404, 'NO_ENCONTRADA');
}
