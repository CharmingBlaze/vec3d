import { ctx } from '../core/context.js';

/**
 * Fit orthographic camera so the full 2D canvas is visible in the viewport
 * with padding (zoomed out slightly for breathing room).
 */
export function fitCameraToCanvas(padding = 1.18) {
  const { three, dom, state } = ctx;
  if (!three.camera?.isOrthographicCamera) return;

  const area = dom.carea3d;
  const viewW = area?.clientWidth || 1;
  const viewH = area?.clientHeight || 1;
  const canvasW = state.canvasW;
  const canvasH = state.canvasH;
  const aspect = viewW / viewH;
  const canvasAspect = canvasW / canvasH;

  let halfW;
  let halfH;
  if (aspect >= canvasAspect) {
    halfH = (canvasH / 2) * padding;
    halfW = halfH * aspect;
  } else {
    halfW = (canvasW / 2) * padding;
    halfH = halfW / aspect;
  }

  three.camera.left = -halfW;
  three.camera.right = halfW;
  three.camera.top = halfH;
  three.camera.bottom = -halfH;
  three.camera.zoom = 1;
  three.camera.position.set(0, 0, 2000);
  three.camera.up.set(0, 1, 0);
  three.camera.lookAt(0, 0, 0);
  three.camera.updateProjectionMatrix();

  ctx.state.cameraPadding = padding;
}

/** Alias used by resize / reset handlers */
export function updateOrthographicCamera(padding) {
  fitCameraToCanvas(padding ?? ctx.state.cameraPadding ?? 1.18);
}

/** Reset 3D view to front-on, matching the 2D artboard */
export function reset3DView() {
  const { three } = ctx;
  if (three.group) {
    three.group.rotation.set(0, 0, 0);
    three.group.position.set(0, 0, 0);
  }
  fitCameraToCanvas();
}
