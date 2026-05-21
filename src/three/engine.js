import { THREE, THREE_CONFIG } from './setup.js';
import { ctx } from '../core/context.js';
import { fitCameraToCanvas, updateOrthographicCamera } from './camera.js';
import { init3DGizmos, update3DGizmoAttachment } from './gizmos.js';
import { moveObjects } from '../svg/transform.js';
import { showHandles } from '../editor/handles.js';
import { saveHistory } from '../editor/history.js';
import { flushRealtime3D } from './realtime.js';

export { fitCameraToCanvas, updateOrthographicCamera };

function activeCarea() {
  return ctx.dom.carea3d;
}

let renderQueued = false;
let interactionLoopActive = false;

function drawThreeFrame() {
  const { three } = ctx;
  if (!three.renderer || !three.scene || !three.camera) return;
  update3DGizmoAttachment();
  three.renderer.render(three.scene, three.camera);
}

/** Coalesce multiple render requests into one frame. */
export function requestThreeRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    drawThreeFrame();
  });
}

export function renderThreeFrame() {
  drawThreeFrame();
}

function startInteractionLoop() {
  const { three } = ctx;
  if (interactionLoopActive) return;
  interactionLoopActive = true;
  const loop = () => {
    if (!interactionLoopActive) return;
    three.animId = requestAnimationFrame(loop);
    drawThreeFrame();
  };
  loop();
}

function stopInteractionLoop() {
  interactionLoopActive = false;
  const { three } = ctx;
  if (three.animId) {
    cancelAnimationFrame(three.animId);
    three.animId = null;
  }
}

export function setThreeBackground(color) {
  const { three, state } = ctx;
  state.bg3d = color;
  if (three.renderer) {
    three.renderer.setClearColor(color, 1);
    if (three.scene?.fog) three.scene.fog.color.set(color);
    renderThreeFrame();
  }
}

