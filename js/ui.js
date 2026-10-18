// Encabezado, pie, autenticación, carrito y utilidades compartidas.
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, updateProfile, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { auth, db } from './firebase.js';
import { BRAND } from './config.js';

export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
export const firstName = (u) => (u?.displayName || '').trim().split(/\s+/)[0] || '';
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const waLink = (text) => `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(text)}`;

// ── Estado de sesión ─────────────────────────────────────────────
export const session = { user: null, isAdmin: false, ready: false };
const listeners = [];
export function onSession(fn) { listeners.push(fn); if (session.ready) fn(session); }

onAuthStateChanged(auth, async (user) => {
  session.user = user;
  session.isAdmin = false;
  if (user) {
    const token = await user.getIdTokenResult();
    session.isAdmin = token.claims.admin === true;
    setDoc(doc(db, 'users', user.uid), { name: user.displayName || '', email: user.email || '', updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }
  session.ready = true;
  if (user && pendingResolve) finishLogin(user);
  paintAuth();
  listeners.forEach((fn) => fn(session));
});

// ── Carrito (localStorage) ───────────────────────────────────────
const CART_KEY = 'fn_cart_v1';
export const cart = {
  get() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } },
  set(items) { try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch {} paintCart(); },
  add(p, qty = 1) {
    const items = cart.get();
    const line = items.find((i) => i.productId === p.id);
    if (line) line.qty = Math.min(10, line.qty + qty);
    else items.push({ productId: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl || '', qty });
    cart.set(items);
  },
  count() { return cart.get().reduce((s, i) => s + i.qty, 0); },
  clear() { cart.set([]); }
};

// ── Toast ────────────────────────────────────────────────────────
let toastTimer;
export function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 4200);
}

// ── Estructura común ─────────────────────────────────────────────
const NAV = [
  ['index.html', 'Inicio'], ['reservar.html', 'Reservar'], ['asesor.html', 'Asesor de estilo'],
  ['galeria.html', 'Galería'], ['tienda.html', 'Tienda']
];

