import { collection, getDocs, getDoc, doc, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db, call } from './firebase.js';
import { renderChrome, esc, money, $, $$, cart, toast, requireLogin, onSession } from './ui.js';

renderChrome('tienda.html');

let products = [];
let business = { shippingFee: 8000, freeShippingFrom: 120000, codEnabled: true, mercadoPagoEnabled: true };
let filter = 'todos';
let checkoutMode = false;

// ── Catálogo ─────────────────────────────────────────────────────
function renderGrid() {
  const list = products.filter((p) => filter === 'todos' || p.category === filter);
  $('#grid').innerHTML = list.map((p) => `
    <article class="card reveal">
      <div class="card-media">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy">` : '🧴'}</div>
      <h3>${esc(p.name)}</h3>
      <p class="muted" style="font-size:.92rem">${esc(p.description || '')}</p>
      <div class="service-meta"><span class="price">${money(p.price)}</span>
        ${p.stock > 0 && p.stock <= 5 ? `<span class="tag warn">Quedan ${p.stock}</span>` : ''}${p.stock <= 0 ? '<span class="tag bad">Agotado</span>' : ''}</div>
      <button class="btn btn-primary btn-small" style="margin-top:16px;width:100%" data-add="${p.id}" ${p.stock > 0 ? '' : 'disabled'}>Agregar al carrito</button>
    </article>`).join('') || '<div class="empty">No hay productos en esta categoría todavía.</div>';
}

function renderFilters() {
  const cats = ['todos', ...new Set(products.map((p) => p.category).filter(Boolean))];
  $('#filters').innerHTML = cats.map((c) => `<button class="${c === filter ? 'on' : ''}" data-cat="${esc(c)}">${esc(c[0].toUpperCase() + c.slice(1))}</button>`).join('');
  $('#filters').onclick = (e) => { if (!e.target.dataset.cat) return; filter = e.target.dataset.cat; renderFilters(); renderGrid(); };
}

$('#grid').onclick = (e) => {
  const id = e.target.dataset.add; if (!id) return;
  const p = products.find((x) => x.id === id);
  const inCart = cart.get().find((i) => i.productId === id)?.qty || 0;
  if (inCart >= Math.min(10, p.stock)) return toast('Ya tiene en su carrito todas las unidades disponibles.', true);
  cart.add(p);
  toast(`Excelente elección: ${p.name} va en su carrito.`);
  openDrawer();
};

// ── Carrito ──────────────────────────────────────────────────────
const totals = () => {
  const subtotal = cart.get().reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal === 0 ? 0 : subtotal >= business.freeShippingFrom ? 0 : business.shippingFee;
  return { subtotal, shipping, total: subtotal + shipping };
};

function renderCart() {
  const items = cart.get();
  const { subtotal, shipping } = totals();
  $('#cartView').innerHTML = items.length ? items.map((i) => `
    <div class="cart-line">
      <div><b>${esc(i.name)}</b><br><span class="muted">${money(i.price)}</span></div>
      <div style="text-align:right">
        <div class="qty"><button data-dec="${i.productId}" aria-label="Menos">−</button><span>${i.qty}</span><button data-inc="${i.productId}" aria-label="Más">+</button></div>
      </div>
    </div>`).join('') : '<div class="empty">Su carrito está vacío.<br><br>Empiece por la pomada mate: es la favorita de nuestros clientes para un acabado natural.</div>';
  $('#subtotal').textContent = money(subtotal);
  $('#shipping').textContent = subtotal ? (shipping ? money(shipping) : 'Gratis') : '—';
  const missing = business.freeShippingFrom - subtotal;
  $('#shipHint').textContent = subtotal && missing > 0 ? `Le faltan ${money(missing)} para el envío gratis.` : subtotal ? '¡Su envío va por nuestra cuenta!' : '';
  $('#nextBtn').disabled = !items.length;
  $('#nextBtn').textContent = checkoutMode
    ? ($('input[name=pay]:checked')?.value === 'contraentrega' ? `Confirmar pedido · ${money(totals().total)}` : `Pagar ${money(totals().total)} con Mercado Pago`)
    : 'Continuar con mi compra';
}

$('#cartView').onclick = (e) => {
  const inc = e.target.dataset.inc, dec = e.target.dataset.dec;
  if (!inc && !dec) return;
  const items = cart.get();
  const line = items.find((i) => i.productId === (inc || dec));
  const p = products.find((x) => x.id === line.productId);
  if (inc) line.qty = Math.min(line.qty + 1, 10, p?.stock ?? 10);
  if (dec) line.qty -= 1;
  cart.set(items.filter((i) => i.qty > 0));
  renderCart();
};

function openDrawer() { $('#drawer').classList.add('open'); $('#scrim').classList.add('open'); document.body.classList.add('no-fab'); renderCart(); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#scrim').classList.remove('open'); document.body.classList.remove('no-fab'); setCheckout(false); }
$('#closeDrawer').onclick = closeDrawer;
$('#scrim').onclick = closeDrawer;
document.addEventListener('click', (e) => { if (e.target.closest('.cart-link')) { e.preventDefault(); openDrawer(); } });

function setCheckout(on) {
  checkoutMode = on;
  $('#checkout').classList.toggle('hidden', !on);
  $('#cartView').classList.toggle('hidden', on);
  $('#drawerTitle').textContent = on ? 'Datos de entrega' : 'Su carrito';
  renderCart();
}
$('#checkout').addEventListener('change', renderCart);

// ── Pago ─────────────────────────────────────────────────────────
$('#nextBtn').onclick = async () => {
  if (!checkoutMode) {
    await requireLogin('Ingrese para finalizar su compra y recibir la confirmación por correo.');
    onSession(({ user }) => { if (user && !$('#shName').value) $('#shName').value = user.displayName || ''; });
    return setCheckout(true);
  }
  const form = $('#checkout');
  if (!form.reportValidity()) return;
  const btn = $('#nextBtn');
  btn.disabled = true; btn.textContent = 'Procesando su pedido…';
  try {
    const res = await call('createOrder', {
      items: cart.get().map((i) => ({ productId: i.productId, qty: i.qty })),
      paymentMethod: $('input[name=pay]:checked').value,
      shipping: { name: $('#shName').value, phone: $('#shPhone').value, address: $('#shAddress').value, city: $('#shCity').value, notes: $('#shNotes').value }
    });
    cart.clear();
    location.href = res.redirectUrl;
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false; renderCart();
  }
};

// ── Arranque ─────────────────────────────────────────────────────
async function init() {
  const [snap, biz] = await Promise.all([
    getDocs(query(collection(db, 'products'), where('active', '==', true))),
    getDoc(doc(db, 'config', 'business'))
  ]);
  products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (biz.exists()) business = { ...business, ...biz.data() };
  $('#payCod').classList.toggle('hidden', !business.codEnabled);
  $('#payMp').classList.toggle('hidden', !business.mercadoPagoEnabled);
  if (!business.mercadoPagoEnabled) $('#payCod input').checked = true;
  // Sincroniza precios del carrito con el catálogo vigente
  cart.set(cart.get().filter((i) => products.some((p) => p.id === i.productId)).map((i) => ({ ...i, price: products.find((p) => p.id === i.productId).price })));
  renderFilters(); renderGrid();
  if (location.hash === '#carrito') openDrawer();
}
init().catch((e) => { console.error(e); toast('No pudimos cargar la tienda.', true); });
