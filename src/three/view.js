import { ctx } from '../core/context.js';
import { reset3DView } from './camera.js';
import { clear3DMeshes } from './generate.js';
import { flushRealtime3D } from './realtime.js';
import { initThree, resizeThree, renderThreeFrame } from './engine.js';

export function show3DView() {
  const { dom, state } = ctx;
  state.activeScreen = '3d';
  dom.app.classList.add('mode-3d');
  dom.carea2d.classList.remove('on');
  dom.carea3d.classList.add('on');
  dom.vtab3d.classList.add('on');
  dom.vtab2d.classList.remove('on');
  initThree();
  resizeThree();
  flushRealtime3D();
  reset3DView();
}

export function show2DView() {
  const { dom, state } = ctx;
  state.activeScreen = '2d';
  dom.app.classList.remove('mode-3d');
  dom.carea2d.classList.add('on');
  dom.carea3d.classList.remove('on');
  dom.vtab2d.classList.add('on');
  dom.vtab3d.classList.remove('on');
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
