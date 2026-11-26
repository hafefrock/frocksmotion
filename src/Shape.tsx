import { ShapeKind } from "./types";

export const SHAPES: { id: ShapeKind; label: string; w: number; h: number }[] = [
  { id: "rect", label: "Kotak", w: 600, h: 400 },
  { id: "circle", label: "Lingkaran", w: 420, h: 420 },
  { id: "triangle", label: "Segitiga", w: 440, h: 400 },
  { id: "star", label: "Bintang", w: 440, h: 420 },
  { id: "heart", label: "Hati", w: 440, h: 400 },
  { id: "arrow", label: "Panah", w: 600, h: 300 },
  { id: "line", label: "Garis", w: 800, h: 16 },
];

export const shapeLabel = (k: ShapeKind) => SHAPES.find((s) => s.id === k)?.label ?? "Bentuk";

type Props = {
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string;
  strokeW?: number;
  strokeColor?: string;
  radius?: number;
};

// Gambar bentuk sebagai SVG dengan ukuran piksel sebenarnya, supaya tebal garis tepi tidak ikut melar
export const ShapeSvg: React.FC<Props> = ({ shape, width: w, height: h, fill, strokeW = 0, strokeColor = "#000000", radius = 0 }) => {
  const sw = Math.max(0, strokeW);
  const common = {
    fill,
    stroke: sw > 0 ? strokeColor : "none",
    strokeWidth: sw,
    strokeLinejoin: "round" as const,
  };
  let body: React.ReactNode;

  if (shape === "rect") {
    const rx = (Math.min(w, h) / 2) * (radius / 100);
    body = <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={rx} {...common} />;
  } else if (shape === "circle") {
    body = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, (w - sw) / 2)} ry={Math.max(0, (h - sw) / 2)} {...common} />;
  } else if (shape === "triangle") {
    body = <polygon points={`${w / 2},${sw} ${w - sw},${h - sw} ${sw},${h - sw}`} {...common} />;
  } else if (shape === "star") {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = ((-90 + i * 36) * Math.PI) / 180;
      const r = i % 2 === 0 ? 1 : 0.4;
      return `${w / 2 + ((w - sw) / 2) * r * Math.cos(a)},${h / 2 + ((h - sw) / 2) * r * Math.sin(a) + h * 0.04}`;
    }).join(" ");
    body = <polygon points={pts} {...common} />;
  } else if (shape === "heart") {
    const sx = w / 100;
    const sy = h / 90;
    body = (
      <path
        transform={`scale(${sx} ${sy})`}
        d="M50 88 C10 56 0 36 0 24 C0 10 12 0 26 0 C37 0 46 6 50 14 C54 6 63 0 74 0 C88 0 100 10 100 24 C100 36 90 56 50 88 Z"
        {...common}
        strokeWidth={sw / ((sx + sy) / 2)}
      />
    );
  } else if (shape === "arrow") {
    const x = w * 0.6;
    body = (
      <polygon
        points={`${sw},${h * 0.3} ${x},${h * 0.3} ${x},${sw} ${w - sw},${h / 2} ${x},${h - sw} ${x},${h * 0.7} ${sw},${h * 0.7}`}
        {...common}
      />
    );
  } else {
    body = <rect x={0} y={0} width={w} height={h} rx={h / 2} {...common} />;
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      {body}
    </svg>
  );
};
