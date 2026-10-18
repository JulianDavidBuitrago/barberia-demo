// Datos iniciales del demo: catálogo, dos usuarios de prueba,
// citas y pedidos de ejemplo con fechas relativas a "hoy".
const TZ_OFFSET = '-05:00';
const DAY = 86_400_000;

export const DEMO_USERS = [
  { uid: 'demo-barbero', email: 'barbero@demo.com', password: 'demo1234', displayName: 'Andrés Gómez', claims: { admin: true }, barberId: 'b-andres' },
  { uid: 'demo-cliente', email: 'cliente@demo.com', password: 'demo1234', displayName: 'Camilo Ríos', claims: {} }
];

const ymd = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(ms));
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00${TZ_OFFSET}`);
const svg = (s) => `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;

// ── Ilustraciones vectoriales (no requieren imágenes externas) ──
const HAIR = {
  fade: 'M190 205 Q300 120 410 205 L412 250 Q300 205 188 250 Z',
  pompadour: 'M182 230 Q190 110 300 95 Q430 90 420 215 L416 250 Q300 190 184 252 Z',
  buzz: 'M196 222 Q300 160 404 222 L404 240 Q300 205 196 240 Z',
  textured: 'M186 228 Q200 130 260 140 Q300 110 340 138 Q405 128 414 228 L414 252 Q300 200 186 252 Z',
  long: 'M170 260 Q170 110 300 105 Q430 110 430 260 L440 420 L400 420 L398 240 Q300 200 202 240 L200 420 L160 420 Z',
  curly: 'M180 235 Q170 150 230 140 Q250 100 300 112 Q350 96 372 140 Q432 148 420 235 L418 252 Q300 200 182 252 Z'
};

export function cutArt(title, variant, hue, beard = false) {
  return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 720">
<defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="hsl(${hue},38%,30%)"/><stop offset="1" stop-color="#14110f"/></radialGradient></defs>
<rect width="600" height="720" fill="url(#g)"/>
<path d="M210 520 Q300 560 390 520 L460 720 L140 720 Z" fill="#2a2521"/>
<ellipse cx="300" cy="300" rx="112" ry="140" fill="#d9c3a5"/>
<ellipse cx="186" cy="310" rx="16" ry="30" fill="#cdb393"/><ellipse cx="414" cy="310" rx="16" ry="30" fill="#cdb393"/>
<rect x="262" y="420" width="76" height="90" fill="#cdb393"/>
<path d="${HAIR[variant]}" fill="#1c1611"/>
${variant === 'fade' || variant === 'buzz' ? '<path d="M188 250 L192 330 Q196 300 204 280 Z M412 250 L408 330 Q404 300 396 280 Z" fill="#1c1611" opacity=".45"/>' : ''}
${beard ? '<path d="M200 330 Q206 445 300 455 Q394 445 400 330 Q380 410 300 418 Q220 410 200 330 Z" fill="#1c1611"/>' : ''}
<path d="M262 288 h26 M312 288 h26" stroke="#3a2c22" stroke-width="7" stroke-linecap="round"/>
<path d="M280 380 Q300 392 320 380" stroke="#8a5a48" stroke-width="5" fill="none" stroke-linecap="round"/>
<text x="300" y="640" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#f3ebdd">${title}</text>
<text x="300" y="680" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" letter-spacing="4" fill="#c9973f">FILO &amp; NAVAJA</text>
</svg>`);
}

function productArt(kind, label, hue) {
  const shapes = {
    jar: '<rect x="190" y="250" width="220" height="190" rx="26" fill="#2a2521"/><rect x="180" y="215" width="240" height="56" rx="14" fill="#c9973f"/>',
    bottle: '<rect x="230" y="210" width="140" height="250" rx="30" fill="#3a2a1a" opacity=".92"/><rect x="270" y="150" width="60" height="70" fill="#1c1611"/><rect x="262" y="130" width="76" height="30" rx="8" fill="#c9973f"/>',
    tube: '<path d="M215 170 L385 170 L360 450 L240 450 Z" fill="#f3ebdd"/><rect x="250" y="450" width="100" height="40" rx="6" fill="#c9973f"/>'
  };
  return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><rect width="600" height="450" fill="hsl(${hue},25%,18%)"/>
<g transform="translate(0,-40)">${shapes[kind]}</g>
<text x="300" y="${kind === 'tube' ? 300 : 345}" text-anchor="middle" font-family="Georgia,serif" font-size="24" fill="${kind === 'tube' ? '#14110f' : '#f3ebdd'}">${label}</text></svg>`);
}

