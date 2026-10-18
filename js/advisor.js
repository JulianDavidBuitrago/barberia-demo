import { call } from './firebase.js';
import { renderChrome, esc, $, toast, requireLogin, firstName, session } from './ui.js';

renderChrome('asesor.html');

const MAX_SIDE = 1024;
let image = null; // { base64, mediaType }
let stream = null;

// ── Captura y compresión ─────────────────────────────────────────
function compress(source, w, h) {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
}

function setImage(result) {
  image = result;
  $('#preview').src = result.dataUrl;
  $('#preview').classList.remove('hidden');
  $('#dropText').classList.add('hidden');
  $('#guide').classList.add('hidden');
  updateGo();
}

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return toast('Seleccione una imagen JPG, PNG o WebP.', true);
  if (file.size > 15 * 1024 * 1024) return toast('La foto es muy pesada (máx. 15 MB).', true);
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) return toast('No pudimos leer esa imagen. Intente con otra.', true);
  setImage(compress(bmp, bmp.width, bmp.height));
  stopCam();
}

$('#pickBtn').onclick = () => $('#file').click();
$('#drop').onclick = () => { if (!stream) $('#file').click(); };
$('#drop').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } };
$('#file').onchange = (e) => loadFile(e.target.files[0]);
['dragover', 'dragenter'].forEach((ev) => $('#drop').addEventListener(ev, (e) => { e.preventDefault(); $('#drop').classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => $('#drop').addEventListener(ev, () => $('#drop').classList.remove('drag')));
$('#drop').addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

$('#camBtn').onclick = async () => {
  if (!navigator.mediaDevices?.getUserMedia) return $('#file').click();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
    const v = $('#cam');
    v.srcObject = stream; await v.play();
    v.classList.remove('hidden'); $('#guide').classList.remove('hidden');
    $('#preview').classList.add('hidden'); $('#dropText').classList.add('hidden');
    $('#shotBtn').classList.remove('hidden'); $('#camBtn').classList.add('hidden');
    toast('Ubique su rostro dentro del óvalo y mire de frente.');
  } catch { toast('No pudimos abrir la cámara. Puede cargar una foto desde su galería.', true); }
};

$('#shotBtn').onclick = () => {
  const v = $('#cam');
  setImage(compress(v, v.videoWidth, v.videoHeight));
  stopCam();
};

function stopCam() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $('#cam').classList.add('hidden');
  $('#shotBtn').classList.add('hidden'); $('#camBtn').classList.remove('hidden');
}

function updateGo() { $('#goBtn').disabled = !(image && $('#consent').checked); }
$('#consent').onchange = updateGo;

// ── Análisis ─────────────────────────────────────────────────────
$('#prefs').onsubmit = async (e) => {
  e.preventDefault();
  if (!image) return toast('Primero cargue su foto.', true);
  await requireLogin('Ingrese para recibir su análisis y guardarlo para mostrárselo a su barbero.');
  const btn = $('#goBtn');
  btn.disabled = true;
  $('#result').innerHTML = '<div class="card center"><div class="loader"></div><p class="muted" style="margin:0">Nuestro asesor está estudiando las proporciones de su rostro…</p></div>';
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const r = await call('analyzeFace', {
      imageBase64: image.base64, mediaType: image.mediaType, consent: true,
      preferences: { length: $('#pLength').value, style: $('#pStyle').value, maintenance: $('#pMaint').value, beard: $('#pBeard').value }
    });
    if (!r.ok) {
      $('#result').innerHTML = `<div class="card"><h3>Necesitamos una foto un poco mejor</h3><p class="muted">${esc(r.retryTip || 'Tome la foto de frente, con buena luz y el rostro despejado.')}</p><button class="btn btn-primary btn-small" onclick="document.getElementById('camBtn').click()">Tomar otra foto</button></div>`;
      return;
    }
    renderResult(r);
  } catch (err) {
    $('#result').innerHTML = `<div class="card"><p>${esc(err.message)}</p><a href="reservar.html" class="btn btn-primary btn-small">Prefiero que me asesoren en persona</a></div>`;
  } finally { updateGo(); }
};

function renderResult(r) {
  const name = firstName(session.user);
  const recos = r.recommendations.map((c, i) => {
    const nota = `Recomendación del asesor: ${c.name}. ${c.barberNotes}`;
    return `<article class="card reco">
      <span class="rank">${['Su mejor opción', 'Segunda opción', 'Tercera opción'][i]}</span>
      <h3 style="margin-top:4px">${esc(c.name)}</h3>
      <p>${esc(c.why)}</p>
      <p class="muted" style="font-size:.9rem;margin:0">Mantenimiento ${esc(c.maintenance)} · visita cada ${esc(String(c.visitEveryWeeks))} semanas<br>En casa: ${esc(c.styling)}</p>
      <div class="barber-notes"><b>Para su barbero:</b> ${esc(c.barberNotes)}</div>
      <a class="btn btn-primary btn-small" style="margin-top:14px" href="reservar.html?nota=${encodeURIComponent(nota.slice(0, 480))}">Reservar este corte</a>
    </article>`;
  }).join('');

  $('#result').innerHTML = `
    <div class="card" style="border-color:var(--brass);margin-bottom:14px">
      <span class="eyebrow">Su análisis</span>
      <h2 style="margin-bottom:8px">${name ? esc(name) + ', su' : 'Su'} rostro es ${esc(r.faceShape)}</h2>
      ${r.highlights?.length ? `<p>Rasgos a su favor: ${r.highlights.map(esc).join(' · ')}.</p>` : ''}
      <p class="muted" style="margin:0">Cabello ${esc(r.hair?.texture || '')}, densidad ${esc(r.hair?.density || '')} · Confianza del análisis: ${esc(r.confidence)}</p>
    </div>
    ${recos}
    <div class="card" style="margin-top:14px">
      <h3>Barba: ${esc(r.beard?.recommended || '')}</h3><p class="muted">${esc(r.beard?.why || '')}</p>
      ${r.avoid?.length ? `<h3 style="margin-top:16px">Mejor evitar</h3><ul class="muted">${r.avoid.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      <p class="muted" style="font-size:.85rem">Este análisis se guardó en su cuenta para que lo muestre el día de su cita. Es una guía: su barbero lo afinará en persona.</p>
      <div class="btn-row"><a href="reservar.html?nota=${encodeURIComponent(`Recomendación del asesor: ${r.recommendations[0]?.name || ''}`)}" class="btn btn-primary">Quiero mi nuevo look: reservar ahora</a>
      <a href="tienda.html" class="btn btn-ghost">Ver productos para mi tipo de cabello</a></div>
    </div>`;
}