export function renderChrome(active) {
  document.documentElement.classList.add('js');
  document.body.dataset.page = active || '';
  const nav = NAV.map(([href, label]) => `<a href="${href}" class="${href === active ? 'active' : ''}">${label}</a>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `
<div class="pole" aria-hidden="true"></div>
<header class="site-header"><div class="wrap">
  <a class="brand" href="index.html">${esc(BRAND.name.split(' ')[0])} <b>${esc(BRAND.name.split(' ').slice(1).join(' '))}</b></a>
  <nav class="nav" id="nav">${nav}<a href="cuenta.html" class="${active === 'cuenta.html' ? 'active' : ''}">Mi cuenta</a><a href="admin.html" id="adminLink" class="hidden">Panel</a><button type="button" class="nav-auth" id="authBtnM">Ingresar</button></nav>
  <div class="nav-actions">
    <a href="tienda.html#carrito" class="cart-link btn btn-ghost btn-small" aria-label="Carrito">Carrito<span class="cart-badge hidden" id="cartBadge">0</span></a>
    <button class="btn btn-ghost btn-small" id="authBtn">Ingresar</button>
    <a href="reservar.html" class="btn btn-primary btn-small">Reservar</a>
    <button class="menu-btn" id="menuBtn" aria-label="Menú">☰</button>
  </div>
</div></header>`);

  document.body.insertAdjacentHTML('beforeend', `
<footer class="site-footer"><div class="wrap">
  <div class="grid">
    <div><h4>${esc(BRAND.name)}</h4><p>${esc(BRAND.tagline)}. Cada cliente que se sienta en nuestra silla merece nuestra mejor versión.</p>
      <p><a href="${esc(BRAND.mapsUrl)}" target="_blank" rel="noopener">${esc(BRAND.address)}</a></p></div>
    <div><h4>Explore</h4><a href="reservar.html">Reservar turno</a><a href="asesor.html">Asesor de estilo con IA</a><a href="galeria.html">Galería</a><a href="tienda.html">Tienda</a></div>
    <div><h4>Hablemos</h4><a href="${waLink('Hola, quiero información')}" target="_blank" rel="noopener">WhatsApp</a><a href="${esc(BRAND.instagram)}" target="_blank" rel="noopener">Instagram</a><a href="mailto:${esc(BRAND.email)}">${esc(BRAND.email)}</a><a href="privacidad.html">Política de privacidad</a></div>
  </div>
  <p style="margin-top:30px">© ${new Date().getFullYear()} ${esc(BRAND.name)}. Todos los derechos reservados.</p>
</div></footer>
<a href="reservar.html" class="btn btn-primary fab">Reservar ahora</a>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="modal" id="authModal" role="dialog" aria-modal="true" aria-labelledby="authTitle"><div class="card">
  <button class="x" data-close aria-label="Cerrar">×</button>
  <h3 id="authTitle">Bienvenido</h3>
  <p class="muted" id="authReason">Ingrese para guardar sus citas, pedidos y recomendaciones en un solo lugar.</p>
  <button class="btn btn-primary" style="width:100%" id="googleBtn">Continuar con Google</button>
  <div class="divider">o con su correo</div>
  <form id="authForm">
    <div class="field hidden" id="nameField"><label for="authName">Nombre</label><input id="authName" autocomplete="name" maxlength="80"></div>
    <div class="field"><label for="authEmail">Correo</label><input id="authEmail" type="email" autocomplete="email" required></div>
    <div class="field"><label for="authPass">Contraseña</label><input id="authPass" type="password" autocomplete="current-password" minlength="6" required></div>
    <button class="btn btn-ghost" style="width:100%" type="submit" id="authSubmit">Ingresar</button>
  </form>
  <p class="muted" style="margin:14px 0 0;font-size:.88rem"><a href="#" id="toggleMode">¿Primera vez? Cree su cuenta</a> · <a href="#" id="resetPass">Olvidé mi contraseña</a></p>
</div></div>`);

  $('#menuBtn').onclick = () => {
    const open = $('#nav').classList.toggle('open');
    $('#menuBtn').setAttribute('aria-expanded', String(open));
    $('#menuBtn').textContent = open ? '✕' : '☰';
  };
  document.addEventListener('click', (e) => {
    if ($('#nav').classList.contains('open') && !e.target.closest('#nav, #menuBtn')) $('#menuBtn').click();
  });
  const authAction = () => (session.user ? confirmSignOut() : openAuth());
  $('#authBtn').onclick = authAction;
  $('#authBtnM').onclick = () => { $('#menuBtn').click(); authAction(); };
  wireAuthModal();
  paintCart();
  revealOnScroll();
  labelTables();
}

function confirmSignOut() {
  if (confirm('¿Desea cerrar sesión?')) signOut(auth).then(() => toast('Sesión cerrada. ¡Vuelva pronto!'));
}

function paintAuth() {
  const btn = $('#authBtn');
  if (!btn) return;
  btn.textContent = session.user ? `Hola, ${firstName(session.user) || 'cliente'}` : 'Ingresar';
  const m = $('#authBtnM');
  if (m) m.textContent = session.user ? `Cerrar sesión (${firstName(session.user) || session.user.email})` : 'Ingresar / Crear cuenta';
  $('#adminLink')?.classList.toggle('hidden', !session.isAdmin);
}

function paintCart() {
  const badge = $('#cartBadge');
  if (!badge) return;
  const n = cart.count();
  badge.textContent = n;
  badge.classList.toggle('hidden', n === 0);
}

// ── Modal de autenticación ───────────────────────────────────────
let pendingResolve = null;
let registerMode = false;

export function openAuth(reason) {
  if (reason) $('#authReason').textContent = reason;
  $('#authModal').classList.add('open');
  $('#authEmail').focus();
}
function closeAuth() { $('#authModal').classList.remove('open'); }

// Devuelve el usuario; si no hay sesión, abre el modal y espera.
export function requireLogin(reason) {
  return new Promise((resolve) => {
    const decide = () => {
      if (session.user) return resolve(session.user);
      pendingResolve = resolve;
      openAuth(reason);
    };
    // Espera a que Firebase restaure la sesión guardada antes de decidir.
    if (session.ready) decide();
    else { let done = false; onSession(() => { if (!done) { done = true; decide(); } }); }
  });
}

function finishLogin(user) {
  const wasOpen = $('#authModal')?.classList.contains('open');
  closeAuth();
  if (wasOpen) toast(`¡Qué gusto tenerle aquí${firstName(user) ? ', ' + firstName(user) : ''}!`);
  if (pendingResolve) { pendingResolve(user); pendingResolve = null; }
}

function wireAuthModal() {
  const modal = $('#authModal');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.matches('[data-close]')) closeAuth(); });

  $('#googleBtn').onclick = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const { user } = await signInWithPopup(auth, provider);
      finishLogin(user);
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider);
      if (err.code !== 'auth/popup-closed-by-user') toast('No fue posible ingresar con Google.', true);
    }
  };

  $('#toggleMode').onclick = (e) => {
    e.preventDefault();
    registerMode = !registerMode;
    $('#nameField').classList.toggle('hidden', !registerMode);
    $('#authSubmit').textContent = registerMode ? 'Crear mi cuenta' : 'Ingresar';
    $('#toggleMode').textContent = registerMode ? '¿Ya tiene cuenta? Ingrese' : '¿Primera vez? Cree su cuenta';
    $('#authPass').autocomplete = registerMode ? 'new-password' : 'current-password';
  };

  $('#resetPass').onclick = async (e) => {
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    if (!email) return toast('Escriba su correo y le enviamos el enlace.', true);
    await sendPasswordResetEmail(auth, email).catch(() => {});
    toast('Si el correo está registrado, recibirá un enlace en minutos.');
  };

  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    const pass = $('#authPass').value;
    try {
      if (registerMode) {
        const name = $('#authName').value.trim();
        if (!name) return toast('¿Cómo le gusta que lo llamemos?', true);
        const { user } = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(user, { displayName: name });
        sendEmailVerification(user).catch(() => {});
        finishLogin(user);
      } else {
        const { user } = await signInWithEmailAndPassword(auth, email, pass);
        finishLogin(user);
      }
    } catch (err) {
      const map = {
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/email-already-in-use': 'Ese correo ya tiene cuenta. Ingrese con él.',
        'auth/weak-password': 'Use una contraseña de al menos 6 caracteres.',
        'auth/too-many-requests': 'Demasiados intentos. Espere un momento.'
      };
      toast(map[err.code] || 'No fue posible ingresar.', true);
    }
  };
}

// ── Tablas legibles en móvil: copia cada encabezado como etiqueta de su celda
function labelTables() {
  const apply = () => $$('table.data').forEach((t) => {
    const heads = $$('thead th', t).map((th) => th.textContent.trim());
    if (!heads.length) return;
    t.classList.add('stackable');
    $$('tbody tr', t).forEach((tr) => [...tr.children].forEach((td, i) => { if (!td.hasAttribute('data-label')) td.dataset.label = heads[i] || ''; }));
  });
  apply();
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
}

// ── Animación sutil al hacer scroll ──────────────────────────────
function revealOnScroll() {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  const watch = () => $$('.reveal:not(.in)').forEach((el) => io.observe(el));
  watch();
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
}

export function formatDateLong(date) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(date);
}
