export const FULL_W = 2560;
export const FULL_H = 1440;
export const FPS = 30;

export type TextLayer = {
  type: "text";
  id: string;
  text: string;
  x: number; // posisi tengah, koordinat 2K (0..2560)
  y: number; // posisi tengah, koordinat 2K (0..1440)
  size: number; // ukuran huruf, koordinat 2K
  color: string;
  start: number; // detik
  duration: number; // detik
};

export type MediaLayer = {
  type: "media";
  id: string;
  kind: "image" | "video";
  name: string; // nama file; untuk ekspor, file harus ada di folder media/ repo
  src?: string; // alamat sementara di hp (hanya untuk preview, tidak ikut diekspor)
  mediaDuration?: number; // durasi asli klip (detik)
  x: number;
  y: number;
  width: number; // lebar di koordinat 2K, tinggi mengikuti rasio asli
  trim: number; // potong bagian awal klip (detik)
  start: number;
  duration: number;
};

export type Layer = TextLayer | MediaLayer;

export type Project = {
  duration: number; // detik
  layers: Layer[];
};

export const defaultProject: Project = {
  duration: 5,
  layers: [
    { type: "text", id: "t1", text: "Halo Remotion", x: 1280, y: 640, size: 160, color: "#ffffff", start: 0, duration: 5 },
    { type: "text", id: "t2", text: "FROCKSMOTION", x: 1280, y: 860, size: 90, color: "#bfdbfe", start: 1, duration: 4 },
  ],
};
