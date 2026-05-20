import { ctx, getScene } from '../core/context.js';

let rafId = null;
let dirty3D = true;

export function mark3DDirty() {
  dirty3D = true;
}

/** Coalesce live 3D rebuilds, and skip heavy work while the user is in 2D. */
export function scheduleRealtime3D() {
  dirty3D = true;
  if (ctx.state.realtime3d === false || ctx.state.activeScreen !== '3d') return;
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    runRealtime3DRebuild();
  });
}

/** Immediate rebuild. In 2D this only marks dirty unless forced by export/show-3D. */
export function flushRealtime3D(opts = {}) {
  dirty3D = true;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (!opts.force && ctx.state.activeScreen !== '3d') return false;
  return runRealtime3DRebuild();
}

export function is3DDirty() {
  return dirty3D || getScene()?.dirty3d;
}

async function runRealtime3DRebuild() {
  try {
    const [{ initThree, renderThreeFrame }, { rebuild3D, clear3DMeshes }] = await Promise.all([
      import('./engine.js'),
      import('./generate.js'),
    ]);
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
