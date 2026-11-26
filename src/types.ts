export const FPS = 30;

export type Ratio = "16:9" | "9:16" | "1:1";

// Ukuran kanvas desain per rasio (sisi terpanjang maksimal 2K)
export const canvasOf = (r?: Ratio) =>
  r === "9:16" ? { w: 1440, h: 2560 } : r === "1:1" ? { w: 1440, h: 1440 } : { w: 2560, h: 1440 };

export type Anim = "none" | "fade" | "slideUp" | "slideLeft" | "zoom" | "pop";
export type Motion = "none" | "zoomIn" | "zoomOut" | "panLeft" | "panRight"; // gerak pelan pada gambar/video
export type ShapeKind = "rect" | "circle" | "triangle" | "star" | "heart" | "arrow" | "line";
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
  align?: "left" | "center" | "right"; // rata teks (terlihat pada teks beberapa baris), bawaan tengah
  spacing?: number; // jarak antarhuruf, koordinat kanvas
  strokeW?: number; // tebal garis tepi, 0 = tanpa
  strokeColor?: string;
  shadow?: number; // 0..100
  bgColor?: string; // warna kotak di belakang teks
  bgOpacity?: number; // 0..1, 0 = tanpa kotak
  rotation?: number; // derajat
  opacity?: number; // 0..1, bawaan 1
  flip?: boolean; // balik horizontal
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
  speed?: number; // kecepatan putar video, bawaan 1
  fadeIn?: number; // detik, suara masuk perlahan (video)
  fadeOut?: number; // detik, suara keluar perlahan (video)
  motion?: Motion; // gerak pelan selama layer tampil
  rotation?: number; // derajat
  opacity?: number; // 0..1, bawaan 1
  flip?: boolean; // balik horizontal
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
  speed?: number; // kecepatan putar, bawaan 1
  fadeIn?: number; // detik
  fadeOut?: number; // detik
  trim: number; // potong bagian awal klip (detik)
  start: number;
  duration: number;
};

export type ShapeLayer = {
  type: "shape";
  id: string;
  shape: ShapeKind;
  x: number; // posisi tengah, koordinat kanvas
  y: number;
  width: number;
  height: number;
  fill: string;
  strokeW?: number; // tebal garis tepi, 0 = tanpa
  strokeColor?: string;
  radius?: number; // kebulatan sudut kotak, 0..100
  rotation?: number; // derajat
  opacity?: number; // 0..1, bawaan 1
  flip?: boolean; // balik horizontal
  anim?: Anim; // bawaan: none
  animOut?: boolean;
  start: number;
  duration: number;
};

export type Layer = TextLayer | MediaLayer | AudioLayer | ShapeLayer;
export type VisualLayer = TextLayer | MediaLayer | ShapeLayer;

export const isVisual = (l: Layer): l is VisualLayer => l.type !== "audio";

export type Background = {
  mode: "gradient" | "solid";
  a: string;
  b: string;
};

export const DEFAULT_BG: Background = { mode: "gradient", a: "#1e3a8a", b: "#3b82f6" };

export type Project = {
  duration: number; // detik
  ratio?: Ratio; // bawaan: 16:9
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
