import { THREE } from './setup.js';
import { ctx, getObj } from '../core/context.js';
import { ensureObjTransform, writeTransformToEl } from '../svg/transform.js';
import { ensureObjectD3 } from '../core/d3-settings.js';
import { showHandles } from '../editor/handles.js';
import { saveHistory } from '../editor/history.js';
import { flushRealtime3D } from './realtime.js';
import { renderThreeFrame } from './engine.js';

function activeArea() {
  return ctx.dom.carea3d;
}

function screenDeltaToEditorDelta(dx, dy) {
  return screenDeltaToVisibleEditorDelta(dx, dy);
}

function worldVectorToEditorDelta(world) {
  const local = world.clone();
  if (ctx.three.group) local.applyQuaternion(ctx.three.group.quaternion.clone().invert());
  return { dx: local.x, dy: -local.y };
}

function projectWorldPointToScreen(point) {
  const { three, dom } = ctx;
  if (!three.camera || !dom.carea3d) return null;
  const p = point.clone().project(three.camera);
  const w = dom.carea3d.clientWidth || 1;
  const h = dom.carea3d.clientHeight || 1;
  return {
    x: ((p.x + 1) / 2) * w,
    y: ((-p.y + 1) / 2) * h,
  };
}

function selectedAnchorWorld() {
  const groups = selectedObjectGroups();
  if (!groups.length) return new THREE.Vector3(0, 0, 0);
  const box = new THREE.Box3();
  groups.forEach(({ group }) => box.expandByObject(group));
  return box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
}

function worldAxisScreenVector(axis, originWorld = selectedAnchorWorld()) {
  const origin = projectWorldPointToScreen(originWorld);
  const end = projectWorldPointToScreen(originWorld.clone().add(axis.clone().normalize().multiplyScalar(100)));
  if (!origin || !end) return { x: axis.x || 1, y: -axis.y || 0, pxPerWorld: 1 };
  const sx = end.x - origin.x;
  const sy = end.y - origin.y;
  const len = Math.hypot(sx, sy) || 1;
  return { x: sx / len, y: sy / len, pxPerWorld: len / 100 };
}

function fallbackScreenAxis(axisName) {
  return axisName === 'x' ? { x: 1, y: 0 } : { x: 0, y: -1 };
}

function normalizeScreenAxis(axis, fallback = { x: 1, y: 0 }) {
  const len = Math.hypot(axis?.x || 0, axis?.y || 0);
  if (len < 0.0001) return fallback;
  return { x: axis.x / len, y: axis.y / len };
}

function perpendicularScreenAxis(axis) {
  return normalizeScreenAxis({ x: -axis.y, y: axis.x });
}

function rawAxisScreenInfo(axisName) {
  const { three } = ctx;
  const worldAxis = new THREE.Vector3(axisName === 'x' ? 1 : 0, axisName === 'y' ? 1 : 0, 0);
  if (three.group) worldAxis.applyQuaternion(three.group.quaternion);
  return { ...worldAxisScreenVector(worldAxis), worldAxis };
}

function cameraSmartAxisInfo(axisName) {
  const self = rawAxisScreenInfo(axisName);
  if (self.pxPerWorld >= 0.05) return { ...self, edge: false };

  const otherName = axisName === 'x' ? 'y' : 'x';
  const other = rawAxisScreenInfo(otherName);
  const desired = fallbackScreenAxis(axisName);
  let screenAxis = desired;

  if (other.pxPerWorld >= 0.05) {
    screenAxis = perpendicularScreenAxis(other);
    if (screenAxis.x * desired.x + screenAxis.y * desired.y < 0) {
      screenAxis = { x: -screenAxis.x, y: -screenAxis.y };
    }
  }

  return {
    ...self,
    ...screenAxis,
    edge: true,
    pxPerWorld: 1 / fallbackWorldPerPixel(),
  };
}

function fallbackWorldPerPixel() {
  const { three, dom } = ctx;
  const area = activeArea();
  const w = area?.clientWidth || dom.threeCanvas?.clientWidth || 1;
  const h = area?.clientHeight || dom.threeCanvas?.clientHeight || 1;
  const sx = (three.camera.right - three.camera.left) / three.camera.zoom / w;
  const sy = (three.camera.top - three.camera.bottom) / three.camera.zoom / h;
  return (Math.abs(sx) + Math.abs(sy)) / 2;
}

