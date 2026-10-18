import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage, connectStorageEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { firebaseConfig, FUNCTIONS_REGION, USE_EMULATORS } from './config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'es';
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);

if (USE_EMULATORS && ['localhost', '127.0.0.1'].includes(location.hostname)) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

const FRIENDLY = {
  'functions/unauthenticated': 'Inicie sesión para continuar.',
  'functions/unavailable': 'El servicio no respondió. Intente de nuevo en un momento.',
  'functions/internal': 'Algo salió mal de nuestro lado. Ya estamos revisándolo.',
  'functions/deadline-exceeded': 'La operación tardó demasiado. Intente de nuevo.'
};

// Llama una Cloud Function y traduce errores a mensajes amables.
export async function call(name, data = {}) {
  try {
    const res = await httpsCallable(functions, name, { timeout: 95_000 })(data);
    return res.data;
  } catch (err) {
    const raw = (err.message || '').trim();
    const generic = !raw || /^internal$/i.test(raw) || raw.startsWith('functions/');
    const msg = generic ? (FRIENDLY[err.code] || 'No fue posible completar la acción.') : raw;
    const e = new Error(msg); e.code = err.code; throw e;
  }
}
