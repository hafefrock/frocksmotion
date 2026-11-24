import { useEffect, useRef, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { FONTS } from "./fonts";
import { Icon, IconName } from "./icons";
import { probe } from "./media";
import { PreviewOverlay } from "./PreviewOverlay";
import { Timeline } from "./Timeline";
import { Video } from "./Video";
import {
  deleteFile,
  hydrateProject,
  loadSavedProject,
  parseProject,
  putFile,
  saveProject,
  serializeProject,
} from "./storage";
import {
  Anim,
  AudioLayer,
  Background,
  DEFAULT_BG,
  FPS,
  Layer,
  MediaLayer,
  Project,
  Ratio,
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

const SWATCHES = ["#FFFFFF", "#FFB84D", "#FF4F8B", "#34C6B4", "#9A8CFF", "#1F2937"];

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

const uid = () => Math.random().toString(36).slice(2, 9);
const round1 = (n: number) => Math.round(n * 10) / 10;
const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

type Panel = "edit" | "ukuran" | "posisi" | "waktu" | "durasi" | "anim" | "volume" | "latar" | "rasio" | "gaya";
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
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

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
  const [loaded, setLoaded] = useState(false);
  const [importText, setImportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const playerRef = useRef<PlayerRef>(null);
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const selected = project.layers.find((l) => l.id === selectedId);
  const activePanel: Panel | null = panel === "durasi" || panel === "latar" || panel === "rasio" || (panel && selected) ? panel : null;

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

  // ---- Muat dan simpan otomatis ----
  useEffect(() => {
    (async () => {
      const saved = loadSavedProject();
      if (saved) {
        const hydrated = await hydrateProject(saved);
        commit({ present: hydrated, past: [], future: [] });
        // gambar mini dibuat belakangan supaya app cepat terbuka
        const thumbs = new Map<string, string>();
        await Promise.all(
          hydrated.layers.map(async (l) => {
            if (l.type === "media" && l.src) {
              const meta = await probe(l.src, l.kind);
              if (meta.thumb) thumbs.set(l.id, meta.thumb);
            }
          }),
        );
        if (thumbs.size) {
          const cur = histRef.current;
          commit({
            ...cur,
            present: {
              ...cur.present,
              layers: cur.present.layers.map((l) => (l.type === "media" && thumbs.has(l.id) ? { ...l, thumb: thumbs.get(l.id) } : l)),
            },
          });
        }
      }
      setLoaded(true);
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* abaikan */
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => saveProject(project), 400);
    return () => clearTimeout(t);
  }, [project, loaded]);

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
          ? { ...l, x: Math.round(l.x * fx), y: Math.round(l.y * fy), size: Math.max(20, Math.round((l.size * fs) / 5) * 5) }
          : l.type === "media"
            ? { ...l, x: Math.round(l.x * fx), y: Math.round(l.y * fy), width: Math.max(100, Math.round((l.width * fs) / 10) * 10) }
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
      second.trim = round1(second.trim + (t - selected.start));
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
  const missingMedia = project.layers.filter((l) => l.type !== "text" && !l.src);
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

  const newProject = () => {
    if (!window.confirm("Mulai proyek baru? Proyek saat ini akan dihapus dari hp.")) return;
    project.layers.forEach((l) => {
      if (l.type !== "text") deleteFile(l.fileId ?? l.id);
    });
    commit({ present: defaultProject, past: [], future: [] });
    setSelectedId("");
    setPanel(null);
    setExportOpen(false);
  };

  const importProject = () => {
    const p = parseProject(importText);
    if (!p) {
      window.alert("Data proyek tidak valid. Pastikan yang ditempel utuh dan belum diubah.");
      return;
    }
    apply(() => p);
    setSelectedId("");
    setPanel(null);
    setImportText("");
    setExportOpen(false);
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
      ...(selected.kind === "video" ? [{ icon: "volume", label: "Volume", onClick: () => setPanel("volume") } as Tool] : []),
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
        <button className="icon-btn xs accent" aria-label="Ekspor" onClick={() => setExportOpen(true)}>
          <Icon name="export" size={18} />
        </button>
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
                  <div className="field">
                    <span className="field-row">
                      <span>Warna</span>
                    </span>
                    <div className="swatches">
                      {SWATCHES.map((c) => (
                        <button
                          key={c}
                          className="swatch"
                          aria-label={`Warna ${c}`}
                          aria-pressed={selected.color.toLowerCase() === c.toLowerCase()}
                          style={{ background: c }}
                          onClick={() => updateLayer({ color: c })}
                        />
                      ))}
                      <input
                        className="swatch-custom"
                        type="color"
                        aria-label="Warna lain"
                        value={selected.color}
                        onChange={(e) => updateLayer({ color: e.target.value })}
                      />
                    </div>
                  </div>
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
              <h3>Muat dari data</h3>
              <p className="hint">Proyek tersimpan otomatis di hp ini. Tempel data yang pernah disalin untuk memuatnya.</p>
              <textarea
                className="input"
                rows={3}
                placeholder="Tempel data proyek di sini"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <button className="btn" style={{ marginTop: 10 }} onClick={importProject} disabled={!importText.trim()}>
                Muat data
              </button>
            </div>

            <button className="btn danger" onClick={newProject}>
              <Icon name="trash" size={18} />
              Proyek baru
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