function screenDeltaToVisibleEditorDelta(dxScreen, dyScreen) {
  const xAxis = rawAxisScreenInfo('x');
  const yAxis = rawAxisScreenInfo('y');
  const xBasis = { x: xAxis.x * xAxis.pxPerWorld, y: xAxis.y * xAxis.pxPerWorld };
  const yBasis = { x: -yAxis.x * yAxis.pxPerWorld, y: -yAxis.y * yAxis.pxPerWorld };
  const det = xBasis.x * yBasis.y - yBasis.x * xBasis.y;

  if (Math.abs(det) > 0.0001) {
    return {
      dx: (dxScreen * yBasis.y - yBasis.x * dyScreen) / det,
      dy: (xBasis.x * dyScreen - dxScreen * xBasis.y) / det,
    };
  }

  const xStrength = Math.hypot(xBasis.x, xBasis.y);
  const yStrength = Math.hypot(yBasis.x, yBasis.y);
  if (xStrength >= yStrength && xStrength > 0.0001) {
    return { dx: (dxScreen * xBasis.x + dyScreen * xBasis.y) / (xStrength * xStrength), dy: 0 };
  }
  if (yStrength > 0.0001) {
    return { dx: 0, dy: (dxScreen * yBasis.x + dyScreen * yBasis.y) / (yStrength * yStrength) };
  }

  return { dx: dxScreen * fallbackWorldPerPixel(), dy: dyScreen * fallbackWorldPerPixel() };
}

function axisDragToEditorDelta(dxScreen, dyScreen, axisName) {
  const screenAxis = cameraSmartAxisInfo(axisName);
  const signedPixels = dxScreen * screenAxis.x + dyScreen * screenAxis.y;
  if (screenAxis.edge) {
    return screenDeltaToVisibleEditorDelta(screenAxis.x * signedPixels, screenAxis.y * signedPixels);
  }
  const worldUnits = signedPixels / screenAxis.pxPerWorld;
  return worldVectorToEditorDelta(screenAxis.worldAxis.clone().normalize().multiplyScalar(worldUnits));
}

function axisDragAmount(dxScreen, dyScreen, axisName) {
  const screenAxis = cameraSmartAxisInfo(axisName);
  return dxScreen * screenAxis.x + dyScreen * screenAxis.y;
}

function cameraFacingLocalAxis() {
  const { three } = ctx;
  const axis = new THREE.Vector3(0, 0, 1);
  if (three.camera) axis.applyQuaternion(three.camera.quaternion);
  if (three.group) axis.applyQuaternion(three.group.quaternion.clone().invert());
  return axis.normalize();
}

function localRotationAxisForAction(action) {
  if (action === 'rotate-x') return new THREE.Vector3(1, 0, 0);
  if (action === 'rotate-y') return new THREE.Vector3(0, 1, 0);
  return cameraFacingLocalAxis();
}

function viewRotationToEditorDegrees(deg, localAxis) {
  const zInfluence = Math.abs(localAxis.z);
  if (zInfluence < 0.35) return 0;
  return deg * Math.sign(localAxis.z || 1);
}

function storeObject3DOrientation(obj, quaternion, use3DOrientation) {
  const d3 = ensureObjectD3(obj);
  if (use3DOrientation) d3.orient3d = quaternion.toArray();
  else delete d3.orient3d;
}

function screenPointFromWorld(point) {
  const { three, dom } = ctx;
  if (!point || !three.camera || !dom.carea3d) return null;
  const p = point.clone().project(three.camera);
  const w = dom.carea3d.clientWidth || 1;
  const h = dom.carea3d.clientHeight || 1;
  return {
    x: ((p.x + 1) / 2) * w,
    y: ((-p.y + 1) / 2) * h,
  };
}

function worldClientPoint(point) {
  const p = screenPointFromWorld(point);
  const rect = ctx.dom.carea3d?.getBoundingClientRect();
  if (!p || !rect) return null;
  return {
    x: rect.left + p.x,
    y: rect.top + p.y,
  };
}

