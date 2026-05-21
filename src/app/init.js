import { ctx } from '../core/context.js';
import { cacheDom } from './dom.js';
import { initKeyboard } from './keyboard.js';
import { initCanvasEvents } from '../canvas/events.js';
import { initControls, initToolbar } from '../ui/controls.js';
import { initMenuDropdowns } from '../ui/menus.js';
import { initDocumentD3FromDom } from '../core/d3-settings.js';
import { initDocumentStyleFromState, syncPanelFromContext } from '../core/object-settings.js';
import { initPathOps, importSVG, exportSVG } from '../io/svg-io.js';
import { initSceneGraph } from '../scene/init.js';
import { SceneEvents } from '../scene/scene-bus.js';
import { saveHistory } from '../editor/history.js';
import { initSceneSyncObserver } from '../editor/scene-sync.js';
import { refreshLayers, updateStatus } from '../ui/layers.js';
import { fit2DView } from '../svg/coordinates.js';
import { initCanvasGrid } from '../svg/canvas-grid.js';
import { deleteSelected } from '../editor/objects.js';
import { undo, redo } from '../editor/history.js';
import { copySelection, pasteClipboard, flipSelected } from '../editor/clipboard.js';
import { initSplitView } from '../ui/split-view.js';
import { initSplitView3D, show2DView } from '../three/view.js';
import { resizeThree } from '../three/engine.js';

export function initApp() {
  cacheDom();
  initDocumentStyleFromState();
  initDocumentD3FromDom();
  syncPanelFromContext();
  initSceneGraph();
  initControls();
  initToolbar();
  initCanvasEvents();
  initKeyboard();
  initPathOps();
  initMenuDropdowns();
  initSceneSyncObserver();
  wireTopbar();
  wireActionState();
  initSplitView();
  initCanvasGrid();
  fit2DView();
  saveHistory();
  refreshLayers();
  updateStatus();
  initSplitView3D();
  window.addEventListener('resize', () => {
    if (!ctx.three.renderer) return;
    resizeThree();
  });
}

function wireTopbar() {
  const { dom, state, three } = ctx;
  ensureEditMenuActions(dom);

  dom.tbNew.onclick = () => {
    if (!confirm('Clear all and start new?')) return;
    ctx.scene.clear();
    dom.handlesLayer.innerHTML = '';
    state.history = [];
    state.histIdx = -1;
    saveHistory();
    if (three.group) {
      import('../three/generate.js').then(({ clear3DMeshes }) => clear3DMeshes());
    }
    show2DView();
    fit2DView();
    refreshLayers();
  };

  dom.tbOpen.onclick = importSVG;
  dom.tbSaveSvg.onclick = exportSVG;
  dom.btnExportSvg.onclick = exportSVG;
  dom.tbUndo.onclick = runTopbarAction(undo);
  dom.tbRedo.onclick = runTopbarAction(redo);
  dom.tbDel.onclick = runTopbarAction(deleteSelected);
  dom.tbCopy.onclick = runTopbarAction(copySelection);
  dom.tbPaste.onclick = runTopbarAction(pasteClipboard);
  dom.tbFlipH.onclick = runTopbarAction(() => flipSelected('x'));
  dom.tbFlipV.onclick = runTopbarAction(() => flipSelected('y'));
  dom.menuCopy.onclick = runMenuAction(copySelection);
  dom.menuPaste.onclick = runMenuAction(pasteClipboard);
  dom.menuFlipH.onclick = runMenuAction(() => flipSelected('x'));
  dom.menuFlipV.onclick = runMenuAction(() => flipSelected('y'));

  dom.vtab2d.onclick = () => import('../three/view.js').then(({ show2DView }) => show2DView());
  dom.vtab3d.onclick = () => import('../three/view.js').then(({ show3DView }) => show3DView());
  dom.btnExportObj.onclick = () => import('../three/export.js').then(({ exportOBJ }) => exportOBJ());
  if (dom.btnExportGltf) {
    dom.btnExportGltf.onclick = () => import('../three/export.js').then(({ exportGLTF }) => exportGLTF());
  }
}

function ensureEditMenuActions(dom) {
  const menu = dom.tbUndo?.closest('.menu-pop');
  if (!menu || dom.menuCopy) return;

  const makeButton = (label, title) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    return button;
  };

  dom.menuCopy = makeButton('Copy', 'Copy selection (Ctrl+C)');
  dom.menuPaste = makeButton('Paste', 'Paste selection (Ctrl+V)');
  dom.menuFlipH = makeButton('Flip Horizontal', 'Flip selected objects horizontally');
  dom.menuFlipV = makeButton('Flip Vertical', 'Flip selected objects vertically');

  const anchor = dom.tbDel ?? null;
  [dom.menuCopy, dom.menuPaste, dom.menuFlipH, dom.menuFlipV].forEach((button) => {
    menu.insertBefore(button, anchor);
  });
}

function runTopbarAction(action) {
  return () => {
    const result = action();
    syncTopbarActionState();
    return result;
  };
}

function runMenuAction(action) {
  return (event) => {
    const result = runTopbarAction(action)();
    event.currentTarget.closest('details')?.removeAttribute('open');
    return result;
  };
}

function wireActionState() {
  const scene = ctx.scene;
  if (!scene) return;
  const sync = () => syncTopbarActionState();

  scene.on(SceneEvents.SELECTION, sync);
  scene.on(SceneEvents.STRUCTURE, sync);
  scene.on(SceneEvents.HISTORY, sync);
  document.addEventListener('vec3d:clipboard-changed', sync);
  document.addEventListener('vec3d:history-changed', sync);
  sync();
}

function syncTopbarActionState() {
  const { dom, state } = ctx;
  const hasEditableSelection = state.selected.some((id) => {
    const node = ctx.scene?.get(id);
    return node && !node.locked && node.visible !== false;
  });
  const canPaste = Array.isArray(state.clipboard) && state.clipboard.length > 0;
  const canUndo = state.histIdx > 0;
  const canRedo = state.histIdx >= 0 && state.histIdx < state.history.length - 1;

  setButtonEnabled(dom.tbUndo, canUndo);
  setButtonEnabled(dom.tbRedo, canRedo);
  setButtonEnabled(dom.tbDel, hasEditableSelection);
  setButtonEnabled(dom.tbCopy, hasEditableSelection);
  setButtonEnabled(dom.tbPaste, canPaste);
  setButtonEnabled(dom.tbFlipH, hasEditableSelection);
  setButtonEnabled(dom.tbFlipV, hasEditableSelection);
  setButtonEnabled(dom.menuCopy, hasEditableSelection);
  setButtonEnabled(dom.menuPaste, canPaste);
  setButtonEnabled(dom.menuFlipH, hasEditableSelection);
  setButtonEnabled(dom.menuFlipV, hasEditableSelection);
}

function setButtonEnabled(button, enabled) {
  if (!button) return;
  button.disabled = !enabled;
  button.setAttribute('aria-disabled', String(!enabled));
}
