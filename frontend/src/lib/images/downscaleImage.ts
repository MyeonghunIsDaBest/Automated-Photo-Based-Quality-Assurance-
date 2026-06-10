// Client-side image downscale/compress for the upload path. Full-resolution
// phone photos (3–12 MB) are the main mobile upload slowness; shrinking them on
// the device before upload is the biggest perceived-speed win. We cap the long
// edge at 1600px (the Claude Vision model already caps input at 1568px, so the
// Ai loses nothing) and re-encode JPEG ~0.82 → typically 0.3–0.6 MB.
//
// Best-effort + FAIL-OPEN: anything that isn't a decodable raster image (e.g. an
// undecodable HEIC, a PDF, a decode error) returns the ORIGINAL file untouched.
// This never throws and never blocks an upload.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export interface DownscaledImage {
  file: File;
  /** Pixel dimensions of the (possibly resized) image; 0 when unknown. */
  width: number;
  height: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function downscaleImageForUpload(file: File): Promise<DownscaledImage> {
  // Only touch raster images; leave anything else (incl. HEIC we can't decode) as-is.
  if (!file.type.startsWith('image/')) return { file, width: 0, height: 0 };

  try {
    // `imageOrientation: 'from-image'` bakes EXIF rotation into the bitmap so the
    // canvas output is upright (phone cameras tag orientation rather than rotate).
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const ow = bitmap.width;
    const oh = bitmap.height;

    const scale = Math.min(1, MAX_EDGE / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow * scale));
    const h = Math.max(1, Math.round(oh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { file, width: ow, height: oh };
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
    if (!blob) return { file, width: ow, height: oh };

    // If we didn't downscale and the re-encode is no smaller, keep the original
    // bytes (avoid pointless re-compression / growth) — but still report dims.
    if (scale === 1 && blob.size >= file.size) return { file, width: ow, height: oh };

    const name = `${file.name.replace(/\.[^.]+$/, '')}.jpg`;
    const out = new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    return { file: out, width: w, height: h };
  } catch {
    // Decode failure / unsupported format → upload the original untouched.
    return { file, width: 0, height: 0 };
  }
}