function createCustomGizmo() {
  const root = document.createElement('div');
  root.className = 'custom-3d-gizmo';
  root.hidden = true;
  root.innerHTML = `
    <div class="custom-gizmo-readout" data-gizmo-readout></div>
    <button class="custom-gizmo-handle custom-gizmo-center" data-gizmo-action="translate" title="Move selected 3D object" aria-label="Move selected 3D object">
      <span class="custom-gizmo-dot"></span>
    </button>
    <button class="custom-gizmo-handle custom-gizmo-arrow custom-gizmo-x" data-gizmo-action="axis-x" title="X axis" aria-label="Transform on X axis">
      <span class="custom-gizmo-axis"></span>
      <span class="custom-gizmo-tip"></span>
      <span class="custom-gizmo-label">X</span>
    </button>
    <button class="custom-gizmo-handle custom-gizmo-arrow custom-gizmo-y" data-gizmo-action="axis-y" title="Y axis" aria-label="Transform on Y axis">
      <span class="custom-gizmo-axis"></span>
      <span class="custom-gizmo-tip"></span>
      <span class="custom-gizmo-label">Y</span>
    </button>
    <button class="custom-gizmo-handle custom-gizmo-rotate" data-gizmo-action="rotate" title="Rotate" aria-label="Rotate selected 3D object">
      <span class="custom-gizmo-ring"></span>
      <span class="custom-gizmo-label">ROT</span>
    </button>
    <button class="custom-gizmo-handle custom-gizmo-scale" data-gizmo-action="scale" title="Scale" aria-label="Scale selected 3D object">
      <span class="custom-gizmo-scale-box"></span>
    </button>
  `;
  activeArea()?.appendChild(root);
  root.querySelectorAll('[data-gizmo-action]').forEach((handle) => {
    handle.addEventListener('pointerdown', startCustomGizmoDrag);
  });
  ctx.three.customGizmo = root;
  return root;
}

function selectedObjectGroups() {
  const { three, state } = ctx;
  return state.selected
    .filter((id) => getObj(id)?.el && three.objectGroups?.has(id))
    .map((id) => ({ id, group: three.objectGroups.get(id), obj: getObj(id) }));
}

function baseSnapshot(targets) {
  return targets.map(({ id, group, obj }) => ({
    id,
    group,
    obj,
    baseTf: { ...ensureObjTransform(obj) },
    baseGroupPosition: group.position.clone(),
    baseGroupRotation: group.rotation.clone(),
    baseGroupQuaternion: group.quaternion.clone(),
    baseGroupScale: group.scale.clone(),
  }));
}

function resolveGizmoAction(rawAction) {
  const mode = ctx.state.gizmoMode || 'translate';
  if (rawAction === 'axis-x') {
    if (mode === 'rotate') return 'rotate-x';
    if (mode === 'scale') return 'scale-x';
    return 'translate-x';
  }
  if (rawAction === 'axis-y') {
    if (mode === 'rotate') return 'rotate-y';
    if (mode === 'scale') return 'scale-y';
    return 'translate-y';
  }
  if (rawAction === 'translate') {
    if (mode === 'rotate') return 'rotate';
    if (mode === 'scale') return 'scale';
  }
  return rawAction;
}

