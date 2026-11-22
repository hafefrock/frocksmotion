import { useState } from "react";
import { Player } from "@remotion/player";
import { Video } from "./Video";

const FULL_W = 2560;
const FULL_H = 1440;
const PREVIEW_H = 360; // live preview 360p
const previewScale = PREVIEW_H / FULL_H; // 0.25

export const App: React.FC = () => {
  const [title, setTitle] = useState("Halo Remotion");

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <Player
        component={Video}
        inputProps={{ title, scale: previewScale }}
        durationInFrames={150}
        fps={30}
        compositionWidth={Math.round(FULL_W * previewScale)}
        compositionHeight={PREVIEW_H}
        style={{ width: "100%", borderRadius: 8 }}
        controls
        loop
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Teks judul"
        style={{ padding: 12, fontSize: 16, borderRadius: 8, border: "1px solid #334155", background: "#111827", color: "inherit" }}
      />
      <small style={{ opacity: 0.7 }}>
        Preview 360p. Ekspor 2K / 1080p / 720p lewat GitHub Actions (workflow "Render Video").
      </small>
    </div>
  );
};
