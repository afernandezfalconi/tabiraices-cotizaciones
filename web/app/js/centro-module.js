let auditLogs = [];
let allHolds = [];

function initCentroModule() {
  loadCentroData();
}

async function loadCentroData() {
  const userId = sessionStorage.getItem('tabiraices_user') || 'admin';
  const userRole = sessionStorage.getItem('tabiraices_user_role') || 'admin';

  try {
    // Cargar auditoría
    const auditResponse = await fetch('https://tabiraices-inventory-api.lindero-coti.workers.dev/api/audit?limit=100', {
      headers: {
        'X-User-ID': userId,
        'X-User-Role': userRole,
      },
    });

    if (auditResponse.ok) {
      const auditData = await auditResponse.json();
      auditLogs = auditData.data || [];
    }

    // Cargar holds
    const holdsResponse = await fetch('https://tabiraices-inventory-api.lindero-coti.workers.dev/api/holds', {
      headers: {
        'X-User-ID': userId,
        'X-User-Role': userRole,
      },
    });

    if (holdsResponse.ok) {
      const holdsData = await holdsResponse.json();
      allHolds = holdsData.data || [];
    }

    renderCentroModule();
  } catch (error) {
    console.error('Centro data load error:', error);
  }
}

function renderCentroModule() {
  const app = document.getElementById('app');

  const holdsPendientes = allHolds.filter((h) => h.estado === 'pendiente').length;
  const holdsPagadas = allHolds.filter((h) => h.estado === 'pagada').length;

  const auditIngreso = auditLogs.filter((a) => a.tipo === 'ingreso').length;
  const auditVenta = auditLogs.filter((a) => a.tipo === 'venta').length;

  app.innerHTML += `
    <div class="page">
      <h2 style="font-size: 20px; font-weight: 900; margin-bottom: 20px; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px;">🏢 Centro de Cotizaciones</h2>

      <!-- El panel de administración se monta aquí (solo rol admin) -->
      <div id="admin-panel-slot"></div>

      <div class="stats">
        <div class="sc">
          <div class="sl">Cotizaciones Pendientes</div>
          <div class="sv" id="stat-pendientes">${holdsPendientes}</div>
        </div>
        <div class="sc">
          <div class="sl">Cotizaciones Pagadas</div>
          <div class="sv gold" id="stat-pagadas">${holdsPagadas}</div>
        </div>
        <div class="sc">
          <div class="sl">Ingresos Registrados</div>
          <div class="sv" id="stat-ingresos">${auditIngreso}</div>
        </div>
        <div class="sc">
          <div class="sl">Ventas Registradas</div>
          <div class="sv" id="stat-ventas">${auditVenta}</div>
        </div>
      </div>

      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 30px;">
        <h3 style="font-size: 16px; font-weight: 900; margin-bottom: 15px; color: var(--text); text-transform: uppercase;">📋 Auditoría (Últimos 50 cambios)</h3>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: var(--navy); color: #fff;">
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Tipo</th>
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Usuario</th>
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Producto</th>
                <th style="padding: 10px; text-align: right; font-weight: 800; text-transform: uppercase;">Antes</th>
                <th style="padding: 10px; text-align: right; font-weight: 800; text-transform: uppercase;">Después</th>
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Timestamp</th>
              </tr>
            </thead>
            <tbody id="audit-table-body">
              ${auditLogs.length === 0 ? '<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--muted);">Sin registros</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px;">
        <h3 style="font-size: 16px; font-weight: 900; margin-bottom: 15px; color: var(--text); text-transform: uppercase;">⏰ Holds Activos</h3>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: var(--navy); color: #fff;">
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Hold ID</th>
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Cotización</th>
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Producto</th>
                <th style="padding: 10px; text-align: right; font-weight: 800; text-transform: uppercase;">Cantidad</th>
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Estado</th>
                <th style="padding: 10px; text-align: left; font-weight: 800; text-transform: uppercase;">Expira</th>
              </tr>
            </thead>
            <tbody id="holds-table-body">
              ${allHolds.length === 0 ? '<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--muted);">Sin holds activos</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  renderAuditTable();
  renderHoldsTable();
}

function renderAuditTable() {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  if (auditLogs.length === 0) return;

  const tipoEmoji = {
    ingreso: '📥',
    venta: '💰',
    hold_creado: '⏱️',
    hold_liberado: '🔓',
    configuracion: '⚙️',
  };

  tbody.innerHTML = auditLogs.map((log, idx) => {
    const fecha = new Date(log.timestamp).toLocaleString('es-MX');
    const emoji = tipoEmoji[log.tipo] || '•';

    return `
      <tr style="border-bottom: 1px solid var(--border); background: ${idx % 2 === 0 ? 'transparent' : 'var(--surface2)'};">
        <td style="padding: 10px; color: var(--text);">${emoji} ${log.tipo}</td>
        <td style="padding: 10px; color: var(--text); font-weight: 600;">${log.usuario_id}</td>
        <td style="padding: 10px; color: var(--muted);">${log.producto_id || '-'}</td>
        <td style="padding: 10px; text-align: right; color: var(--muted);">${log.cantidad_antes}</td>
        <td style="padding: 10px; text-align: right; color: var(--text); font-weight: 700;">${log.cantidad_despues}</td>
        <td style="padding: 10px; color: var(--muted); font-size: 11px;">${fecha}</td>
      </tr>
    `;
  }).join('');
}

function renderHoldsTable() {
  const tbody = document.getElementById('holds-table-body');
  if (!tbody) return;

  if (allHolds.length === 0) return;

  const estadoEmoji = {
    pendiente: '⏳',
    pagada: '✅',
    expirada: '❌',
    liberada: '🔓',
  };

  tbody.innerHTML = allHolds.map((hold, idx) => {
    const expiraFecha = new Date(hold.expira_en);
    const ahora = new Date();
    const horasRestantes = (expiraFecha - ahora) / (1000 * 60 * 60);
    const expiraStr = expiraFecha.toLocaleString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const estadoColor = horasRestantes < 2 ? 'var(--danger)' : 'var(--text)';
    const emoji = estadoEmoji[hold.estado] || '•';

    return `
      <tr style="border-bottom: 1px solid var(--border); background: ${idx % 2 === 0 ? 'transparent' : 'var(--surface2)'};">
        <td style="padding: 10px; color: var(--text); font-family: monospace; font-size: 11px;">${hold.id.substring(0, 12)}...</td>
        <td style="padding: 10px; color: var(--text); font-weight: 600;">#${hold.cotizacion_id}</td>
        <td style="padding: 10px; color: var(--muted);">${hold.producto_id}</td>
        <td style="padding: 10px; text-align: right; color: var(--text); font-weight: 700;">${hold.cantidad}</td>
        <td style="padding: 10px; color: var(--text);">${emoji} ${hold.estado}</td>
        <td style="padding: 10px; color: ${estadoColor}; font-weight: 700; font-size: 11px;">${expiraStr}</td>
      </tr>
    `;
  }).join('');
}

window.loadCentroData = loadCentroData;
window.renderCentroModule = renderCentroModule;
window.initCentroModule = initCentroModule;

// Inicializar cuando se cargue el módulo
initCentroModule();
