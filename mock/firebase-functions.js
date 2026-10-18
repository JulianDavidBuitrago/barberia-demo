// MODO DEMO · reemplazo de firebase-functions.js
// Reproduce en el navegador la lógica de las Cloud Functions reales
// (functions/src/*.js): agenda anti doble reserva, recordatorios,
// pedidos con stock, pasarela simulada y asesor de estilo simulado.
import { db, col, getRaw, setRaw, deleteRaw, decode, newId, save, sendMail, Timestamp } from './store.js';

const TZ = 'America/Bogota';
const OFF = '-05:00';

class HttpsError extends Error { constructor(code, message) { super(message); this.code = `functions/${code}`; } }
const assert = (c, msg, code = 'invalid-argument') => { if (!c) throw new HttpsError(code, msg); };

const get = (path) => { const r = getRaw(path); return r === undefined ? null : { id: path.split('/').pop(), ...decode(r) }; };
const put = (path, data) => setRaw(path, data);
const patch = (path, data) => setRaw(path, { ...decode(getRaw(path)), ...data });
const all = (c) => Object.entries(col(c)).map(([id, raw]) => ({ id, ...decode(raw) }));

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const localDate = (d, t) => new Date(`${d}T${t}:00${OFF}`);
const weekday = (d) => new Date(`${d}T12:00:00${OFF}`).getUTCDay();
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const fmt = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(d);
const first = (n = '') => n.trim().split(/\s+/)[0] || 'amigo';
const clean = (s, max = 300) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

function business() { return get('config/business') || {}; }
function ctx() {
  const s = db();
  const u = s.users.find((x) => x.uid === s.session);
  return u ? { uid: u.uid, token: { email: u.email, name: u.displayName, admin: u.claims?.admin === true, email_verified: true } } : null;
}
const requireAuth = () => { const a = ctx(); if (!a) throw new HttpsError('unauthenticated', 'Inicie sesión para continuar.'); return a; };
const requireAdmin = () => { const a = requireAuth(); if (!a.token.admin) throw new HttpsError('permission-denied', 'Acción reservada al administrador.'); return a; };

// ── Agenda ───────────────────────────────────────────────────────
const blocksFor = (barberId, date, start, dur, step) => {
  const ids = [];
  for (let m = start; m < start + dur; m += step) ids.push(`${barberId}_${date}_${toHHMM(m).replace(':', '')}`);
  return ids;
};
function hoursFor(biz, barber, date) {
  if ((barber.daysOff || []).includes(date)) return null;
  const wd = weekday(date);
  const o = barber.hours ? barber.hours[wd] : undefined;
  return o !== undefined ? o : biz.openingHours[wd];
}
function catalog(barberId, serviceId) {
  const barber = get(`barbers/${barberId}`); const service = get(`services/${serviceId}`);
  assert(barber && barber.active !== false, 'El barbero seleccionado no está disponible.', 'not-found');
  assert(service && service.active !== false, 'El servicio seleccionado no está disponible.', 'not-found');
  if (barber.serviceIds?.length) assert(barber.serviceIds.includes(service.id), `${barber.name} no realiza este servicio.`);
  return { barber, service };
}

