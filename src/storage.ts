import { Project } from "./types";

// ---- Penyimpanan file media (gambar/video) di hp: IndexedDB ----
const DB_NAME = "frocksmotion";
const STORE = "files";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function putFile(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* penyimpanan gagal: proyek tetap jalan, hanya tidak tersimpan */
  }
}

export async function getFile(key: string): Promise<Blob | undefined> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  } catch {
    return undefined;
  }
}

export async function deleteFile(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* abaikan */
  }
}

// ---- Penyimpanan data proyek: localStorage ----
const KEY = "frocksmotion:project:v1";

// alamat sementara (src) tidak ikut disimpan atau diekspor
export const serializeProject = (p: Project): string =>
  JSON.stringify(p, (k, v) => (k === "src" ? undefined : v));

export function parseProject(raw: string): Project | null {
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.duration === "number" && Array.isArray(p.layers)) return p as Project;
  } catch {
    /* tidak valid */
  }
  return null;
}

export function saveProject(p: Project): void {
  try {
    localStorage.setItem(KEY, serializeProject(p));
  } catch {
    /* abaikan */
  }
}

export function loadSavedProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
}

// Pasang kembali file media yang tersimpan di hp ke layer-nya
export async function hydrateProject(p: Project): Promise<Project> {
  const layers = await Promise.all(
    p.layers.map(async (l) => {
      if (l.type !== "media") return l;
      const blob = await getFile(l.id);
      return blob ? { ...l, src: URL.createObjectURL(blob) } : l;
    }),
  );
  return { ...p, layers };
}
