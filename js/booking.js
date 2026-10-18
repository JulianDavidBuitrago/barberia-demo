import { collection, getDocs, getDoc, doc, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db, call } from './firebase.js';
import { renderChrome, esc, money, $, $$, toast, requireLogin, onSession, firstName } from './ui.js';
import { BRAND } from './config.js';

renderChrome('reservar.html');

const params = new URLSearchParams(location.search);
const rescheduleId = params.get('reprogramar');
const state = { step: 1, service: null, barber: null, date: null, time: null, services: [], barbers: [], business: null, booking: null };

const DEFAULT_BUSINESS = { reminderOptions: [1, 2, 3, 24], defaultReminderHours: 2, bookingWindowDays: 30, openingHours: { 0: null } };
const TZ = 'America/Bogota';
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const fmtDay = (s) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${s}T12:00:00-05:00`));
const fmtTime = (t) => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(`1970-01-01T${t}:00Z`));
const reminderLabel = (h) => (h === 24 ? '1 día antes' : h === 1 ? '1 hora antes' : `${h} horas antes`);

function go(step) {
  state.step = step;
  $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', Number(p.dataset.panel) !== step));
  $$('#stepper span').forEach((s) => {
    const n = Number(s.dataset.step);
    s.classList.toggle('on', n === step);
    s.classList.toggle('done', n < step);
  });
  paintSummary();
  if (step <= 4) $('#stepper').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function paintSummary() {
  $('#sService').textContent = state.service?.name || '—';
  $('#sBarber').textContent = state.barber?.name || '—';
  $('#sDate').textContent = state.date ? fmtDay(state.date) : '—';
  $('#sTime').textContent = state.time ? fmtTime(state.time) : '—';
  $('#sDur').textContent = state.service ? `${state.service.durationMin} min` : '—';
  $('#sPrice').textContent = state.service ? money(state.service.price) : '—';
}

$$('[data-back]').forEach((b) => (b.onclick = () => go(Math.max(rescheduleId ? 3 : 1, state.step - 1))));

// ── Paso 1: servicios ────────────────────────────────────────────
function renderServices() {
  $('#serviceList').innerHTML = state.services.map((s) => `
    <button class="choice" data-id="${s.id}">
      <b>${esc(s.name)}</b><small>${esc(s.description || '')}</small>
      <small style="margin-top:10px;color:var(--brass-2)">${money(s.price)} · ${s.durationMin} min</small>
    </button>`).join('') || '<div class="empty">Aún no hay servicios publicados.</div>';
  $('#serviceList').onclick = (e) => {
    const btn = e.target.closest('.choice'); if (!btn) return;
    state.service = state.services.find((s) => s.id === btn.dataset.id);
    state.date = state.time = null;
    renderBarbers();
    go(2);
  };
}

// ── Paso 2: barberos ─────────────────────────────────────────────
function barbersFor(service) {
  return state.barbers.filter((b) => !b.serviceIds?.length || b.serviceIds.includes(service.id));
}
function renderBarbers() {
  const list = barbersFor(state.service);
  $('#barberList').innerHTML = list.map((b) => `
    <button class="choice ${state.barber?.id === b.id ? 'selected' : ''}" data-id="${b.id}">
      <b>${esc(b.name)}</b><small>${esc(b.bio || '')}</small>
    </button>`).join('') || '<div class="empty">Ningún barbero ofrece este servicio por ahora.</div>';
  $('#barberList').onclick = (e) => {
    const btn = e.target.closest('.choice'); if (!btn) return;
    state.barber = state.barbers.find((b) => b.id === btn.dataset.id);
    state.date = state.time = null;
    renderDays();
    go(3);
  };
}

// ── Paso 3: días y horarios ──────────────────────────────────────
function isClosed(dateStr) {
  const wd = new Date(`${dateStr}T12:00:00-05:00`).getUTCDay();
  if ((state.barber.daysOff || []).includes(dateStr)) return true;
  const override = state.barber.hours ? state.barber.hours[wd] : undefined;
  const hours = override !== undefined ? override : state.business.openingHours?.[wd];
  return !hours;
}

function renderDays() {
  const days = [];
  const base = new Date();
  for (let i = 0; i < Math.min(state.business.bookingWindowDays, 30); i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    days.push(ymd(d));
  }
  $('#days').innerHTML = days.map((s) => {
    const d = new Date(`${s}T12:00:00-05:00`);
    const closed = isClosed(s);
    return `<button class="day" data-date="${s}" ${closed ? 'disabled title="Cerrado"' : ''}>
      <small>${new Intl.DateTimeFormat('es-CO', { weekday: 'short', timeZone: TZ }).format(d)}</small>
      <b>${d.getUTCDate()}</b>
      <small>${new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: TZ }).format(d)}</small></button>`;
  }).join('');
  $('#slots').innerHTML = '';
  $('#slotsMsg').textContent = 'Seleccione un día para ver los horarios.';
  $('#days').onclick = (e) => {
    const btn = e.target.closest('.day'); if (!btn || btn.disabled) return;
    $$('.day').forEach((d) => d.classList.toggle('selected', d === btn));
    state.date = btn.dataset.date; state.time = null;
    paintSummary();
    loadSlots();
  };
  const first = $('.day:not([disabled])');
  if (first) first.click();
}

async function loadSlots() {
  $('#slots').innerHTML = '';
  $('#slotsMsg').innerHTML = '<div class="loader"></div>';
  try {
    const res = await call('getAvailability', { barberId: state.barber.id, serviceId: state.service.id, date: state.date });
    if (res.closed) { $('#slotsMsg').textContent = 'Ese día no atendemos. ¿Le sirve otro?'; return; }
    if (!res.slots.length) { $('#slotsMsg').textContent = 'Este día se llenó. Pruebe el siguiente: suele haber espacio temprano.'; return; }
    $('#slotsMsg').textContent = `${res.slots.length} horarios libres. Toque el que más le convenga.`;
    $('#slots').innerHTML = res.slots.map((t) => `<button class="slot" data-time="${t}">${fmtTime(t)}</button>`).join('');
    $('#slots').onclick = (e) => {
      const btn = e.target.closest('.slot'); if (!btn) return;
      state.time = btn.dataset.time;
      $$('.slot').forEach((s) => s.classList.toggle('selected', s === btn));
      if (rescheduleId) return doReschedule();
      prepareConfirm();
      go(4);
    };
  } catch (err) {
    $('#slotsMsg').textContent = err.message;
  }
}

// ── Paso 4: confirmar ────────────────────────────────────────────
function prepareConfirm() {
  const opts = state.business.reminderOptions || [1, 2, 3, 24];
  $('#cReminder').innerHTML = opts.map((h) => `<option value="${h}" ${h === state.business.defaultReminderHours ? 'selected' : ''}>${reminderLabel(h)}</option>`).join('');
  onSession(({ user }) => { if (user && !$('#cName').value) $('#cName').value = user.displayName || ''; });
}

$('#confirmForm').onsubmit = async (e) => {
  e.preventDefault();
  const user = await requireLogin('Ingrese para confirmar su turno y enviarle el recordatorio a su correo.');
  const btn = $('#confirmBtn');
  btn.disabled = true; btn.textContent = 'Reservando su espacio…';
  try {
    await call('createBooking', {
      barberId: state.barber.id, serviceId: state.service.id, date: state.date, time: state.time,
      reminderHours: Number($('#cReminder').value), clientName: $('#cName').value.trim(),
      phone: $('#cPhone').value.trim(), notes: $('#cNotes').value.trim()
    });
    const name = $('#cName').value.trim().split(' ')[0] || firstName(user);
    $('#doneTitle').textContent = `${name}, su silla le está esperando`;
    $('#doneText').textContent = `${state.service.name} con ${state.barber.name}, el ${fmtDay(state.date)} a las ${fmtTime(state.time)}. Le enviamos la confirmación a ${user.email} y le recordaremos ${reminderLabel(Number($('#cReminder').value))}. Gracias por elegirnos.`;
    $('#calLink').href = calendarUrl();
    go(5);
  } catch (err) {
    toast(err.message, true);
    if (err.code === 'functions/already-exists') { go(3); loadSlots(); }
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar mi turno';
  }
};

function calendarUrl() {
  const start = new Date(`${state.date}T${state.time}:00-05:00`);
  const end = new Date(start.getTime() + state.service.durationMin * 60_000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: `${state.service.name} · ${BRAND.name}`, dates: `${f(start)}/${f(end)}`, details: `Con ${state.barber.name}`, location: BRAND.address });
  return `https://calendar.google.com/calendar/render?${p}`;
}

