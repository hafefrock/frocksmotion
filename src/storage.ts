import { Project, defaultProject } from "./types";

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

// ---- Penyimpanan data proyek: localStorage (banyak proyek) ----
export type ProjectMeta = { id: string; name: string; updated: number };

const IDX_KEY = "frocksmotion:projects:v1";
const CUR_KEY = "frocksmotion:current:v1";
const LEGACY_KEY = "frocksmotion:project:v1"; // proyek tunggal dari versi sebelumnya
const dataKey = (id: string) => `frocksmotion:proj:${id}`;

// alamat sementara (src) dan gambar mini (thumb) tidak ikut disimpan atau diekspor
export const serializeProject = (p: Project): string =>
  JSON.stringify(p, (k, v) => (k === "src" || k === "thumb" ? undefined : v));

export function parseProject(raw: string): Project | null {
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.duration === "number" && Array.isArray(p.layers)) return p as Project;
  } catch {
    /* tidak valid */
  }
  return null;
}

const writeRaw = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* abaikan */
  }
};

const readRaw = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function saveIndex(list: ProjectMeta[]): void {
  writeRaw(IDX_KEY, JSON.stringify(list));
}

export function setCurrentId(id: string): void {
  writeRaw(CUR_KEY, id);
}

export function loadProject(id: string): Project | null {
  const raw = readRaw(dataKey(id));
  return raw ? parseProject(raw) : null;
}

export function saveProjectData(id: string, p: Project): void {
  writeRaw(dataKey(id), serializeProject(p));
}

export function removeProjectData(id: string): void {
  try {
    localStorage.removeItem(dataKey(id));
  } catch {
    /* abaikan */
  }
}

// Siapkan daftar proyek. Proyek tunggal dari versi lama dipindahkan jadi "Proyek 1".
export function ensureProjects(newId: () => string): { list: ProjectMeta[]; currentId: string } {
  let list: ProjectMeta[] = [];
  try {
    const parsed = JSON.parse(readRaw(IDX_KEY) ?? "[]");
    if (Array.isArray(parsed)) list = parsed.filter((m) => m && typeof m.id === "string" && typeof m.name === "string");
  } catch {
    list = [];
  }

  if (list.length === 0) {
    const id = newId();
    const legacy = readRaw(LEGACY_KEY);
    const old = legacy ? parseProject(legacy) : null;
    writeRaw(dataKey(id), serializeProject(old ?? defaultProject));
    if (old) {
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* abaikan */
      }
    }
    list = [{ id, name: "Proyek 1", updated: Date.now() }];
    saveIndex(list);
  }

  let currentId = readRaw(CUR_KEY) ?? "";
  if (!list.some((m) => m.id === currentId)) currentId = list[0].id;
  setCurrentId(currentId);
  return { list, currentId };
}

const fileIdsOf = (p: Project): string[] =>
  p.layers.flatMap((l) => (l.type === "media" || l.type === "audio" ? [l.fileId ?? l.id] : []));

// Hapus file media milik sebuah proyek, kecuali yang masih dipakai proyek lain
export async function deleteUnusedFiles(project: Project, others: Project[]): Promise<void> {
  const used = new Set(others.flatMap(fileIdsOf));
  await Promise.all(fileIdsOf(project).filter((f) => !used.has(f)).map((f) => deleteFile(f)));
}

// Pasang kembali file media yang tersimpan di hp ke layer-nya
export async function hydrateProject(p: Project): Promise<Project> {
  const layers = await Promise.all(
    p.layers.map(async (l) => {
      if (l.type !== "media" && l.type !== "audio") return l;
      const blob = await getFile(l.fileId ?? l.id);
      return blob ? { ...l, src: URL.createObjectURL(blob) } : l;
    }),
  );
  return { ...p, layers };
}
