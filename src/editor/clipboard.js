import { ctx, getObj, getScene, nextObjectId } from '../core/context.js';
import { saveHistory } from './history.js';
import { showHandles } from './handles.js';
import { refreshLayers } from '../ui/layers.js';
import { onObjMouseDown } from '../canvas/handlers.js';
import { updateProps } from './selection.js';
import { ensureObjTransform, flipObjects, writeTransformToEl } from '../svg/transform.js';
import { flushRealtime3D } from '../three/realtime.js';

const PASTE_OFFSET = 24;

function cloneData(data) {
  return data ? JSON.parse(JSON.stringify(data)) : {};
}

function selectedNodes() {
  const scene = getScene();
  if (!scene) return [];
  const selected = new Set(ctx.state.selected);
  return scene.getAll().filter((node) => selected.has(node.id) && node.el && !node.locked);
}

export function copySelection() {
  const nodes = selectedNodes();
  if (!nodes.length) return false;
  ctx.state.clipboard = nodes.map((node) => ({
    type: node.type,
    fill: node.fill,
    stroke: node.stroke,
    sw: node.sw,
    op: node.op,
    visible: node.visible !== false,
    data: cloneData(node.data),
    svg: node.el.cloneNode(true),
  }));
  ctx.state.clipboardPasteCount = 0;
  return true;
}

export function pasteClipboard() {
  const scene = getScene();
  const clipboard = ctx.state.clipboard;
  if (!scene || !clipboard?.length) return false;

  ctx.state.clipboardPasteCount = (ctx.state.clipboardPasteCount ?? 0) + 1;
  const offset = PASTE_OFFSET * ctx.state.clipboardPasteCount;
  const pastedIds = [];

  clipboard.forEach((item) => {
    const id = nextObjectId();
    const el = item.svg.cloneNode(true);
    const data = cloneData(item.data);
    el.dataset.id = id;
    el.classList.remove('is-selected');
    el.removeAttribute('filter');
    el.addEventListener('mousedown', onObjMouseDown);
    ctx.dom.shapesLayer.appendChild(el);

    if (data.transform) {
      data.transform.tx = (data.transform.tx || 0) + offset;
      data.transform.ty = (data.transform.ty || 0) + offset;
      writeTransformToEl(el, data.transform);
    }

    const node = scene.addNode({
      id,
      el,
      type: item.type,
      fill: item.fill,
      stroke: item.stroke,
      sw: item.sw,
      op: item.op,
      data,
    });
    node.visible = item.visible;
    node.locked = false;
    ensureObjTransform(node);
    pastedIds.push(id);
  });

  scene.setSelection(pastedIds);
  scene.notifyChanged('paste', { ids: pastedIds });
  showHandles();
  updateProps();
  saveHistory();
  refreshLayers();
  flushRealtime3D();
  return true;
}

export function flipSelected(axis) {
  const ids = ctx.state.selected.filter((id) => {
    const node = getObj(id);
    return node && !node.locked;
  });
  if (!ids.length || !flipObjects(ids, axis)) return false;
  showHandles();
  saveHistory();
  refreshLayers();
  flushRealtime3D();
  return true;
}
