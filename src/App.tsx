import { useEffect, useRef, useState } from "react";
import { Player, PlayerRef } from "@remotion/player";
import { Icon } from "./icons";
import { Timeline, kindClass, layerName } from "./Timeline";
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
const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

type Tab = "isi" | "posisi" | "waktu";

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

const readVideoDuration = (url: string): Promise<number> =>
  new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 5);
    v.onerror = () => resolve(5);
    v.src = url;
  });

export const App: React.FC = () => {
  const [project, setProject] = useState<Project>(defaultProject);
  const [selectedId, setSelectedId] = useState(defaultProject.layers[0].id);
  const playerRef = useRef<PlayerRef>(null);
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [importText, setImportText] = useState("");
  const [tab, setTab] = useState<Tab>("isi");
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const selected = project.layers.find((l) => l.id === selectedId);

  // Muat proyek tersimpan saat app dibuka
  useEffect(() => {
    (async () => {
      const saved = loadSavedProject();
      if (saved) {
        const hydrated = await hydrateProject(saved);
        setProject(hydrated);
        setSelectedId(hydrated.layers[0]?.id ?? "");
      }
      setLoaded(true);
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* abaikan */
      }
    })();
  }, []);

  // Simpan otomatis setiap ada perubahan
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => saveProject(project), 400);
    return () => clearTimeout(t);
  }, [project, loaded]);

  const patchLayer = (id: string, patch: Record<string, unknown>) =>
    setProject((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
    }));

  const updateLayer = (patch: Record<string, unknown>) => patchLayer(selectedId, patch);

  const setDuration = (d: number) => {
    const next = Math.min(60, Math.max(1, d));
    setProject((p) => ({
      duration: next,
      layers: p.layers.map((l) => {
        const start = Math.min(l.start, Math.max(0, next - 0.5));
        return { ...l, start, duration: Math.max(0.5, Math.min(l.duration, next - start)) };
      }),
    }));
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
      start: 0,
      duration: project.duration,
    };
    setProject((p) => ({ ...p, layers: [...p.layers, layer] }));
    setSelectedId(layer.id);
    setTab("isi");
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
    setProject((p) => ({ ...p, layers: [...p.layers, ...added] }));
    setSelectedId(added[added.length - 1].id);
    setTab("isi");
  };

  const removeLayer = () => {
    if (selected?.type === "media") deleteFile(selected.id);
    const rest = project.layers.filter((l) => l.id !== selectedId);
    setProject((p) => ({ ...p, layers: rest }));
    setSelectedId(rest[0]?.id ?? "");
  };

  const moveLayer = (dir: -1 | 1) =>
    setProject((p) => {
      const i = p.layers.findIndex((l) => l.id === selectedId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.layers.length) return p;
      const layers = [...p.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...p, layers };
    });

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
      if (l.type === "media") deleteFile(l.id);
    });
    setProject(defaultProject);
    setSelectedId(defaultProject.layers[0].id);
    setMenuOpen(false);
  };

  const importProject = () => {
    const p = parseProject(importText);
    if (!p) {
      window.alert("Data proyek tidak valid. Pastikan yang ditempel utuh dan belum diubah.");
      return;
    }
    setProject(p);
    setSelectedId(p.layers[0]?.id ?? "");
    setImportText("");
    setMenuOpen(false);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">FROCKSMOTION</h1>
        <button className="icon-btn" aria-label="Menu proyek" onClick={() => setMenuOpen(true)}>
          <Icon name="more" />
        </button>
      </header>

      <section>
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
            controls
            showVolumeControls={false}
            loop
          />
        </div>
      </section>

      <div className="meta">
        <span>Preview 360p</span>
        <div className="stepper">
          <span>Durasi</span>
          <button className="icon-btn sm" aria-label="Kurangi durasi" onClick={() => setDuration(project.duration - 1)}>
            <Icon name="minus" size={18} />
          </button>
          <output>{project.duration} dtk</output>
          <button className="icon-btn sm" aria-label="Tambah durasi" onClick={() => setDuration(project.duration + 1)}>
            <Icon name="plus" size={18} />
          </button>
        </div>
      </div>

      <section className="tl" style={{ display: "grid", gap: 12 }}>
        <div className="section-head">
          <h2>Layer</h2>
          <div className="row">
            <button className="btn primary" onClick={addText}>
              <Icon name="plus" size={18} />
              Teks
            </button>
            <label className="btn">
              <Icon name="media" size={18} />
              Media
              <input type="file" accept="image/*,video/*" multiple hidden onChange={addMedia} />
            </label>
          </div>
        </div>

        {missingMedia.length > 0 && (
          <div className="banner">
            {missingMedia.length} file belum ada di hp. Pilih ulang lewat tombol Media dengan nama file yang sama.
          </div>
        )}

        <Timeline
          layers={project.layers}
          duration={project.duration}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChange={patchLayer}
          playerRef={playerRef}
        />
      </section>

      {selected && (
        <section className="panel">
          <div className="panel-head">
            <div className="panel-title">
              <span className={`dot ${kindClass(selected)}`} />
              <span className="name">{layerName(selected)}</span>
            </div>
            <div className="row">
              <button
                className="icon-btn sm"
                aria-label="Naikkan urutan layer"
                disabled={selectedIndex >= project.layers.length - 1}
                onClick={() => moveLayer(1)}
              >
                <Icon name="up" size={18} />
              </button>
              <button
                className="icon-btn sm"
                aria-label="Turunkan urutan layer"
                disabled={selectedIndex <= 0}
                onClick={() => moveLayer(-1)}
              >
                <Icon name="down" size={18} />
              </button>
              <button className="icon-btn sm" aria-label="Hapus layer" onClick={removeLayer}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          </div>

          <div className="tabs" role="tablist">
            {(["isi", "posisi", "waktu"] as Tab[]).map((t) => (
              <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === "isi" ? "Isi" : t === "posisi" ? "Posisi" : "Waktu"}
              </button>
            ))}
          </div>

          <div className="panel-body">
            {tab === "isi" && selected.type === "text" && (
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

            {tab === "isi" && selected.type === "media" && (
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

            {tab === "posisi" && (
              <div className="grid2">
                <Slider label="Posisi X" value={selected.x} min={0} max={FULL_W} step={10} onChange={(v) => updateLayer({ x: v })} />
                <Slider label="Posisi Y" value={selected.y} min={0} max={FULL_H} step={10} onChange={(v) => updateLayer({ y: v })} />
              </div>
            )}

            {tab === "waktu" && (
              <div className="grid2">
                <Slider label="Mulai" unit=" dtk" value={selected.start} min={0} max={project.duration} step={0.5} onChange={(v) => updateLayer({ start: v })} />
                <Slider label="Lama tampil" unit=" dtk" value={selected.duration} min={0.5} max={project.duration} step={0.5} onChange={(v) => updateLayer({ duration: v })} />
              </div>
            )}
          </div>
        </section>
      )}

      {menuOpen && (
        <div className="sheet-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="sheet" role="dialog" aria-label="Proyek" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <h2 style={{ fontFamily: "var(--font-brand)", fontSize: 18 }}>Proyek</h2>
              <button className="icon-btn sm" aria-label="Tutup" onClick={() => setMenuOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div>
              <h3>Data untuk ekspor</h3>
              <p className="hint">
                Salin, lalu tempel ke kolom project di workflow Render Video. Unggah dulu file gambar/video asli ke
                folder media di repo dengan nama yang sama persis, tanpa spasi.
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
