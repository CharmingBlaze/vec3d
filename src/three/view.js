import { ctx } from '../core/context.js';
import { reset3DView } from './camera.js';
import { clear3DMeshes } from './generate.js';
import { flushRealtime3D } from './realtime.js';
import { initThree, resizeThree, renderThreeFrame } from './engine.js';
import { initViewModeControls } from './viewMode.js';
import { setSplitFocus } from '../ui/split-view.js';

let viewModeReady = false;

export async function initSplitView3D() {
  if (!viewModeReady) {
    initViewModeControls();
    viewModeReady = true;
  }
  initThree();
  resizeThree();
  await flushRealtime3D({ force: true });
  reset3DView();
}

export async function show3DView() {
  setSplitFocus('3d');
  if (!ctx.three.renderer) {
    await initSplitView3D();
  } else {
    resizeThree();
    renderThreeFrame();
  }
}

export function show2DView() {
  setSplitFocus('2d');
  resizeThree();
}

export function clear3D() {
  clear3DMeshes();
  show2DView();
}

export function reset3DRotation() {
  initThree();
  reset3DView();
  resizeThree();
  renderThreeFrame();
}
