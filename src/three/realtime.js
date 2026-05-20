import { ctx, getScene } from '../core/context.js';
import { initThree, renderThreeFrame } from './engine.js';
import { rebuild3D, clear3DMeshes } from './generate.js';

let rafId = null;

/** Coalesce to next animation frame — updates every frame while dragging */
export function scheduleRealtime3D() {
  if (ctx.state.realtime3d === false) return;
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    runRealtime3DRebuild();
  });
}

/** Immediate rebuild (end of drag, undo, tab to 3D) */
export function flushRealtime3D() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  runRealtime3DRebuild();
}

function runRealtime3DRebuild() {
  try {
    const nodes = getScene()?.getAll() ?? ctx.state.objects;
    if (!nodes.length) {
      clear3DMeshes();
      renderThreeFrame();
      return;
    }
    initThree();
    rebuild3D({ preserveCamera: true, silent: true });
    renderThreeFrame();
  } catch (err) {
    console.error('Realtime 3D rebuild failed:', err);
  }
}
