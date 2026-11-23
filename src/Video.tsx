import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { FPS, FULL_H, FULL_W, Layer, MediaLayer, Project, TextLayer } from "./types";

export type VideoProps = { project: Project; scale: number };

const TextItem: React.FC<{ layer: TextLayer }> = ({ layer }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const dy = interpolate(frame, [0, 15], [40, 0], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: layer.x,
        top: layer.y,
        transform: `translate(-50%, calc(-50% + ${dy}px))`,
        opacity,
        color: layer.color,
        fontSize: layer.size,
        fontFamily: "system-ui, sans-serif",
        fontWeight: 700,
        textAlign: "center",
        whiteSpace: "pre-wrap",
      }}
    >
      {layer.text}
    </div>
  );
};

const MediaItem: React.FC<{ layer: MediaLayer }> = ({ layer }) => {
  // Di hp: pakai alamat sementara (src). Saat ekspor: pakai file di folder media/ repo.
  const src = layer.src ?? staticFile(layer.name);
  const style: React.CSSProperties = {
    position: "absolute",
    left: layer.x,
    top: layer.y,
    transform: "translate(-50%, -50%)",
    width: layer.width,
    height: "auto",
  };
  if (layer.kind === "image") {
    return <Img src={src} style={style} />;
  }
  return <OffthreadVideo src={src} startFrom={Math.round(layer.trim * FPS)} style={style} />;
};

const Item: React.FC<{ layer: Layer }> = ({ layer }) =>
  layer.type === "text" ? <TextItem layer={layer} /> : <MediaItem layer={layer} />;

// Desain selalu di kanvas 2560x1440. `scale` mengecilkan hasil gambar
// (live preview 360p). Ekspor 1080p/720p memakai --scale dari CLI.
// Urutan layer: yang pertama di daftar ada paling bawah.
export const Video: React.FC<VideoProps> = ({ project, scale }) => (
  <AbsoluteFill>
    <div
      style={{
        position: "relative",
        width: FULL_W,
        height: FULL_H,
        flexShrink: 0,
        overflow: "hidden",
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
      }}
    >
      {project.layers.map((l) => (
        <Sequence
          key={l.id}
          from={Math.round(l.start * FPS)}
          durationInFrames={Math.max(1, Math.round(l.duration * FPS))}
          layout="none"
        >
          <Item layer={l} />
        </Sequence>
      ))}
    </div>
  </AbsoluteFill>
);
