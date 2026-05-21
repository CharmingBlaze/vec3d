import { ctx, getScene } from '../core/context.js';
import { applyStyle } from '../svg/elements.js';
import { saveHistory } from './history.js';
import { clearHandles } from './handles.js';
import { refreshLayers } from '../ui/layers.js';
import { onObjMouseDown } from '../canvas/handlers.js';
import { ensureObjectD3, getDocumentD3 } from '../core/d3-settings.js';
import { styleForNewObject } from '../core/object-settings.js';
import { flushRealtime3D } from '../three/realtime.js';

export function addObject(el, type, data = {}) {
  const { dom } = ctx;
  const scene = getScene();
  const style = styleForNewObject();
  el.addEventListener('mousedown', onObjMouseDown);
  dom.shapesLayer.appendChild(el);
  applyStyle(el, style.fill, style.stroke, style.strokeW, style.opacity / 100);

  const node = scene.addNode({
    el,
    type,
    fill: style.fill,
    stroke: style.stroke,
    sw: style.strokeW,
    op: style.opacity / 100,
    data: {
      ...data,
      fillMode: data.fillMode ?? style.fillMode,
      d3: data.d3 ? { ...data.d3 } : { ...getDocumentD3() },
    },
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

    if (prop === 'fill') {
      o.fill = val;
      o.el.setAttribute('fill', val);
      if (val !== 'none') {
        if (!o.data) o.data = {};
        o.data.fillMode = 'solid';
      }
    } else if (prop === 'stroke') {
      o.stroke = val;
      o.el.setAttribute('stroke', val);
    } else if (prop === 'strokeW') {
      o.sw = val;
      o.el.setAttribute('stroke-width', val);
    } else if (prop === 'opacity') {
      o.op = val;
      o.el.setAttribute('opacity', val);
    } else {
      o[prop] = val;
    }
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