function avatar(initials, hue) {
  return svg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${hue},30%,22%)"/>
<circle cx="200" cy="150" r="78" fill="#c9973f"/><text x="200" y="172" text-anchor="middle" font-family="Georgia,serif" font-size="64" fill="#14110f">${initials}</text></svg>`);
}

// ── Utilidades para bloquear la agenda de las citas sembradas ───
function blocks(barberId, date, hhmm, dur) {
  const [h, m] = hhmm.split(':').map(Number);
  const ids = [];
  for (let x = h * 60 + m; x < h * 60 + m + dur; x += 15) {
    ids.push(`${barberId}_${date}_${String(Math.floor(x / 60)).padStart(2, '0')}${String(x % 60).padStart(2, '0')}`);
  }
  return ids;
}

export function seedData() {
  const now = Date.now();
  const today = ymd(now);
  const tomorrow = ymd(now + DAY);
  const ago12 = ymd(now - 12 * DAY);

  const services = {
    's-clasico': { name: 'Corte clásico', description: 'Corte a tijera y máquina, lavado y peinado con producto.', durationMin: 45, price: 30000, order: 1, active: true },
    's-combo': { name: 'Corte + barba', description: 'Corte completo y perfilado de barba con toalla caliente.', durationMin: 60, price: 45000, order: 2, active: true },
    's-fade': { name: 'Degradado (fade)', description: 'Skin, low, mid o high fade con acabado a detalle.', durationMin: 45, price: 35000, order: 3, active: true },
    's-afeitado': { name: 'Afeitado tradicional', description: 'Navaja, toalla caliente, aceites y bálsamo calmante.', durationMin: 30, price: 25000, order: 4, active: true },
    's-barba': { name: 'Arreglo de barba', description: 'Diseño, perfilado y nutrición de barba.', durationMin: 30, price: 20000, order: 5, active: true }
  };

  const barbers = {
    'b-andres': { name: 'Andrés Gómez', bio: 'Especialista en degradados y diseños. 12 años de oficio.', photoUrl: avatar('AG', 30), order: 1, active: true, serviceIds: [], daysOff: [] },
    'b-santiago': { name: 'Santiago Ruiz', bio: 'Maestro de la navaja y la barba clásica.', photoUrl: avatar('SR', 200), order: 2, active: true, serviceIds: ['s-clasico', 's-combo', 's-afeitado', 's-barba'], daysOff: [] }
  };

  const products = {
    'p-pomada': { name: 'Pomada mate', description: 'Fijación media, acabado natural. 100 g.', price: 38000, stock: 20, category: 'cabello', imageUrl: productArt('jar', 'Pomada mate', 35), active: true },
    'p-cera': { name: 'Cera de alto brillo', description: 'Para peinados clásicos y pompadour. 100 g.', price: 36000, stock: 4, category: 'cabello', imageUrl: productArt('jar', 'Cera brillo', 10), active: true },
    'p-aceite': { name: 'Aceite para barba', description: 'Suaviza y da brillo saludable. 30 ml.', price: 32000, stock: 15, category: 'barba', imageUrl: productArt('bottle', '', 25), active: true },
    'p-balsamo': { name: 'Bálsamo after shave', description: 'Calma la piel después del afeitado. 100 ml.', price: 29000, stock: 12, category: 'afeitado', imageUrl: productArt('tube', 'After shave', 190), active: true },
    'p-shampoo': { name: 'Shampoo para barba', description: 'Limpieza suave sin resecar. 200 ml.', price: 27000, stock: 0, category: 'barba', imageUrl: productArt('bottle', '', 140), active: true }
  };

  const galleryItems = [
    ['Mid fade con textura', 'fade', 30, false, 'degradado', 'b-andres'],
    ['Pompadour clásico', 'pompadour', 15, false, 'clásico', 'b-santiago'],
    ['Corte + barba completa', 'textured', 200, true, 'barba', 'b-andres'],
    ['Buzz cut con diseño', 'buzz', 260, false, 'diseño', 'b-andres'],
    ['Melena con capas', 'long', 330, false, 'largo', 'b-santiago'],
    ['Rizos definidos', 'curly', 100, false, 'clásico', 'b-andres'],
    ['Skin fade + barba', 'fade', 0, true, 'barba', 'b-santiago'],
    ['Texturizado moderno', 'textured', 45, false, 'degradado', 'b-andres']
  ];
  const gallery = {};
  galleryItems.forEach(([title, v, hue, beard, category, barberId], i) => {
    gallery[`g-${i}`] = {
      url: cutArt(title, v, hue, beard), path: `gallery/demo-${i}.svg`, type: 'image', title, description: '',
      category, barberId, barberName: barbers[barberId].name, published: true, createdAt: new Date(now - i * 3_600_000)
    };
  });

  const bookings = {};
  const slotLocks = {};
  const add = (id, o) => {
    const svc = services[o.serviceId];
    const start = at(o.date, o.time);
    const lockIds = o.status === 'confirmada' ? blocks(o.barberId, o.date, o.time, svc.durationMin) : [];
    lockIds.forEach((l) => { slotLocks[l] = { barberId: o.barberId, date: o.date, bookingId: id }; });
    bookings[id] = {
      uid: o.uid || 'walkin-' + id, clientName: o.clientName, clientEmail: o.clientEmail || 'cliente.mostrador@correo.com', clientPhone: o.phone || '3001234567',
      notes: o.notes || '', barberId: o.barberId, barberName: barbers[o.barberId].name, serviceId: o.serviceId, serviceName: svc.name,
      durationMin: svc.durationMin, price: svc.price, date: o.date, time: o.time, startAt: start,
      endAt: new Date(start.getTime() + svc.durationMin * 60_000), reminderHours: o.reminderHours || 2,
      reminderAt: new Date(start.getTime() - (o.reminderHours || 2) * 3_600_000),
      reminderSent: start.getTime() - (o.reminderHours || 2) * 3_600_000 <= now, lockIds, status: o.status,
      confirmationSent: true, source: 'web', createdAt: new Date(now - 2 * DAY)
    };
  };
  const statusFor = (date, time) => (at(date, time).getTime() < now ? 'completada' : 'confirmada');

  // Agenda de hoy y mañana para el barbero
  [['10:00', 's-fade', 'Julián Pérez', 'b-andres'], ['11:00', 's-combo', 'Mateo Torres', 'b-andres'], ['13:00', 's-clasico', 'Daniel Ortiz', 'b-santiago'],
   ['14:30', 's-barba', 'Felipe Castro', 'b-andres'], ['15:15', 's-afeitado', 'Sergio López', 'b-santiago']]
    .forEach(([t, s, n, b], i) => add(`bk-t${i}`, { date: today, time: t, serviceId: s, clientName: n, barberId: b, status: statusFor(today, t), notes: i === 0 ? 'Quiere el degradado más bajo que la última vez' : '' }));
  [['09:30', 's-clasico', 'Nicolás Vargas', 'b-santiago'], ['11:00', 's-fade', 'Esteban Mora', 'b-andres']]
    .forEach(([t, s, n, b], i) => add(`bk-m${i}`, { date: tomorrow, time: t, serviceId: s, clientName: n, barberId: b, status: 'confirmada' }));

  // Historial del cliente demo
  add('bk-c-next', { date: tomorrow, time: '16:00', serviceId: 's-combo', clientName: 'Camilo Ríos', clientEmail: 'cliente@demo.com', uid: 'demo-cliente', barberId: 'b-andres', status: 'confirmada', reminderHours: 3, phone: '3157778899', notes: 'Recomendación del asesor: mid fade con textura' });
  add('bk-c-past', { date: ago12, time: '10:00', serviceId: 's-fade', clientName: 'Camilo Ríos', clientEmail: 'cliente@demo.com', uid: 'demo-cliente', barberId: 'b-andres', status: 'completada' });

  const ship = { name: 'Camilo Ríos', phone: '3157778899', address: 'Carrera 23 # 65-10, apto 402', city: 'Su ciudad', notes: '' };
  const orders = {
    'o-cod': { id: 'o-cod', code: 'K7Q2MX', uid: 'demo-cliente', clientEmail: 'cliente@demo.com', items: [{ productId: 'p-pomada', name: 'Pomada mate', price: 38000, qty: 1 }, { productId: 'p-aceite', name: 'Aceite para barba', price: 32000, qty: 1 }], subtotal: 70000, shippingFee: 8000, total: 78000, currency: 'COP', paymentMethod: 'contraentrega', shipping: ship, status: 'pendiente_entrega', stockRestored: false, expiresAt: null, createdAt: new Date(now - 3 * 3_600_000) },
    'o-paid': { id: 'o-paid', code: 'R2T9WA', uid: 'demo-cliente', clientEmail: 'cliente@demo.com', items: [{ productId: 'p-balsamo', name: 'Bálsamo after shave', price: 29000, qty: 1 }], subtotal: 29000, shippingFee: 8000, total: 37000, currency: 'COP', paymentMethod: 'mercadopago', shipping: ship, status: 'entregado', stockRestored: false, expiresAt: null, createdAt: new Date(now - 9 * DAY) }
  };

  return {
    version: 3,
    session: null,
    users: DEMO_USERS.map((u) => ({ ...u })),
    mail: [{
      id: 'm0', to: 'cliente@demo.com', tag: 'booking_confirmation', at: now - 2 * DAY, read: false,
      subject: 'Camilo, su cita está confirmada',
      html: `<p>Hemos reservado este espacio exclusivamente para usted. Andrés ya sabe que viene y estará listo para dedicarle toda su atención.</p><p><b>Corte + barba</b> · mañana a las 4:00 p. m. · $45.000</p><p>Le enviaremos un recordatorio <b>3 horas antes</b>.</p>`
    }],
    cols: {
      config: {
        business: {
          name: 'Filo & Navaja Barbería', slotMinutes: 15, defaultReminderHours: 2, reminderOptions: [1, 2, 3, 24],
          bookingWindowDays: 30, minNoticeMinutes: 60, cancelLimitHours: 2, shippingFee: 8000, freeShippingFrom: 120000,
          codEnabled: true, mercadoPagoEnabled: true, currency: 'COP',
          openingHours: { 0: { open: '10:00', close: '16:00' }, 1: { open: '09:00', close: '20:00' }, 2: { open: '09:00', close: '20:00' }, 3: { open: '09:00', close: '20:00' }, 4: { open: '09:00', close: '20:00' }, 5: { open: '09:00', close: '21:00' }, 6: { open: '08:00', close: '18:00' } }
        }
      },
      services, barbers, products, gallery, bookings, slotLocks, orders,
      users: { 'demo-cliente': { name: 'Camilo Ríos', email: 'cliente@demo.com' }, 'demo-barbero': { name: 'Andrés Gómez', email: 'barbero@demo.com' } },
      'users/demo-cliente/aiConsults': {}
    }
  };
}
