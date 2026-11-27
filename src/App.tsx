import { useEffect, useRef, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { FONTS } from "./fonts";
import { Icon, IconName } from "./icons";
import { probe } from "./media";
import { PreviewOverlay } from "./PreviewOverlay";
import { SHAPES, ShapeSvg } from "./Shape";
import { Timeline } from "./Timeline";
import { Video } from "./Video";
import {
  ProjectMeta,
  deleteUnusedFiles,
  ensureProjects,
  hydrateProject,
  loadProject,
  parseProject,
  putFile,
  removeProjectData,
  saveIndex,
  saveProjectData,
  serializeProject,
  setCurrentId as storeCurrentId,
} from "./storage";
import {
  Anim,
  AudioLayer,
  Background,
  DEFAULT_BG,
  FPS,
  Layer,
  MediaLayer,
  Motion,
  Project,
  Ratio,
  ShapeKind,
  ShapeLayer,
  TextLayer,
  canvasOf,
  defaultProject,
  isVisual,
} from "./types";

const PREVIEW_SHORT = 360; // live preview 360p (sisi terpendek)

const RATIOS: { id: Ratio; label: string; hint: string; stage: number }[] = [
  { id: "16:9", label: "16:9", hint: "Mendatar", stage: 0.5625 },
  { id: "9:16", label: "9:16", hint: "Vertikal", stage: 0.78 },
  { id: "1:1", label: "1:1", hint: "Kotak", stage: 0.66 },
];

const SWATCHES = ["#FFFFFF", "#FFB84D", "#FF4F8B", "#34C6B4", "#9A8CFF", "#000000"];

const BG_PRESETS: [string, string][] = [
  ["#1e3a8a", "#3b82f6"],
  ["#7c3aed", "#ec4899"],
  ["#0f766e", "#34d399"],
  ["#b45309", "#fbbf24"],
  ["#111827", "#4b5563"],
  ["#be123c", "#fb7185"],
];

const ANIMS: { id: Anim; label: string }[] = [
  { id: "none", label: "Tanpa" },
  { id: "fade", label: "Pudar" },
  { id: "slideUp", label: "Naik" },
  { id: "slideLeft", label: "Geser" },
  { id: "zoom", label: "Zoom" },
  { id: "pop", label: "Pop" },
];

const MOTIONS: { id: Motion; label: string }[] = [
  { id: "none", label: "Tanpa" },
  { id: "zoomIn", label: "Zoom masuk" },
  { id: "zoomOut", label: "Zoom keluar" },
  { id: "panLeft", label: "Geser kiri" },
  { id: "panRight", label: "Geser kanan" },
];

const SPEEDS = [0.5, 1, 1.5, 2, 3];

const uid = () => Math.random().toString(36).slice(2, 9);
const round1 = (n: number) => Math.round(n * 10) / 10;
const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

type Panel =
  | "edit"
  | "ukuran"
  | "posisi"
  | "waktu"
  | "durasi"
  | "anim"
  | "volume"
  | "latar"
  | "rasio"
  | "gaya"
  | "teksgaya"
  | "bentuk"
  | "tambahbentuk"
  | "kecepatan";
type Hist = { present: Project; past: Project[]; future: Project[] };

const PANEL_TITLE: Record<Panel, string> = {
  edit: "Teks",
  ukuran: "Ukuran",
  posisi: "Posisi",
  waktu: "Waktu",
  durasi: "Durasi video",
  anim: "Animasi",
  volume: "Volume",
  latar: "Latar",
  rasio: "Rasio video",
  gaya: "Tampilan",
  teksgaya: "Gaya teks",
  bentuk: "Bentuk",
  tambahbentuk: "Tambah bentuk",
  kecepatan: "Kecepatan",
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

const ago = (t: number) => {
  const sec = Math.max(0, (Date.now() - t) / 1000);
  if (sec < 60) return "baru saja";
  if (sec < 3600) return `${Math.floor(sec / 60)} mnt lalu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} jam lalu`;
  return `${Math.floor(sec / 86400)} hari lalu`;
};

const ColorRow: React.FC<{ label: string; value: string; onChange: (c: string) => void }> = ({ label, value, onChange }) => (
  <div className="field">
    <span className="field-row">
      <span>{label}</span>
    </span>
    <div className="swatches">
      {SWATCHES.map((c) => (
        <button
          key={c}
          className="swatch"
          aria-label={`${label} ${c}`}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <input
        className="swatch-custom"
        type="color"
        aria-label={`${label} lain`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  </div>
);

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, unit = "", onChange }) => (
  <label className="field">
    <span className="field-row">
      <span>{label}</span>
      <output>
        {value}
        {unit}
      </output>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ "--p": `${max > min ? ((value - min) / (max - min)) * 100 : 0}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  </label>
);

// Baris kontrol di bawah preview: waktu, tombol putar, undo/redo
const Controls: React.FC<{
  playerRef: React.RefObject<PlayerRef>;
  duration: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}> = ({ playerRef, duration, canUndo, canRedo, onUndo, onRedo }) => {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
    };
  }, [playerRef]);

  return (
    <div className="controls">
      <output className="timecode">
        {fmt(frame / FPS)} <span>/ {fmt(duration)}</span>
      </output>
      <button className="play-btn" aria-label={playing ? "Jeda" : "Putar"} onClick={() => playerRef.current?.toggle()}>
        <Icon name={playing ? "pause" : "play"} size={24} />
      </button>
      <div className="row end">
        <button className="icon-btn sm" aria-label="Urungkan" disabled={!canUndo} onClick={onUndo}>
          <Icon name="undo" size={18} />
        </button>
        <button className="icon-btn sm" aria-label="Ulangi" disabled={!canRedo} onClick={onRedo}>
          <Icon name="redo" size={18} />
        </button>
      </div>
    </div>
  );
};

type Tool = {
  icon: IconName;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  file?: "media" | "audio";
};

export const App: React.FC = () => {
  const [hist, setHist] = useState<Hist>({ present: defaultProject, past: [], future: [] });
  const histRef = useRef(hist);
  const lastEdit = useRef({ key: "", t: 0 });
  const project = hist.present;
  const bg = project.background ?? DEFAULT_BG;
  const canvas = canvasOf(project.ratio);
  const previewScale = PREVIEW_SHORT / Math.min(canvas.w, canvas.h); // 0.25
  const ratioInfo = RATIOS.find((r) => r.id === (project.ratio ?? "16:9")) ?? RATIOS[0];

  const [selectedId, setSelectedId] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [loaded, setLoadedState] = useState(false);
  const loadedRef = useRef(false);
  const setLoaded = (v: boolean) => {
    loadedRef.current = v;
    setLoadedState(v);
  };
  const [importText, setImportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const playerRef = useRef<PlayerRef>(null);
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentId, setCurrentIdState] = useState("");
  const [projectsOpen, setProjectsOpen] = useState(false);
  const listRef = useRef<ProjectMeta[]>([]);
  const currentRef = useRef("");
  const lastSaved = useRef<Project | null>(null);
  const currentName = projects.find((m) => m.id === currentId)?.name ?? "Proyek";

  const selected = project.layers.find((l) => l.id === selectedId);
  const activePanel: Panel | null =
    panel === "durasi" || panel === "latar" || panel === "rasio" || panel === "tambahbentuk" || (panel && selected) ? panel : null;

  // ---- Riwayat (undo/redo) ----
  const commit = (h: Hist) => {
    histRef.current = h;
    setHist(h);
  };

  // `key` dipakai untuk menggabungkan perubahan beruntun (geser slider, ketik) jadi satu langkah undo
  const apply = (fn: (p: Project) => Project, key = "") => {
    const s = histRef.current;
    const next = fn(s.present);
    if (next === s.present) return;
    const now = Date.now();
    const merge = key !== "" && lastEdit.current.key === key && now - lastEdit.current.t < 800;
    lastEdit.current = { key, t: now };
    commit({ present: next, past: merge ? s.past : [...s.past.slice(-49), s.present], future: [] });
  };

  const undo = () => {
    const s = histRef.current;
    if (!s.past.length) return;
    lastEdit.current = { key: "", t: 0 };
    commit({ present: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.present, ...s.future] });
  };

  const redo = () => {
    const s = histRef.current;
    if (!s.future.length) return;
    lastEdit.current = { key: "", t: 0 };
    commit({ present: s.future[0], past: [...s.past, s.present], future: s.future.slice(1) });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  };

  // ---- Daftar proyek, muat, dan simpan otomatis ----
  const setList = (list: ProjectMeta[]) => {
    listRef.current = list;
    setProjects(list);
    saveIndex(list);
  };

  const touch = (id: string) => setList(listRef.current.map((m) => (m.id === id ? { ...m, updated: Date.now() } : m)));

  // Tampilkan proyek di editor. Gambar mini dibuat belakangan supaya app cepat terbuka.
  const showProject = async (p: Project) => {
    setSelectedId("");
    setPanel(null);
    const hydrated = await hydrateProject(p);
    commit({ present: hydrated, past: [], future: [] });
    lastSaved.current = hydrated;
    setLoaded(true);

    const thumbs = new Map<string, string>();
    await Promise.all(
      hydrated.layers.map(async (l) => {
        if (l.type === "media" && l.src) {
          const meta = await probe(l.src, l.kind);
          if (meta.thumb) thumbs.set(l.id, meta.thumb);
        }
      }),
    );
    if (thumbs.size && histRef.current.present === hydrated) {
      const cur = histRef.current;
      const next = {
        ...cur.present,
        layers: cur.present.layers.map((l) => (l.type === "media" && thumbs.has(l.id) ? { ...l, thumb: thumbs.get(l.id) } : l)),
      };
      commit({ ...cur, present: next });
      lastSaved.current = next;
    }
  };

  // Simpan proyek yang sedang dibuka sebelum pindah ke proyek lain
  const flushSave = () => {
    const id = currentRef.current;
    const p = histRef.current.present;
    if (id && loadedRef.current && p !== lastSaved.current) {
      saveProjectData(id, p);
      lastSaved.current = p;
      touch(id);
    }
  };

  const switchTo = async (id: string, p: Project) => {
    setLoaded(false);
    currentRef.current = id;
    storeCurrentId(id);
    setCurrentIdState(id);
    await showProject(p);
  };

  const nextName = (base: string, numbered: boolean) => {
    const names = new Set(listRef.current.map((m) => m.name));
    if (numbered) {
      let n = listRef.current.length + 1;
      while (names.has(`${base} ${n}`)) n++;
      return `${base} ${n}`;
    }
    if (!names.has(base)) return base;
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  };

  const openProject = async (id: string) => {
    setProjectsOpen(false);
    if (id === currentRef.current) return;
    flushSave();
    await switchTo(id, loadProject(id) ?? defaultProject);
  };

  const createProject = async (data?: Project, name?: string) => {
    setProjectsOpen(false);
    flushSave();
    const id = uid();
    const proj = data ?? defaultProject;
    saveProjectData(id, proj);
    setList([{ id, name: name ?? nextName("Proyek", true), updated: Date.now() }, ...listRef.current]);
    await switchTo(id, proj);
  };

  const renameProject = (id: string) => {
    const m = listRef.current.find((x) => x.id === id);
    if (!m) return;
    const name = window.prompt("Nama proyek", m.name)?.trim();
    if (name) setList(listRef.current.map((x) => (x.id === id ? { ...x, name } : x)));
  };

  const duplicateProject = (id: string) => {
    const m = listRef.current.find((x) => x.id === id);
    const data = id === currentRef.current ? histRef.current.present : loadProject(id);
    if (!m || !data) return;
    const nid = uid();
    saveProjectData(nid, data);
    setList([{ id: nid, name: `${m.name} salinan`, updated: Date.now() }, ...listRef.current]);
  };

  const deleteProject = async (id: string) => {
    const m = listRef.current.find((x) => x.id === id);
    if (!m || !window.confirm(`Hapus proyek "${m.name}"? Ini tidak bisa dibatalkan.`)) return;
    const wasCurrent = id === currentRef.current;
    const data = wasCurrent ? histRef.current.present : loadProject(id);
    const rest = listRef.current.filter((x) => x.id !== id);
    if (wasCurrent) setLoaded(false);
    removeProjectData(id);
    const restData = rest.map((x) => loadProject(x.id)).filter((x): x is Project => !!x);
    if (data) await deleteUnusedFiles(data, restData);

    if (rest.length === 0) {
      const nid = uid();
      saveProjectData(nid, defaultProject);
      setList([{ id: nid, name: "Proyek 1", updated: Date.now() }]);
      await switchTo(nid, defaultProject);
      return;
    }
    setList(rest);
    if (wasCurrent) await switchTo(rest[0].id, loadProject(rest[0].id) ?? defaultProject);
  };

  useEffect(() => {
    (async () => {
      const { list, currentId: cid } = ensureProjects(uid);
      listRef.current = list;
      setProjects(list);
      currentRef.current = cid;
      setCurrentIdState(cid);
      await showProject(loadProject(cid) ?? defaultProject);
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* abaikan */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simpan otomatis setiap ada perubahan
  useEffect(() => {
    if (!loaded || !currentId || project === lastSaved.current) return;
    const t = setTimeout(() => {
      saveProjectData(currentId, project);
      lastSaved.current = project;
      touch(currentId);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, loaded, currentId]);

  // ---- Perubahan layer ----
  const patchLayer = (id: string, patch: Record<string, unknown>, key: string) =>
    apply(
      (p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) }),
      key,
    );

  const updateLayer = (patch: Record<string, unknown>) =>
    patchLayer(selectedId, patch, `${selectedId}:${Object.keys(patch).join(",")}`);

  const setBg = (patch: Partial<Background>) => apply((p) => ({ ...p, background: { ...(p.background ?? DEFAULT_BG), ...patch } }), "latar");

  // Ganti rasio: posisi dan ukuran layer ikut menyesuaikan supaya susunannya tetap
  const setRatio = (r: Ratio) => {
    const from = canvasOf(project.ratio);
    const to = canvasOf(r);
    if (from.w === to.w && from.h === to.h) return;
    const fx = to.w / from.w;
    const fy = to.h / from.h;
    const fs = Math.min(fx, fy);
    apply((p) => ({
      ...p,
      ratio: r,
      layers: p.layers.map((l) =>
        l.type === "text"
          ? {
              ...l,
              x: Math.round(l.x * fx),
              y: Math.round(l.y * fy),
              size: Math.max(20, Math.round((l.size * fs) / 5) * 5),
              ...(l.strokeW ? { strokeW: Math.max(1, Math.round(l.strokeW * fs)) } : {}),
              ...(l.spacing ? { spacing: Math.round(l.spacing * fs) } : {}),
            }
          : l.type === "media"
            ? { ...l, x: Math.round(l.x * fx), y: Math.round(l.y * fy), width: Math.max(100, Math.round((l.width * fs) / 10) * 10) }
            : l.type === "shape"
              ? {
                  ...l,
                  x: Math.round(l.x * fx),
                  y: Math.round(l.y * fy),
                  width: Math.max(10, Math.round((l.width * fs) / 10) * 10),
                  height: Math.max(4, Math.round(l.height * fs)),
                  ...(l.strokeW ? { strokeW: Math.max(1, Math.round(l.strokeW * fs)) } : {}),
                }
              : l,
      ),
    }));
  };

  const selectLayer = (id: string) => {
    if (id !== selectedId) setPanel(null);
    setSelectedId(id);
  };

  const setDuration = (d: number) => {
    const next = Math.min(60, Math.max(1, d));
    apply(
      (p) => ({
        ...p,
        duration: next,
        layers: p.layers.map((l) => {
          const start = Math.min(l.start, Math.max(0, next - 0.5));
          return { ...l, start, duration: Math.max(0.5, Math.min(l.duration, next - start)) };
        }),
      }),
      "durasi",
    );
  };

  const playheadSec = () => round1((playerRef.current?.getCurrentFrame() ?? 0) / FPS);

  const addText = () => {
    const layer: TextLayer = {
      type: "text",
      id: uid(),
      text: "Teks baru",
      x: canvas.w / 2,
      y: canvas.h / 2,
      size: 120,
      color: "#ffffff",
      font: "manrope",
      anim: "slideUp",
      start: playheadSec(),
      duration: 2,
    };
    layer.duration = Math.max(0.5, Math.min(2, round1(project.duration - layer.start)));
    apply((p) => ({ ...p, layers: [...p.layers, layer] }));
    setSelectedId(layer.id);
    setPanel("edit");
  };

  const addShape = (kind: ShapeKind) => {
    const def = SHAPES.find((x) => x.id === kind) ?? SHAPES[0];
    const f = Math.min(1, (canvas.w * 0.45) / def.w);
    const layer: ShapeLayer = {
      type: "shape",
      id: uid(),
      shape: kind,
      x: canvas.w / 2,
      y: canvas.h / 2,
      width: Math.max(10, Math.round((def.w * f) / 10) * 10),
      height: Math.max(8, Math.round(def.h * f)),
      fill: "#ff4f8b",
      anim: "none",
      start: playheadSec(),
      duration: 2,
    };
    layer.duration = Math.max(0.5, Math.min(2, round1(project.duration - layer.start)));
    apply((p) => ({ ...p, layers: [...p.layers, layer] }));
    setSelectedId(layer.id);
    setPanel("bentuk");
  };

  // Ubah kecepatan klip: bagian klip asli yang dipakai tetap sama, jadi lama tampil ikut berubah
  const setSpeed = (v: number) => {
    const next = Math.min(4, Math.max(0.25, Math.round(v * 100) / 100));
    apply(
      (p) => ({
        ...p,
        layers: p.layers.map((l) => {
          if (l.id !== selectedId || (l.type !== "media" && l.type !== "audio")) return l;
          const old = l.speed ?? 1;
          let dur = (l.duration * old) / next;
          dur = Math.min(dur, p.duration - l.start);
          if (l.mediaDuration) dur = Math.min(dur, (l.mediaDuration - l.trim) / next);
          return { ...l, speed: next, duration: Math.max(0.5, round1(dur)) };
        }),
      }),
      `${selectedId}:speed`,
    );
  };

  const addMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const added: MediaLayer[] = [];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const id = uid();
      await putFile(id, f);
      const isVideo = f.type.startsWith("video/");
      const meta = await probe(url, isVideo ? "video" : "image");
      added.push({
        type: "media",
        id,
        fileId: id,
        kind: isVideo ? "video" : "image",
        name: f.name,
        src: url,
        thumb: meta.thumb,
        aspect: meta.aspect,
        mediaDuration: meta.duration,
        x: canvas.w / 2,
        y: canvas.h / 2,
        width: Math.round((canvas.w * 0.5) / 20) * 20,
        trim: 0,
        start: 0,
        duration: isVideo ? Math.min(project.duration, half(meta.duration ?? 5)) : project.duration,
      });
    }
    if (added.length === 0) return;
    apply((p) => ({ ...p, layers: [...p.layers, ...added] }));
    setSelectedId(added[added.length - 1].id);
    setPanel(null);
  };

  const addAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const added: AudioLayer[] = [];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const id = uid();
      await putFile(id, f);
      const meta = await probe(url, "audio");
      const start = Math.min(playheadSec(), Math.max(0, project.duration - 0.5));
      added.push({
        type: "audio",
        id,
        fileId: id,
        name: f.name,
        src: url,
        mediaDuration: meta.duration,
        volume: 1,
        trim: 0,
        start,
        duration: Math.max(0.5, Math.min(project.duration - start, half(meta.duration ?? project.duration))),
      });
    }
    if (added.length === 0) return;
    apply((p) => ({ ...p, layers: [...p.layers, ...added] }));
    setSelectedId(added[added.length - 1].id);
    setPanel("volume");
  };

  const removeLayer = () => {
    apply((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== selectedId) }));
    setSelectedId("");
    setPanel(null);
  };

  const moveLayer = (dir: -1 | 1) =>
    apply((p) => {
      const i = p.layers.findIndex((l) => l.id === selectedId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.layers.length) return p;
      const layers = [...p.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...p, layers };
    });

  const duplicateLayer = () => {
    if (!selected) return;
    const copy = (
      isVisual(selected)
        ? { ...selected, id: uid(), x: Math.min(canvas.w, selected.x + 80), y: Math.min(canvas.h, selected.y + 80) }
        : { ...selected, id: uid() }
    ) as Layer;
    apply((p) => {
      const i = p.layers.findIndex((l) => l.id === selected.id);
      const layers = [...p.layers];
      layers.splice(i + 1, 0, copy);
      return { ...p, layers };
    });
    setSelectedId(copy.id);
  };

  // Belah layer terpilih di posisi garis putar
  const splitLayer = () => {
    if (!selected) return;
    const t = playheadSec();
    const end = selected.start + selected.duration;
    if (t <= selected.start + 0.2 || t >= end - 0.2) {
      showToast("Geser garis putar ke dalam layer yang dipilih.");
      return;
    }
    const first = { ...selected, duration: round1(t - selected.start) } as Layer;
    const second = { ...selected, id: uid(), start: t, duration: round1(end - t) } as Layer;
    if ((second.type === "media" && second.kind === "video") || second.type === "audio") {
      second.trim = round1(second.trim + (t - selected.start) * (second.speed ?? 1));
    }
    apply((p) => {
      const i = p.layers.findIndex((l) => l.id === selected.id);
      const layers = [...p.layers];
      layers.splice(i, 1, first, second);
      return { ...p, layers };
    });
    setSelectedId(second.id);
  };

  // ---- Ekspor dan proyek ----
  const exportJson = serializeProject(project);
  const missingMedia = project.layers.filter((l) => (l.type === "media" || l.type === "audio") && !l.src);
  const selectedIndex = project.layers.findIndex((l) => l.id === selectedId);

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      exportRef.current?.select();
      window.alert("Tekan lama kotak teks, lalu pilih Salin.");
    }
  };

  const importProject = () => {
    const p = parseProject(importText);
    if (!p) {
      window.alert("Data proyek tidak valid. Pastikan yang ditempel utuh dan belum diubah.");
      return;
    }
    setImportText("");
    setExportOpen(false);
    void createProject(p, nextName("Impor", false));
  };

  // ---- Toolbar bawah yang berubah sesuai pilihan ----
  const stackTools: Tool[] = [
    { icon: "up", label: "Naik", onClick: () => moveLayer(1), disabled: selectedIndex >= project.layers.length - 1 },
    { icon: "down", label: "Turun", onClick: () => moveLayer(-1), disabled: selectedIndex <= 0 },
  ];
  const editTools: Tool[] = [
    { icon: "split", label: "Belah", onClick: splitLayer },
    { icon: "copy", label: "Gandakan", onClick: duplicateLayer },
  ];
  const deleteTool: Tool = { icon: "trash", label: "Hapus", onClick: removeLayer, danger: true };
  const back: Tool = { icon: "back", label: "Kembali", onClick: () => selectLayer("") };

  let tools: Tool[];
  if (!selected) {
    tools = [
      { icon: "text", label: "Teks", onClick: addText },
      { icon: "shapes", label: "Bentuk", onClick: () => setPanel("tambahbentuk") },
      { icon: "media", label: "Media", file: "media" },
      { icon: "music", label: "Audio", file: "audio" },
      { icon: "palette", label: "Latar", onClick: () => setPanel("latar") },
      { icon: "ratio", label: "Rasio", onClick: () => setPanel("rasio") },
      { icon: "clock", label: "Durasi", onClick: () => setPanel("durasi") },
    ];
  } else if (selected.type === "text") {
    tools = [
      back,
      { icon: "pencil", label: "Edit", onClick: () => setPanel("edit") },
      { icon: "layers", label: "Gaya", onClick: () => setPanel("teksgaya") },
      { icon: "sparkles", label: "Animasi", onClick: () => setPanel("anim") },
      { icon: "rotate", label: "Tampilan", onClick: () => setPanel("gaya") },
      { icon: "move", label: "Posisi", onClick: () => setPanel("posisi") },
      { icon: "clock", label: "Waktu", onClick: () => setPanel("waktu") },
      ...editTools,
      ...stackTools,
      deleteTool,
    ];
  } else if (selected.type === "media") {
    tools = [
      back,
      { icon: "resize", label: "Ukuran", onClick: () => setPanel("ukuran") },
      ...(selected.kind === "video"
        ? [
            { icon: "volume", label: "Volume", onClick: () => setPanel("volume") } as Tool,
            { icon: "speed", label: "Kecepatan", onClick: () => setPanel("kecepatan") } as Tool,
          ]
        : []),
      { icon: "sparkles", label: "Animasi", onClick: () => setPanel("anim") },
      { icon: "rotate", label: "Tampilan", onClick: () => setPanel("gaya") },
      { icon: "move", label: "Posisi", onClick: () => setPanel("posisi") },
      { icon: "clock", label: "Waktu", onClick: () => setPanel("waktu") },
      ...editTools,
      ...stackTools,
      deleteTool,
    ];
  } else if (selected.type === "shape") {
    tools = [
      back,
      { icon: "shapes", label: "Bentuk", onClick: () => setPanel("bentuk") },
      { icon: "resize", label: "Ukuran", onClick: () => setPanel("ukuran") },
      { icon: "sparkles", label: "Animasi", onClick: () => setPanel("anim") },
      { icon: "rotate", label: "Tampilan", onClick: () => setPanel("gaya") },
      { icon: "move", label: "Posisi", onClick: () => setPanel("posisi") },
      { icon: "clock", label: "Waktu", onClick: () => setPanel("waktu") },
      ...editTools,
      ...stackTools,
      deleteTool,
    ];
  } else {
    tools = [
      back,
      { icon: "volume", label: "Volume", onClick: () => setPanel("volume") },
      { icon: "speed", label: "Kecepatan", onClick: () => setPanel("kecepatan") },
      { icon: "clock", label: "Waktu", onClick: () => setPanel("waktu") },
      ...editTools,
      deleteTool,
    ];
  }

  const visualSel = selected && isVisual(selected) ? selected : undefined;
  const volumeSel =
    selected && (selected.type === "audio" || (selected.type === "media" && selected.kind === "video")) ? selected : undefined;

  return (
    <div className="editor">
      <header className="topbar">
        <h1 className="brand">FROCKSMOTION</h1>
        <div className="row">
          <button className="proj-chip" aria-label="Proyek" onClick={() => setProjectsOpen(true)}>
            <Icon name="folder" size={16} />
            <span>{currentName}</span>
          </button>
          <button className="icon-btn xs accent" aria-label="Ekspor" onClick={() => setExportOpen(true)}>
            <Icon name="export" size={18} />
          </button>
        </div>
      </header>

      <div className="stage" style={{ height: `calc(min(100vw, 560px) * ${ratioInfo.stage})` }}>
        <div className="player-box" data-ratio={ratioInfo.id}>
          <Player
            ref={playerRef}
            component={Video}
            inputProps={{ project, scale: previewScale }}
            durationInFrames={Math.max(1, Math.round(project.duration * FPS))}
            fps={FPS}
            compositionWidth={Math.round(canvas.w * previewScale)}
            compositionHeight={Math.round(canvas.h * previewScale)}
            style={{ width: "100%", display: "block" }}
            controls={false}
            clickToPlay={false}
            allowFullscreen={false}
            loop
          />
          <PreviewOverlay
            layers={project.layers}
            selectedId={selectedId}
            canvas={canvas}
            playerRef={playerRef}
            onSelect={selectLayer}
            onChange={patchLayer}
          />
        </div>
      </div>

      <Controls
        playerRef={playerRef}
        duration={project.duration}
        canUndo={hist.past.length > 0}
        canRedo={hist.future.length > 0}
        onUndo={undo}
        onRedo={redo}
      />

      <div className="tl-area">
        {missingMedia.length > 0 && (
          <div className="banner">
            {missingMedia.length} file belum ada di hp. Pilih ulang lewat tombol Media atau Audio dengan nama file yang sama.
          </div>
        )}
        <Timeline
          layers={project.layers}
          duration={project.duration}
          selectedId={selectedId}
          onSelect={selectLayer}
          onChange={patchLayer}
          playerRef={playerRef}
        />
      </div>

      <div className="bottom">
        {activePanel ? (
          <div className="toolpanel">
            <div className="toolpanel-head">
              <h2>{PANEL_TITLE[activePanel]}</h2>
              <button className="icon-btn sm" aria-label="Selesai" onClick={() => setPanel(null)}>
                <Icon name="check" size={18} />
              </button>
            </div>
            <div className="toolpanel-body">
              {activePanel === "durasi" && (
                <Slider label="Durasi video" unit=" dtk" value={project.duration} min={1} max={60} onChange={setDuration} />
              )}

              {activePanel === "rasio" && (
                <>
                  <div className="chip-grid">
                    {RATIOS.map((r) => (
                      <button
                        key={r.id}
                        className="chip two"
                        aria-pressed={(project.ratio ?? "16:9") === r.id}
                        onClick={() => setRatio(r.id)}
                      >
                        <b>{r.label}</b>
                        <small>{r.hint}</small>
                      </button>
                    ))}
                  </div>
                  <p className="hint-line">
                    Vertikal 9:16 cocok untuk TikTok, Reels, dan Shorts. Posisi dan ukuran layer ikut menyesuaikan.
                  </p>
                </>
              )}

              {activePanel === "gaya" && visualSel && (
                <>
                  <div className="grid2">
                    <Slider
                      label="Rotasi"
                      unit="°"
                      value={Math.round(visualSel.rotation ?? 0)}
                      min={-180}
                      max={180}
                      step={5}
                      onChange={(v) => updateLayer({ rotation: v })}
                    />
                    <Slider
                      label="Opasitas"
                      unit="%"
                      value={Math.round((visualSel.opacity ?? 1) * 100)}
                      min={0}
                      max={100}
                      step={5}
                      onChange={(v) => updateLayer({ opacity: v / 100 })}
                    />
                  </div>
                  <button className="chip wide" aria-pressed={!!visualSel.flip} onClick={() => updateLayer({ flip: !visualSel.flip })}>
                    Balik horizontal
                  </button>
                </>
              )}

              {activePanel === "latar" && (
                <>
                  <div className="seg">
                    <button aria-pressed={bg.mode === "gradient"} onClick={() => setBg({ mode: "gradient" })}>
                      Gradasi
                    </button>
                    <button aria-pressed={bg.mode === "solid"} onClick={() => setBg({ mode: "solid" })}>
                      Polos
                    </button>
                  </div>
                  <div className="swatches">
                    {BG_PRESETS.map(([a, b]) => (
                      <button
                        key={a + b}
                        className="swatch"
                        aria-label={`Latar ${a} ke ${b}`}
                        aria-pressed={bg.mode === "gradient" && bg.a === a && bg.b === b}
                        style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
                        onClick={() => setBg({ mode: "gradient", a, b })}
                      />
                    ))}
                  </div>
                  <div className="grid2">
                    <label className="field">
                      <span className="field-row">
                        <span>Warna 1</span>
                      </span>
                      <input className="colorbar" type="color" value={bg.a} onChange={(e) => setBg({ a: e.target.value })} />
                    </label>
                    {bg.mode === "gradient" && (
                      <label className="field">
                        <span className="field-row">
                          <span>Warna 2</span>
                        </span>
                        <input className="colorbar" type="color" value={bg.b} onChange={(e) => setBg({ b: e.target.value })} />
                      </label>
                    )}
                  </div>
                </>
              )}

              {activePanel === "edit" && selected?.type === "text" && (
                <>
                  <textarea
                    className="input"
                    rows={2}
                    value={selected.text}
                    onChange={(e) => updateLayer({ text: e.target.value })}
                  />
                  <div className="chip-grid">
                    {FONTS.map((f) => (
                      <button
                        key={f.id}
                        className="chip"
                        aria-pressed={(selected.font ?? "manrope") === f.id}
                        style={{ fontFamily: f.family, fontWeight: f.weight }}
                        onClick={() => updateLayer({ font: f.id })}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <Slider label="Ukuran huruf" value={selected.size} min={30} max={400} step={5} onChange={(v) => updateLayer({ size: v })} />
                  <ColorRow label="Warna" value={selected.color} onChange={(c) => updateLayer({ color: c })} />
                </>
              )}

              {activePanel === "teksgaya" && selected?.type === "text" && (
                <>
                  <div className="seg three">
                    {(["left", "center", "right"] as const).map((a) => (
                      <button key={a} aria-pressed={(selected.align ?? "center") === a} onClick={() => updateLayer({ align: a })}>
                        {a === "left" ? "Kiri" : a === "center" ? "Tengah" : "Kanan"}
                      </button>
                    ))}
                  </div>
                  <div className="grid2">
                    <Slider label="Jarak huruf" value={selected.spacing ?? 0} min={-10} max={60} onChange={(v) => updateLayer({ spacing: v })} />
                    <Slider label="Bayangan" unit="%" value={selected.shadow ?? 0} min={0} max={100} step={5} onChange={(v) => updateLayer({ shadow: v })} />
                  </div>
                  <div className="grid2">
                    <Slider label="Garis tepi" value={selected.strokeW ?? 0} min={0} max={40} onChange={(v) => updateLayer({ strokeW: v })} />
                    <Slider
                      label="Kotak latar"
                      unit="%"
                      value={Math.round((selected.bgOpacity ?? 0) * 100)}
                      min={0}
                      max={100}
                      step={5}
                      onChange={(v) => updateLayer({ bgOpacity: v / 100 })}
                    />
                  </div>
                  {(selected.strokeW ?? 0) > 0 && (
                    <ColorRow label="Warna tepi" value={selected.strokeColor ?? "#000000"} onChange={(c) => updateLayer({ strokeColor: c })} />
                  )}
                  {(selected.bgOpacity ?? 0) > 0 && (
                    <ColorRow label="Warna kotak" value={selected.bgColor ?? "#000000"} onChange={(c) => updateLayer({ bgColor: c })} />
                  )}
                </>
              )}

              {activePanel === "anim" && visualSel && (
                <>
                  <div className="chip-grid">
                    {ANIMS.map((a) => (
                      <button
                        key={a.id}
                        className="chip"
                        aria-pressed={(visualSel.anim ?? (visualSel.type === "text" ? "slideUp" : "none")) === a.id}
                        onClick={() => updateLayer({ anim: a.id })}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <button className="chip wide" aria-pressed={!!visualSel.animOut} onClick={() => updateLayer({ animOut: !visualSel.animOut })}>
                    Pudar di akhir
                  </button>
                  {visualSel.type === "media" && (
                    <>
                      <div className="field">
                        <span className="field-row">
                          <span>Gerak pelan</span>
                        </span>
                      </div>
                      <div className="chip-grid">
                        {MOTIONS.map((m) => (
                          <button
                            key={m.id}
                            className="chip"
                            aria-pressed={(visualSel.motion ?? "none") === m.id}
                            onClick={() => updateLayer({ motion: m.id })}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {activePanel === "tambahbentuk" && (
                <div className="chip-grid">
                  {SHAPES.map((sh) => (
                    <button key={sh.id} className="chip shape-chip" onClick={() => addShape(sh.id)}>
                      <ShapeSvg shape={sh.id} width={sh.id === "line" ? 44 : 32} height={sh.id === "line" ? 6 : 28} fill="currentColor" />
                      <small>{sh.label}</small>
                    </button>
                  ))}
                </div>
              )}

              {activePanel === "bentuk" && selected?.type === "shape" && (
                <>
                  <div className="chip-grid">
                    {SHAPES.map((sh) => (
                      <button
                        key={sh.id}
                        className="chip shape-chip"
                        aria-pressed={selected.shape === sh.id}
                        onClick={() => updateLayer({ shape: sh.id })}
                      >
                        <ShapeSvg shape={sh.id} width={sh.id === "line" ? 44 : 32} height={sh.id === "line" ? 6 : 28} fill="currentColor" />
                        <small>{sh.label}</small>
                      </button>
                    ))}
                  </div>
                  <ColorRow label="Warna isi" value={selected.fill} onChange={(c) => updateLayer({ fill: c })} />
                  <div className="grid2">
                    <Slider label="Garis tepi" value={selected.strokeW ?? 0} min={0} max={40} onChange={(v) => updateLayer({ strokeW: v })} />
                    {selected.shape === "rect" && (
                      <Slider label="Sudut bulat" unit="%" value={selected.radius ?? 0} min={0} max={100} step={5} onChange={(v) => updateLayer({ radius: v })} />
                    )}
                  </div>
                  {(selected.strokeW ?? 0) > 0 && (
                    <ColorRow label="Warna tepi" value={selected.strokeColor ?? "#000000"} onChange={(c) => updateLayer({ strokeColor: c })} />
                  )}
                </>
              )}

              {activePanel === "ukuran" && selected?.type === "shape" && (
                <div className="grid2">
                  <Slider label="Lebar" value={selected.width} min={10} max={canvas.w} step={10} onChange={(v) => updateLayer({ width: v })} />
                  <Slider label="Tinggi" value={selected.height} min={4} max={canvas.h} step={4} onChange={(v) => updateLayer({ height: v })} />
                </div>
              )}

              {activePanel === "kecepatan" && volumeSel && (
                <>
                  <div className="chip-grid five">
                    {SPEEDS.map((v) => (
                      <button key={v} className="chip" aria-pressed={(volumeSel.speed ?? 1) === v} onClick={() => setSpeed(v)}>
                        {v}x
                      </button>
                    ))}
                  </div>
                  <Slider label="Kecepatan" unit="x" value={volumeSel.speed ?? 1} min={0.25} max={4} step={0.05} onChange={setSpeed} />
                </>
              )}

              {activePanel === "ukuran" && selected?.type === "media" && (
                <>
                  <Slider label="Lebar" value={selected.width} min={100} max={canvas.w} step={20} onChange={(v) => updateLayer({ width: v })} />
                  {selected.kind === "video" && (
                    <Slider
                      label="Potong awal klip"
                      unit=" dtk"
                      value={selected.trim}
                      min={0}
                      max={Math.max(0.5, Math.floor((selected.mediaDuration ?? 5) * 2) / 2)}
                      step={0.5}
                      onChange={(v) => updateLayer({ trim: v })}
                    />
                  )}
                </>
              )}

              {activePanel === "volume" && volumeSel && (
                <>
                  <Slider
                    label="Volume"
                    unit="%"
                    value={Math.round((volumeSel.volume ?? 1) * 100)}
                    min={0}
                    max={100}
                    step={5}
                    onChange={(v) => updateLayer({ volume: v / 100 })}
                  />
                  <div className="grid2">
                    <Slider label="Masuk perlahan" unit=" dtk" value={volumeSel.fadeIn ?? 0} min={0} max={5} step={0.5} onChange={(v) => updateLayer({ fadeIn: v })} />
                    <Slider label="Keluar perlahan" unit=" dtk" value={volumeSel.fadeOut ?? 0} min={0} max={5} step={0.5} onChange={(v) => updateLayer({ fadeOut: v })} />
                  </div>
                  {volumeSel.type === "audio" && (
                    <Slider
                      label="Potong awal klip"
                      unit=" dtk"
                      value={volumeSel.trim}
                      min={0}
                      max={Math.max(0.5, Math.floor((volumeSel.mediaDuration ?? 5) * 2) / 2)}
                      step={0.5}
                      onChange={(v) => updateLayer({ trim: v })}
                    />
                  )}
                </>
              )}

              {activePanel === "posisi" && visualSel && (
                <div className="grid2">
                  <Slider label="Posisi X" value={visualSel.x} min={0} max={canvas.w} step={10} onChange={(v) => updateLayer({ x: v })} />
                  <Slider label="Posisi Y" value={visualSel.y} min={0} max={canvas.h} step={10} onChange={(v) => updateLayer({ y: v })} />
                </div>
              )}

              {activePanel === "waktu" && selected && (
                <div className="grid2">
                  <Slider label="Mulai" unit=" dtk" value={selected.start} min={0} max={project.duration} step={0.5} onChange={(v) => updateLayer({ start: v })} />
                  <Slider label="Lama tampil" unit=" dtk" value={selected.duration} min={0.5} max={project.duration} step={0.5} onChange={(v) => updateLayer({ duration: v })} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <nav className="toolbar" aria-label="Alat edit">
            {tools.map((t) =>
              t.file ? (
                <label key={t.label} className="tool">
                  <Icon name={t.icon} size={22} />
                  {t.label}
                  <input
                    type="file"
                    accept={t.file === "audio" ? "audio/*" : "image/*,video/*"}
                    multiple
                    hidden
                    onChange={t.file === "audio" ? addAudio : addMedia}
                  />
                </label>
              ) : (
                <button
                  key={t.label}
                  className={`tool${t.danger ? " danger" : ""}`}
                  disabled={t.disabled}
                  onClick={t.onClick}
                >
                  <Icon name={t.icon} size={22} />
                  {t.label}
                </button>
              ),
            )}
          </nav>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      {projectsOpen && (
        <div className="sheet-backdrop" onClick={() => setProjectsOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Proyek" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2 style={{ fontFamily: "var(--font-brand)", fontSize: 18 }}>Proyek</h2>
              <button className="icon-btn sm" aria-label="Tutup" onClick={() => setProjectsOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <button className="btn primary" onClick={() => void createProject()}>
              <Icon name="plus" size={18} />
              Proyek baru
            </button>
            <div className="proj-list">
              {projects.map((m) => {
                const d = m.id === currentId ? project : loadProject(m.id);
                return (
                  <div key={m.id} className={`proj-row${m.id === currentId ? " cur" : ""}`}>
                    <button className="proj-main" onClick={() => void openProject(m.id)}>
                      <b>{m.name}</b>
                      <small>
                        {ago(m.updated)}, {d?.duration ?? 0} dtk, {d?.ratio ?? "16:9"}, {d?.layers.length ?? 0} layer
                      </small>
                    </button>
                    <button className="icon-btn sm" aria-label={`Ganti nama ${m.name}`} onClick={() => renameProject(m.id)}>
                      <Icon name="pencil" size={16} />
                    </button>
                    <button className="icon-btn sm" aria-label={`Gandakan ${m.name}`} onClick={() => duplicateProject(m.id)}>
                      <Icon name="copy" size={16} />
                    </button>
                    <button className="icon-btn sm" aria-label={`Hapus ${m.name}`} onClick={() => void deleteProject(m.id)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="sheet-backdrop" onClick={() => setExportOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Ekspor dan proyek" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2 style={{ fontFamily: "var(--font-brand)", fontSize: 18 }}>Ekspor dan proyek</h2>
              <button className="icon-btn sm" aria-label="Tutup" onClick={() => setExportOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div>
              <h3>Data untuk ekspor</h3>
              <p className="hint">
                Salin, lalu tempel ke kolom project di workflow Render Video, dan pilih kualitas 2K, 1080p, atau 720p
                di sana. Unggah dulu file gambar, video, dan audio asli ke folder media di repo dengan nama yang sama
                persis, tanpa spasi.
              </p>
              <textarea ref={exportRef} className="input" readOnly rows={4} value={exportJson} />
              <button className="btn primary" style={{ marginTop: 10 }} onClick={copyExport}>
                <Icon name={copied ? "check" : "copy"} size={18} />
                {copied ? "Tersalin" : "Salin data"}
              </button>
            </div>

            <div>
              <h3>Buat proyek dari data</h3>
              <p className="hint">Tempel data yang pernah disalin. Hasilnya menjadi proyek baru di daftar Proyek.</p>
              <textarea
                className="input"
                rows={3}
                placeholder="Tempel data proyek di sini"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <button className="btn" style={{ marginTop: 10 }} onClick={importProject} disabled={!importText.trim()}>
                Buat proyek
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
