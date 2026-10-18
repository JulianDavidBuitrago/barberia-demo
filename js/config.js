// ─────────────────────────────────────────────────────────────
// 1) Pegue aquí la configuración web de su proyecto Firebase
//    (Consola Firebase → Configuración del proyecto → Sus apps → Web).
//    Estos valores son públicos por diseño; la seguridad la dan las
//    reglas de Firestore/Storage y las Cloud Functions.
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: 'SU_API_KEY',
  authDomain: 'SU-PROYECTO.firebaseapp.com',
  projectId: 'SU-PROYECTO',
  storageBucket: 'SU-PROYECTO.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:xxxxxxxxxxxxxxxx'
};

export const FUNCTIONS_REGION = 'us-central1';

// 2) Identidad de la marca (textos visibles del sitio).
export const BRAND = {
  name: 'Filo & Navaja',
  tagline: 'Barbería de autor',
  address: 'Calle 00 # 00-00, Su ciudad',
  mapsUrl: 'https://maps.google.com',
  whatsapp: '573000000000',          // sin "+" ni espacios
  instagram: 'https://instagram.com/',
  email: 'hola@sudominio.com',
  heroImage: ''                       // URL opcional de foto para la portada
};

// 3) Emuladores locales (true solo en desarrollo).
export const USE_EMULATORS = false;