function applyTargetsFromDrag(drag, e) {
  const dxScreen = e.clientX - drag.startX;
  const dyScreen = e.clientY - drag.startY;
  const mode = drag.action;

  if (mode.startsWith('translate')) {
    let delta = screenDeltaToEditorDelta(dxScreen, dyScreen);
    if (mode === 'translate-x') delta = axisDragToEditorDelta(dxScreen, dyScreen, 'x');
    if (mode === 'translate-y') delta = axisDragToEditorDelta(dxScreen, dyScreen, 'y');

    drag.targets.forEach((t) => {
      const tf = { ...t.baseTf, tx: t.baseTf.tx + delta.dx, ty: t.baseTf.ty + delta.dy };
      writeTransformToEl(t.obj.el, tf);
      Object.assign(ensureObjTransform(t.obj), tf);
      t.group.position.copy(t.baseGroupPosition).add(new THREE.Vector3(delta.dx, -delta.dy, 0));
    });
    updateGizmoReadout(`${Math.round(delta.dx)}, ${Math.round(delta.dy)}`);
    return true;
  }

  if (mode.startsWith('rotate')) {
    const startAngle = Math.atan2(drag.startY - drag.center.y, drag.startX - drag.center.x);
    const angle = Math.atan2(e.clientY - drag.center.y, e.clientX - drag.center.x);
    const deg = mode === 'rotate-x'
      ? axisDragAmount(dxScreen, dyScreen, 'x') * 0.75
      : mode === 'rotate-y'
        ? axisDragAmount(dxScreen, dyScreen, 'y') * 0.75
        : ((angle - startAngle) * 180) / Math.PI;
    const rad = THREE.MathUtils.degToRad(deg);
    const viewAxis = drag.viewAxis ?? new THREE.Vector3(0, 0, 1);
    const quat = new THREE.Quaternion().setFromAxisAngle(viewAxis, rad);
    const editorDeg = mode === 'rotate' ? viewRotationToEditorDegrees(deg, viewAxis) : 0;
    const use3DOrientation = mode !== 'rotate' || editorDeg === 0;

    drag.targets.forEach((t) => {
      const tf = { ...t.baseTf, rot: t.baseTf.rot + editorDeg };
      writeTransformToEl(t.obj.el, tf);
      Object.assign(ensureObjTransform(t.obj), tf);
      t.group.quaternion.copy(t.baseGroupQuaternion).premultiply(quat);
      storeObject3DOrientation(t.obj, t.group.quaternion, use3DOrientation);
    });
    updateGizmoReadout(`${Math.round(deg)} deg`);
    return true;
  }

  if (mode.startsWith('scale')) {
    const baseDist = Math.hypot(drag.startX - drag.center.x, drag.startY - drag.center.y);
    const nextDist = Math.hypot(e.clientX - drag.center.x, e.clientY - drag.center.y);
    const amount = mode === 'scale-x'
      ? axisDragAmount(dxScreen, dyScreen, 'x')
      : mode === 'scale-y'
        ? axisDragAmount(dxScreen, dyScreen, 'y')
        : nextDist - baseDist;
    const factor = Math.max(0.05, Math.min(20, Math.exp(amount / 140)));

    drag.targets.forEach((t) => {
      const tf = {
        ...t.baseTf,
        sx: mode === 'scale-y' ? t.baseTf.sx : t.baseTf.sx * factor,
        sy: mode === 'scale-x' ? t.baseTf.sy : t.baseTf.sy * factor,
      };
      writeTransformToEl(t.obj.el, tf);
      Object.assign(ensureObjTransform(t.obj), tf);
      t.group.scale.copy(t.baseGroupScale);
      if (mode !== 'scale-y') t.group.scale.x = t.baseGroupScale.x * factor;
      if (mode !== 'scale-x') t.group.scale.y = t.baseGroupScale.y * factor;
    });
    updateGizmoReadout(`${Math.round(factor * 100)}%`);
    return true;
  }

  return false;
}

function updateGizmoReadout(text = '') {
  const readout = ctx.three.customGizmo?.querySelector('[data-gizmo-readout]');
  if (readout) readout.textContent = text;
}

