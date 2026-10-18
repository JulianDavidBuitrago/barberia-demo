// MODO DEMO · reemplazo de firebase-firestore.js (subconjunto usado por el sitio)
import { col, getRaw, setRaw, deleteRaw, decode, encode, newId, save, subscribe, Timestamp, SERVER_TS } from './store.js';

export { Timestamp };
export const getFirestore = () => ({ demo: true });
export function connectFirestoreEmulator() {}
export const serverTimestamp = () => SERVER_TS;

const join = (parts) => parts.filter(Boolean).join('/').replace(/\/+/g, '/');

export function collection(_db, ...segments) { return { type: 'collection', path: join(segments) }; }
export function doc(_db, ...segments) {
  const path = join(segments);
  return { type: 'document', path, id: path.split('/').pop() };
}

export const where = (field, op, value) => ({ kind: 'where', field, op, value });
export const orderBy = (field, dir = 'asc') => ({ kind: 'orderBy', field, dir });
export const limit = (n) => ({ kind: 'limit', n });
export const startAfter = (snap) => ({ kind: 'startAfter', id: snap?.id });
export function query(ref, ...constraints) { return { ...ref, constraints }; }

const cmpVal = (v) => (v instanceof Timestamp ? v.toMillis() : v);

function matches(data, w) {
  const a = cmpVal(data[w.field]);
  const b = Array.isArray(w.value) ? w.value.map(cmpVal) : cmpVal(w.value);
  switch (w.op) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    case 'in': return b.includes(a);
    case 'array-contains': return Array.isArray(data[w.field]) && data[w.field].includes(w.value);
    default: return true;
  }
}

function docSnap(path, raw) {
  const id = path.split('/').pop();
  return {
    id, ref: { type: 'document', path, id },
    exists: () => raw !== undefined,
    data: () => (raw === undefined ? undefined : decode(raw))
  };
}

function runQuery(q) {
  const store = col(q.path);
  let rows = Object.entries(store).map(([id, raw]) => ({ id, raw, data: decode(raw) }));
  const cs = q.constraints || [];
  cs.filter((c) => c.kind === 'where').forEach((w) => { rows = rows.filter((r) => matches(r.data, w)); });
  const orders = cs.filter((c) => c.kind === 'orderBy');
  if (orders.length) {
    rows.sort((x, y) => {
      for (const o of orders) {
        const a = cmpVal(x.data[o.field]); const b = cmpVal(y.data[o.field]);
        if (a === b) continue;
        const r = a > b ? 1 : -1;
        return o.dir === 'desc' ? -r : r;
      }
      return 0;
    });
  }
  const sa = cs.find((c) => c.kind === 'startAfter');
  if (sa?.id) { const i = rows.findIndex((r) => r.id === sa.id); if (i >= 0) rows = rows.slice(i + 1); }
  const lim = cs.find((c) => c.kind === 'limit');
  if (lim) rows = rows.slice(0, lim.n);
  const docs = rows.map((r) => docSnap(`${q.path}/${r.id}`, r.raw));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
}

const tick = () => new Promise((r) => setTimeout(r, 60));

export async function getDocs(q) { await tick(); return runQuery(q); }
export async function getDoc(ref) { await tick(); return docSnap(ref.path, getRaw(ref.path)); }

export async function setDoc(ref, data, opts = {}) {
  const prev = getRaw(ref.path);
  setRaw(ref.path, opts.merge && prev ? { ...decode(prev), ...data } : data);
  save();
}

export async function addDoc(colRef, data) {
  const id = newId();
  setRaw(`${colRef.path}/${id}`, data);
  save();
  return { type: 'document', path: `${colRef.path}/${id}`, id };
}

export async function updateDoc(ref, data) {
  const prev = getRaw(ref.path);
  if (!prev) { const e = new Error('Documento no encontrado'); e.code = 'not-found'; throw e; }
  setRaw(ref.path, { ...decode(prev), ...data });
  save();
}

export async function deleteDoc(ref) { deleteRaw(ref.path); save(); }

export function onSnapshot(ref, next, error) {
  const emit = () => {
    try { next(ref.type === 'document' ? docSnap(ref.path, getRaw(ref.path)) : runQuery(ref)); }
    catch (e) { error?.(e); }
  };
  setTimeout(emit, 0);
  return subscribe(emit);
}

export { encode as __encode };
