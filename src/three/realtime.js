import { ctx, getScene } from '../core/context.js';
import { initThree, requestThreeRender } from './engine.js';
import { rebuild3D, clear3DMeshes } from './generate.js';

let pendingId = null;
let pendingIsTimeout = false;
let dirty3D = true;
let lastRebuildAt = 0;

/** Minimum ms between live mesh rebuilds while dragging/editing. */
const REBUILD_MIN_MS = 140;

function clearPending() {
  if (pendingId === null) return;
  if (pendingIsTimeout) clearTimeout(pendingId);
  else cancelAnimationFrame(pendingId);
  pendingId = null;
  pendingIsTimeout = false;
}

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
      requestThreeRender();
      dirty3D = false;
      return true;
    }
    initThree();
    const ok = rebuild3D({ preserveCamera: true, silent: true });
    requestThreeRender();
    dirty3D = false;
    return ok;
  } catch (err) {
    console.error('Realtime 3D rebuild failed:', err);
    return false;
  }
}

function queueRebuild(immediate = false) {
  clearPending();
  const run = () => {
    pendingId = null;
    pendingIsTimeout = false;
    lastRebuildAt = performance.now();
    runRealtime3DRebuild();
  };

  if (immediate) {
    run();
    return;
  }

  const elapsed = performance.now() - lastRebuildAt;
  if (elapsed >= REBUILD_MIN_MS) {
    pendingId = requestAnimationFrame(run);
  } else {
    pendingIsTimeout = true;
    pendingId = setTimeout(run, REBUILD_MIN_MS - elapsed);
  }
}

/** Coalesce live 3D rebuilds while editing (throttled). */
export function scheduleRealtime3D() {
  dirty3D = true;
  if (!canRunRealtime3D()) return;
  if (pendingId !== null) return;
  queueRebuild(false);
}

/** Immediate rebuild for the end of a drag or history step. */
export function flushRealtime3D(opts = {}) {
  dirty3D = true;
  if (!opts.force && !canRunRealtime3D()) return false;
  queueRebuild(true);
  return true;
}

export function is3DDirty() {
  return dirty3D || getScene()?.dirty3d;
}
