let inventoryCache = null;
let inventorySyncInterval = null;

function initInventoryModule() {
  // Escuchar cambios de inventario
  window.addEventListener('inventory:updated', (e) => {
    inventoryCache = e.detail;
    renderInventoryTable();
    updateKPIs();
  });

  renderInventoryModule();
  startInventorySync();
}

function renderInventoryModule() {
  const app = document.getElementById('app');
  if (!app) { console.error('app element not found'); return; }

  const userRole = sessionStorage.getItem('tabiraices_user_role') || 'vendedor';
  const isAdmin = userRole === 'admin';

  const adminSection = isAdmin ? `
    <div style="margin-bottom: 20px;">
      <button class="btn bg" onclick="openIngresoForm()">➕ Agregar Stock</button>
    </div>
    <div id="ingreso-form" style="display: none; margin-bottom: 20px; padding: 20px; background: var(--surface2); border-radius: 12px;">
      <h3 style="margin-bottom: 15px; text-transform: uppercase;">Agregar Stock</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end;">
        <div>
          <label style="display: block; font-size: 12px; color: var(--muted); font-weight: 700; margin-bottom: 6px; text-transform: uppercase;">Producto</label>
          <select id="ingreso-producto" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--inp); color: var(--text); font-family: Montserrat;">
            <option value="">Seleccionar...</option>
          </select>
        </div>
        <div>
          <label style="display: block; font-size: 12px; color: var(--muted); font-weight: 700; margin-bottom: 6px; text-transform: uppercase;">Cantidad</label>
          <input type="number" id="ingreso-cantidad" min="1" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--inp); color: var(--text); font-family: Montserrat;" />
        </div>
        <button class="btn bg" onclick="handleIngresoSubmit()" style="padding: 10px 20px;">Agregar</button>
      </div>
      <button class="btn bgh bsm" onclick="closeIngresoForm()" style="margin-top: 10px;">Cancelar</button>
    </div>
  ` : '';

  app.innerHTML += `
    <div class="page">
      <h2 style="font-size: 20px; font-weight: 900; margin-bottom: 20px; color: var(--text); text-transform: uppercase; letter-spacing: 0.5px;">📦 Inventario</h2>

      <div class="stats">
        <div class="sc">
          <div class="sl">Valor Total Stock</div>
          <div class="sv gold" id="kpi-valor-total">$0.00</div>
        </div>
        <div class="sc">
          <div class="sl">Cantidad Total</div>
          <div class="sv" id="kpi-cantidad-total">0</div>
        </div>
        <div class="sc">
          <div class="sl">Bloqueado</div>
          <div class="sv" id="kpi-cantidad-bloqueada">0</div>
        </div>
        <div class="sc">
          <div class="sl">Disponible</div>
          <div class="sv" id="kpi-cantidad-disponible">0</div>
        </div>
      </div>

      ${adminSection}

      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: var(--navy); color: #fff;">
              <th style="padding: 12px 16px; text-align: left; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Producto</th>
              <th style="padding: 12px 16px; text-align: right; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">P. Costo</th>
              <th style="padding: 12px 16px; text-align: right; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Total</th>
              <th style="padding: 12px 16px; text-align: right; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gold);">Bloq.</th>
              <th style="padding: 12px 16px; text-align: right; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--success);">Disponible</th>
              <th style="padding: 12px 16px; text-align: right; font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Valor Total</th>
            </tr>
          </thead>
          <tbody id="inventory-table-body">
            <tr style="background: var(--surface2); height: 100px;">
              <td colspan="6" style="text-align: center; color: var(--muted); padding: 40px;">Cargando inventario...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  renderInventoryTable();
  updateKPIs();
}

function renderInventoryTable() {
  if (!inventoryCache || !Array.isArray(inventoryCache.products)) return;

  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

  tbody.innerHTML = inventoryCache.products.map((p, idx) => `
    <tr style="border-bottom: 1px solid var(--border); background: ${idx % 2 === 0 ? "transparent" : "var(--surface2)"};">
      <td style="padding: 12px 16px; color: var(--text); font-weight: 600;">${p.nombre}</td>
      <td style="padding: 12px 16px; text-align: right; color: var(--text); font-weight: 600;">${fmt(p.precio_costo)}</td>
      <td style="padding: 12px 16px; text-align: right; color: var(--text); font-weight: 600;">${p.cantidad_total}</td>
      <td style="padding: 12px 16px; text-align: right; color: var(--warning); font-weight: 700;">${p.cantidad_bloqueada}</td>
      <td style="padding: 12px 16px; text-align: right; color: var(--success); font-weight: 700;">${p.cantidad_disponible}</td>
      <td style="padding: 12px 16px; text-align: right; color: var(--gold); font-weight: 900;">${fmt(p.valor_total)}</td>
    </tr>
  `).join('');

  // Rellenar selector de productos para ingreso
  const productoSelect = document.getElementById('ingreso-producto');
  if (productoSelect) {
    productoSelect.innerHTML = '<option value="">Seleccionar...</option>' +
      inventoryCache.products.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  }
}

function updateKPIs() {
  if (!inventoryCache || typeof inventoryCache.totals !== 'object') return;

  const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
  const t = inventoryCache.totals;

  const valorEl = document.getElementById('kpi-valor-total');
  const cantEl = document.getElementById('kpi-cantidad-total');
  const bloqEl = document.getElementById('kpi-cantidad-bloqueada');
  const dispEl = document.getElementById('kpi-cantidad-disponible');

  if (valorEl) valorEl.textContent = fmt(t.valor_total || 0);
  if (cantEl) cantEl.textContent = t.cantidad_total || 0;
  if (bloqEl) bloqEl.textContent = t.cantidad_bloqueada || 0;
  if (dispEl) dispEl.textContent = t.cantidad_disponible || 0;
}

function openIngresoForm() {
  const form = document.getElementById('ingreso-form');
  if (form) form.style.display = 'block';
}

function closeIngresoForm() {
  const form = document.getElementById('ingreso-form');
  if (form) form.style.display = 'none';
  document.getElementById('ingreso-producto').value = '';
  document.getElementById('ingreso-cantidad').value = '';
}

async function handleIngresoSubmit() {
  const productoId = document.getElementById('ingreso-producto').value;
  const cantidad = parseInt(document.getElementById('ingreso-cantidad').value);

  if (!productoId || !cantidad || cantidad <= 0) {
    alert('Por favor completa todos los campos');
    return;
  }

  const userId = sessionStorage.getItem('tabiraices_user') || 'admin';
  const userRole = sessionStorage.getItem('tabiraices_user_role') || 'admin';

  try {
    const response = await fetch(`https://tabiraices-inventory-api.lindero-coti.workers.dev/api/inventory/${productoId}/ingreso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
        'X-User-Role': userRole,
      },
      body: JSON.stringify({ cantidad, notas: '' }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al agregar stock');
    }

    alert('✅ Stock agregado correctamente');
    closeIngresoForm();
    await syncInventory();
  } catch (error) {
    alert('❌ ' + error.message);
  }
}

