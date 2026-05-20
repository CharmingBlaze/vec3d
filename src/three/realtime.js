import { ctx, getScene } from '../core/context.js';
import { initThree, renderThreeFrame } from './engine.js';
import { rebuild3D, clear3DMeshes } from './generate.js';

let rafId = null;
let dirty3D = true;

export function mark3DDirty() {
  dirty3D = true;
}

function canRunRealtime3D() {
  return ctx.state.realtime3d !== false;
}

function runRealtime3DRebuild() {
  try {
    const nodes = getScene()?.getAll() ?? ctx.state.objects;
    if (!nodes.length) {
      clear3DMeshes();
      renderThreeFrame();
      dirty3D = false;
      return true;
    }
    initThree();
    const ok = rebuild3D({ preserveCamera: true, silent: true });
    renderThreeFrame();
    dirty3D = false;
    return ok;
  } catch (err) {
    console.error('Realtime 3D rebuild failed:', err);
    return false;
  }
}

/** Coalesce live 3D rebuilds while editing. */
export function scheduleRealtime3D() {
  dirty3D = true;
  if (!canRunRealtime3D()) return;
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    runRealtime3DRebuild();
  });
}

/** Immediate rebuild for the end of a drag or history step. */
export function flushRealtime3D(opts = {}) {
  dirty3D = true;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (!opts.force && !canRunRealtime3D()) return false;
  return runRealtime3DRebuild();
}

export function is3DDirty() {
  return dirty3D || getScene()?.dirty3d;
}