function startCustomGizmoDrag(e) {
  const { three } = ctx;
  const targets = selectedObjectGroups();
  if (!targets.length) return;

  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.setPointerCapture?.(e.pointerId);
  const action = resolveGizmoAction(e.currentTarget.dataset.gizmoAction);
  three.gizmoDragging = true;
  three.customGizmo?.classList.add('is-dragging', `drag-${action}`);
  e.currentTarget.classList.add('is-active');
  document.body.classList.add('custom-gizmo-dragging');
  ctx.state.drag3 = false;
  ctx.state.pan3 = false;

  const center = worldClientPoint(selectedAnchorWorld()) ?? {
    x: e.clientX,
    y: e.clientY,
  };
  const drag = {
    action,
    startX: e.clientX,
    startY: e.clientY,
    center,
    targets: baseSnapshot(targets),
    viewAxis: action.startsWith('rotate') ? localRotationAxisForAction(action) : null,
    moved: false,
  };
  three.customGizmoDrag = drag;

  const onMove = (moveEvent) => {
    moveEvent.preventDefault();
    drag.moved = applyTargetsFromDrag(drag, moveEvent) || drag.moved;
    showHandles();
    renderThreeFrame();
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    three.gizmoDragging = false;
    three.customGizmoDrag = null;
    three.customGizmo?.classList.remove('is-dragging', `drag-${drag.action}`);
    e.currentTarget.classList.remove('is-active');
    document.body.classList.remove('custom-gizmo-dragging');
    updateGizmoReadout('');
    three.lastGizmoPointerUp = performance.now();
    if (drag.moved) {
      saveHistory();
      flushRealtime3D();
    } else {
      update3DGizmoAttachment();
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

export function setGizmoMode(mode) {
  ctx.state.gizmoMode = mode;
  updateCustomGizmoMode();
}

function updateCustomGizmoMode() {
  const root = ctx.three.customGizmo;
  if (!root) return;
  root.dataset.mode = ctx.state.gizmoMode || 'translate';
}

export function init3DGizmos() {
  if (!ctx.three.customGizmo) createCustomGizmo();
  updateCustomGizmoMode();
}

export function detach3DGizmo() {
  const { three } = ctx;
  three.gizmoTargets = null;
  three.customGizmoDrag = null;
  three.gizmoDragging = false;
  if (three.customGizmo) three.customGizmo.hidden = true;
  if (three.gizmoPivot) {
    three.gizmoPivot.position.set(0, 0, 0);
    three.gizmoPivot.rotation.set(0, 0, 0);
    three.gizmoPivot.scale.set(1, 1, 1);
  }
}

function ensureGizmoPivot() {
  const { three } = ctx;
  if (three.gizmoPivot?.parent === three.group) return three.gizmoPivot;
  const pivot = new THREE.Group();
  pivot.name = 'customGizmoPivot';
  three.group.add(pivot);
  three.gizmoPivot = pivot;
  return pivot;
}

export function update3DGizmoAttachment() {
  const { three } = ctx;
  if (three.customGizmoDrag) return;
  const root = three.customGizmo ?? createCustomGizmo();
  const targets = selectedObjectGroups();

  if (!targets.length) {
    detach3DGizmo();
    return;
  }

  three.gizmoTargets = targets.map(({ id, obj }) => ({
    id,
    baseTf: { ...ensureObjTransform(obj) },
  }));

  const anchor = selectedAnchorWorld();
  if (targets.length > 1) {
    const pivot = ensureGizmoPivot();
    const box = new THREE.Box3();
    targets.forEach(({ group }) => box.expandByObject(group));
    if (box.isEmpty()) {
      detach3DGizmo();
      return;
    }
    const localCenter = box.getCenter(new THREE.Vector3());
    three.group?.worldToLocal(localCenter);
    pivot.position.copy(localCenter);
  }

  const p = screenPointFromWorld(anchor);
  if (!p) {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  root.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  const xAxis = cameraSmartAxisInfo('x');
  const yAxis = cameraSmartAxisInfo('y');
  const xEdge = xAxis.edge;
  const yEdge = yAxis.edge;
  root.style.setProperty('--gizmo-x-angle', `${Math.atan2(xAxis.y, xAxis.x)}rad`);
  root.style.setProperty('--gizmo-y-angle', `${Math.atan2(yAxis.y, yAxis.x)}rad`);
  root.classList.toggle('x-axis-edge-on', xEdge);
  root.classList.toggle('y-axis-edge-on', yEdge);
  updateCustomGizmoMode();
}

export function getObjectGroup(objectId) {
  return ctx.three.objectGroups?.get(objectId) ?? null;
}

export function ensureObjectGroup(objectId) {
  const { three } = ctx;
  if (!three.objectGroups) three.objectGroups = new Map();
  let group = three.objectGroups.get(objectId);
  if (!group) {
    group = new THREE.Group();
    group.userData.sourceObjectId = objectId;
    three.objectGroups.set(objectId, group);
    three.group.add(group);
  }
  return group;
}
