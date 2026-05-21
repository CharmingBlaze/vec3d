import { THREE } from './setup.js';
import { ctx, getObj } from '../core/context.js';
import { getThreeMat, updateSceneLights } from './materials.js';
import { renderThreeFrame } from './engine.js';
import { getObjectD3 } from '../core/d3-settings.js';

function removeEdgeLines(mesh) {
  const line = mesh.userData.edgeLines;
  if (!line) return;
  mesh.remove(line);
  line.geometry?.dispose();
  line.material?.dispose();
  mesh.userData.edgeLines = null;
}

function isGameTopologyMesh(mesh) {
  return !!(mesh.geometry?.userData?.gameMesh || mesh.geometry?.userData?.topologyPositions?.length);
}

function addTopologyLoopLines(mesh, color = 0xffa12a) {
  if (mesh.userData.edgeLines) return;
  const topology = mesh.geometry?.userData?.topologyPositions;
  if (!topology?.length) return false;

  const edges = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute(topology, 3),
  );
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
  });
  const line = new THREE.LineSegments(edges, mat);
  line.renderOrder = 2;
  mesh.add(line);
  mesh.userData.edgeLines = line;
  return true;
}

function addEdgeLines(mesh, threshold = 18) {
  if (mesh.userData.edgeLines) return;
  if (addTopologyLoopLines(mesh)) return;

  const isDoodleSolid = mesh.geometry?.userData?.doodleSolid || mesh.geometry?.userData?.gameMesh;
  const edgeThreshold = isDoodleSolid ? 42 : threshold;
  const edges = new THREE.EdgesGeometry(mesh.geometry, edgeThreshold);
  const mat = new THREE.LineBasicMaterial({
    color: 0x0a0a12,
    transparent: true,
    opacity: 0.9,
  });
  const line = new THREE.LineSegments(edges, mat);
  line.renderOrder = 1;
  mesh.add(line);
  mesh.userData.edgeLines = line;
}

function materialTypeForMode(mode) {
  const mat = ctx.dom.d3Mat?.value || 'phong';
  if (mode === 'textured') {
    return mat === 'wireframe' || mat === 'flat' ? 'phong' : mat;
  }
  if (mode === 'solid' || mode === 'solid-loops' || mode === 'solid-lines') return 'flat';
  if (mode === 'loops') return 'wireframe';
  return 'wireframe';
}

function resolveMeshMaterialOpts(mesh) {
  const sourceId = mesh.userData?.sourceObjectId;
  const o = sourceId ? getObj(sourceId) : null;
  const d3 = o ? getObjectD3(o) : null;
  return {
    mat: d3?.mat ?? ctx.dom.d3Mat?.value ?? 'flat',
    shine: d3?.shine ?? +(ctx.dom.d3Shine?.value ?? 100),
  };
}

function resolveMatTypeForView(mode, userMat) {
  if (mode === 'wireframe' || mode === 'loops') return 'wireframe';
  if (mode === 'textured') {
    return userMat === 'wireframe' || userMat === 'flat' ? 'phong' : userMat;
  }
  return userMat || 'flat';
}

function setMeshMaterial(mesh, color, mode) {
  const { mat, shine } = resolveMeshMaterialOpts(mesh);
  const next = getThreeMat(color, resolveMatTypeForView(mode, mat), shine);
  const isTopologyMesh = !!mesh.geometry?.userData?.topologyPositions?.length;
  const isSilhouetteCage = !!mesh.geometry?.userData?.silhouetteSolid;

  if (isTopologyMesh && (mode === 'wireframe' || mode === 'loops' || (isSilhouetteCage && mode === 'solid-lines'))) {
    next.wireframe = false;
    next.transparent = true;
    next.opacity = mode === 'loops' ? 0.04 : isSilhouetteCage ? 0.08 : 0.16;
    next.depthWrite = false;
  }
  if (mesh.material && mesh.material !== next) mesh.material.dispose();
  mesh.material = next;
}

/** Re-apply materials, lights, and display mode without rebuilding geometry */
export function refresh3DAppearance() {
  if (!ctx.meshes3d.length) return false;
  applyViewMode(ctx.state.viewMode3d);
  updateSceneLights();
  renderThreeFrame();
  return true;
}

/** Apply display mode to all current 3D meshes (no geometry rebuild) */
export function applyViewMode(mode = ctx.state.viewMode3d) {
  ctx.state.viewMode3d = mode;
  ctx.meshes3d.forEach((mesh) => {
    if (!mesh.isMesh) return;
    const color = mesh.userData.fillColor || '#888888';
    removeEdgeLines(mesh);

    if (mode === 'wireframe') {
      if (isGameTopologyMesh(mesh)) {
        setMeshMaterial(mesh, color, 'flat');
        mesh.material.transparent = true;
        mesh.material.opacity = 0.12;
        mesh.material.depthWrite = false;
        addTopologyLoopLines(mesh, 0xffa12a);
        return;
      }
      setMeshMaterial(mesh, color, 'wireframe');
      return;
    }

    if (mode === 'loops') {
      setMeshMaterial(mesh, color, 'loops');
      addTopologyLoopLines(mesh) || addEdgeLines(mesh, 40);
      return;
    }

    setMeshMaterial(mesh, color, mode);

    if (mode === 'solid-loops' || mode === 'solid-lines') {
      if (isGameTopologyMesh(mesh)) addTopologyLoopLines(mesh);
      else addEdgeLines(mesh);
    }
  });

  syncViewModeUi(mode);
}

export function setViewMode3d(mode) {
  applyViewMode(mode);
  updateSceneLights();
  renderThreeFrame();
}

export function syncViewModeUi(mode = ctx.state.viewMode3d) {
  document.querySelectorAll('[data-d3-view]').forEach((el) => {
    const on = el.dataset.d3View === mode;
    if (el.tagName === 'OPTION') el.selected = on;
    else el.classList.toggle('on', on);
  });
  const sel = ctx.dom.d3ViewMode;
  if (sel && sel.value !== mode) sel.value = mode;
}

export function initViewModeControls() {
  document.querySelectorAll('[data-d3-view]').forEach((el) => {
    if (el.tagName === 'OPTION') return;
    el.addEventListener('click', () => setViewMode3d(el.dataset.d3View));
  });
  if (ctx.dom.d3ViewMode) {
    ctx.dom.d3ViewMode.onchange = (e) => setViewMode3d(e.target.value);
  }
  syncViewModeUi();
}