// ── Correos con el mismo tono de los reales ─────────────────────
function mailBooking(kind, b) {
  const when = fmt(b.startAt.toDate());
  const templates = {
    confirmation: [`${first(b.clientName)}, su cita está confirmada: ${when}`,
      `<p>Hemos reservado este espacio exclusivamente para usted. ${b.barberName} ya sabe que viene y estará listo para dedicarle toda su atención.</p>
       <p><b>${b.serviceName}</b> · ${when} · ${money(b.price)}</p><p>Le enviaremos un recordatorio <b>${b.reminderHours === 24 ? '1 día' : b.reminderHours + (b.reminderHours === 1 ? ' hora' : ' horas')} antes</b>, para que llegue tranquilo y sin prisas.</p>`],
    reminder: [`${first(b.clientName)}, lo esperamos: ${when}`,
      `<p>Su espacio con <b>${b.barberName}</b> para <b>${b.serviceName}</b> está listo: <b>${when}</b>.</p><p>Un consejo de barbero: llegue con el cabello limpio y sin productos; así su corte queda más preciso y le dura más.</p>`],
    cancelled: [`${first(b.clientName)}, su cita fue cancelada`,
      `<p>Confirmamos la cancelación de su ${b.serviceName} del ${when}.</p><p>Gracias por avisarnos: ese gesto dice mucho de usted. Cuando quiera retomar su estilo, su silla lo estará esperando.</p>`],
    rescheduled: [`${first(b.clientName)}, su cita fue reprogramada`,
      `<p>Le esperamos el <b>${when}</b> con ${b.barberName}. Gracias por avisarnos con tiempo.</p>`]
  };
  const [subject, html] = templates[kind];
  sendMail({ to: b.clientEmail, subject, html, tag: `booking_${kind}` });
  if (kind === 'confirmation') sendMail({ to: 'barbero@demo.com', subject: `Nueva cita: ${b.clientName} · ${when}`, html: `<p>${b.serviceName} con ${b.barberName}.</p>${b.notes ? `<p>Nota: <i>${b.notes}</i></p>` : ''}`, tag: 'business_new_booking' });
}

function mailOrder(o, kind) {
  const lines = o.items.map((i) => `<li>${i.name} × ${i.qty} — ${money(i.price * i.qty)}</li>`).join('');
  const subjects = {
    confirmation: `${first(o.shipping.name)}, recibimos su pedido #${o.code}`,
    enviado: `Su pedido #${o.code} va en camino`, entregado: `Su pedido #${o.code} fue entregado`, cancelado: `Su pedido #${o.code} fue cancelado`
  };
  const cod = o.paymentMethod === 'contraentrega';
  const body = kind === 'confirmation'
    ? `<p>${cod ? `Pagará <b>${money(o.total)}</b> al recibir.` : 'Su pago fue <b>aprobado</b>.'} Estamos empacando sus productos con el mismo cuidado con el que atendemos en la silla.</p><ul>${lines}</ul><p><b>Total: ${money(o.total)}</b></p>`
    : `<p>Queremos que siempre sepa en qué va su compra.</p><ul>${lines}</ul>`;
  sendMail({ to: o.clientEmail, subject: subjects[kind], html: body, tag: `order_${kind}` });
  if (kind === 'confirmation') sendMail({ to: 'barbero@demo.com', subject: `Pedido #${o.code} · ${o.paymentMethod} · ${money(o.total)}`, html: `<p>${o.shipping.name} · ${o.shipping.address}</p><ul>${lines}</ul>`, tag: 'business_new_order' });
}

// ── Recordatorios (equivale a la función programada cada 5 min) ─
export function runReminderScheduler({ force = false } = {}) {
  const now = Date.now();
  let sent = 0;
  all('bookings').forEach((b) => {
    if (b.status !== 'confirmada' || b.reminderSent) return;
    if (b.startAt.toMillis() < now) return;
    if (!force && b.reminderAt.toMillis() > now) return;
    mailBooking('reminder', b);
    patch(`bookings/${b.id}`, { reminderSent: true, reminderSentAt: new Date() });
    sent++;
  });
  if (sent) save();
  return sent;
}

