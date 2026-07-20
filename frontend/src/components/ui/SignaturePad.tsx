import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

// Dependency-free signature pad. Draws with pointer events (mouse + touch +
// stylus) on a canvas and emits the current PNG data URL after each stroke
// (null when cleared). Used by the ITP sign-off capture (P4.2). Kept tiny and
// self-contained so it needs no signature library.

interface SignaturePadProps {
  /** Fires with the canvas PNG data URL after each stroke, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  height?: number;
  disabled?: boolean;
}

export default function SignaturePad({ onChange, height = 160, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Size the canvas backing store to its CSS box (× devicePixelRatio) so lines
  // stay crisp and coordinates map 1:1. Re-runs on mount + container resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#0f172a';
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointFromEvent(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirtyRef.current = true;
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (dirtyRef.current) {
      setHasInk(true);
      const url = canvasRef.current?.toDataURL('image/png') ?? null;
      onChange(url);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirtyRef.current = false;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-[#D8D2C4] bg-white">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, touchAction: 'none' }}
          className={disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[#A0A0A0]">
            Sign here
          </span>
        )}
      </div>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#6B6B6B] hover:bg-[#F0EDE4] disabled:opacity-40"
        >
          <Eraser className="h-3 w-3" />
          Clear
        </button>
      </div>
    </div>
  );
}
