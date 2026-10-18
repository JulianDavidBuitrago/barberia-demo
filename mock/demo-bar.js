// MODO DEMO · Barra superior: cambiar de usuario, bandeja de correos
// simulada, forzar recordatorios y reiniciar los datos.
import { db, save, subscribe, resetDemo } from './store.js';
import { setSession } from './firebase-auth.js';
import { runReminderScheduler } from './firebase-functions.js';

// Algunos visores embebidos bloquean confirm()/alert(). Solo en ese caso
// el demo acepta las confirmaciones para que cada acción pueda probarse.
if (window.self !== window.top) {
  window.confirm = () => true;
  window.alert = (m) => console.info('[demo]', m);
}

const css = `
#demoBar{background:#e2b866;color:#14110f;font:600 13px/1.3 Manrope,system-ui,sans-serif;position:relative;z-index:55}
#demoBar .in{width:min(1180px,100% - 24px);margin-inline:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0}
#demoBar .lbl{background:#14110f;color:#e2b866;border-radius:999px;padding:3px 9px;font-size:11px;letter-spacing:.12em}
#demoBar .who{margin-right:auto;min-width:0}
#demoBar button{font:700 12px Manrope,system-ui,sans-serif;border:1px solid #14110f;background:transparent;color:#14110f;border-radius:999px;padding:6px 11px;cursor:pointer;white-space:nowrap}
#demoBar button.on{background:#14110f;color:#e2b866}
#demoBar .n{background:#8a2f2a;color:#fff;border-radius:999px;padding:0 6px;margin-left:4px;font-size:11px}
@media(max-width:620px){#demoBar .who{flex-basis:100%}#demoBar .hide-sm{display:none}}
#demoInbox{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:130;display:none;place-items:center;padding:12px}
#demoInbox.open{display:grid}
#demoInbox .box{background:#1e1a17;color:#f3ebdd;border:1px solid rgba(243,235,221,.15);border-radius:14px;width:min(640px,100%);max-height:88vh;display:flex;flex-direction:column;font-family:Manrope,system-ui,sans-serif}
#demoInbox header{padding:16px 18px;border-bottom:1px solid rgba(243,235,221,.12);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#demoInbox header h3{margin:0 auto 0 0;font:500 20px Fraunces,Georgia,serif}
#demoInbox .list{overflow:auto;padding:6px 0}
#demoInbox details{border-bottom:1px solid rgba(243,235,221,.08);padding:12px 18px}
#demoInbox summary{cursor:pointer;list-style:none}
#demoInbox summary small{display:block;color:#a89f92;font-weight:500;margin-top:2px}
#demoInbox .mail{background:#fff;color:#1c1a17;border-radius:10px;padding:16px;margin-top:10px;font:15px/1.55 Georgia,serif;overflow-wrap:anywhere}
#demoInbox .b{font:700 12px Manrope,system-ui,sans-serif;border:1px solid rgba(243,235,221,.3);background:transparent;color:#f3ebdd;border-radius:999px;padding:7px 12px;cursor:pointer}
#demoInbox .b.p{background:#c9973f;color:#14110f;border-color:#c9973f}
.demo-hint{background:rgba(226,184,102,.12);border:1px dashed #c9973f;border-radius:10px;padding:10px 12px;font-size:.85rem;margin-bottom:14px;color:#f3ebdd}
.demo-hint button{background:none;border:0;color:#e2b866;font:700 .85rem Manrope,system-ui,sans-serif;cursor:pointer;padding:0;text-decoration:underline}
`;

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

const bar = document.createElement('div');
bar.id = 'demoBar';
const inbox = document.createElement('div');
inbox.id = 'demoInbox';
inbox.setAttribute('role', 'dialog');

