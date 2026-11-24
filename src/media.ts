export type MediaMeta = { duration?: number; aspect?: number; thumb?: string };

const THUMB_H = 96;

function drawThumb(source: CanvasImageSource, w: number, h: number): string | undefined {
  try {
    if (!w || !h) return undefined;
    const th = THUMB_H;
    const tw = Math.max(1, Math.round((w / h) * th));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    canvas.getContext("2d")?.drawImage(source, 0, 0, tw, th);
    return canvas.toDataURL("image/jpeg", 0.65);
  } catch {
    return undefined;
  }
}

// Baca durasi, rasio, dan gambar mini dari file. Selalu selesai (ada batas waktu) supaya app tidak macet.
export function probe(url: string, kind: "image" | "video" | "audio"): Promise<MediaMeta> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (m: MediaMeta) => {
      if (done) return;
      done = true;
      resolve(m);
    };
    setTimeout(() => finish({}), 6000);

    if (kind === "image") {
      const img = new Image();
      img.onload = () =>
        finish({ aspect: img.naturalHeight / img.naturalWidth, thumb: drawThumb(img, img.naturalWidth, img.naturalHeight) });
      img.onerror = () => finish({});
      img.src = url;
      return;
    }

    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.muted = true;
    el.onerror = () => finish({});
    el.onloadedmetadata = () => {
      const duration = Number.isFinite(el.duration) ? el.duration : undefined;
      if (kind === "audio") {
        finish({ duration });
        return;
      }
      const v = el as HTMLVideoElement;
      const aspect = v.videoWidth ? v.videoHeight / v.videoWidth : undefined;
      v.onseeked = () => finish({ duration, aspect, thumb: drawThumb(v, v.videoWidth, v.videoHeight) });
      try {
        v.currentTime = Math.min(0.5, (duration ?? 1) / 2);
      } catch {
        finish({ duration, aspect });
      }
    };
    el.src = url;
  });
}