export function initThree() {
  const { three, dom, state, interaction } = ctx;
  if (three.renderer) return;

  const canvas = dom.threeCanvas;
  three.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  three.renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, THREE_CONFIG.maxPixelRatio),
  );
  three.renderer.setClearColor(state.bg3d || THREE_CONFIG.clearColor, 1);
  three.renderer.shadowMap.enabled = true;

  three.scene = new THREE.Scene();
  three.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, THREE_CONFIG.cameraNear, THREE_CONFIG.cameraFar);

  const light = +dom.d3Light.value / 100;
  three.scene.add(new THREE.AmbientLight(0xffffff, 0.45 * light));
  const dl = new THREE.DirectionalLight(0xffffff, 1.1 * light);
  dl.position.set(500, 700, 600);
  dl.castShadow = true;
  three.scene.add(dl);
  const rl = new THREE.DirectionalLight(0x6699ff, 0.4 * light);
  rl.position.set(-600, -200, 300);
  three.scene.add(rl);
  const pl = new THREE.PointLight(0xffaa88, 0.35, 6000);
  pl.position.set(-400, 400, 300);
  three.scene.add(pl);

  three.group = new THREE.Group();
  three.scene.add(three.group);

  three.scene.fog = new THREE.Fog(0x111318, 1800, 5200);

  init3DGizmos();

  canvas.tabIndex = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const updatePointer = (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };

  const find3DObjectId = (e) => {
    updatePointer(e);
    raycaster.setFromCamera(pointer, three.camera);
    const hit = raycaster.intersectObjects(ctx.meshes3d, true)[0];
    let target = hit?.object ?? null;
    while (target && !target.userData?.sourceObjectId) target = target.parent;
    return target?.userData?.sourceObjectId ?? null;
  };

  const pick3DObject = (e) => {
    if (three.gizmoDragging || state.threeObjectDrag || state.threePointerMoved > 5 || e.button !== 0) return;
    const id = find3DObjectId(e);
    if (id) ctx.scene?.setSelection([id]);
    else ctx.scene?.clearSelection();
  };

  const screenDeltaToEditorDelta = (dx, dy) => {
    const area = activeCarea();
    const w = area?.clientWidth || canvas.clientWidth || 1;
    const h = area?.clientHeight || canvas.clientHeight || 1;
    const world = new THREE.Vector3(
      (dx / w) * (three.camera.right - three.camera.left) / three.camera.zoom,
      (-dy / h) * (three.camera.top - three.camera.bottom) / three.camera.zoom,
      0,
    );
    if (three.group) world.applyQuaternion(three.group.quaternion.clone().invert());
    return { dx: world.x, dy: -world.y };
  };

  const move3DSelection = (dx, dy) => {
    const ids = state.threeObjectDrag?.ids;
    if (!ids?.length) return;
    const delta = screenDeltaToEditorDelta(dx, dy);
    if (!delta.dx && !delta.dy) return;
    moveObjects(ids, delta.dx, delta.dy);
    ids.forEach((id) => {
      const group = three.objectGroups?.get(id);
      if (group) group.position.add(new THREE.Vector3(delta.dx, -delta.dy, 0));
    });
    showHandles();
    requestThreeRender();
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    state.threePointerMoved = 0;
    state.threePointerDown = { x: e.clientX, y: e.clientY };
    if (three.gizmoDragging) {
      state.threePointerDown = null;
      state.threeObjectDrag = null;
      state.drag3 = false;
      state.pan3 = false;
      return;
    }
    if (e.button === 0) {
      const id = find3DObjectId(e);
      if (id) {
        const selected = state.selected.includes(id) ? state.selected : [id];
        if (!state.selected.includes(id)) ctx.scene?.setSelection([id]);
        state.threeObjectDrag = { ids: selected, moved: false };
        state.lm3 = { x: e.clientX, y: e.clientY };
        startInteractionLoop();
        e.preventDefault();
        return;
      }
    }
    if (e.button === 2) {
      state.drag3 = true;
      state.three.rotating = true;
      startInteractionLoop();
    } else if (e.button === 1) {
      state.pan3 = true;
      startInteractionLoop();
      e.preventDefault();
    }
    state.lm3 = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (three.gizmoDragging) return;
    if (state.threePointerDown) {
      state.threePointerMoved = Math.max(
        state.threePointerMoved || 0,
        Math.hypot(e.clientX - state.threePointerDown.x, e.clientY - state.threePointerDown.y),
      );
    }
    if (state.threeObjectDrag) {
      const dx = e.clientX - state.lm3.x;
      const dy = e.clientY - state.lm3.y;
      if (dx || dy) {
        move3DSelection(dx, dy);
        state.threeObjectDrag.moved = true;
      }
      state.lm3 = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }
    if (state.drag3) {
      three.group.rotation.y += (e.clientX - state.lm3.x) * 0.013;
      three.group.rotation.x += (e.clientY - state.lm3.y) * 0.013;
    }
    if (state.pan3) {
      three.group.position.x += (e.clientX - state.lm3.x) * 0.8;
      three.group.position.y -= (e.clientY - state.lm3.y) * 0.8;
    }
    state.lm3 = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    const objectDrag = state.threeObjectDrag;
    if (e.button === 0 || e.button === 2) state.drag3 = false;
    if (e.button === 0 || e.button === 1) state.pan3 = false;
    state.threeObjectDrag = null;
    if (!state.drag3 && !state.pan3) stopInteractionLoop();
    const recentGizmo = performance.now() - (three.lastGizmoPointerUp || 0) < 80;
    if (objectDrag?.moved) {
      saveHistory();
      flushRealtime3D();
    } else if (!recentGizmo) {
      pick3DObject(e);
    }
    state.threePointerDown = null;
    requestThreeRender();
  });
  canvas.addEventListener('pointercancel', () => {
    if (state.threeObjectDrag?.moved) {
      saveHistory();
      flushRealtime3D();
    }
    state.threeObjectDrag = null;
    state.drag3 = false;
    state.pan3 = false;
    state.threePointerDown = null;
    stopInteractionLoop();
    requestThreeRender();
  });
  canvas.addEventListener('mouseleave', () => {
    if (state.threeObjectDrag?.moved) {
      saveHistory();
      flushRealtime3D();
    }
    state.threeObjectDrag = null;
    state.drag3 = false;
    state.pan3 = false;
    state.threePointerDown = null;
    stopInteractionLoop();
  });
  canvas.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      const nextZoom = three.camera.zoom * (e.deltaY < 0 ? 1.08 : 0.92);
      three.camera.zoom = Math.max(0.15, Math.min(8, nextZoom));
      three.camera.updateProjectionMatrix();
      requestThreeRender();
    },
    { passive: true },
  );

  fitCameraToCanvas();
  requestThreeRender();
}

export function resizeThree() {
  const { three, dom } = ctx;
  const area = activeCarea();
  let w = area?.clientWidth || 0;
  let h = area?.clientHeight || 0;
  if (!w || !h) {
    w = dom.carea2d?.clientWidth || dom.carea3d?.clientWidth || 1;
    h = dom.carea2d?.clientHeight || dom.carea3d?.clientHeight || 1;
  }
  if (!dom.threeCanvas) return;
  dom.threeCanvas.width = w;
  dom.threeCanvas.height = h;
  if (three.renderer) {
    three.renderer.setSize(w, h);
    if (ctx.meshes3d.length) fitCameraToCanvas();
    else updateOrthographicCamera();
    renderThreeFrame();
  }
}
