import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export type VideoProps = { title: string; scale: number };

// Desain selalu dalam ukuran 2560x1440. `scale` hanya mengecilkan hasil gambar
// (dipakai untuk live preview 480p). Ekspor 1080p/720p memakai --scale dari CLI.
export const Video: React.FC<VideoProps> = ({ title, scale }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const y = interpolate(frame, [0, 30], [80, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <div
        style={{
          width: 2560,
          height: 1440,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          flexShrink: 0,
          background: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            color: "white",
            fontSize: 160,
            fontFamily: "system-ui, sans-serif",
            opacity,
            transform: `translateY(${y}px)`,
          }}
        >
          {title}
        </h1>
      </div>
    </AbsoluteFill>
  );
};
