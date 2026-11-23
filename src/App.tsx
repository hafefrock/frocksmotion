import { useEffect, useRef, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { Icon, IconName } from "./icons";
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
import { FPS, FULL_H, FULL_W, Layer, MediaLayer, Project, TextLayer, defaultProject } from "./types";

const PREVIEW_H = 360; // live preview 360p
const previewScale = PREVIEW_H / FULL_H; // 0.25

const SWATCHES = ["#FFFFFF", "#FFB84D", "#FF4F8B", "#34C6B4", "#9A8CFF", "#1F2937"];

const uid = () => Math.random().toString(36).slice(2, 9);
const round1 = (n: number) => Math.round(n * 10) / 10;
const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

type Panel = "edit" | "ukuran" | "posisi" | "waktu" | "durasi";
type Hist = { present: Project; past: Project[]; future: Project[] };

const PANEL_TITLE: Record<Panel, string> = {
  edit: "Teks",
  ukuran: "Ukuran",
  posisi: "Posisi",
  waktu: "Waktu",
  durasi: "Durasi video",
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

const readVideoDuration = (url: string): Promise<number> =>
  new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 5);
    v.onerror = () => resolve(5);
    v.src = url;
  });

type Tool = { icon: IconName; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean; file?: boolean };

export const App: React.FC = () => {
  const [hist, setHist] = useState<Hist>({ present: defaultProject, past: [], future: [] });
  const histRef = useRef(hist);
  const lastEdit = useRef({ key: "", t: 0 });
  const project = hist.present;

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
  const activePanel: Panel | null = panel === "durasi" || (panel && selected) ? panel : null;

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
      if (saved) commit({ present: await hydrateProject(saved), past: [], future: [] });
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

  const setDuration = (d: number) => {
    const next = Math.min(60, Math.max(1, d));
    apply(
      (p) => ({
        duration: next,
        layers: p.layers.map((l) => {
          const start = Math.min(l.start, Math.max(0, next - 0.5));
          return { ...l, start, duration: Math.max(0.5, Math.min(l.duration, next - start)) };
        }),
      }),
      "durasi",
    );
  };

  const addText = () => {
    const layer: TextLayer = {
      type: "text",
      id: uid(),
      text: "Teks baru",
      x: FULL_W / 2,
      y: FULL_H / 2,
      size: 120,
      color: "#ffffff",
      start: round1((playerRef.current?.getCurrentFrame() ?? 0) / FPS),
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
      const mediaDuration = isVideo ? await readVideoDuration(url) : undefined;
      added.push({
        type: "media",
        id,
        fileId: id,
        kind: isVideo ? "video" : "image",
        name: f.name,
        src: url,
        mediaDuration,
        x: FULL_W / 2,
        y: FULL_H / 2,
        width: 1280,
        trim: 0,
        start: 0,
        duration: isVideo ? Math.min(project.duration, half(mediaDuration ?? 5)) : project.duration,
      });
    }
    if (added.length === 0) return;
    apply((p) => ({ ...p, layers: [...p.layers, ...added] }));
    setSelectedId(added[added.length - 1].id);
    setPanel(null);
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
    const copy = {
      ...selected,
      id: uid(),
      x: Math.min(FULL_W, selected.x + 80),
      y: Math.min(FULL_H, selected.y + 80),
    } as Layer;
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
    const t = round1((playerRef.current?.getCurrentFrame() ?? 0) / FPS);
    const end = selected.start + selected.duration;
    if (t <= selected.start + 0.2 || t >= end - 0.2) {
      showToast("Geser garis putar ke dalam layer yang dipilih.");
      return;
    }
    const first = { ...selected, duration: round1(t - selected.start) } as Layer;
    const second = { ...selected, id: uid(), start: t, duration: round1(end - t) } as Layer;
    if (second.type === "media" && second.kind === "video") second.trim = round1(second.trim + (t - selected.start));
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
  const missingMedia = project.layers.filter((l) => l.type === "media" && !l.src);
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
      if (l.type === "media") deleteFile(l.fileId ?? l.id);
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
  const common: Tool[] = [
    { icon: "split", label: "Belah", onClick: splitLayer },
    { icon: "copy", label: "Gandakan", onClick: duplicateLayer },
    { icon: "up", label: "Naik", onClick: () => moveLayer(1), disabled: selectedIndex >= project.layers.length - 1 },
    { icon: "down", label: "Turun", onClick: () => moveLayer(-1), disabled: selectedIndex <= 0 },
    { icon: "trash", label: "Hapus", onClick: removeLayer, danger: true },
  ];

  const tools: Tool[] = !selected
    ? [
        { icon: "text", label: "Teks", onClick: addText },
        { icon: "media", label: "Media", file: true },
        { icon: "clock", label: "Durasi", onClick: () => setPanel("durasi") },
      ]
    : [
        { icon: "back", label: "Kembali", onClick: () => setSelectedId("") },
        selected.type === "text"
          ? { icon: "pencil", label: "Edit", onClick: () => setPanel("edit") }
          : { icon: "resize", label: "Ukuran", onClick: () => setPanel("ukuran") },
        { icon: "move", label: "Posisi", onClick: () => setPanel("posisi") },
        { icon: "clock", label: "Waktu", onClick: () => setPanel("waktu") },
        ...common,
      ];

  return (
    <div className="editor">
      <header className="topbar">
        <h1 className="brand">FROCKSMOTION</h1>
        <button className="btn primary sm" onClick={() => setExportOpen(true)}>
          Ekspor
        </button>
      </header>

      <div className="stage">
        <Player
          ref={playerRef}
          component={Video}
          inputProps={{ project, scale: previewScale }}
          durationInFrames={Math.max(1, Math.round(project.duration * FPS))}
          fps={FPS}
          compositionWidth={Math.round(FULL_W * previewScale)}
          compositionHeight={PREVIEW_H}
          style={{ width: "100%", display: "block" }}
          controls={false}
          clickToPlay
          allowFullscreen={false}
          loop
        />
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
            {missingMedia.length} file belum ada di hp. Pilih ulang lewat tombol Media dengan nama file yang sama.
          </div>
        )}
        <Timeline
          layers={project.layers}
          duration={project.duration}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            if (!id) setPanel(null);
          }}
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

              {activePanel === "edit" && selected?.type === "text" && (
                <>
                  <textarea
                    className="input"
                    rows={2}
                    value={selected.text}
                    onChange={(e) => updateLayer({ text: e.target.value })}
                  />
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

              {activePanel === "ukuran" && selected?.type === "media" && (
                <>
                  <div className="file-info">
                    <Icon name="media" />
                    <span>
                      {selected.name} ({selected.kind === "video" ? "video" : "gambar"})
                    </span>
                  </div>
                  <Slider label="Lebar" value={selected.width} min={100} max={FULL_W} step={20} onChange={(v) => updateLayer({ width: v })} />
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

              {activePanel === "posisi" && selected && (
                <div className="grid2">
                  <Slider label="Posisi X" value={selected.x} min={0} max={FULL_W} step={10} onChange={(v) => updateLayer({ x: v })} />
                  <Slider label="Posisi Y" value={selected.y} min={0} max={FULL_H} step={10} onChange={(v) => updateLayer({ y: v })} />
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
                  <input type="file" accept="image/*,video/*" multiple hidden onChange={addMedia} />
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
                di sana. Unggah dulu file gambar/video asli ke folder media di repo dengan nama yang sama persis,
                tanpa spasi.
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
