import { ctx, getObj, getScene } from '../core/context.js';
import { ensureSelectionGlow } from '../svg/elements.js';
import { showHandles, clearHandles } from './handles.js';
import { refreshLayers, updateStatus } from '../ui/layers.js';
import { syncTransformPanel } from '../svg/transform.js';
import { syncD3PanelFromObject, syncD3PanelFromDocument } from '../core/d3-settings.js';

export function selectObj(id, add = false) {
  const scene = getScene();
  if (add) {
    scene.setSelection([...ctx.state.selected, id]);
  } else {
    scene.setSelection([id]);
  }
  showHandles();
  updateProps();
}

export function deselectAll() {
  getScene().clearSelection();
  clearHandles();
  syncD3PanelFromDocument();
  updateStatus();
}

export function highlightSelectedFromScene() {
  const { state } = ctx;
  ensureSelectionGlow();
  state.objects.forEach((o) => {
    const on = state.selected.includes(o.id);
    o.el.setAttribute('filter', on ? 'url(#sel-glow)' : '');
    o.el.classList.toggle('is-selected', on);
    o.el.style.cursor = on ? 'move' : '';
  });
  refreshLayers();
}

function highlightSelected() {
  highlightSelectedFromScene();
}

export function updateProps() {
  const { state, dom } = ctx;
  if (!state.selected.length) {
    syncD3PanelFromDocument();
    return;
  }
  syncTransformPanel(dom, getObj(state.selected[0]));
  syncD3PanelFromObject(getObj(state.selected[0]));
}
