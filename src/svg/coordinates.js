import { ctx } from '../core/context.js';

export function svgPoint(e) {
  const { state, dom } = ctx;
  const r = dom.mainSvg.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - state.panX) / state.zoom,
    y: (e.clientY - r.top - state.panY) / state.zoom,
  };
}

export function applyTransform() {
  const { state, dom } = ctx;
  dom.canvasGroup.setAttribute(
    'transform',
    `translate(${state.panX},${state.panY}) scale(${state.zoom})`,
  );
}

export function setZoom(z, center) {
  const { state, dom } = ctx;
  const oz = state.zoom;
  state.zoom = Math.max(0.05, Math.min(20, z));
  if (center) {
    state.panX += center.x * (oz - state.zoom);
    state.panY += center.y * (oz - state.zoom);
  }
  applyTransform();
  dom.zlabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

export function fit2DView(padding = 40) {
  const { state, dom } = ctx;
  const area = dom.carea2d;
  const viewW = area?.clientWidth || dom.viewport?.clientWidth || 1;
  const viewH = area?.clientHeight || dom.viewport?.clientHeight || 1;
  const availableW = Math.max(1, viewW - padding * 2);
  const availableH = Math.max(1, viewH - padding * 2);
  const fitZoom = Math.min(availableW / state.canvasW, availableH / state.canvasH, 1);

  state.zoom = Math.max(0.05, fitZoom);
  state.panX = (viewW - state.canvasW * state.zoom) / 2;
  state.panY = (viewH - state.canvasH * state.zoom) / 2;
  applyTransform();
  dom.zlabel.textContent = `${Math.round(state.zoom * 100)}%`;
}
