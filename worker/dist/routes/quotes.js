import { QuotesService, totalDe } from '../services/quotes-service';
import { requirePermiso, AuthError } from '../middleware/auth';
import { puede } from '../lib/roles';
import { bitacora } from '../services/bitacora-service';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
const ok = (data) => json({ success: true, data });
const err = (error, status = 400, codigo) => json({ success: false, error, codigo }, status);
const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const money = (n) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/**
 * Landing pública: la sirve el Worker desde KV.
 *
 * Antes era un HTML que leía `localStorage`, así que el cliente al que le
 * mandabas el enlace veía una página vacía: la cotización sólo existía en el
 * navegador de quien la creó.
 *
 * No expone `precio_costo` ni margen: sólo lo que el cliente debe ver.
 */
function landingHTML(c) {
    const items = (c.items || []).filter((i) => i.desc || i.qty);
    const sub = items.reduce((s, i) => s + (parseFloat(String(i.unit)) || 0) * (parseFloat(String(i.qty)) || 0), 0);
    const iva = sub * ((Number(c.ivaRate) || 0) / 100);
    const filas = items
        .map((i) => {
        const u = parseFloat(String(i.unit)) || 0;
        const q = parseFloat(String(i.qty)) || 0;
        return `<tr><td>${esc(i.desc) || '—'}</td><td class="n">${money(u)}</td><td class="n">${q}</td><td class="n b">${money(u * q)}</td></tr>`;
    })
        .join('');
    const estado = c.status === 'paid'
        ? '<span class="badge pagada">PAGADA</span>'
        : c.status === 'cancelled'
            ? '<span class="badge cancelada">CANCELADA</span>'
            : '';
    return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Cotización #${esc(c.id)} | TABIRAÍCES</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Montserrat,system-ui,sans-serif;background:#f4f3ef;color:#1a1a1a;padding:16px;line-height:1.5}
.hoja{max-width:760px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.enc{background:#0D1B2A;color:#fff;padding:24px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.marca{font-size:22px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase}
.lema{font-size:9px;color:#F5C010;font-weight:700;letter-spacing:.5px;text-transform:uppercase;margin-top:2px}
.folio{text-align:right}
.folio .et{font-size:9px;color:rgba(255,255,255,.5);font-weight:700;text-transform:uppercase}
.folio .nu{font-size:26px;font-weight:900;color:#F5C010;line-height:1.1}
.folio .fe{font-size:10px;color:rgba(255,255,255,.6)}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:9px;font-weight:800;letter-spacing:.5px;margin-top:6px}
.pagada{background:#d1fae5;color:#065f46}.cancelada{background:#fee2e2;color:#b91c1c}
.contacto{background:#f0efe9;padding:12px 24px;font-size:11px;color:#555;display:flex;gap:18px;flex-wrap:wrap}
.cuerpo{padding:24px}
.datos{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:22px}
.dato .et{font-size:9px;color:#888;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.dato .va{font-size:14px;font-weight:700;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#0D1B2A;color:#fff;padding:10px;text-align:left;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
td{padding:10px;border-bottom:1px solid #eee}
.n{text-align:right}.b{font-weight:800}
.tot{margin-top:18px;margin-left:auto;max-width:280px}
.tr{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
.tg{display:flex;justify-content:space-between;padding:11px 0;border-top:2px solid #0D1B2A;margin-top:6px;font-size:17px;font-weight:900}
.tg .v{color:#0D1B2A}
.pie{background:#0D1B2A;color:rgba(255,255,255,.75);padding:16px 24px;font-size:11px;text-align:center}
@media(max-width:520px){.enc{flex-direction:column}.folio{text-align:left}}
</style></head><body>
<div class="hoja">
  <div class="enc">
    <div><div class="marca">TABIRAÍCES</div><div class="lema">La base de toda buena obra</div></div>
    <div class="folio">
      <div class="et">Cotización</div><div class="nu">#${esc(c.id)}</div>
      <div class="fe">${esc(c.date)}</div>${estado}
    </div>
  </div>
  <div class="contacto">
    <span>Tel: 954 100 4104 / 954 138 9557</span>
    <span>Ventanilla, Colotepec</span>
    <span>bloquera.tabiraices@gmail.com</span>
  </div>
  <div class="cuerpo">
    <div class="datos">
      <div class="dato"><div class="et">Cliente</div><div class="va">${esc(c.client) || '—'}</div></div>
      <div class="dato"><div class="et">Proyecto / Obra</div><div class="va">${esc(c.project) || '—'}</div></div>
      <div class="dato"><div class="et">Entrega en</div><div class="va">${esc(c.location) || '—'}</div></div>
    </div>
    <table>
      <thead><tr><th>Descripción</th><th class="n">P. Unitario</th><th class="n">Cantidad</th><th class="n">Total</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="4" style="text-align:center;color:#888;padding:24px">Sin productos</td></tr>'}</tbody>
    </table>
    <div class="tot">
      <div class="tr"><span style="color:#888">Subtotal</span><span class="b">${money(sub)}</span></div>
      <div class="tr"><span style="color:#888">IVA (${Number(c.ivaRate) || 0}%)</span><span class="b">${money(iva)}</span></div>
      <div class="tg"><span>TOTAL</span><span class="v">${money(sub + iva)}</span></div>
    </div>
    ${c.payment ? `<div style="margin-top:18px;font-size:12px;color:#666">Forma de pago: <strong style="color:#1a1a1a">${esc(c.payment)}</strong></div>` : ''}
  </div>
  <div class="pie">TABIRAÍCES · Ventanilla, Colotepec, Puerto Escondido, Oaxaca</div>
</div>
</body></html>`;
}
export async function handleQuotesRequest(request, kv, usuariosKV, ipSalt) {
    const url = new URL(request.url);
    const ruta = url.pathname;
    const metodo = request.method;
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const quotes = new QuotesService(kv);
    /* ---------------- landing pública: SIN autenticación, a propósito ------- */
    const mLanding = ruta.match(/^\/landing\/([a-z0-9]+)$/);
    if (metodo === 'GET' && mLanding) {
        const c = await quotes.porToken(mLanding[1]);
        if (!c) {
            return new Response('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>No encontrada</title></head><body style="font-family:system-ui;text-align:center;padding:60px;color:#555"><h1 style="font-size:20px">Cotización no encontrada</h1><p>El enlace expiró o ya no está disponible.</p></body></html>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        // Cuántas veces abre el cliente la cotización que le mandaron: es la
        // señal de si la herramienta le está sirviendo al vendedor.
        await bitacora(usuariosKV, c.creado_por_usuario || c.creado_por_nombre || c.creado_por, 'landing_vista', `#${c.id} · ${c.client || 'sin cliente'}`, ip, ipSalt);
        return new Response(landingHTML(c), {
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    }
    const body = ['POST', 'PUT'].includes(metodo)
        ? await request.json().catch(() => ({}))
        : {};
    /* ------------------------------------------------------------- listar --- */
    if (ruta === '/api/cotizaciones' && metodo === 'GET') {
        const yo = await requirePermiso(request, usuariosKV, 'cotizar');
        // Un vendedor sólo ve las suyas; con 'ver_todas' se ven todas.
        const soloDe = puede(yo, 'ver_todas') ? undefined : yo.id;
        const completas = url.searchParams.get('full') === '1';
        const items = completas
            ? await quotes.listarCompletas(soloDe)
            : await quotes.listar(soloDe);
        return ok({ items });
    }
    /* -------------------------------------------------------- crear/guardar - */
    if (ruta === '/api/cotizaciones' && metodo === 'POST') {
        const yo = await requirePermiso(request, usuariosKV, 'cotizar');
        if (body.id) {
            const previa = await quotes.porId(body.id);
            if (previa && !puede(yo, 'ver_todas') && previa.creado_por !== yo.id) {
                return err('No puedes modificar una cotización de otro vendedor', 403, 'PERMISO');
            }
        }
        const esNueva = !!body.nueva || !body.id;
        const guardada = await quotes.guardar(body, { id: yo.id, nombre: yo.nombre, usuario: yo.usuario });
        await bitacora(usuariosKV, yo.usuario, esNueva ? 'cotizacion_crear' : 'cotizacion_editar', `#${guardada.id} · ${guardada.client || 'sin cliente'} · $${totalDe(guardada).toFixed(2)}`, ip, ipSalt);
        return ok(guardada);
    }
    /* ------------------------------------------------------- una cotización - */
    const mId = ruta.match(/^\/api\/cotizaciones\/([^/]+)$/);
    if (mId && ['GET', 'DELETE'].includes(metodo)) {
        const yo = await requirePermiso(request, usuariosKV, 'cotizar');
        const c = await quotes.porId(mId[1]);
        if (!c)
            return err('Cotización no encontrada', 404, 'NO_ENCONTRADA');
        if (!puede(yo, 'ver_todas') && c.creado_por !== yo.id) {
            return err('No tienes acceso a esta cotización', 403, 'PERMISO');
        }
        if (metodo === 'DELETE') {
            await quotes.eliminar(mId[1]);
            await bitacora(usuariosKV, yo.usuario, 'cotizacion_eliminar', `#${c.id} · ${c.client || 'sin cliente'}`, ip, ipSalt);
            return ok({ eliminada: true });
        }
        return ok(c);
    }
    /* ----------------------------------------------- publicar/obtener enlace - */
    const mShare = ruta.match(/^\/api\/cotizaciones\/([^/]+)\/compartir$/);
    if (mShare && metodo === 'POST') {
        const yo = await requirePermiso(request, usuariosKV, 'cotizar');
        const c = await quotes.porId(mShare[1]);
        if (!c)
            return err('Cotización no encontrada', 404, 'NO_ENCONTRADA');
        if (!puede(yo, 'ver_todas') && c.creado_por !== yo.id) {
            return err('No tienes acceso a esta cotización', 403, 'PERMISO');
        }
        // Reutiliza el enlace ya publicado: compartir dos veces da la MISMA URL.
        const token = await quotes.tokenDeLanding(c.id);
        await bitacora(usuariosKV, yo.usuario, 'cotizacion_compartir', `#${c.id} · ${c.client || 'sin cliente'}`, ip, ipSalt);
        return ok({ token, total: totalDe(c) });
    }
    /* --------------------------------------------------- siguiente folio ---- */
    if (ruta === '/api/cotizaciones/folio/siguiente' && metodo === 'GET') {
        await requirePermiso(request, usuariosKV, 'cotizar');
        return ok({ folio: await quotes.siguienteFolio() });
    }
    throw new AuthError('UNAUTHORIZED', 'Ruta no encontrada');
}
