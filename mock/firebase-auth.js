// MODO DEMO · reemplazo de firebase-auth.js
// Usuarios de prueba: cliente@demo.com y barbero@demo.com (clave demo1234).
import { db, save, subscribe } from './store.js';

const listeners = new Set();
const authObj = { currentUser: null, languageCode: 'es' };

function err(code) { const e = new Error(code); e.code = code; return e; }

function toUser(u) {
  if (!u) return null;
  return {
    uid: u.uid, email: u.email, displayName: u.displayName || '', emailVerified: true, isAnonymous: false,
    async getIdTokenResult() { const fresh = db().users.find((x) => x.uid === u.uid) || u; return { claims: { ...(fresh.claims || {}), email: u.email } }; },
    async getIdToken() { return 'demo-token'; }
  };
}

function current() {
  const s = db();
  return toUser(s.users.find((u) => u.uid === s.session));
}

function emit() {
  authObj.currentUser = current();
  listeners.forEach((fn) => fn(authObj.currentUser));
}

// Cambio de sesión desde otra pestaña
let lastSession = db().session;
subscribe(() => { if (db().session !== lastSession) { lastSession = db().session; emit(); } });

export function setSession(uid) {
  db().session = uid; lastSession = uid; save(); emit();
}

export function getAuth() { authObj.currentUser = current(); return authObj; }
export function connectAuthEmulator() {}

export function onAuthStateChanged(_auth, cb) {
  listeners.add(cb);
  setTimeout(() => cb(current()), 0);
  return () => listeners.delete(cb);
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  await new Promise((r) => setTimeout(r, 250));
  const u = db().users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!u || u.password !== password) throw err('auth/invalid-credential');
  setSession(u.uid);
  return { user: current() };
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
  const s = db();
  if (s.users.some((x) => x.email.toLowerCase() === email.toLowerCase())) throw err('auth/email-already-in-use');
  if (String(password).length < 6) throw err('auth/weak-password');
  const user = { uid: 'u-' + Math.random().toString(36).slice(2, 10), email: email.toLowerCase(), password, displayName: '', claims: {} };
  s.users.push(user);
  setSession(user.uid);
  return { user: current() };
}

export async function updateProfile(user, { displayName }) {
  const u = db().users.find((x) => x.uid === user.uid);
  if (u) { u.displayName = displayName; save(); emit(); }
}

export class GoogleAuthProvider {}

// En el demo, "Continuar con Google" entra como el cliente de prueba.
export async function signInWithPopup() { setSession('demo-cliente'); return { user: current() }; }
export async function signInWithRedirect() { setSession('demo-cliente'); }
export async function sendEmailVerification() {}
export async function sendPasswordResetEmail() {}
export async function signOut() { setSession(null); }
