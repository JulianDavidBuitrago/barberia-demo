import {
  collection, getDocs, getDoc, doc, query, where, orderBy, limit, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { db, storage, call, auth } from './firebase.js';
import { renderChrome, esc, money, $, $$, toast, requireLogin, onSession, formatDateLong } from './ui.js';

renderChrome('admin.html');
const TZ = 'America/Bogota';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
let barbers = [], services = [];

// ── Acceso ───────────────────────────────────────────────────────
(async () => {
  await requireLogin('Ingrese con su cuenta de administrador.');
  onSession(({ isAdmin }) => {
    $('#gate').classList.toggle('hidden', isAdmin);
    $('#panel').classList.toggle('hidden', !isAdmin);
    if (isAdmin && !window.__started) { window.__started = true; start(); }
  });
})();

$('#claimBtn').onclick = async () => {
  try {
    const r = await call('claimOwner');
    await auth.currentUser.getIdToken(true);
    toast(r.message); setTimeout(() => location.reload(), 1200);
  } catch (err) { toast(err.message, true); }
};

$('#tabs').onclick = (e) => {
  const t = e.target.dataset.tab; if (!t) return;
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $$('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== t));
  history.replaceState(null, '', `#${t}`);
  loaders[t]?.();
};

async function refreshCatalog() {
  const [b, s] = await Promise.all([getDocs(collection(db, 'barbers')), getDocs(collection(db, 'services'))]);
  barbers = b.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (x.order || 0) - (y.order || 0));
  services = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (x.order || 0) - (y.order || 0));
  const opts = '<option value="">—</option>' + barbers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('#upBarber').innerHTML = opts;
  $('#agBarber').innerHTML = '<option value="">Todos los barberos</option>' + barbers.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
}

async function start() {
  $('#agDate').value = today();
  await refreshCatalog();
  const tab = location.hash.slice(1);
  if (tab && $(`#tabs [data-tab="${tab}"]`)) $(`#tabs [data-tab="${tab}"]`).click(); else loaders.agenda();
}

$('#seedBtn').onclick = async () => {
  if (!confirm('Se crearán servicios, barberos y productos de ejemplo solo si están vacíos. ¿Continuar?')) return;
  try { const r = await call('seedDemoData'); toast(`Listo: ${r.created.join(', ') || 'no había nada que crear'}.`); await refreshCatalog(); }
  catch (err) { toast(err.message, true); }
};

