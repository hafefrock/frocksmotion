import { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { Icon } from "./icons";
import { FPS, Layer } from "./types";

const ZOOMS = [30, 60, 100, 160]; // piksel per detik

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export const kindClass = (l: Layer) => (l.type === "text" ? "k-text" : l.kind === "video" ? "k-video" : "k-image");
export const layerName = (l: Layer) => (l.type === "text" ? l.text.split("\n")[0] || "(teks kosong)" : l.name);

// Garis penanda posisi putar. Dipisah supaya hanya bagian ini yang digambar ulang tiap frame.
const Playhead: React.FC<{ playerRef: React.RefObject<PlayerRef>; pps: number }> = ({ playerRef, pps }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
  }, [playerRef]);
  return <div className="tl-playhead" style={{ left: (frame / FPS) * pps }} />;
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
    <div className="tl">
      <div className="tl-scroll">
        <div
          className="tl-track"
          style={{ width: duration * pps + 40, minWidth: "100%" }}
          onPointerMove={onTrackMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className="tl-ruler"
            style={{ width: duration * pps }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              seekFromEvent(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0 && !drag.current) seekFromEvent(e);
            }}
          >
            {ticks.map((i) => (
              <div key={i} className="tl-tick" style={{ left: i * pps }}>
                {i % labelEvery === 0 ? `${i}s` : ""}
              </div>
            ))}
          </div>

          {layers.length === 0 && <div className="tl-empty">Belum ada layer. Tambahkan teks atau gambar/video.</div>}

          {layers.map((l) => (
            <div key={l.id} className="tl-row">
              <div
                className={`tl-bar ${kindClass(l)}${l.id === selectedId ? " sel" : ""}`}
                style={{ left: l.start * pps, width: Math.max(26, l.duration * pps) }}
                onPointerDown={(e) => startDrag(e, l, "move")}
              >
                {layerName(l)}
                <div className="tl-handle" onPointerDown={(e) => startDrag(e, l, "resize")} />
              </div>
            </div>
          ))}

          <Playhead playerRef={playerRef} pps={pps} />
        </div>
      </div>

      <div className="section-head">
        <p className="tl-hint">Geser batang untuk pindah. Tarik ujung kanan untuk durasi.</p>
        <div className="row">
          <button className="icon-btn sm" aria-label="Perkecil timeline" onClick={() => zoom(-1)}>
            <Icon name="minus" size={18} />
          </button>
          <button className="icon-btn sm" aria-label="Perbesar timeline" onClick={() => zoom(1)}>
            <Icon name="plus" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
