import { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fontOf, loadAllFonts } from "./fonts";
import {
  Anim,
  AudioLayer,
  DEFAULT_BG,
  FPS,
  FULL_H,
  FULL_W,
  Layer,
  MediaLayer,
  Project,
  TextLayer,
} from "./types";

export type VideoProps = { project: Project; scale: number };

const IN_FRAMES = 15; // lama animasi masuk
const OUT_FRAMES = 12; // lama pudar di akhir

const animStyle = (anim: Anim, frame: number, fps: number, durFrames: number, out: boolean): React.CSSProperties => {
  const p = interpolate(frame, [0, IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  let opacity = 1;
  let tx = 0;
  let ty = 0;
  let scale = 1;

  if (anim === "fade") opacity = p;
  else if (anim === "slideUp") {
    opacity = p;
    ty = (1 - p) * 70;
  } else if (anim === "slideLeft") {
    opacity = p;
    tx = -(1 - p) * 220;
  } else if (anim === "zoom") {
    opacity = p;
    scale = 0.6 + 0.4 * p;
  } else if (anim === "pop") {
    const s = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
    scale = 0.3 + 0.7 * s;
    opacity = Math.min(1, frame / 4);
  }

  if (out) {
    opacity *= interpolate(frame, [durFrames - OUT_FRAMES, durFrames], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }
  return { opacity, transform: `translate(${tx}px, ${ty}px) scale(${scale})` };
};

const TextItem: React.FC<{ layer: TextLayer; durFrames: number }> = ({ layer, durFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const font = fontOf(layer.font);
  return (
    <div style={{ position: "absolute", left: layer.x, top: layer.y, transform: "translate(-50%, -50%)" }}>
      <div
        style={{
          ...animStyle(layer.anim ?? "slideUp", frame, fps, durFrames, !!layer.animOut),
          width: "max-content",
          maxWidth: FULL_W * 0.9,
          color: layer.color,
          fontSize: layer.size,
          fontFamily: font.family,
          fontWeight: font.weight,
          lineHeight: 1.15,
          textAlign: "center",
          whiteSpace: "pre-wrap",
        }}
      >
        {layer.text}
      </div>
    </div>
  );
};

const MediaItem: React.FC<{ layer: MediaLayer; durFrames: number }> = ({ layer, durFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Di hp: pakai alamat sementara (src). Saat ekspor: pakai file di folder media/ repo.
  const src = layer.src ?? staticFile(layer.name);
  const fill: React.CSSProperties = { width: "100%", height: "auto", display: "block" };
  return (
    <div style={{ position: "absolute", left: layer.x, top: layer.y, width: layer.width, transform: "translate(-50%, -50%)" }}>
      <div style={animStyle(layer.anim ?? "none", frame, fps, durFrames, !!layer.animOut)}>
        {layer.kind === "image" ? (
          <Img src={src} style={fill} />
        ) : (
          <OffthreadVideo src={src} startFrom={Math.round(layer.trim * FPS)} volume={layer.volume ?? 1} style={fill} />
        )}
      </div>
    </div>
  );
};

const AudioItem: React.FC<{ layer: AudioLayer }> = ({ layer }) => (
  <Audio src={layer.src ?? staticFile(layer.name)} startFrom={Math.round(layer.trim * FPS)} volume={layer.volume} />
);

const Item: React.FC<{ layer: Layer; durFrames: number }> = ({ layer, durFrames }) =>
  layer.type === "text" ? (
    <TextItem layer={layer} durFrames={durFrames} />
  ) : layer.type === "media" ? (
    <MediaItem layer={layer} durFrames={durFrames} />
  ) : (
    <AudioItem layer={layer} />
  );

// Tahan render sampai semua font siap, supaya hasil ekspor memakai huruf yang benar
const useFontsReady = () => {
  const [handle] = useState(() => delayRender("Memuat font"));
  useEffect(() => {
    loadAllFonts()
      .catch(() => undefined)
      .finally(() => continueRender(handle));
  }, [handle]);
};

// Desain selalu di kanvas 2560x1440. `scale` mengecilkan hasil gambar
// (live preview 360p). Ekspor 1080p/720p memakai --scale dari CLI.
// Urutan layer: yang pertama di daftar ada paling bawah.
export const Video: React.FC<VideoProps> = ({ project, scale }) => {
  useFontsReady();
  const bg = project.background ?? DEFAULT_BG;
  const background = bg.mode === "solid" ? bg.a : `linear-gradient(135deg, ${bg.a}, ${bg.b})`;

  return (
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
          background,
        }}
      >
        {project.layers.map((l) => {
          const durFrames = Math.max(1, Math.round(l.duration * FPS));
          return (
            <Sequence key={l.id} from={Math.round(l.start * FPS)} durationInFrames={durFrames} layout="none">
              <Item layer={l} durFrames={durFrames} />
            </Sequence>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
