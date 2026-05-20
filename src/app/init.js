import { ctx } from '../core/context.js';
import { cacheDom } from './dom.js';
import { initKeyboard } from './keyboard.js';
import { initCanvasEvents } from '../canvas/events.js';
import { initControls, initToolbar } from '../ui/controls.js';
import { initPathOps, importSVG, exportSVG } from '../io/svg-io.js';
import { initSceneGraph } from '../scene/init.js';
import { saveHistory } from '../editor/history.js';
import { initSceneSyncObserver } from '../editor/scene-sync.js';
import { refreshLayers, updateStatus } from '../ui/layers.js';
import { fit2DView } from '../svg/coordinates.js';
import { show2DView, show3DView } from '../three/view.js';
import { exportOBJ, exportGLTF } from '../three/export.js';
import { updateSceneLights } from '../three/materials.js';
import { resizeThree } from '../three/engine.js';
import { initViewModeControls } from '../three/viewMode.js';
import { clear3DMeshes } from '../three/generate.js';
import { deleteSelected } from '../editor/objects.js';
import { undo, redo } from '../editor/history.js';

export function initApp() {
  cacheDom();
  initSceneGraph();
  initControls();
  initToolbar();
  initCanvasEvents();
  initKeyboard();
  initPathOps();
  initViewModeControls();
  initSceneSyncObserver();
  wireTopbar();
  fit2DView();
  saveHistory();
  refreshLayers();
  updateStatus();
  window.addEventListener('resize', resizeThree);
  resizeThree();
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
    if (three.group) three.group.clear();
    clear3DMeshes();
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

  dom.vtab2d.onclick = show2DView;
  dom.vtab3d.onclick = show3DView;
  dom.btnExportObj.onclick = exportOBJ;
  if (dom.btnExportGltf) dom.btnExportGltf.onclick = exportGLTF;
}
