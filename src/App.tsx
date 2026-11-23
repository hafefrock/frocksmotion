import { useState } from "react";
import { Player } from "@remotion/player";
import { Video } from "./Video";
import { FPS, FULL_H, FULL_W, Layer, MediaLayer, Project, TextLayer, defaultProject } from "./types";

const PREVIEW_H = 360; // live preview 360p
const previewScale = PREVIEW_H / FULL_H; // 0.25

const uid = () => Math.random().toString(36).slice(2, 9);
const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);

const box: React.CSSProperties = {
  padding: 10,
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#111827",
  color: "inherit",
  width: "100%",
  boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  background: "#3b82f6",
  color: "white",
  fontSize: 15,
};

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => (
  <label style={{ display: "block", fontSize: 14 }}>
    {label}: <b>{value}</b>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: "100%" }}
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

const chipLabel = (l: Layer, i: number) =>
  l.type === "text"
    ? `${i + 1}. T ${l.text.slice(0, 10) || "(kosong)"}`
    : `${i + 1}. ${l.kind === "video" ? "▶" : "🖼"} ${l.name.slice(0, 12)}`;

export const App: React.FC = () => {
  const [project, setProject] = useState<Project>(defaultProject);
  const [selectedId, setSelectedId] = useState(defaultProject.layers[0].id);
  const selected = project.layers.find((l) => l.id === selectedId);

  const updateLayer = (patch: Record<string, unknown>) =>
    setProject((p) => ({
      ...p,
      layers: p.layers.map((l) => (l.id === selectedId ? ({ ...l, ...patch } as Layer) : l)),
    }));

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
  };

  const addMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const added: MediaLayer[] = [];
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const isVideo = f.type.startsWith("video/");
      const mediaDuration = isVideo ? await readVideoDuration(url) : undefined;
      added.push({
        type: "media",
        id: uid(),
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
  };

  const removeLayer = () => {
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

  // alamat sementara (src) tidak ikut diekspor
  const exportJson = JSON.stringify(project, (k, v) => (k === "src" ? undefined : v));

  return (
    <div
      style={{
        padding: 12,
        paddingTop: "max(36px, env(safe-area-inset-top, 0px))",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Player
        component={Video}
        inputProps={{ project, scale: previewScale }}
        durationInFrames={Math.max(1, Math.round(project.duration * FPS))}
        fps={FPS}
        compositionWidth={Math.round(FULL_W * previewScale)}
        compositionHeight={PREVIEW_H}
        style={{ width: "100%", borderRadius: 8 }}
        controls
        loop
      />

      <Slider
        label="Durasi video (detik)"
        value={project.duration}
        min={1}
        max={60}
        onChange={(v) => setProject((p) => ({ ...p, duration: v }))}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {project.layers.map((l, i) => (
          <button
            key={l.id}
            onClick={() => setSelectedId(l.id)}
            style={{ ...btn, background: l.id === selectedId ? "#3b82f6" : "#1f2937" }}
          >
            {chipLabel(l, i)}
          </button>
        ))}
        <button onClick={addText} style={{ ...btn, background: "#059669" }}>
          + Teks
        </button>
        <label style={{ ...btn, background: "#059669", display: "inline-block" }}>
          + Gambar/Video
          <input type="file" accept="image/*,video/*" multiple onChange={addMedia} style={{ display: "none" }} />
        </label>
      </div>

      {selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => moveLayer(-1)} style={{ ...btn, background: "#1f2937" }}>
              ◀ Ke bawah
            </button>
            <button onClick={() => moveLayer(1)} style={{ ...btn, background: "#1f2937" }}>
              Ke atas ▶
            </button>
          </div>

          {selected.type === "text" ? (
            <>
              <textarea
                value={selected.text}
                onChange={(e) => updateLayer({ text: e.target.value })}
                rows={2}
                style={box}
              />
              <Slider label="Ukuran huruf" value={selected.size} min={30} max={400} step={5} onChange={(v) => updateLayer({ size: v })} />
              <label style={{ fontSize: 14 }}>
                Warna:{" "}
                <input type="color" value={selected.color} onChange={(e) => updateLayer({ color: e.target.value })} />
              </label>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14 }}>
                File: <b>{selected.name}</b> ({selected.kind === "video" ? "video" : "gambar"})
              </div>
              <Slider label="Lebar" value={selected.width} min={100} max={FULL_W} step={20} onChange={(v) => updateLayer({ width: v })} />
              {selected.kind === "video" && (
                <Slider
                  label="Potong awal klip (detik)"
                  value={selected.trim}
                  min={0}
                  max={Math.max(0, Math.floor((selected.mediaDuration ?? 5) * 2) / 2)}
                  step={0.5}
                  onChange={(v) => updateLayer({ trim: v })}
                />
              )}
            </>
          )}

          <Slider label="Posisi X" value={selected.x} min={0} max={FULL_W} step={10} onChange={(v) => updateLayer({ x: v })} />
          <Slider label="Posisi Y" value={selected.y} min={0} max={FULL_H} step={10} onChange={(v) => updateLayer({ y: v })} />
          <Slider label="Mulai (detik)" value={selected.start} min={0} max={project.duration} step={0.5} onChange={(v) => updateLayer({ start: v })} />
          <Slider label="Lama tampil (detik)" value={selected.duration} min={0.5} max={project.duration} step={0.5} onChange={(v) => updateLayer({ duration: v })} />

          <button onClick={removeLayer} style={{ ...btn, background: "#b91c1c" }}>
            Hapus layer ini
          </button>
        </div>
      )}

      <details>
        <summary style={{ fontSize: 15 }}>Data proyek untuk ekspor</summary>
        <p style={{ fontSize: 13, opacity: 0.75 }}>
          Tekan lama kotak di bawah, pilih Salin, lalu tempel ke kolom "project" di workflow Render Video.
          Kalau ada gambar/video, unggah dulu file aslinya ke folder media/ di repo dengan nama yang sama persis
          (hindari spasi di nama file).
        </p>
        <textarea readOnly value={exportJson} rows={6} style={{ ...box, fontSize: 12 }} />
      </details>

      <small style={{ opacity: 0.7 }}>Preview 360p. Ekspor 2K / 1080p / 720p lewat GitHub Actions.</small>
    </div>
  );
};
