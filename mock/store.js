// ─────────────────────────────────────────────────────────────
// MODO DEMO · Base de datos simulada en el navegador (localStorage).
// Reemplaza a Firebase solo en la carpeta /demo. Cada visitante
// tiene su propia copia; "Reiniciar demo" la restaura.
// ─────────────────────────────────────────────────────────────
import { seedData } from './seed.js';

const KEY = 'fn_demo_db_v3';

export class Timestamp {
  constructor(ms) { this._ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = 0; }
  static now() { return new Timestamp(Date.now()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  toDate() { return new Date(this._ms); }
  toMillis() { return this._ms; }
  valueOf() { return this._ms; }
}

export const SERVER_TS = { __serverTimestamp: true };

// Codifica para JSON: Timestamp/Date/serverTimestamp → { __ts }
export function encode(v) {
  if (v === SERVER_TS || v?.__serverTimestamp) return { __ts: Date.now() };
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}

export function decode(v) {
  if (v && typeof v === 'object' && '__ts' in v && Object.keys(v).length === 1) return new Timestamp(v.__ts);
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  return v;
}

let state = null;
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* almacenamiento bloqueado */ }
  return encode(seedData());
}

export function db() {
  if (!state) { state = load(); save(false); }
  return state;
}

export function save(notify = true) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { console.warn('[demo] El almacenamiento del navegador está lleno; los cambios se mantienen solo en esta pestaña.'); }
  if (notify) listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function resetDemo() {
  try { localStorage.removeItem(KEY); localStorage.removeItem('fn_cart_v1'); } catch {}
  state = null;
}

// Sincroniza entre pestañas abiertas del demo.
window.addEventListener('storage', (e) => {
  if (e.key === KEY && e.newValue) { state = JSON.parse(e.newValue); listeners.forEach((fn) => fn()); }
});

// ── Acceso a colecciones ─────────────────────────────────────────
export function col(path) {
  const s = db();
  s.cols[path] = s.cols[path] || {};
  return s.cols[path];
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function getRaw(path) {
  const i = path.lastIndexOf('/');
  return col(path.slice(0, i))[path.slice(i + 1)];
}

export function setRaw(path, data) {
  const i = path.lastIndexOf('/');
  col(path.slice(0, i))[path.slice(i + 1)] = encode(data);
}

export function deleteRaw(path) {
  const i = path.lastIndexOf('/');
  delete col(path.slice(0, i))[path.slice(i + 1)];
}

// ── Correo simulado ──────────────────────────────────────────────
export function sendMail({ to, subject, html, tag }) {
  const s = db();
  s.mail.unshift({ id: newId(), to, subject, html, tag, at: Date.now(), read: false });
  s.mail = s.mail.slice(0, 60);
}
