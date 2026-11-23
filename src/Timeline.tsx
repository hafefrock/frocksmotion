import { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { FPS, Layer } from "./types";

const ZOOMS = [30, 60, 100, 160]; // piksel per detik
const ROW_H = 34;
const RULER_H = 26;

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

const label = (l: Layer) =>
  l.type === "text" ? `T ${l.text || "(kosong)"}` : `${l.kind === "video" ? "▶" : "🖼"} ${l.name}`;

const barColor = (l: Layer) =>
  l.type === "text" ? "#3b82f6" : l.kind === "video" ? "#7c3aed" : "#059669";

// Garis merah penanda posisi putar. Terpisah supaya hanya bagian ini yang digambar ulang tiap frame.
const Playhead: React.FC<{ playerRef: React.RefObject<PlayerRef>; pps: number }> = ({ playerRef, pps }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
  }, [playerRef]);
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: (frame / FPS) * pps,
        width: 2,
        background: "#f87171",
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
};

type Drag = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  start: number;
  duration: number;
  last: number;
};

export const Timeline: React.FC<{
  layers: Layer[];
  duration: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Record<string, unknown>) => void;
  playerRef: React.RefObject<PlayerRef>;
}> = ({ layers, duration, selectedId, onSelect, onChange, playerRef }) => {
  const [pps, setPps] = useState(60);
  const drag = useRef<Drag | null>(null);

  const zoom = (dir: -1 | 1) => {
    const i = ZOOMS.indexOf(pps);
    setPps(ZOOMS[clamp(i + dir, 0, ZOOMS.length - 1)]);
  };

  const seekFromEvent = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sec = clamp((e.clientX - rect.left) / pps, 0, duration);
    const frame = clamp(Math.round(sec * FPS), 0, Math.max(0, Math.round(duration * FPS) - 1));
    playerRef.current?.seekTo(frame);
  };

  const startDrag = (e: React.PointerEvent, l: Layer, mode: Drag["mode"]) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(l.id);
    drag.current = {
      id: l.id,
      mode,
      startX: e.clientX,
      start: l.start,
      duration: l.duration,
      last: mode === "move" ? l.start : l.duration,
    };
  };

  const onTrackMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / pps;
    if (d.mode === "move") {
      const v = round1(clamp(d.start + dx, 0, Math.max(0, duration - d.duration)));
      if (v !== d.last) {
        d.last = v;
        onChange(d.id, { start: v });
      }
    } else {
      const v = round1(clamp(d.duration + dx, 0.5, Math.max(0.5, duration - d.start)));
      if (v !== d.last) {
        d.last = v;
        onChange(d.id, { duration: v });
      }
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const labelEvery = pps < 50 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, fontSize: 14 }}>
        <span style={{ flex: 1 }}>
          Timeline <small style={{ opacity: 0.7 }}>(geser batang = pindah, ujung kanan = durasi, ketuk penggaris = loncat)</small>
        </span>
        <button onClick={() => zoom(-1)} style={zoomBtn}>
          −
        </button>
        <button onClick={() => zoom(1)} style={zoomBtn}>
          +
        </button>
      </div>

      <div style={{ overflow: "auto", maxHeight: 250, border: "1px solid #334155", borderRadius: 8, background: "#0f172a" }}>
        <div
          style={{ position: "relative", width: duration * pps + 40 }}
          onPointerMove={onTrackMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            style={{ position: "relative", height: RULER_H, width: duration * pps, touchAction: "none", borderBottom: "1px solid #334155" }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              seekFromEvent(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0 && !drag.current) seekFromEvent(e);
            }}
          >
            {ticks.map((i) => (
              <div
                key={i}
                style={{ position: "absolute", left: i * pps, top: 0, bottom: 0, borderLeft: "1px solid #475569", fontSize: 11, paddingLeft: 3, color: "#94a3b8", pointerEvents: "none" }}
              >
                {i % labelEvery === 0 ? `${i}s` : ""}
              </div>
            ))}
          </div>

          {layers.map((l) => (
            <div key={l.id} style={{ position: "relative", height: ROW_H, margin: "4px 0" }}>
              <div
                onPointerDown={(e) => startDrag(e, l, "move")}
                style={{
                  position: "absolute",
                  left: l.start * pps,
                  width: Math.max(14, l.duration * pps),
                  top: 0,
                  bottom: 0,
                  background: barColor(l),
                  borderRadius: 6,
                  border: l.id === selectedId ? "2px solid #fde047" : "2px solid transparent",
                  boxSizing: "border-box",
                  touchAction: "none",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  fontSize: 12,
                  lineHeight: `${ROW_H - 4}px`,
                  paddingLeft: 6,
                  paddingRight: 22,
                  color: "white",
                }}
              >
                {label(l)}
                <div
                  onPointerDown={(e) => startDrag(e, l, "resize")}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 20,
                    background: "rgba(255,255,255,0.35)",
                    touchAction: "none",
                  }}
                />
              </div>
            </div>
          ))}

          <Playhead playerRef={playerRef} pps={pps} />
        </div>
      </div>
    </div>
  );
};

const zoomBtn: React.CSSProperties = {
  width: 38,
  height: 34,
  borderRadius: 8,
  border: "none",
  background: "#1f2937",
  color: "white",
  fontSize: 18,
};
