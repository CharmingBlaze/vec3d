import { ctx, getScene } from '../core/context.js';
import { applyStyle } from '../svg/elements.js';
import { saveHistory } from './history.js';
import { clearHandles } from './handles.js';
import { refreshLayers } from '../ui/layers.js';
import { onObjMouseDown } from '../canvas/handlers.js';
import { ensureObjectD3 } from '../core/d3-settings.js';
import { flushRealtime3D } from '../three/realtime.js';

export function addObject(el, type, data = {}) {
  const { state, dom } = ctx;
  const scene = getScene();
  el.addEventListener('mousedown', onObjMouseDown);
  dom.shapesLayer.appendChild(el);
  applyStyle(el, state.fill, state.stroke, state.strokeW, state.opacity / 100);

  const node = scene.addNode({
    el,
    type,
    fill: state.fill,
    stroke: state.stroke,
    sw: state.strokeW,
    op: state.opacity / 100,
    data: { ...data, d3: data.d3 ?? undefined },
    id: el.dataset.id || undefined,
  });
  ensureObjectD3(node);

  saveHistory();
  refreshLayers();
  flushRealtime3D();
  return node;
}

export function updateSelected(prop, val) {
  const scene = getScene();
  const ids = [];
  ctx.state.selected.forEach((id) => {
    const o = scene.get(id);
    if (!o) return;
    ids.push(id);
    o[prop] = val;
    if (prop === 'fill') o.el.setAttribute('fill', val);
    if (prop === 'stroke') o.el.setAttribute('stroke', val);
    if (prop === 'strokeW') {
      o.el.setAttribute('stroke-width', val);
      o.sw = val;
    }
    if (prop === 'opacity') o.el.setAttribute('opacity', val);
  });
  if (ids.length) scene.notifyStyle(ids);
}

export function deleteSelected() {
  const scene = getScene();
  const toRemove = ctx.state.selected.filter((id) => {
    const o = scene.get(id);
    return o && !o.locked;
  });
  scene.removeMany(toRemove);
  clearHandles();
  saveHistory();
  refreshLayers();
}
