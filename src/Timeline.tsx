import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { Icon } from "./icons";
import { FPS, Layer } from "./types";

const ZOOMS = [30, 60, 100, 160]; // piksel per detik

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export const kindClass = (l: Layer) => (l.type === "text" ? "k-text" : l.kind === "video" ? "k-video" : "k-image");
export const layerName = (l: Layer) => (l.type === "text" ? l.text.split("\n")[0] || "(teks kosong)" : l.name);

type Drag = {
  id: string;
  mode: "move" | "left" | "right";
  startX: number;
  layer: Layer;
  last: number;
};

export const Timeline: React.FC<{
  layers: Layer[];
  duration: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Record<string, unknown>, key: string) => void;
  playerRef: React.RefObject<PlayerRef>;
}> = ({ layers, duration, selectedId, onSelect, onChange, playerRef }) => {
  const [pps, setPps] = useState(60);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(360);
  const expected = useRef(0); // posisi geser yang kita atur sendiri
  const userActive = useRef(false);
  const userTimer = useRef<number | undefined>(undefined);
  const drag = useRef<Drag | null>(null);

  // lebar area timeline, supaya waktu 0 bisa sejajar dengan garis putar di tengah
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setScroll = (x: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = x;
    expected.current = el.scrollLeft;
  };

  // Saat video diputar, timeline ikut bergeser di bawah garis putar
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      if (p.isPlaying()) setScroll((e.detail.frame / FPS) * ppsRef.current);
    };
    const onStop = () => {
      if (!userActive.current) setScroll((p.getCurrentFrame() / FPS) * ppsRef.current);
    };
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("pause", onStop);
    p.addEventListener("ended", onStop);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("pause", onStop);
      p.removeEventListener("ended", onStop);
    };
  }, [playerRef]);

  // Saat jari menggeser timeline, preview loncat ke posisi di bawah garis putar
  const onScroll = () => {
    const el = scrollRef.current;
    const p = playerRef.current;
    if (!el || !p) return;
    if (Math.abs(el.scrollLeft - expected.current) < 2) return; // geseran dari kita sendiri
    expected.current = el.scrollLeft;
    userActive.current = true;
    window.clearTimeout(userTimer.current);
    userTimer.current = window.setTimeout(() => {
      userActive.current = false;
    }, 250);
    if (p.isPlaying()) p.pause();
    const lastFrame = Math.max(0, Math.round(durationRef.current * FPS) - 1);
    p.seekTo(clamp(Math.round((el.scrollLeft / ppsRef.current) * FPS), 0, lastFrame));
  };

  const zoom = (dir: -1 | 1) => {
    const next = ZOOMS[clamp(ZOOMS.indexOf(pps) + dir, 0, ZOOMS.length - 1)];
    const t = (playerRef.current?.getCurrentFrame() ?? 0) / FPS;
    ppsRef.current = next;
    setPps(next);
    requestAnimationFrame(() => setScroll(t * next));
  };

  const startDrag = (e: React.PointerEvent, l: Layer, mode: Drag["mode"]) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      id: l.id,
      mode,
      startX: e.clientX,
      layer: l,
      last: Number.NaN,
    };
  };

  const onTrackMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const l = d.layer;
    const dx = (e.clientX - d.startX) / pps;
    const isVideo = l.type === "media" && l.kind === "video";
    const trim0 = l.type === "media" ? l.trim : 0;

    if (d.mode === "move") {
      const v = round1(clamp(l.start + dx, 0, Math.max(0, duration - l.duration)));
      if (v !== d.last) {
        d.last = v;
        onChange(d.id, { start: v }, `drag:${d.id}`);
      }
    } else if (d.mode === "right") {
      const mediaLimit = isVideo && l.type === "media" && l.mediaDuration ? l.mediaDuration - trim0 : Infinity;
      const v = round1(clamp(l.duration + dx, 0.5, Math.max(0.5, Math.min(duration - l.start, mediaLimit))));
      if (v !== d.last) {
        d.last = v;
        onChange(d.id, { duration: v }, `drag:${d.id}`);
      }
    } else {
      const minStart = isVideo ? Math.max(0, l.start - trim0) : 0;
      const v = round1(clamp(l.start + dx, minStart, l.start + l.duration - 0.5));
      if (v !== d.last) {
        d.last = v;
        const delta = v - l.start;
        const patch: Record<string, unknown> = { start: v, duration: round1(l.duration - delta) };
        if (isVideo) patch.trim = round1(Math.max(0, trim0 + delta));
        onChange(d.id, patch, `drag:${d.id}`);
      }
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const labelEvery = pps < 50 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(duration) + 1 }, (_, i) => i);

  return (
    <div className="tl-wrap">
      <div className="tl-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="tl-inner" style={{ width: duration * pps + w }}>
          <div
            className="tl-track"
            style={{ marginLeft: w / 2, width: duration * pps }}
            onPointerMove={onTrackMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={(e) => {
              const t = e.target as HTMLElement;
              if (t === e.currentTarget || t.classList.contains("tl-row")) onSelect("");
            }}
          >
            <div className="tl-ruler">
              {ticks.map((i) => (
                <div key={i} className="tl-tick" style={{ left: i * pps }}>
                  {i % labelEvery === 0 ? `${i}s` : ""}
                </div>
              ))}
            </div>

            {layers.map((l) => {
              const sel = l.id === selectedId;
              return (
                <div key={l.id} className="tl-row">
                  <div
                    className={`tl-bar ${kindClass(l)}${sel ? " sel" : ""}`}
                    style={{ left: l.start * pps, width: Math.max(sel ? 60 : 26, l.duration * pps) }}
                    onClick={() => onSelect(l.id)}
                    onPointerDown={sel ? (e) => startDrag(e, l, "move") : undefined}
                  >
                    <span className="tl-label">{layerName(l)}</span>
                    {sel && (
                      <>
                        <div className="tl-handle left" onPointerDown={(e) => startDrag(e, l, "left")} />
                        <div className="tl-handle right" onPointerDown={(e) => startDrag(e, l, "right")} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="tl-playhead" />
      {layers.length === 0 && <div className="tl-empty">Belum ada layer. Tambahkan teks atau gambar/video dari toolbar di bawah.</div>}

      <div className="tl-zoom">
        <button className="icon-btn sm" aria-label="Perkecil timeline" onClick={() => zoom(-1)}>
          <Icon name="minus" size={18} />
        </button>
        <button className="icon-btn sm" aria-label="Perbesar timeline" onClick={() => zoom(1)}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
};