// ── Reprogramación ───────────────────────────────────────────────
async function doReschedule() {
  if (!confirm(`¿Mover su cita al ${fmtDay(state.date)} a las ${fmtTime(state.time)}?`)) return;
  try {
    await call('rescheduleBooking', { bookingId: rescheduleId, date: state.date, time: state.time });
    $('#doneTitle').textContent = 'Cita reprogramada';
    $('#doneText').textContent = `Le esperamos el ${fmtDay(state.date)} a las ${fmtTime(state.time)}. Gracias por avisarnos con tiempo: eso nos ayuda a atender a todos mejor.`;
    $('#calLink').href = calendarUrl();
    go(5);
  } catch (err) { toast(err.message, true); loadSlots(); }
}

// ── Arranque ─────────────────────────────────────────────────────
async function init() {
  const [svcSnap, barSnap, bizSnap] = await Promise.all([
    getDocs(query(collection(db, 'services'), where('active', '==', true))),
    getDocs(query(collection(db, 'barbers'), where('active', '==', true))),
    getDoc(doc(db, 'config', 'business'))
  ]);
  state.services = svcSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  state.barbers = barSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  state.business = { ...DEFAULT_BUSINESS, ...(bizSnap.exists() ? bizSnap.data() : {}) };
  renderServices();

  const nota = params.get('nota');
  if (nota) $('#cNotes').value = nota.slice(0, 500);

  if (rescheduleId) {
    const user = await requireLogin('Ingrese para reprogramar su cita.');
    const b = await getDoc(doc(db, 'bookings', rescheduleId));
    if (!b.exists() || b.data().uid !== user.uid) { toast('No encontramos esa cita.', true); return go(1); }
    state.booking = b.data();
    state.service = state.services.find((s) => s.id === state.booking.serviceId);
    state.barber = state.barbers.find((x) => x.id === state.booking.barberId);
    $('#modeEyebrow').textContent = 'Reprogramar cita';
    $('#title').textContent = 'Elija su nuevo horario';
    renderDays();
    return go(3);
  }

  const preService = state.services.find((s) => s.id === params.get('servicio'));
  const preBarber = state.barbers.find((b) => b.id === params.get('barbero'));
  if (preService) {
    state.service = preService;
    renderBarbers();
    if (preBarber && barbersFor(preService).includes(preBarber)) { state.barber = preBarber; renderDays(); return go(3); }
    return go(2);
  }
  if (preBarber) state.barber = preBarber;
  go(1);
}

init().catch((err) => { console.error(err); toast('No pudimos cargar la agenda. Recargue la página.', true); });
