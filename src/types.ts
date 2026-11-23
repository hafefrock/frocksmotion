export const FULL_W = 2560;
export const FULL_H = 1440;
export const FPS = 30;

export type TextLayer = {
  id: string;
  text: string;
  x: number; // posisi tengah teks, koordinat 2K (0..2560)
  y: number; // posisi tengah teks, koordinat 2K (0..1440)
  size: number; // ukuran huruf, koordinat 2K
  color: string;
  start: number; // detik
  duration: number; // detik
};

export type Project = {
  duration: number; // detik
  layers: TextLayer[];
};

export const defaultProject: Project = {
  duration: 5,
  layers: [
    { id: "t1", text: "Halo Remotion", x: 1280, y: 640, size: 160, color: "#ffffff", start: 0, duration: 5 },
    { id: "t2", text: "FROCKSMOTION", x: 1280, y: 860, size: 90, color: "#bfdbfe", start: 1, duration: 4 },
  ],
};
