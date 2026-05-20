import { ctx } from '../core/context.js';
import { cacheDom } from './dom.js';
import { initKeyboard } from './keyboard.js';
import { initCanvasEvents } from '../canvas/events.js';
import { initControls, initToolbar } from '../ui/controls.js';
import { initMenuDropdowns } from '../ui/menus.js';
import { initDocumentD3FromDom } from '../core/d3-settings.js';
import { initPathOps, importSVG, exportSVG } from '../io/svg-io.js';
import { initSceneGraph } from '../scene/init.js';
import { saveHistory } from '../editor/history.js';
import { initSceneSyncObserver } from '../editor/scene-sync.js';
import { refreshLayers, updateStatus } from '../ui/layers.js';
import { fit2DView } from '../svg/coordinates.js';
import { deleteSelected } from '../editor/objects.js';
import { undo, redo } from '../editor/history.js';

export function initApp() {
  cacheDom();
  initDocumentD3FromDom();
  initSceneGraph();
  initControls();
  initToolbar();
  initCanvasEvents();
  initKeyboard();
  initPathOps();
  initMenuDropdowns();
  initSceneSyncObserver();
  wireTopbar();
  fit2DView();
  saveHistory();
  refreshLayers();
  updateStatus();
  window.addEventListener('resize', () => {
    if (!ctx.three.renderer) return;
    import('../three/engine.js').then(({ resizeThree }) => resizeThree());
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
    show2DPane();
    fit2DView();
    refreshLayers();
  };

  dom.tbOpen.onclick = importSVG;
  dom.tbSaveSvg.onclick = exportSVG;
  dom.btnExportSvg.onclick = exportSVG;
  dom.tbUndo.onclick = undo;
  dom.tbRedo.onclick = redo;
  dom.tbDel.onclick = deleteSelected;

  dom.vtab2d.onclick = show2DPane;
  dom.vtab3d.onclick = () => import('../three/view.js').then(({ show3DView }) => show3DView());
  dom.btnExportObj.onclick = () => import('../three/export.js').then(({ exportOBJ }) => exportOBJ());
  if (dom.btnExportGltf) {
    dom.btnExportGltf.onclick = () => import('../three/export.js').then(({ exportGLTF }) => exportGLTF());
  }
}

function show2DPane() {
  const { dom, state } = ctx;
  state.activeScreen = '2d';
  dom.app.classList.remove('mode-3d');
  dom.carea2d.classList.add('on');
  dom.carea3d.classList.remove('on');
  dom.vtab2d.classList.add('on');
  dom.vtab3d.classList.remove('on');
}