// ── Agenda ───────────────────────────────────────────────────────
async function loadAgenda() {
  const date = $('#agDate').value;
  const snap = await getDocs(query(collection(db, 'bookings'), where('date', '==', date), orderBy('startAt')));
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if ($('#agBarber').value) rows = rows.filter((b) => b.barberId === $('#agBarber').value);
  const active = rows.filter((b) => b.status === 'confirmada');
  const income = rows.filter((b) => ['confirmada', 'completada'].includes(b.status)).reduce((s, b) => s + b.price, 0);
  $('#agenda').innerHTML = `<p class="muted">${active.length} citas activas · ingreso proyectado ${money(income)}</p>` + (rows.length ? `<div class="table-wrap"><table class="data">
    <thead><tr><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Barbero</th><th>Estado</th><th></th></tr></thead><tbody>
    ${rows.map((b) => `<tr><td><b>${b.time}</b><br><small class="muted">${b.durationMin} min</small></td>
      <td>${esc(b.clientName)}<br><small class="muted">${esc(b.clientPhone || '')} · ${esc(b.clientEmail)}</small>${b.notes ? `<br><small>📝 ${esc(b.notes)}</small>` : ''}</td>
      <td>${esc(b.serviceName)}<br><small class="muted">${money(b.price)}</small></td><td>${esc(b.barberName)}</td>
      <td><span class="tag ${b.status === 'confirmada' ? 'ok' : b.status === 'cancelada' ? 'bad' : ''}">${b.status.replace('_', ' ')}</span></td>
      <td>${b.status === 'confirmada' ? `<div class="btn-row"><button class="btn btn-ghost btn-small" data-st="completada" data-id="${b.id}">Atendido</button>
        <button class="btn btn-ghost btn-small" data-st="no_asistio" data-id="${b.id}">No vino</button>
        <button class="btn btn-danger btn-small" data-cancel="${b.id}">Cancelar</button>
        ${b.clientPhone ? `<a class="btn btn-ghost btn-small" target="_blank" rel="noopener" href="https://wa.me/57${b.clientPhone.replace(/\D/g, '').replace(/^57/, '')}">WhatsApp</a>` : ''}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No hay citas para este día.</div>');
}
$('#agDate').onchange = loadAgenda;
$('#agBarber').onchange = loadAgenda;
$('#agenda').onclick = async (e) => {
  const { st, id, cancel } = e.target.dataset;
  try {
    if (st) { await call('adminSetBookingStatus', { bookingId: id, status: st }); toast('Actualizado.'); }
    else if (cancel) { if (!confirm('¿Cancelar esta cita? El cliente recibirá un correo.')) return; await call('cancelBooking', { bookingId: cancel }); toast('Cita cancelada y horario liberado.'); }
    else return;
    loadAgenda();
  } catch (err) { toast(err.message, true); }
};

// ── Pedidos ──────────────────────────────────────────────────────
async function loadOrders() {
  const f = $('#ordFilter').value;
  const q = f ? query(collection(db, 'orders'), where('status', '==', f), orderBy('createdAt', 'asc'), limit(100))
    : query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100));
  const snap = await getDocs(q);
  $('#orders').innerHTML = snap.empty ? '<div class="empty">Sin pedidos en esta vista.</div>' : `<div class="table-wrap"><table class="data">
    <thead><tr><th>Pedido</th><th>Cliente y entrega</th><th>Productos</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>
    ${snap.docs.map((d) => { const o = d.data(); return `<tr>
      <td>#${esc(o.code)}<br><small class="muted">${o.createdAt ? esc(formatDateLong(o.createdAt.toDate())) : ''}</small></td>
      <td>${esc(o.shipping.name)} · ${esc(o.shipping.phone)}<br><small class="muted">${esc(o.shipping.address)}, ${esc(o.shipping.city)}${o.shipping.notes ? ' · ' + esc(o.shipping.notes) : ''}</small></td>
      <td>${o.items.map((i) => `${esc(i.name)} ×${i.qty}`).join('<br>')}</td>
      <td>${money(o.total)}<br><small class="muted">${o.paymentMethod === 'contraentrega' ? 'Contraentrega' : 'Mercado Pago'}</small></td>
      <td><span class="tag">${esc(o.status.replace(/_/g, ' '))}</span></td>
      <td><div class="btn-row">
        ${['pagado', 'pendiente_entrega'].includes(o.status) ? `<button class="btn btn-ghost btn-small" data-o="${d.id}" data-s="enviado">Despachado</button>` : ''}
        ${o.status === 'enviado' ? `<button class="btn btn-ghost btn-small" data-o="${d.id}" data-s="entregado">Entregado</button>` : ''}
        ${!['entregado', 'cancelado', 'reembolsado'].includes(o.status) ? `<button class="btn btn-danger btn-small" data-o="${d.id}" data-s="cancelado">Cancelar</button>` : ''}
      </div></td></tr>`; }).join('')}</tbody></table></div>`;
}
$('#ordFilter').onchange = loadOrders;
$('#orders').onclick = async (e) => {
  const { o, s } = e.target.dataset; if (!o) return;
  if (s === 'cancelado' && !confirm('¿Cancelar el pedido? El stock se devolverá al inventario. Si fue pagado en línea, haga el reembolso desde Mercado Pago.')) return;
  try { await call('adminUpdateOrder', { orderId: o, status: s }); toast('Pedido actualizado y cliente notificado.'); loadOrders(); }
  catch (err) { toast(err.message, true); }
};

// ── CRUD genérico de catálogos ───────────────────────────────────
const SCHEMAS = {
  services: { title: 'Servicio', cols: ['name', 'price', 'durationMin', 'active'], fields: [
    ['name', 'Nombre', 'text'], ['description', 'Descripción', 'textarea'], ['price', 'Precio (COP)', 'number'],
    ['durationMin', 'Duración (min, múltiplo de 15)', 'number'], ['order', 'Orden', 'number'], ['active', 'Activo', 'checkbox']] },
  barbers: { title: 'Barbero', cols: ['name', 'bio', 'active'], fields: [
    ['name', 'Nombre', 'text'], ['bio', 'Presentación corta', 'textarea'], ['photoUrl', 'Foto', 'image'], ['order', 'Orden', 'number'],
    ['serviceIds', 'Servicios que realiza (vacío = todos)', 'services'], ['daysOff', 'Días libres (AAAA-MM-DD separados por coma)', 'list'], ['active', 'Activo', 'checkbox']] },
  products: { title: 'Producto', cols: ['name', 'price', 'stock', 'active'], fields: [
    ['name', 'Nombre', 'text'], ['description', 'Descripción', 'textarea'], ['price', 'Precio (COP)', 'number'], ['stock', 'Stock', 'number'],
    ['category', 'Categoría (cabello, barba, afeitado…)', 'text'], ['imageUrl', 'Imagen', 'image'], ['active', 'Activo', 'checkbox']] }
};

async function loadCrud(col) {
  const box = $(`[data-crud="${col}"]`);
  const schema = SCHEMAS[col];
  const snap = await getDocs(collection(db, col));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  const cell = (r, c) => c === 'active' ? (r.active !== false ? '<span class="tag ok">Sí</span>' : '<span class="tag bad">No</span>') : c === 'price' ? money(r.price) : esc(String(r[c] ?? ''));
  box.innerHTML = `<button class="btn btn-primary btn-small" data-new style="margin-bottom:16px">+ Nuevo ${schema.title.toLowerCase()}</button>
    <div class="table-wrap"><table class="data"><thead><tr>${schema.cols.map((c) => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr>${schema.cols.map((c) => `<td>${cell(r, c)}</td>`).join('')}<td><div class="btn-row"><button class="btn btn-ghost btn-small" data-edit="${r.id}">Editar</button><button class="btn btn-danger btn-small" data-del="${r.id}">Eliminar</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
  box.onclick = async (e) => {
    if (e.target.dataset.new !== undefined) openEditor(col, null);
    if (e.target.dataset.edit) openEditor(col, rows.find((r) => r.id === e.target.dataset.edit));
    if (e.target.dataset.del) {
      if (!confirm('¿Eliminar definitivamente? Sugerencia: desactívelo en su lugar para conservar el historial.')) return;
      await deleteDoc(doc(db, col, e.target.dataset.del)); toast('Eliminado.'); loadCrud(col); refreshCatalog();
    }
  };
}

function openEditor(col, data) {
  const schema = SCHEMAS[col];
  const v = data || { active: true };
  $('#editTitle').textContent = `${data ? 'Editar' : 'Nuevo'} ${schema.title.toLowerCase()}`;
  $('#editForm').innerHTML = schema.fields.map(([k, label, type]) => {
    if (type === 'textarea') return `<div class="field"><label>${label}</label><textarea name="${k}" rows="3">${esc(v[k] || '')}</textarea></div>`;
    if (type === 'checkbox') return `<label class="check field"><input type="checkbox" name="${k}" ${v[k] !== false ? 'checked' : ''}> ${label}</label>`;
    if (type === 'image') return `<div class="field"><label>${label}</label>${v[k] ? `<img src="${esc(v[k])}" style="max-height:90px;border-radius:8px;margin-bottom:8px">` : ''}<input type="file" name="${k}" accept="image/*"></div>`;
    if (type === 'list') return `<div class="field"><label>${label}</label><input name="${k}" value="${esc((v[k] || []).join(', '))}"></div>`;
    if (type === 'services') return `<div class="field"><label>${label}</label>${services.map((s) => `<label class="check"><input type="checkbox" name="${k}" value="${s.id}" ${(v[k] || []).includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div>`;
    return `<div class="field"><label>${label}</label><input name="${k}" type="${type}" value="${esc(v[k] ?? '')}" ${type === 'number' ? 'min="0" step="1"' : ''} ${k === 'name' ? 'required' : ''}></div>`;
  }).join('') + '<button class="btn btn-primary" type="submit">Guardar</button>';
  $('#editModal').classList.add('open');

  $('#editForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const out = {};
      for (const [k, , type] of schema.fields) {
        const el = $(`#editForm [name="${k}"]`);
        if (type === 'checkbox') out[k] = el.checked;
        else if (type === 'number') out[k] = Number(el.value || 0);
        else if (type === 'list') out[k] = el.value.split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
        else if (type === 'services') out[k] = $$(`#editForm [name="${k}"]:checked`).map((c) => c.value);
        else if (type === 'image') { if (el.files[0]) out[k] = await uploadImage(col, el.files[0]); }
        else out[k] = el.value.trim();
      }
      if (col === 'services' && out.durationMin % 15) throw new Error('La duración debe ser múltiplo de 15 minutos.');
      out.updatedAt = serverTimestamp();
      if (data) await updateDoc(doc(db, col, data.id), out);
      else await addDoc(collection(db, col), { ...out, createdAt: serverTimestamp() });
      $('#editModal').classList.remove('open');
      toast('Guardado.'); loadCrud(col); refreshCatalog();
    } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = 'Guardar'; }
  };
}
$('#editModal').onclick = (e) => { if (e.target.id === 'editModal' || e.target.matches('[data-close]')) $('#editModal').classList.remove('open'); };

function uploadImage(folder, file) {
  const path = `${folder}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type, cacheControl: 'public,max-age=31536000' });
    task.on('state_changed', null, reject, async () => resolve(await getDownloadURL(task.snapshot.ref)));
  });
}

// ── Galería ──────────────────────────────────────────────────────
async function loadGallery() {
  const snap = await getDocs(query(collection(db, 'gallery'), orderBy('createdAt', 'desc'), limit(120)));
  $('#galleryAdmin').innerHTML = snap.docs.map((d) => { const g = d.data(); return `<article class="card" style="padding:12px">
    ${g.type === 'video' ? `<video src="${esc(g.url)}" muted preload="metadata" style="border-radius:8px"></video>` : `<img src="${esc(g.url)}" style="border-radius:8px" loading="lazy">`}
    <p style="margin:10px 0 6px"><b>${esc(g.title || 'Sin título')}</b><br><small class="muted">${esc(g.category || '')}</small></p>
    <div class="btn-row"><button class="btn btn-ghost btn-small" data-pub="${d.id}" data-val="${g.published ? 0 : 1}">${g.published ? 'Ocultar' : 'Publicar'}</button>
    <button class="btn btn-danger btn-small" data-gdel="${d.id}" data-path="${esc(g.path)}">Eliminar</button></div></article>`; }).join('') || '<div class="empty">Aún no hay trabajos publicados.</div>';
}
$('#galleryAdmin').onclick = async (e) => {
  const { pub, val, gdel, path } = e.target.dataset;
  if (pub) { await updateDoc(doc(db, 'gallery', pub), { published: val === '1' }); loadGallery(); }
  if (gdel) {
    if (!confirm('¿Eliminar este archivo de forma permanente?')) return;
    await deleteObject(ref(storage, path)).catch(() => {});
    await deleteDoc(doc(db, 'gallery', gdel)); toast('Eliminado.'); loadGallery();
  }
};

$('#upForm').onsubmit = async (e) => {
  e.preventDefault();
  const files = [...$('#upFiles').files];
  const barber = barbers.find((b) => b.id === $('#upBarber').value);
  $('#upBtn').disabled = true;
  try {
    for (const [i, file] of files.entries()) {
      const isVideo = file.type.startsWith('video/');
      if (file.size > (isVideo ? 150 : 15) * 1024 * 1024) { toast(`${file.name} supera el tamaño permitido.`, true); continue; }
      const path = `gallery/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
      const url = await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type, cacheControl: 'public,max-age=31536000' });
        task.on('state_changed', (s) => { $('#upProgress').textContent = `Subiendo ${i + 1}/${files.length}: ${Math.round(s.bytesTransferred / s.totalBytes * 100)}%`; }, reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref)));
      });
      await addDoc(collection(db, 'gallery'), {
        url, path, type: isVideo ? 'video' : 'image', title: $('#upTitle').value.trim(), description: $('#upDesc').value.trim(),
        category: $('#upCat').value, barberId: barber?.id || null, barberName: barber?.name || null, published: true, createdAt: serverTimestamp()
      });
    }
    $('#upProgress').textContent = '¡Publicado! Sus clientes ya pueden verlo.';
    $('#upForm').reset(); loadGallery();
  } catch (err) { toast('Error al subir: ' + err.message, true); }
  finally { $('#upBtn').disabled = false; }
};

