import { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { fontOf } from "./fonts";
import { FPS, FULL_H, FULL_W, Layer, TextLayer, VisualLayer, isVisual } from "./types";

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const SNAP = 24; // jarak tarik ke garis tengah (koordinat 2K)

let measureCtx: CanvasRenderingContext2D | null = null;
const measureText = (l: TextLayer) => {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  const f = fontOf(l.font);
  let w = l.size * 2;
  if (measureCtx) {
    measureCtx.font = `${f.weight} ${l.size}px ${f.family}`;
    w = Math.max(...l.text.split("\n").map((line) => measureCtx!.measureText(line).width));
  }
  return { w: Math.min(Math.max(w, l.size), FULL_W * 0.9), h: l.text.split("\n").length * l.size * 1.15 };
};

// Kotak pembatas layer di koordinat 2K
const boxOf = (l: VisualLayer) =>
  l.type === "text" ? measureText(l) : { w: l.width, h: l.width * (l.aspect ?? 9 / 16) };

type Gesture =
  | { mode: "move"; id: string; startX: number; startY: number; x0: number; y0: number }
  | { mode: "pinch"; id: string; dist0: number; size0: number };

// Lapisan di atas preview: ketuk untuk memilih, seret untuk memindah, cubit untuk mengubah ukuran
export const PreviewOverlay: React.FC<{
  layers: Layer[];
  selectedId: string;
  playerRef: React.RefObject<PlayerRef>;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Record<string, unknown>, key: string) => void;
}> = ({ layers, selectedId, playerRef, onSelect, onChange }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [frame, setFrame] = useState(0);
  const [guides, setGuides] = useState({ v: false, h: false });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const s = width / FULL_W;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    setWidth(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener("frameupdate", onFrame);
    return () => p.removeEventListener("frameupdate", onFrame);
  }, [playerRef]);

  const visibleAt = (l: Layer, t: number): l is VisualLayer => isVisual(l) && t >= l.start && t < l.start + l.duration;

  const toCanvas = (e: React.PointerEvent) => {
    const rect = rootRef.current!.getBoundingClientRect();
    return { px: (e.clientX - rect.left) / s, py: (e.clientY - rect.top) / s };
  };

  const hit = (l: VisualLayer, px: number, py: number, pad = 0) => {
    const b = boxOf(l);
    return Math.abs(px - l.x) <= b.w / 2 + pad && Math.abs(py - l.y) <= b.h / 2 + pad;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    rootRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const t = (playerRef.current?.getCurrentFrame() ?? 0) / FPS;
    const selected = layers.find((l) => l.id === selectedId);

    if (pointers.current.size === 2 && selected && visibleAt(selected, t)) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        mode: "pinch",
        id: selected.id,
        dist0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        size0: selected.type === "text" ? selected.size : selected.width,
      };
      return;
    }
    if (pointers.current.size > 1) return;

    const { px, py } = toCanvas(e);
    let target: VisualLayer | undefined;
    if (selected && visibleAt(selected, t) && hit(selected, px, py, 30)) target = selected;
    else {
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (visibleAt(l, t) && hit(l, px, py)) {
          target = l;
          break;
        }
      }
    }
    if (!target) {
      onSelect("");
      gesture.current = null;
      return;
    }
    if (target.id !== selectedId) onSelect(target.id);
    gesture.current = { mode: "move", id: target.id, startX: e.clientX, startY: e.clientY, x0: target.x, y0: target.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.mode === "move" && pointers.current.size === 1) {
      let x = clamp(Math.round(g.x0 + (e.clientX - g.startX) / s), 0, FULL_W);
      let y = clamp(Math.round(g.y0 + (e.clientY - g.startY) / s), 0, FULL_H);
      const snapX = Math.abs(x - FULL_W / 2) < SNAP;
      const snapY = Math.abs(y - FULL_H / 2) < SNAP;
      if (snapX) x = FULL_W / 2;
      if (snapY) y = FULL_H / 2;
      setGuides({ v: snapX, h: snapY });
      onChange(g.id, { x, y }, `pdrag:${g.id}`);
    } else if (g.mode === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const ratio = (Math.hypot(a.x - b.x, a.y - b.y) || 1) / g.dist0;
      const layer = layers.find((l) => l.id === g.id);
      if (layer?.type === "text") {
        onChange(g.id, { size: clamp(Math.round((g.size0 * ratio) / 5) * 5, 20, 800) }, `pinch:${g.id}`);
      } else if (layer?.type === "media") {
        onChange(g.id, { width: clamp(Math.round((g.size0 * ratio) / 10) * 10, 100, 5120) }, `pinch:${g.id}`);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && gesture.current?.mode === "pinch") gesture.current = null;
    if (pointers.current.size === 0) {
      gesture.current = null;
      setGuides({ v: false, h: false });
    }
  };

  const t = frame / FPS;
  const sel = layers.find((l) => l.id === selectedId);
  const box = sel && visibleAt(sel, t) ? { l: sel, b: boxOf(sel) } : null;

  return (
    <div
      ref={rootRef}
      className="pv-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {guides.v && <div className="pv-guide v" />}
      {guides.h && <div className="pv-guide h" />}
      {box && (
        <div
          className="pv-box"
          style={{
            left: (box.l.x - box.b.w / 2) * s,
            top: (box.l.y - box.b.h / 2) * s,
            width: box.b.w * s,
            height: box.b.h * s,
          }}
        >
          <i className="tl" />
          <i className="tr" />
          <i className="bl" />
          <i className="br" />
        </div>
      )}
    </div>
  );
};