const USERS = { cliente: 'demo-cliente', barbero: 'demo-barbero' };
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function paint() {
  const s = db();
  const user = s.users.find((u) => u.uid === s.session);
  const unread = s.mail.filter((m) => !m.read).length;
  bar.innerHTML = `<div class="in">
    <span class="lbl">DEMO</span>
    <span class="who">${user ? `Sesión: <b>${esc(user.displayName || user.email)}</b> <span class="hide-sm">(${user.claims?.admin ? 'barbero · panel' : 'cliente'})</span>` : 'Sin sesión. Pruebe como:'}</span>
    <button data-as="cliente" class="${s.session === USERS.cliente ? 'on' : ''}">Cliente</button>
    <button data-as="barbero" class="${s.session === USERS.barbero ? 'on' : ''}">Barbero</button>
    <button data-inbox>Correos<span class="n">${unread}</span></button>
    <button data-reset class="hide-sm">Reiniciar</button>
  </div>`;
}

function paintInbox() {
  const s = db();
  inbox.innerHTML = `<div class="box">
    <header><h3>Bandeja simulada</h3>
      <button class="b p" data-force>Enviar recordatorios ahora</button>
      <button class="b" data-close>Cerrar</button></header>
    <p style="margin:12px 18px 0;color:#a89f92;font-size:13px">Aquí llegan los correos que el sistema real envía por SMTP: confirmaciones, recordatorios (según las horas que eligió el cliente), cancelaciones y pedidos. «Enviar recordatorios ahora» adelanta el reloj para verlos sin esperar.</p>
    <div class="list">${s.mail.length ? s.mail.map((m) => `<details data-id="${m.id}">
      <summary>${m.read ? '' : '● '}<b>${esc(m.subject)}</b><small>Para: ${esc(m.to)} · ${new Date(m.at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</small></summary>
      <div class="mail">${m.html}</div></details>`).join('') : '<p style="padding:18px;color:#a89f92">Aún no hay correos.</p>'}</div></div>`;
}

bar.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.as) {
    setSession(USERS[b.dataset.as]);
    location.href = b.dataset.as === 'barbero' ? 'admin.html' : 'cuenta.html';
  }
  if (b.dataset.inbox !== undefined) { paintInbox(); inbox.classList.add('open'); }
  if (b.dataset.reset !== undefined && confirm('¿Restaurar el demo a su estado inicial? Se borran citas, pedidos y cambios hechos.')) {
    resetDemo(); location.href = 'index.html';
  }
});

inbox.addEventListener('click', (e) => {
  if (e.target === inbox || e.target.dataset.close !== undefined) inbox.classList.remove('open');
  if (e.target.dataset.force !== undefined) {
    const n = runReminderScheduler({ force: true });
    paintInbox();
    if (!n) alert('No hay recordatorios pendientes. Reserve una cita como cliente y vuelva a intentarlo.');
  }
});
inbox.addEventListener('toggle', (e) => {
  const d = e.target.closest('details');
  if (d?.open) { const m = db().mail.find((x) => x.id === d.dataset.id); if (m && !m.read) { m.read = true; save(); } }
}, true);

// Pista de credenciales dentro del modal de ingreso
function addLoginHint() {
  const form = document.getElementById('authForm');
  if (!form || form.previousElementSibling?.classList?.contains('demo-hint')) return;
  const hint = document.createElement('div');
  hint.className = 'demo-hint';
  hint.innerHTML = 'Usuarios de prueba (clave <b>demo1234</b>):<br><button type="button" data-fill="cliente@demo.com">cliente@demo.com</button> · <button type="button" data-fill="barbero@demo.com">barbero@demo.com</button>';
  hint.onclick = (e) => {
    const email = e.target.dataset.fill; if (!email) return;
    document.getElementById('authEmail').value = email;
    document.getElementById('authPass').value = 'demo1234';
  };
  form.before(hint);
}

function mount() {
  const pole = document.querySelector('.pole');
  if (!bar.isConnected) (pole ? pole.before(bar) : document.body.prepend(bar));
  else if (pole && bar.nextElementSibling !== pole) pole.before(bar);
  if (!inbox.isConnected) document.body.appendChild(inbox);
  addLoginHint();
}

paint();
subscribe(() => { paint(); if (inbox.classList.contains('open')) paintInbox(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
new MutationObserver(mount).observe(document.documentElement, { childList: true, subtree: true });

// Equivale a la tarea programada: envía recordatorios vencidos.
runReminderScheduler();
setInterval(() => runReminderScheduler(), 60_000);
