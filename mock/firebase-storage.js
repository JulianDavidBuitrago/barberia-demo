// MODO DEMO · reemplazo de firebase-storage.js
// Archivos pequeños se guardan como data URL (persisten); los grandes
// (p. ej. videos) se muestran solo durante la sesión actual.
const urls = new Map();
const PERSIST_MAX = 1.2 * 1024 * 1024;

export const getStorage = () => ({ demo: true });
export function connectStorageEmulator() {}
export const ref = (_s, path) => ({ fullPath: path, name: path.split('/').pop() });

function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

async function shrinkImage(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return readAsDataURL(file);
  const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export function uploadBytesResumable(storageRef, file) {
  const handlers = [];
  const task = {
    snapshot: { ref: storageRef, bytesTransferred: 0, totalBytes: file.size },
    on(_ev, progress, error, complete) { handlers.push({ progress, error, complete }); return () => {}; }
  };
  (async () => {
    try {
      for (let p = 0.25; p <= 1; p += 0.25) {
        await new Promise((r) => setTimeout(r, 180));
        task.snapshot.bytesTransferred = Math.round(file.size * p);
        handlers.forEach((h) => h.progress?.(task.snapshot));
      }
      let url;
      if (file.type.startsWith('image/')) url = await shrinkImage(file);
      else if (file.size <= PERSIST_MAX) url = await readAsDataURL(file);
      else url = URL.createObjectURL(file);
      urls.set(storageRef.fullPath, url);
      handlers.forEach((h) => h.complete?.());
    } catch (e) { handlers.forEach((h) => h.error?.(e)); }
  })();
  return task;
}

export async function getDownloadURL(storageRef) { return urls.get(storageRef.fullPath); }
export async function deleteObject() {}
