export const FULL_W = 2560;
export const FULL_H = 1440;
export const FPS = 30;

export type Anim = "none" | "fade" | "slideUp" | "slideLeft" | "zoom" | "pop";
export type FontId = "manrope" | "syne" | "playfair" | "bebas" | "caveat" | "mono";

export type TextLayer = {
  type: "text";
  id: string;
  text: string;
  x: number; // posisi tengah, koordinat 2K (0..2560)
  y: number; // posisi tengah, koordinat 2K (0..1440)
  size: number; // ukuran huruf, koordinat 2K
  color: string;
  font?: FontId; // bawaan: manrope
  anim?: Anim; // animasi masuk, bawaan: slideUp
  animOut?: boolean; // pudar di akhir
  start: number; // detik
  duration: number; // detik
};

export type MediaLayer = {
  type: "media";
  id: string;
  kind: "image" | "video";
  name: string; // nama file; untuk ekspor, file harus ada di folder media/ repo
  fileId?: string; // kunci file di penyimpanan hp (dipakai bersama oleh layer hasil belah/gandakan)
  src?: string; // alamat sementara di hp (hanya untuk preview, tidak ikut diekspor)
  thumb?: string; // gambar mini untuk timeline (hanya di hp, tidak ikut diekspor)
  aspect?: number; // tinggi dibagi lebar asli
  mediaDuration?: number; // durasi asli klip (detik)
  x: number;
  y: number;
  width: number; // lebar di koordinat 2K, tinggi mengikuti rasio asli
  trim: number; // potong bagian awal klip (detik)
  volume?: number; // 0..1, hanya untuk video (bawaan 1)
  anim?: Anim; // bawaan: none
  animOut?: boolean;
  start: number;
  duration: number;
};

export type AudioLayer = {
  type: "audio";
  id: string;
  name: string; // nama file; untuk ekspor, file harus ada di folder media/ repo
  fileId?: string;
  src?: string;
  mediaDuration?: number;
  volume: number; // 0..1
  trim: number; // potong bagian awal klip (detik)
  start: number;
  duration: number;
};

export type Layer = TextLayer | MediaLayer | AudioLayer;
export type VisualLayer = TextLayer | MediaLayer;

export const isVisual = (l: Layer): l is VisualLayer => l.type !== "audio";

export type Background = {
  mode: "gradient" | "solid";
  a: string;
  b: string;
};

export const DEFAULT_BG: Background = { mode: "gradient", a: "#1e3a8a", b: "#3b82f6" };

export type Project = {
  duration: number; // detik
  background?: Background;
  layers: Layer[];
};

export const defaultProject: Project = {
  duration: 5,
  background: DEFAULT_BG,
  layers: [
    { type: "text", id: "t1", text: "Halo Remotion", x: 1280, y: 640, size: 160, color: "#ffffff", start: 0, duration: 5 },
    { type: "text", id: "t2", text: "FROCKSMOTION", x: 1280, y: 860, size: 90, color: "#bfdbfe", start: 1, duration: 4 },
  ],
};