async function startInventorySync() {
  await syncInventory();
  inventorySyncInterval = setInterval(syncInventory, 30000);
}

async function syncInventory() {
  try {
    const userId = sessionStorage.getItem('tabiraices_user') || 'admin';
    const userRole = sessionStorage.getItem('tabiraices_user_role') || 'admin';

    const response = await fetch('https://tabiraices-inventory-api.lindero-coti.workers.dev/api/inventory', {
      headers: {
        'X-User-ID': userId,
        'X-User-Role': userRole,
      },
      mode: 'cors'
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Sync failed:', response.status, text);
      throw new Error('Sync failed: ' + response.status);
    }

    const data = await response.json();
    if (data.success && data.data) {
      inventoryCache = data.data;
      localStorage.setItem('tabiraices_inventory_cache', JSON.stringify(data.data));
      window.dispatchEvent(new CustomEvent('inventory:updated', { detail: data.data }));
    } else {
      console.error('Invalid response:', data);
    }
  } catch (error) {
    console.error('Inventory sync error:', error.message);
  }
}

function stopInventorySync() {
  if (inventorySyncInterval) clearInterval(inventorySyncInterval);
}

window.openIngresoForm = openIngresoForm;
window.closeIngresoForm = closeIngresoForm;
window.handleIngresoSubmit = handleIngresoSubmit;
window.syncInventory = syncInventory;
window.renderInventoryModule = renderInventoryModule;
window.initInventoryModule = initInventoryModule;
window.startInventorySync = startInventorySync;
window.stopInventorySync = stopInventorySync;

// Inicializar cuando se cargue el módulo
initInventoryModule();
