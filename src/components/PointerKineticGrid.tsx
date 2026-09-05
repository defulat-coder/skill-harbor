// Adapted from Open Design AppWashKineticGrid.tsx (Apache-2.0).
// See THIRD_PARTY_NOTICES.md and docs/design/upstream/manifest.json.
// Full-window shared background; input, idle, hidden and reduced-motion handling.
import { useEffect, useRef } from 'react';

const DOT_COLOR = '#9a9a9a';
const SPACING = 25;
const RADIUS = 203;
const STRENGTH = 2;

interface GridDot {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function PointerKineticGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;

    const pull = (Math.max(1, Math.min(10, STRENGTH)) / 10) * 4;
    const mouse = { x: -9999, y: -9999, active: false };
    // While the user is focused in an editable (the composer), the
    // cursor-follow behavior is switched off — dots settle back to rest.
    let hoverSuppressed = false;
    const isEditable = (node: EventTarget | null): boolean =>
      node instanceof Element &&
      !!node.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
    const onFocusIn = (event: FocusEvent) => {
      hoverSuppressed = isEditable(event.target);
      wake();
    };
    const onFocusOut = () => {
      hoverSuppressed = false;
      wake();
    };

    let width = 1;
    let height = 1;
    let dots: GridDot[] = [];

    const host = canvas.parentElement;
    if (!host) return;


    function build(): void {
      if (!canvas || !ctx || !host) return;
      const rect = host.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      const h = rect.height;
      height = Math.max(1, Math.floor(h));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots = [];
      const nCols = Math.floor(width / SPACING) + 2;
      const nRows = Math.floor(height / SPACING) + 2;
      for (let c = 0; c < nCols; c++) {
        for (let r = 0; r < nRows; r++) {
          const hx = c * SPACING;
          const hy = r * SPACING;
          dots.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0 });
        }
      }
    }

    function drawStatic(): void {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = DOT_COLOR;
      for (const d of dots) {
        ctx.globalAlpha = 0.22 * Math.max(0, Math.min(1, (height - d.hy) / 90));
        ctx.beginPath();
        ctx.arc(d.hx, d.hy, 0.55, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    build();

    const ro = new ResizeObserver(() => {
      build();
      drawStatic();
      wake();
    });
    ro.observe(host);


    drawStatic();

    // Background layer: the canvas never receives pointer events, so the
    // cursor is tracked on the window and mapped into the host's box (the
    // rect is re-read per move — the home view scrolls under the cursor).
    const onMove = (event: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active = true;
      wake();
    };
    const onLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
      wake();
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    const onOut = (event: MouseEvent) => { if (!event.relatedTarget) onLeave(); };
    window.addEventListener('mouseout', onOut);
    window.addEventListener('blur', onLeave);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    hoverSuppressed = isEditable(document.activeElement);

    let raf = 0;
    function wake() {
      if (!raf && !reducedMotion && !document.hidden) raf = requestAnimationFrame(frame);
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      mouse.active = false;
      wake();
    };
    const onMotionChange = () => {
      reducedMotion = motionQuery.matches;
      cancelAnimationFrame(raf);
      raf = 0;
      build();
      drawStatic();
      wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    motionQuery.addEventListener('change', onMotionChange);
    const frame = () => {
      raf = 0;
      if (document.hidden || reducedMotion) return;
      let moving = false;
      ctx.clearRect(0, 0, width, height);
      const interactive = mouse.active && !hoverSuppressed;
      for (const d of dots) {
        let ax = (d.hx - d.x) * 0.08;
        let ay = (d.hy - d.y) * 0.08;
        if (interactive) {
          const dx = mouse.x - d.x;
          const dy = mouse.y - d.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < RADIUS && dist > 0.001) {
            const f = (1 - dist / RADIUS) * pull;
            ax += (dx / dist) * f;
            ay += (dy / dist) * f;
          }
        }
        d.vx = (d.vx + ax) * 0.82;
        d.vy = (d.vy + ay) * 0.82;
        d.x += d.vx;
        d.y += d.vy;
        if (Math.abs(d.vx) + Math.abs(d.vy) > 0.005) moving = true;

        const prox = interactive
          ? Math.max(0, 1 - Math.sqrt((mouse.x - d.x) ** 2 + (mouse.y - d.y) ** 2) / RADIUS)
          : 0;
        const edgeFade = Math.max(0, Math.min(1, (height - d.y) / 90));
        ctx.globalAlpha = (0.22 + prox * 0.78) * edgeFade;
        ctx.fillStyle = DOT_COLOR;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 0.55 + prox * 0.8, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (moving) wake();
    };
    wake();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onOut);
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery.removeEventListener('change', onMotionChange);
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
}
