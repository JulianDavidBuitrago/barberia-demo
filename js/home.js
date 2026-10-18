import { collection, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { db } from './firebase.js';
import { renderChrome, esc, money, $, cart, toast } from './ui.js';
import { BRAND } from './config.js';

renderChrome('index.html');
if (BRAND.heroImage) $('#hero').style.setProperty('--hero-img', `url("${BRAND.heroImage}")`);

async function loadServices() {
  const snap = await getDocs(query(collection(db, 'services'), where('active', '==', true)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  $('#services').innerHTML = items.length ? items.map((s) => `
    <article class="card reveal">
      <h3>${esc(s.name)}</h3>
      <p class="muted">${esc(s.description || '')}</p>
      <div class="service-meta"><span class="price">${money(s.price)}</span><span class="tag">${s.durationMin} min</span></div>
      <a href="reservar.html?servicio=${s.id}" class="btn btn-primary btn-small" style="margin-top:18px;width:100%">Reservar este servicio</a>
    </article>`).join('') : '<div class="empty">Muy pronto publicaremos nuestros servicios.</div>';
}

async function loadBarbers() {
  const snap = await getDocs(query(collection(db, 'barbers'), where('active', '==', true)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
  $('#barbers').innerHTML = items.map((b) => `
    <article class="card reveal">
      <div class="card-media">${b.photoUrl ? `<img src="${esc(b.photoUrl)}" alt="${esc(b.name)}" loading="lazy">` : '✂'}</div>
      <h3>${esc(b.name)}</h3><p class="muted">${esc(b.bio || '')}</p>
      <a href="reservar.html?barbero=${b.id}" class="btn btn-ghost btn-small">Reservar con ${esc(b.name.split(' ')[0])}</a>
    </article>`).join('');
}

async function loadGallery() {
  const snap = await getDocs(query(collection(db, 'gallery'), where('published', '==', true), orderBy('createdAt', 'desc'), limit(6)));
  $('#galleryPreview').innerHTML = snap.empty ? '<div class="empty">Pronto verá aquí nuestros últimos trabajos.</div>' : snap.docs.map((d) => {
    const g = d.data();
    return `<figure class="reveal">${g.type === 'video'
      ? `<video src="${esc(g.url)}" muted playsinline loop autoplay preload="metadata"></video><span class="play-badge">Video</span>`
      : `<img src="${esc(g.url)}" alt="${esc(g.title || 'Corte')}" loading="lazy">`}
      ${g.title ? `<figcaption>${esc(g.title)}</figcaption>` : ''}</figure>`;
  }).join('');
}

async function loadProducts() {
  const snap = await getDocs(query(collection(db, 'products'), where('active', '==', true), limit(4)));
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  $('#products').innerHTML = items.map((p) => `
    <article class="card reveal">
      <div class="card-media">${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy">` : '🧴'}</div>
      <h3>${esc(p.name)}</h3><span class="price">${money(p.price)}</span>
      <button class="btn btn-primary btn-small" style="margin-top:14px;width:100%" data-add="${p.id}" ${p.stock > 0 ? '' : 'disabled'}>${p.stock > 0 ? 'Agregar al carrito' : 'Agotado'}</button>
    </article>`).join('');
  $('#products').onclick = (e) => {
    const id = e.target.dataset.add; if (!id) return;
    cart.add(items.find((p) => p.id === id));
    toast('Excelente elección. Lo agregamos a su carrito.');
  };
}

Promise.allSettled([loadServices(), loadBarbers(), loadGallery(), loadProducts()])
  .then((r) => r.filter((x) => x.status === 'rejected').forEach((x) => console.error(x.reason)));
