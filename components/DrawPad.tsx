'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type DrawPadHandle = { canvas: HTMLCanvasElement | null; isEmpty: () => boolean; clear: () => void };

type Pt = { x: number; y: number };

// Ukuran internal kanvas. Ketebalan garis disetel supaya setelah preprocessing
// mirip goresan pena di data training.
const SIZES = { aksara: { w: 360, h: 360, line: 5 }, ocr: { w: 1200, h: 240, line: 5 } };

const DrawPad = forwardRef<DrawPadHandle, { mode: 'aksara' | 'ocr'; onChange?: (empty: boolean) => void }>(
  function DrawPad({ mode, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<Pt[][]>([]);
    const drawing = useRef(false);
    const [count, setCount] = useState(0);
    const size = SIZES[mode];

    const redraw = useCallback(() => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = size.line;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const s of strokes.current) {
        if (s.length === 0) continue;
        ctx.beginPath();
        ctx.moveTo(s[0].x, s[0].y);
        if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y + 0.1);
        for (let i = 1; i < s.length - 1; i++) {
          const mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2;
          ctx.quadraticCurveTo(s[i].x, s[i].y, mx, my);
        }
        if (s.length > 1) ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y);
        ctx.stroke();
      }
    }, [size.line]);

    useEffect(() => { strokes.current = []; setCount(0); redraw(); }, [mode, redraw]);
    useEffect(() => { onChange?.(count === 0); }, [count, onChange]);

    const clear = useCallback(() => { strokes.current = []; setCount(0); redraw(); }, [redraw]);

    useImperativeHandle(ref, () => ({
      canvas: canvasRef.current,
      isEmpty: () => strokes.current.length === 0,
      clear,
    }), [clear]);

    const pos = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h };
    };

    return (
      <div className="pad">
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          className={`pad-canvas ${mode}`}
          aria-label="Area untuk menulis aksara"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            strokes.current.push([pos(e)]);
            redraw();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            strokes.current[strokes.current.length - 1].push(pos(e));
            redraw();
          }}
          onPointerUp={() => { if (drawing.current) { drawing.current = false; setCount(strokes.current.length); } }}
          onPointerCancel={() => { drawing.current = false; setCount(strokes.current.length); }}
        />
        <div className="pad-tools">
          <span className="pad-hint">
            {mode === 'aksara' ? 'Tulis satu aksara memenuhi kotak.' : 'Tulis satu baris aksara dari kiri ke kanan.'}
          </span>
          <button type="button" className="link-btn" disabled={count === 0}
            onClick={() => { strokes.current.pop(); setCount(strokes.current.length); redraw(); }}>
            Urungkan
          </button>
          <button type="button" className="link-btn" disabled={count === 0} onClick={clear}>
            Hapus
          </button>
        </div>
      </div>
    );
  },
);

export default DrawPad;
