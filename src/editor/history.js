import { ctx, getScene } from '../core/context.js';
import { clearHandles, showHandles } from './handles.js';
import { updateStatus } from '../ui/layers.js';
import { onObjMouseDown } from '../canvas/handlers.js';
import { updateProps, highlightSelectedFromScene } from './selection.js';

function notifyHistoryChanged() {
  document.dispatchEvent(new CustomEvent('vec3d:history-changed'));
}

export function saveHistory() {
  const { state, dom } = ctx;
  const scene = getScene();
  scene.syncOrderFromDom();
  scene.syncPropsFromDom();
  const snap = dom.shapesLayer.innerHTML;
  state.history = state.history.slice(0, state.histIdx + 1);
  state.history.push({
    svg: snap,
    objs: JSON.stringify(scene.serializeNodes()),
    selected: [...state.selected],
  });
  while (state.history.length > 80) state.history.shift();
  state.histIdx = state.history.length - 1;
  scene.markSaveClean();
  updateStatus();
  notifyHistoryChanged();
}

export function restoreHistory(idx) {
  const { state } = ctx;
  const h = state.history[idx];
  if (!h) return;
  getScene().restoreFromSnapshot(h.svg, JSON.parse(h.objs), (el) => {
    el.addEventListener('mousedown', onObjMouseDown);
  }, h.selected || []);
  clearHandles();
  highlightSelectedFromScene();
  if (ctx.state.selected.length) showHandles();
  updateProps();
  updateStatus();
  notifyHistoryChanged();
}

export function canUndo() {
  return ctx.state.histIdx > 0;
}

export function canRedo() {
  return ctx.state.histIdx < ctx.state.history.length - 1;
}

export function undo() {
  if (!canUndo()) return;
  ctx.state.histIdx--;
  restoreHistory(ctx.state.histIdx);
}

export function redo() {
  if (!canRedo()) return;
  ctx.state.histIdx++;
  restoreHistory(ctx.state.histIdx);
}