const handlers = {
  getAvailability({ barberId, serviceId, date }) {
    const biz = business();
    const { barber, service } = catalog(barberId, serviceId);
    const hours = hoursFor(biz, barber, date);
    if (!hours) return { date, slots: [], closed: true };
    const taken = new Set(Object.keys(col('slotLocks')).filter((id) => id.startsWith(`${barberId}_${date}_`)));
    const earliest = Date.now() + biz.minNoticeMinutes * 60_000;
    const slots = [];
    for (let m = toMin(hours.open); m + service.durationMin <= toMin(hours.close); m += biz.slotMinutes) {
      if (localDate(date, toHHMM(m)).getTime() < earliest) continue;
      if (blocksFor(barberId, date, m, service.durationMin, biz.slotMinutes).every((id) => !taken.has(id))) slots.push(toHHMM(m));
    }
    return { date, slots, closed: false };
  },

  createBooking(d) {
    const a = requireAuth();
    const biz = business();
    const reminderHours = Number(d.reminderHours ?? biz.defaultReminderHours);
    assert(biz.reminderOptions.includes(reminderHours), 'Elija una opción de recordatorio válida.');
    const startAt = localDate(d.date, d.time);
    assert(startAt.getTime() >= Date.now() + biz.minNoticeMinutes * 60_000, `Las reservas requieren al menos ${biz.minNoticeMinutes} minutos de anticipación.`);
    const active = all('bookings').filter((b) => b.uid === a.uid && b.status === 'confirmada' && b.startAt.toMillis() >= Date.now());
    assert(active.length < 3, 'Puede tener hasta 3 citas activas a la vez.', 'resource-exhausted');
    const { barber, service } = catalog(d.barberId, d.serviceId);
    const hours = hoursFor(biz, barber, d.date);
    assert(hours, 'La barbería no atiende ese día.', 'failed-precondition');
    const start = toMin(d.time);
    const lockIds = blocksFor(barber.id, d.date, start, service.durationMin, biz.slotMinutes);
    if (lockIds.some((id) => getRaw(`slotLocks/${id}`))) throw new HttpsError('already-exists', 'Alguien acaba de tomar ese horario. Por favor elija otro; aún hay excelentes opciones.');
    const id = newId();
    const reminderAt = startAt.getTime() - reminderHours * 3_600_000;
    const booking = {
      uid: a.uid, clientName: clean(d.clientName, 80) || a.token.name || 'Cliente', clientEmail: a.token.email, clientPhone: clean(d.phone, 20),
      notes: clean(d.notes, 500), barberId: barber.id, barberName: barber.name, serviceId: service.id, serviceName: service.name,
      durationMin: service.durationMin, price: service.price, date: d.date, time: d.time,
      startAt, endAt: new Date(startAt.getTime() + service.durationMin * 60_000), reminderHours,
      reminderAt: new Date(reminderAt), reminderSent: reminderAt <= Date.now(), lockIds, status: 'confirmada', source: 'web', createdAt: new Date()
    };
    put(`bookings/${id}`, booking);
    lockIds.forEach((l) => put(`slotLocks/${l}`, { barberId: barber.id, date: d.date, bookingId: id }));
    mailBooking('confirmation', { ...booking, startAt: Timestamp.fromDate(startAt) });
    save();
    return { bookingId: id };
  },

  cancelBooking({ bookingId }) {
    const a = requireAuth();
    const b = get(`bookings/${bookingId}`);
    assert(b, 'La cita no existe.', 'not-found');
    assert(a.token.admin || b.uid === a.uid, 'No puede modificar esta cita.', 'permission-denied');
    assert(b.status === 'confirmada', 'Esta cita ya no está activa.', 'failed-precondition');
    if (!a.token.admin) assert(Date.now() <= b.startAt.toMillis() - business().cancelLimitHours * 3_600_000, `Las cancelaciones en línea se aceptan hasta ${business().cancelLimitHours} horas antes. Escríbanos y con gusto le ayudamos.`, 'failed-precondition');
    (b.lockIds || []).forEach((l) => deleteRaw(`slotLocks/${l}`));
    patch(`bookings/${bookingId}`, { status: 'cancelada', cancelledBy: a.token.admin ? 'admin' : 'cliente', cancelledAt: new Date() });
    mailBooking('cancelled', b);
    save();
    return { ok: true };
  },

  rescheduleBooking({ bookingId, date, time }) {
    const a = requireAuth();
    const biz = business();
    const b = get(`bookings/${bookingId}`);
    assert(b, 'La cita no existe.', 'not-found');
    assert(a.token.admin || b.uid === a.uid, 'No puede modificar esta cita.', 'permission-denied');
    assert(b.status === 'confirmada', 'Esta cita ya no está activa.', 'failed-precondition');
    const startAt = localDate(date, time);
    assert(startAt.getTime() >= Date.now() + biz.minNoticeMinutes * 60_000, 'Elija un horario con más anticipación.');
    const { barber, service } = catalog(b.barberId, b.serviceId);
    assert(hoursFor(biz, barber, date), 'La barbería no atiende ese día.', 'failed-precondition');
    const newIds = blocksFor(barber.id, date, toMin(time), service.durationMin, biz.slotMinutes);
    const old = new Set(b.lockIds || []);
    if (newIds.some((id) => !old.has(id) && getRaw(`slotLocks/${id}`))) throw new HttpsError('already-exists', 'Ese horario ya fue tomado. Elija otro, por favor.');
    (b.lockIds || []).forEach((l) => deleteRaw(`slotLocks/${l}`));
    newIds.forEach((l) => put(`slotLocks/${l}`, { barberId: barber.id, date, bookingId }));
    const reminderAt = startAt.getTime() - b.reminderHours * 3_600_000;
    patch(`bookings/${bookingId}`, { date, time, startAt, endAt: new Date(startAt.getTime() + service.durationMin * 60_000), reminderAt: new Date(reminderAt), reminderSent: reminderAt <= Date.now(), lockIds: newIds });
    mailBooking('rescheduled', { ...b, startAt: Timestamp.fromDate(startAt) });
    save();
    return { ok: true };
  },

  adminSetBookingStatus({ bookingId, status }) {
    requireAdmin();
    assert(['completada', 'no_asistio'].includes(status), 'Estado no válido.');
    const b = get(`bookings/${bookingId}`);
    (b.lockIds || []).forEach((l) => deleteRaw(`slotLocks/${l}`));
    patch(`bookings/${bookingId}`, { status, closedAt: new Date() });
    save();
    return { ok: true };
  },

  // ── Tienda ─────────────────────────────────────────────────────
  createOrder({ items, paymentMethod, shipping = {} }) {
    const a = requireAuth();
    const biz = business();
    assert(Array.isArray(items) && items.length, 'Su carrito está vacío.');
    assert(['mercadopago', 'contraentrega'].includes(paymentMethod), 'Seleccione un método de pago.');
    const ship = { name: clean(shipping.name, 80), phone: clean(shipping.phone, 20), address: clean(shipping.address, 160), city: clean(shipping.city, 60), notes: clean(shipping.notes, 300) };
    assert(ship.name && ship.phone && ship.address && ship.city, 'Complete los datos de entrega.');
    const merged = new Map();
    items.forEach((i) => merged.set(i.productId, (merged.get(i.productId) || 0) + Math.floor(Number(i.qty))));
    const lines = [...merged].map(([pid, qty]) => {
      const p = get(`products/${pid}`);
      assert(p && p.active !== false, 'Un producto de su carrito ya no está disponible.', 'not-found');
      assert(p.stock >= qty, `Solo quedan ${p.stock} unidades de ${p.name}.`, 'failed-precondition');
      return { productId: pid, name: p.name, price: p.price, qty, imageUrl: p.imageUrl || null };
    });
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const shippingFee = subtotal >= biz.freeShippingFrom ? 0 : biz.shippingFee;
    const id = newId();
    const order = {
      id, code: Date.now().toString(36).toUpperCase().slice(-6), uid: a.uid, clientEmail: a.token.email, items: lines, subtotal, shippingFee,
      total: subtotal + shippingFee, currency: 'COP', paymentMethod, shipping: ship,
      status: paymentMethod === 'contraentrega' ? 'pendiente_entrega' : 'pendiente_pago', stockRestored: false,
      expiresAt: paymentMethod === 'mercadopago' ? new Date(Date.now() + 24 * 3_600_000) : null, createdAt: new Date()
    };
    lines.forEach((l) => patch(`products/${l.productId}`, { stock: get(`products/${l.productId}`).stock - l.qty }));
    put(`orders/${id}`, order);
    if (paymentMethod === 'contraentrega') mailOrder(order, 'confirmation');
    save();
    return { orderId: id, code: order.code, redirectUrl: paymentMethod === 'contraentrega' ? `pedido.html?id=${id}` : `mp-simulado.html?id=${id}` };
  },

  // Equivale al webhook de Mercado Pago (llamado desde la pasarela simulada)
  __mpSimulate({ orderId, status }) {
    const o = get(`orders/${orderId}`);
    assert(o, 'Pedido no encontrado.', 'not-found');
    if (o.status !== 'pendiente_pago') return { ok: true };
    if (status === 'approved') { patch(`orders/${orderId}`, { status: 'pagado', mpStatus: status, paidAt: new Date() }); mailOrder(o, 'confirmation'); }
    if (status === 'rejected') {
      o.items.forEach((i) => patch(`products/${i.productId}`, { stock: get(`products/${i.productId}`).stock + i.qty }));
      patch(`orders/${orderId}`, { status: 'pago_rechazado', mpStatus: status, stockRestored: true });
    }
    save();
    return { ok: true };
  },

  adminUpdateOrder({ orderId, status }) {
    requireAdmin();
    assert(['enviado', 'entregado', 'cancelado'].includes(status), 'Estado no válido.');
    const o = get(`orders/${orderId}`);
    const upd = { status, updatedAt: new Date() };
    if (status === 'cancelado' && !o.stockRestored) {
      o.items.forEach((i) => { const p = get(`products/${i.productId}`); if (p) patch(`products/${i.productId}`, { stock: p.stock + i.qty }); });
      upd.stockRestored = true;
    }
    patch(`orders/${orderId}`, upd);
    mailOrder({ ...o, status }, status);
    save();
    return { ok: true };
  },

  // ── Asesor de estilo (SIMULADO en el demo; en producción usa la API de Claude) ──
  async analyzeFace({ consent, imageBase64, preferences = {} }) {
    const a = requireAuth();
    assert(consent === true, 'Necesitamos su autorización para analizar la foto.');
    assert(typeof imageBase64 === 'string' && imageBase64.length > 1000, 'Cargue una foto para continuar.');
    await new Promise((r) => setTimeout(r, 1800));
    const shapes = ['ovalado', 'cuadrado', 'redondo', 'rectangular', 'diamante'];
    let h = 0; for (let i = 0; i < imageBase64.length; i += 997) h = (h * 31 + imageBase64.charCodeAt(i)) >>> 0;
    const shape = shapes[h % shapes.length];
    const CATALOG = {
      ovalado: [['Texturizado con mid fade', 'Su rostro equilibrado admite volumen arriba sin perder proporción.', 'Mid fade con máquina 1 a 3; arriba 5–6 cm texturizado con tijera de entresacar.'],
        ['Pompadour moderno', 'Aprovecha su frente proporcionada y estiliza aún más el perfil.', 'Laterales en 2 con transición suave; arriba 7–8 cm peinado hacia atrás.'],
        ['Crew cut', 'Limpio y versátil; resalta sus pómulos sin esfuerzo.', 'Laterales en 2, arriba 3 cm con degradado frontal.']],
      cuadrado: [['Crew cut texturizado', 'Suaviza ligeramente su mandíbula fuerte y mantiene la presencia.', 'Laterales en 1.5, arriba 3–4 cm con textura irregular.'],
        ['Quiff con low fade', 'El volumen frontal alarga el rostro y equilibra los ángulos.', 'Low fade desde 0.5; arriba 6 cm, más largo al frente.'],
        ['Side part clásico', 'Elegante y profesional; enmarca su mandíbula marcada.', 'Raya lateral marcada con navaja; laterales en 2 a tijera.']],
      redondo: [['High fade con volumen', 'Alarga visualmente el rostro gracias a la altura arriba.', 'High fade desde 0; arriba 6–7 cm con volumen hacia arriba.'],
        ['Faux hawk', 'Crea líneas verticales que estilizan el rostro.', 'Laterales en 1; franja central 5–6 cm peinada hacia el centro.'],
        ['Undercut peinado hacia atrás', 'Contraste lateral que afina la silueta.', 'Laterales en 0.5 sin degradado; arriba 8 cm hacia atrás.']],
      rectangular: [['Corte medio con flequillo', 'El flequillo acorta visualmente la frente y equilibra el largo.', 'Laterales en 3 a tijera; arriba 6 cm con flequillo texturizado.'],
        ['Low fade con textura', 'Mantiene el ancho lateral para no alargar más el rostro.', 'Low fade desde 2; arriba 4–5 cm sin volumen excesivo.'],
        ['Caesar cut', 'Línea frontal recta que proporciona el rostro.', 'Todo a 2–3 cm con flequillo corto y recto.']],
      diamante: [['Fringe texturizado', 'Suaviza sus pómulos marcados y añade amplitud en la frente.', 'Laterales en 3; arriba 5 cm con flequillo hacia adelante.'],
        ['Corte medio desordenado', 'Agrega volumen en frente y mandíbula para equilibrar.', 'Tijera en todo; 6–7 cm con capas.'],
        ['Taper clásico', 'Un acabado limpio que resalta su estructura ósea.', 'Taper en patillas y nuca; arriba 4 cm.']]
    };
    const maint = { 'menos de 2 minutos': 'baja', 'unos 5 minutos': 'media', 'disfruto peinarme': 'alta' }[preferences.maintenance] || 'media';
    const result = {
      ok: true, faceShape: shape, confidence: 'media',
      highlights: ['proporciones armónicas', 'línea de mandíbula definida', 'buena densidad de cabello'].slice(0, 2 + (h % 2)),
      hair: { texture: ['liso', 'ondulado', 'rizado'][h % 3], density: 'media' },
      recommendations: CATALOG[shape].map(([name, why, barberNotes], i) => ({ name, why, barberNotes, maintenance: maint, visitEveryWeeks: 3 + i, styling: 'Con el cabello húmedo, aplique una pequeña cantidad de pomada mate y peine con los dedos.' })),
      beard: preferences.beard === 'prefiero sin barba' ? { recommended: 'sin barba', why: 'Respeta su preferencia y deja el protagonismo al corte.' } : { recommended: 'barba corta perfilada (3–5 mm)', why: 'Define la mandíbula sin endurecer los rasgos.' },
      avoid: ['Volumen excesivo en los laterales', 'Rapados totales sin transición'],
      retryTip: null, demo: true
    };
    const id = newId();
    put(`users/${a.uid}/aiConsults/${id}`, { result, preferences, model: 'simulación demo', createdAt: new Date() });
    save();
    return { ...result, consultId: id };
  },

  // ── Administración ─────────────────────────────────────────────
  claimOwner() {
    const a = requireAuth();
    assert(a.uid === 'demo-barbero', 'Esta cuenta no es la del propietario. En el demo, ingrese como barbero@demo.com.', 'permission-denied');
    return { ok: true, message: 'Su cuenta ya tiene rol de administrador.' };
  },
  setAdminRole({ email, admin }) {
    const me = requireAdmin();
    const u = db().users.find((x) => x.email === String(email).trim().toLowerCase());
    assert(u, 'No hay ningún usuario con ese correo en el demo.', 'not-found');
    assert(u.uid !== me.uid || admin, 'No puede retirarse su propio rol.');
    u.claims = { ...(u.claims || {}), admin };
    save();
    return { ok: true };
  },
  seedDemoData() { requireAdmin(); return { ok: true, created: [] }; }
};

export const getFunctions = () => ({ demo: true });
export function connectFunctionsEmulator() {}

export function httpsCallable(_f, name) {
  return async (data = {}) => {
    const fn = handlers[name];
    if (!fn) throw new HttpsError('not-found', `Función ${name} no disponible en el demo.`);
    await new Promise((r) => setTimeout(r, 220));
    return { data: await fn(data) };
  };
}
