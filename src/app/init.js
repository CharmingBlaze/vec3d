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
  dom.tbUndo.onclick = undo;
  dom.tbRedo.onclick = redo;
  dom.tbDel.onclick = deleteSelected;
  dom.tbCopy.onclick = copySelection;
  dom.tbPaste.onclick = pasteClipboard;
  dom.tbFlipH.onclick = () => flipSelected('x');
  dom.tbFlipV.onclick = () => flipSelected('y');

  dom.vtab2d.onclick = () => import('../three/view.js').then(({ show2DView }) => show2DView());
  dom.vtab3d.onclick = () => import('../three/view.js').then(({ show3DView }) => show3DView());
  dom.btnExportObj.onclick = () => import('../three/export.js').then(({ exportOBJ }) => exportOBJ());
  if (dom.btnExportGltf) {
    dom.btnExportGltf.onclick = () => import('../three/export.js').then(({ exportGLTF }) => exportGLTF());
  }
}
