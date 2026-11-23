import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { FPS, FULL_H, FULL_W, Project, TextLayer } from "./types";

export type VideoProps = { project: Project; scale: number };

const Layer: React.FC<{ layer: TextLayer }> = ({ layer }) => {
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

// Desain selalu di kanvas 2560x1440. `scale` mengecilkan hasil gambar
// (live preview 360p). Ekspor 1080p/720p memakai --scale dari CLI.
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
          <Layer layer={l} />
        </Sequence>
      ))}
    </div>
  </AbsoluteFill>
);