// ── Ajustes ──────────────────────────────────────────────────────
async function loadSettings() {
  const snap = await getDoc(doc(db, 'config', 'business'));
  const c = snap.exists() ? snap.data() : {};
  const oh = c.openingHours || {};
  const num = (k, label, def) => `<div class="field"><label>${label}</label><input type="number" min="0" name="${k}" value="${c[k] ?? def}"></div>`;
  $('#settings').innerHTML = `
    <h3>Reservas y recordatorios</h3>
    <div class="form-row">
      <div class="field"><label>Nombre del negocio</label><input name="name" value="${esc(c.name || 'Filo & Navaja Barbería')}"></div>
      <div class="field"><label>Opciones de recordatorio (horas, separadas por coma)</label><input name="reminderOptions" value="${(c.reminderOptions || [1, 2, 3, 24]).join(', ')}"></div>
      ${num('defaultReminderHours', 'Recordatorio por defecto (horas)', 2)}
      ${num('minNoticeMinutes', 'Anticipación mínima para reservar (min)', 60)}
      ${num('cancelLimitHours', 'Límite para cancelar/reprogramar (h)', 2)}
      ${num('bookingWindowDays', 'Días visibles en la agenda', 30)}
      <div class="field"><label>Intervalo de agenda (min)</label><select name="slotMinutes">${[15, 30].map((m) => `<option ${(c.slotMinutes || 15) === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    </div>
    <h3 style="margin-top:12px">Horario de atención</h3>
    ${DAYS.map((d, i) => `<div class="form-row" style="align-items:center">
      <label class="check"><input type="checkbox" name="open${i}" ${oh[i] ? 'checked' : ''}> ${d}</label>
      <input type="time" name="from${i}" value="${oh[i]?.open || '09:00'}"><input type="time" name="to${i}" value="${oh[i]?.close || '20:00'}"></div>`).join('')}
    <h3 style="margin-top:22px">Tienda</h3>
    <div class="form-row">
      ${num('shippingFee', 'Costo de envío (COP)', 8000)}
      ${num('freeShippingFrom', 'Envío gratis desde (COP)', 120000)}
    </div>
    <label class="check field"><input type="checkbox" name="mercadoPagoEnabled" ${c.mercadoPagoEnabled !== false ? 'checked' : ''}> Aceptar pagos con Mercado Pago</label>
    <label class="check field"><input type="checkbox" name="codEnabled" ${c.codEnabled !== false ? 'checked' : ''}> Aceptar pago contra entrega</label>
    <button class="btn btn-primary" type="submit">Guardar ajustes</button>`;
}
$('#settings').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const n = (k) => Number(f.get(k));
  const reminderOptions = String(f.get('reminderOptions')).split(',').map((s) => Number(s.trim())).filter((x) => x > 0 && x <= 72);
  if (!reminderOptions.length) return toast('Defina al menos una opción de recordatorio.', true);
  if (!reminderOptions.includes(n('defaultReminderHours'))) return toast('El recordatorio por defecto debe estar entre las opciones.', true);
  const openingHours = {};
  DAYS.forEach((_, i) => { openingHours[i] = f.get(`open${i}`) ? { open: f.get(`from${i}`), close: f.get(`to${i}`) } : null; });
  await setDoc(doc(db, 'config', 'business'), {
    name: String(f.get('name')).trim(), reminderOptions: [...new Set(reminderOptions)].sort((a, b) => a - b),
    defaultReminderHours: n('defaultReminderHours'), minNoticeMinutes: n('minNoticeMinutes'), cancelLimitHours: n('cancelLimitHours'),
    bookingWindowDays: Math.min(90, n('bookingWindowDays')), slotMinutes: n('slotMinutes'), openingHours,
    shippingFee: n('shippingFee'), freeShippingFrom: n('freeShippingFrom'),
    mercadoPagoEnabled: !!f.get('mercadoPagoEnabled'), codEnabled: !!f.get('codEnabled'), currency: 'COP', updatedAt: serverTimestamp()
  }, { merge: true });
  toast('Ajustes guardados. Aplican de inmediato a nuevas reservas.');
};

// ── Equipo ───────────────────────────────────────────────────────
$('#teamForm').onsubmit = (e) => e.preventDefault();
$('#teamForm').onclick = async (e) => {
  if (e.target.dataset.admin === undefined) return;
  e.preventDefault();
  const email = $('#teamEmail').value.trim();
  if (!email) return toast('Escriba el correo.', true);
  try { await call('setAdminRole', { email, admin: e.target.dataset.admin === '1' }); toast('Permisos actualizados. La persona debe cerrar sesión y volver a entrar.'); }
  catch (err) { toast(err.message, true); }
};

const loaders = {
  agenda: loadAgenda, pedidos: loadOrders, galeria: loadGallery, ajustes: loadSettings,
  services: () => loadCrud('services'), barbers: () => loadCrud('barbers'), products: () => loadCrud('products')
};
